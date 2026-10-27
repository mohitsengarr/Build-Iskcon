// Krishna check: the Claude call and the stored record (logic in
// krishnaCheckCore.ts). Fails closed: a missing key, an unreadable image, an API
// error, a refusal or a malformed answer is "not checked", so nothing is posted.
// A failed check is not stored, so the next run asks again.

import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";
import {
  buildKrishnaParams,
  bytesToBase64,
  isCurrentCheck,
  KRISHNA_CHECK_MODEL,
  krishnaAllowed,
  type KrishnaAnswer,
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

export type AskResult = { ok: true; answer: KrishnaAnswer } | { ok: false; reason: string };
export type Ask = (imageUrl: string) => Promise<AskResult>;

function env(name: string): string {
  // deno-lint-ignore no-explicit-any
  const d = (globalThis as any).Deno;
  return d?.env?.get?.(name) ?? "";
}

/** Asks Claude whether Krishna is in the picture at this URL. Never throws. */
export async function askKrishna(
  imageUrl: string,
  o: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AskResult> {
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
    const message = await client.beta.messages.create(
      // deno-lint-ignore no-explicit-any
      buildKrishnaParams({ imageB64, mediaType }) as any,
      { timeout: o.timeoutMs ?? 90_000, maxRetries: 1 },
    );
    const parsed = parseKrishnaCheck(message);
    return parsed.outcome === "ok" ? { ok: true, answer: parsed.answer } : { ok: false, reason: parsed.outcome };
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
  const record = krishnaRecord(r.answer, row.image_path, KRISHNA_CHECK_MODEL, (o.now ?? (() => new Date()))());
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
