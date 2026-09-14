// Visual check: PURE logic.
//
// No Deno globals, no network, no npm:/jsr:/https imports. This file must run
// unchanged under Deno (edge functions) and under Node --experimental-strip-types
// (tests/visual-check-core.test.ts), so it uses only plain TypeScript syntax
// that type-stripping supports: no enums, no namespaces, no parameter properties.
//
// Why: FLUX.2-pro drew Gita chapter 1 with three horses and Krishna holding the
// bow, although the prompt said "exactly four white horses" and put the Gandiva
// in Arjuna's hands. Prompt text cannot fix counts. Each render is now checked by
// Claude vision against the same research facts that went into its prompt.
// Supabase cuts a request at 150s, so a request stores its image with a "running"
// record and the check runs after the response: gallery-triggered generation only
// flags a contradicted fact, unattended generation re-renders the image.
//
// The IO wrapper (visualCheck.ts) makes the Claude call and runs the render loops
// and the background work; everything that decides what is sent, how the answer
// is read, which record a new image starts with and whether to spend another
// render lives here so it can be tested offline.

export const VISUAL_CHECK_TOOL_NAME = "record_visual_check";
export const VISUAL_CHECK_MODEL = "claude-opus-5";
/** Larger base64 images are not sent to Claude (the check is skipped). */
export const MAX_CHECK_IMAGE_B64_CHARS = 5_000_000;
/** Time kept free after a retry's render and check, so the request can still store its row. */
export const RETRY_MARGIN_MS = 5_000;
/** A stored `observed` note is cut to this many characters. */
export const MAX_OBSERVED_CHARS = 300;

export type CheckVerdict = "yes" | "no" | "unclear";
export const CHECK_VERDICTS: CheckVerdict[] = ["yes", "no", "unclear"];

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** One answer from Claude: fact_index is 1-based into the facts that were sent. */
export interface VisualCheckItem {
  fact_index: number;
  verdict: CheckVerdict;
  observed: string;
}

export interface FailedFact {
  fact: string;
  observed: string;
}

export interface VisualVerdict {
  status: "pass" | "fail";
  failed: FailedFact[];
  /** Facts answered "unclear" plus facts with no answer at all. */
  unclear: number;
  /** Facts that got an answer of any verdict. */
  answered: number;
}

export type ParseOutcome = "ok" | "refusal" | "no_tool";

// ── Claude request ───────────────────────────────────────────────────────────

/** Strict tool: every object closed, every field required. */
export const VISUAL_CHECK_TOOL = {
  name: VISUAL_CHECK_TOOL_NAME,
  description:
    "Record, for each numbered detail, whether the painting shows it (yes), clearly contradicts it (no) or cannot be judged (unclear), with a short note of what the painting actually shows.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["checks"],
    properties: {
      checks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fact_index", "verdict", "observed"],
          properties: {
            fact_index: { type: "integer", description: "The detail's number, starting at 1." },
            verdict: { type: "string", enum: ["yes", "no", "unclear"] },
            observed: {
              type: "string",
              description: "What the painting actually shows for this detail. For a count, the number counted.",
            },
          },
        },
      },
    },
  },
};

function oneLine(text: unknown): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** The user message text: instructions, then the facts numbered 1..n in the order given. */
export function buildVisualCheckText(facts: unknown[]): string {
  const list = Array.isArray(facts) ? facts : [];
  const numbered = list.map((f, i) => `${i + 1}. ${oneLine(f)}`).join("\n");
  return [
    "This painting was generated from a prompt that asked for the numbered details below. Check the painting against each detail.",
    "",
    "For each detail give one verdict:",
    '- "yes" if the painting clearly shows it.',
    '- "no" if the painting clearly contradicts it: a wrong count, the wrong person holding an object, or a required element missing.',
    '- "unclear" if you cannot tell from the painting.',
    "",
    "For any count (horses, heads, arms, people, objects), count the items one by one and put the number you counted in observed.",
    "observed is a short plain description of what the painting actually shows for that detail.",
    "Judge only these details. Style and composition are not part of the check.",
    "",
    "Details:",
    numbered,
    "",
    `Call the ${VISUAL_CHECK_TOOL_NAME} tool once, with one entry per detail and the detail's number as fact_index.`,
  ].join("\n");
}

/** The params for client.beta.messages.create: image block first, then the numbered facts. */
export function buildVisualCheckParams(input: { facts: unknown[]; imageB64: string; mediaType: ImageMediaType }) {
  return {
    model: VISUAL_CHECK_MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    tools: [VISUAL_CHECK_TOOL],
    // Not forced: thinking is on by default on claude-opus-5 and forced tool
    // use conflicts with it. The text tells the model to call the tool.
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.imageB64 } },
          { type: "text", text: buildVisualCheckText(input.facts) },
        ],
      },
    ],
  };
}

// ── Claude answer ────────────────────────────────────────────────────────────

/**
 * Reads the tool answer. Keeps only checks whose fact_index is an integer in
 * 1..factCount with a known verdict; the first valid answer for an index wins.
 */
export function parseVisualCheck(message: unknown, factCount: number): { outcome: ParseOutcome; checks: VisualCheckItem[] } {
  // deno-lint-ignore no-explicit-any
  const m = message as any;
  if (!m || typeof m !== "object") return { outcome: "no_tool", checks: [] };
  if (m.stop_reason === "refusal") return { outcome: "refusal", checks: [] };
  const content = Array.isArray(m.content) ? m.content : [];
  // deno-lint-ignore no-explicit-any
  const block = content.find((b: any) => b && b.type === "tool_use" && b.name === VISUAL_CHECK_TOOL_NAME);
  const raw = block?.input?.checks;
  if (!Array.isArray(raw)) return { outcome: "no_tool", checks: [] };

  const max = Number.isFinite(Number(factCount)) ? Math.floor(Number(factCount)) : 0;
  const seen = new Set<number>();
  const checks: VisualCheckItem[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const index = c.fact_index;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 1 || index > max) continue;
    if (!CHECK_VERDICTS.includes(c.verdict)) continue;
    if (seen.has(index)) continue;
    seen.add(index);
    const observed = typeof c.observed === "string" ? oneLine(c.observed).slice(0, MAX_OBSERVED_CHARS) : "";
    checks.push({ fact_index: index, verdict: c.verdict, observed });
  }
  return { outcome: "ok", checks };
}

/** Only a "no" fails. A fact with no answer counts as unclear, never as failed. */
export function verdictFor(checks: VisualCheckItem[], facts: unknown[]): VisualVerdict {
  const list = Array.isArray(facts) ? facts : [];
  const byIndex = new Map<number, VisualCheckItem>();
  for (const c of Array.isArray(checks) ? checks : []) {
    if (!c || !Number.isInteger(c.fact_index) || c.fact_index < 1 || c.fact_index > list.length) continue;
    if (!byIndex.has(c.fact_index)) byIndex.set(c.fact_index, c);
  }
  const failed: FailedFact[] = [];
  let unclear = 0;
  let answered = 0;
  list.forEach((fact, i) => {
    const c = byIndex.get(i + 1);
    if (!c) {
      unclear++;
      return;
    }
    answered++;
    if (c.verdict === "no") failed.push({ fact: String(fact), observed: String(c.observed ?? "") });
    else if (c.verdict !== "yes") unclear++;
  });
  return { status: failed.length > 0 ? "fail" : "pass", failed, unclear, answered };
}

// ── Image bytes ──────────────────────────────────────────────────────────────

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodes the first `maxBytes` bytes of a base64 string; stops at the first invalid character. */
function leadingBytes(b64: string, maxBytes: number): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of b64) {
    if (bytes.length >= maxBytes) break;
    let v = B64_ALPHABET.indexOf(ch);
    if (ch === "-") v = 62;
    if (ch === "_") v = 63;
    if (v < 0) break;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

function startsWith(bytes: number[], sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** The image type from its leading magic bytes, or null when it is not a supported image. */
export function detectImageMediaType(b64: unknown): ImageMediaType | null {
  if (typeof b64 !== "string") return null;
  const bytes = leadingBytes(b64.trimStart().slice(0, 16), 12);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // "GIF87a" or "GIF89a"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return "image/gif";
  }
  // "RIFF" <size> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

// ── Retry decisions ──────────────────────────────────────────────────────────

/**
 * Another render is worth starting only when attempts remain and a render plus
 * a check (plus RETRY_MARGIN_MS) still fit before the deadline. The loop passes
 * the slowest render so far and the time it keeps for the check.
 */
export function shouldRetry(input: {
  attemptsSoFar: number;
  maxAttempts: number;
  now: number;
  deadlineAt: number;
  lastRenderMs: number;
  lastCheckMs: number;
}): boolean {
  const { attemptsSoFar, maxAttempts, now, deadlineAt } = input;
  if (!(Number(attemptsSoFar) < Number(maxAttempts))) return false;
  if (!Number.isFinite(now) || !Number.isFinite(deadlineAt)) return false;
  const ms = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  return now + ms(input.lastRenderMs) + ms(input.lastCheckMs) + RETRY_MARGIN_MS <= deadlineAt;
}

/** The attempt with the fewest failed facts; ties go to the earliest. Null when there are none. */
export function pickBest<T extends { verdict?: { failed?: unknown[] } | null }>(attempts: T[]): T | null {
  let best: T | null = null;
  let bestFailed = Infinity;
  for (const a of Array.isArray(attempts) ? attempts : []) {
    if (!a) continue;
    const failed = Array.isArray(a.verdict?.failed) ? (a.verdict?.failed as unknown[]).length : Infinity;
    if (best === null || failed < bestFailed) {
      best = a;
      bestFailed = failed;
    }
  }
  return best;
}

// ── Together request body ────────────────────────────────────────────────────

/**
 * The Together /v1/images/generations body. seed and steps are sent only to
 * black-forest-labs/ (FLUX) models: OpenAI image models such as
 * openai/gpt-image-2 have neither parameter.
 */
export function imagePayload(
  model: string,
  prompt: string,
  w: number,
  h: number,
  opts: { seed?: number | null; steps?: number | null } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, prompt, width: w, height: h, n: 1, response_format: "b64_json" };
  if (typeof model === "string" && model.startsWith("black-forest-labs/")) {
    const seed = opts?.seed;
    const steps = opts?.steps;
    if (typeof seed === "number" && Number.isFinite(seed)) body.seed = seed;
    if (typeof steps === "number" && Number.isFinite(steps) && steps > 0) body.steps = steps;
  }
  return body;
}

// ── Stored record ────────────────────────────────────────────────────────────

/** "running": the image is stored and its check has not finished (it runs after the response). */
export type VisualCheckStatus = "pass" | "fail" | "error" | "skipped" | "running";
export const VISUAL_CHECK_STATUSES: VisualCheckStatus[] = ["pass", "fail", "error", "skipped", "running"];

export interface VisualCheckRecord {
  status: VisualCheckStatus;
  attempts: number;
  chosen_attempt: number;
  failed: FailedFact[];
  unclear: number;
  reason: string | null;
  image_model: string | null;
  checked_at: string | null;
  /**
   * When the background check was queued (ISO). Only records built with a
   * startedAt carry the key: the in-request loop's records keep their shape.
   */
  started_at?: string | null;
}

/**
 * The plain JSON stored in the visual_check jsonb column. checkedAt and startedAt
 * are passed in, never computed here. started_at is stored whenever the input has
 * a startedAt key, as null when it is not a non-empty string.
 */
export function visualCheckRecord(input: {
  status: VisualCheckStatus;
  attempts: number;
  chosenAttempt: number;
  failed?: FailedFact[] | null;
  unclear?: number | null;
  reason?: string | null;
  imageModel?: string | null;
  checkedAt?: string | null;
  startedAt?: string | null;
}): VisualCheckRecord {
  const count = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);
  const text = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const record: VisualCheckRecord = {
    status: input.status,
    attempts: count(input.attempts),
    chosen_attempt: count(input.chosenAttempt),
    failed: (Array.isArray(input.failed) ? input.failed : []).map((f) => ({
      fact: String(f?.fact ?? ""),
      observed: String(f?.observed ?? ""),
    })),
    unclear: count(input.unclear),
    reason: text(input.reason),
    image_model: text(input.imageModel),
    checked_at: text(input.checkedAt),
  };
  if ("startedAt" in input) record.started_at = text(input.startedAt);
  return record;
}

// ── Background check ─────────────────────────────────────────────────────────

/**
 * Work handed to EdgeRuntime.waitUntil outlives the response (the response itself
 * is cut at 150s) until the worker is stopped, 400s of wall clock after it
 * started on the Pro plan, whichever request it is serving. Background checks and
 * re-renders stop 360s after that start, leaving time to store the result.
 */
export const BACKGROUND_BUDGET_MS = 360_000;

/**
 * Epoch ms after which background work starts no check or render, counted from
 * `invocationStart`. The IO wrapper's backgroundDeadline passes the worker's start
 * instead when the worker started earlier. NaN when the start is not a finite
 * number: the image is then still checked once (bounded by the check timeout) but
 * never re-rendered.
 */
export function backgroundDeadline(invocationStart: number): number {
  return typeof invocationStart === "number" && Number.isFinite(invocationStart)
    ? invocationStart + BACKGROUND_BUDGET_MS
    : Number.NaN;
}

/** The record stored with an image whose check is still to come. */
export function runningRecord(input: { imageModel?: string | null; startedAt?: string | null }): VisualCheckRecord {
  return visualCheckRecord({
    status: "running",
    attempts: 1,
    chosenAttempt: 0,
    imageModel: input?.imageModel,
    checkedAt: null,
    startedAt: input?.startedAt ?? null,
  });
}

/**
 * The record stored with a new image, before any check. In this order:
 * - skipped/no_facts: no research fact reached the prompt, so nothing can be checked
 *   (blank and non-string facts do not count);
 * - skipped/safe_fallback: the image came from SAFE_FALLBACK, a prompt with none of the facts;
 * - skipped/disabled: the check cannot run (the IO side sets disabled when
 *   VISUAL_CHECK_ENABLED is off or ANTHROPIC_API_KEY is missing);
 * - otherwise running: the background check is still to come.
 * checkedAt (skipped records only) and startedAt are passed in.
 */
export function initialRecordFor(input: {
  factsUsed?: unknown;
  safeFallback?: unknown;
  imageModel?: string | null;
  startedAt?: string | null;
  disabled?: boolean;
  checkedAt?: string | null;
}): VisualCheckRecord {
  const startedAt = input?.startedAt ?? null;
  const list = input?.factsUsed;
  const facts = Array.isArray(list) ? list.filter((f) => typeof f === "string" && f.trim().length > 0) : [];
  const skipped = (reason: string) =>
    visualCheckRecord({
      status: "skipped",
      attempts: 1,
      chosenAttempt: 0,
      reason,
      imageModel: input?.imageModel,
      checkedAt: input?.checkedAt,
      startedAt,
    });
  if (facts.length === 0) return skipped("no_facts");
  if (input?.safeFallback) return skipped("safe_fallback");
  if (input?.disabled) return skipped("disabled");
  return runningRecord({ imageModel: input?.imageModel, startedAt });
}

/** True only for a running record: its image still needs the background check. */
export function needsBackgroundCheck(record: unknown): boolean {
  return !!record && typeof record === "object" && (record as { status?: unknown }).status === "running";
}
