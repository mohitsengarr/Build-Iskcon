// Krishna check: the Claude call and the stored record (logic in
// krishnaCheckCore.ts). Fails closed: a missing key, an unreadable image, an API
// error, a refusal or a malformed answer is "not checked", so nothing is posted.
// A failed check is not stored, so the next run asks again.
//
// Sonnet answers first. When it says it is not sure, contradicts itself or gives no
// usable answer, Opus is asked and its answer is the one stored (SEN-975). An unsure
// Sonnet answer that Opus could not confirm is not stored: the picture is held back.
// Pictures drawn since SEN-975 usually arrive with a stored answer already, copied
// from the image check that ran after the render (see krishnaCheckCore.ts).

import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";
import { answeredBy, CHECK_MODEL, type CheckModel, ESCALATION_MODEL, usageNote } from "./checkModels.ts";
import {
  buildKrishnaParams,
  bytesToBase64,
  isCurrentCheck,
  KRISHNA_CHECK_MODEL,
  krishnaAllowed,
  type KrishnaAnswer,
  krishnaNeedsSecondOpinion,
  type KrishnaCheck,
  krishnaRecord,
  MAX_KRISHNA_IMAGE_B64_CHARS,
  parseKrishnaCheck,
} from "./krishnaCheckCore.ts";
import { detectImageMediaType } from "./visualCheckCore.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export type KrishnaTable = "ig_pending_review" | "gita_chapter_art_review" | "chaitanya_chapter_art_review";
export const KRISHNA_TABLES: readonly KrishnaTable[] = ["ig_pending_review", "gita_chapter_art_review", "chaitanya_chapter_art_review"];

export type AskResult = { ok: true; answer: KrishnaAnswer; model?: string } | { ok: false; reason: string };
export type Ask = (imageUrl: string) => Promise<AskResult>;

function env(name: string): string {
  // deno-lint-ignore no-explicit-any
  const d = (globalThis as any).Deno;
  return d?.env?.get?.(name) ?? "";
}

type Reply = { ok: true; answer: KrishnaAnswer; model: string } | { ok: false; reason: string; askAgain: boolean };

/** One model's answer. Never throws. */
async function askModel(
  client: Anthropic,
  model: CheckModel,
  imageB64: string,
  mediaType: NonNullable<ReturnType<typeof detectImageMediaType>>,
  timeoutMs: number,
  maxRetries: number,
  log: (line: string) => void,
): Promise<Reply> {
  try {
    const message = await client.beta.messages.create(
      // deno-lint-ignore no-explicit-any
      buildKrishnaParams({ imageB64, mediaType, model }) as any,
      { timeout: timeoutMs, maxRetries },
    );
    const used = usageNote(message);
    if (used) log(`[krishna-check] ${answeredBy(message, model)} tokens=${used}`);
    const parsed = parseKrishnaCheck(message);
    if (parsed.outcome !== "ok") return { ok: false, reason: parsed.outcome, askAgain: parsed.outcome !== "refusal" };
    return { ok: true, answer: parsed.answer, model: answeredBy(message, model) };
  } catch (e) {
    const status = (e as { status?: number })?.status;
    return { ok: false, reason: status ? `api_error_${status}` : `unexpected_${(e as Error)?.name ?? "error"}`, askAgain: false };
  }
}

/**
 * Asks Claude whether Krishna is in the picture at this URL: Sonnet, then Opus
 * only when Sonnet is unsure, contradicts itself or gives no usable answer. Never
 * throws; fails closed.
 */
export async function askKrishna(
  imageUrl: string,
  o: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number; log?: (line: string) => void } = {},
): Promise<AskResult> {
  const log = o.log ?? console.log;
  try {
    const apiKey = o.apiKey ?? env("ANTHROPIC_API_KEY");
    if (!apiKey) return { ok: false, reason: "no_api_key" };
    const res = await (o.fetchImpl ?? fetch)(imageUrl);
    if (!res.ok) return { ok: false, reason: `image_http_${res.status}` };
    const imageB64 = bytesToBase64(new Uint8Array(await res.arrayBuffer()));
    if (imageB64.length > MAX_KRISHNA_IMAGE_B64_CHARS) return { ok: false, reason: "image_too_large" };
    const mediaType = detectImageMediaType(imageB64);
    if (!mediaType) return { ok: false, reason: "unknown_media_type" };
    const client = new Anthropic({ apiKey });
    const timeoutMs = o.timeoutMs ?? 60_000;
    const first = await askModel(client, CHECK_MODEL, imageB64, mediaType, timeoutMs, 1, log);
    const unsure = first.ok && krishnaNeedsSecondOpinion(first.answer);
    if (first.ok && !unsure) return { ok: true, answer: first.answer, model: first.model };
    if (!first.ok && !first.askAgain) return { ok: false, reason: first.reason };
    const second = await askModel(client, ESCALATION_MODEL, imageB64, mediaType, timeoutMs, 0, log);
    if (second.ok) {
      log(`[krishna-check] second opinion from ${second.model}: ${first.ok ? "the first answer was unsure" : `the first gave ${first.reason}`}`);
      return { ok: true, answer: second.answer, model: second.model };
    }
    return { ok: false, reason: first.ok ? `unsure_and_${second.reason}` : first.reason };
  } catch (e) {
    const status = (e as { status?: number })?.status;
    return { ok: false, reason: status ? `api_error_${status}` : `unexpected_${(e as Error)?.name ?? "error"}` };
  }
}

/**
 * The row's current check: the stored one when it judged this image, otherwise a
 * new one, stored only while the row still holds the image it judged (a
 * compare-and-swap on image_path). null when the check failed or the image
 * changed meanwhile.
 */
export async function ensureKrishnaCheck(o: {
  supabase: SupabaseLike;
  table: KrishnaTable;
  row: { id: number; image_path?: unknown; image_url?: unknown; krishna_check?: unknown };
  ask?: Ask;
  now?: () => Date;
  log?: (line: string) => void;
}): Promise<KrishnaCheck | null> {
  const { row } = o;
  const log = o.log ?? console.log;
  if (isCurrentCheck(row.krishna_check, row.image_path)) return row.krishna_check;
  if (typeof row.image_path !== "string" || !row.image_path || typeof row.image_url !== "string" || !row.image_url) return null;
  const r = await (o.ask ?? ((url: string) => askKrishna(url)))(row.image_url);
  if (!r.ok) {
    log(`[krishna-check] ${o.table} #${row.id}: check failed (${r.reason}); not posted`);
    return null;
  }
  const record = krishnaRecord(r.answer, row.image_path, r.model ?? KRISHNA_CHECK_MODEL, (o.now ?? (() => new Date()))());
  const { data, error } = await o.supabase.from(o.table).update({ krishna_check: record })
    .eq("id", row.id).eq("image_path", row.image_path).select("id");
  if (error) {
    log(`[krishna-check] ${o.table} #${row.id}: could not store the check (${error.message}); not posted`);
    return null;
  }
  if (!Array.isArray(data) || data.length !== 1) {
    log(`[krishna-check] ${o.table} #${row.id}: the image changed while it was checked; not posted`);
    return null;
  }
  log(`[krishna-check] ${o.table} #${row.id}: krishna=${record.krishna_visible} form=${record.form} prominence=${record.prominence}`);
  return record;
}

/**
 * Whether this row's picture may go to Instagram or Threads, checking it first
 * when it has no check for its current image. mayCheck false: a picture not
 * checked yet is held back without a check (the caller's run has started enough).
 * checked: a new check was started by this call.
 */
export async function krishnaGate(o: Parameters<typeof ensureKrishnaCheck>[0] & { mayCheck?: boolean }): Promise<{
  allowed: boolean;
  reason: string;
  check: KrishnaCheck | null;
  checked: boolean;
}> {
  const cached = isCurrentCheck(o.row.krishna_check, o.row.image_path);
  if (!cached && o.mayCheck === false) {
    return { allowed: false, reason: "not checked yet: this run has checked enough pictures", check: null, checked: false };
  }
  const check = await ensureKrishnaCheck(o);
  if (!check) return { allowed: false, reason: "the Krishna check could not be completed", check: null, checked: !cached };
  return { ...krishnaAllowed(check, o.row.image_path), check, checked: !cached };
}
