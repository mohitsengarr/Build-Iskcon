// Visual check: IO wrapper around visualCheckCore.ts.
//
// checkImage() asks Claude vision whether a rendered painting shows the research
// facts that went into its prompt. It NEVER throws: a missing key, an unknown or
// oversized image, an API error, a timeout, a refusal or a missing tool call all
// resolve with "skipped" or "error", and the caller keeps the image.
//
// Supabase cuts every request at 150s, a streamed response too. Only work handed
// to EdgeRuntime.waitUntil outlives the response, and only until the worker is
// stopped 400s after it started (Pro plan). A warm worker serves several requests,
// so a request that arrives on one gets less than that. A request stores its image
// first and the check runs after the response:
// - initialRecord() is the record stored with the new image: skipped when there is
//   nothing to check or the check is off, otherwise "running".
// - checkInBackground() (gallery-triggered generation) checks the stored image
//   once and writes the result over the running record. It never renders: a wrong
//   image is flagged on its card, never swapped under a reviewer.
// - redoInBackground() (unattended generation) checks the stored image and, while
//   a fact is clearly contradicted, re-renders. A better image replaces the stored
//   one only through the caller's compare-and-swap; a swap that does not happen
//   (the row was reviewed or changed) ends the loop, and so does the caller's
//   stillCurrent answering false before a re-render or its check.
// - runInBackground() hands either one to EdgeRuntime.waitUntil. Call it before
//   the handler returns its Response.
// Both background functions never reject and start nothing after deadlineAt
// (backgroundDeadline(invocationStart), counted from when the worker started).
//
// renderWithVisualCheck() renders, checks, and re-renders while a fact is clearly
// contradicted ("no"), attempts remain and the deadline allows another render
// plus check. It keeps the image with the fewest failed facts. Background bulk
// runs use it: the whole run is already waitUntil work, so it checks before the
// insert. A checker that fails ("error") never costs another render: the image is
// kept as it is. A re-render (in either loop) gets an abort signal and may not run
// past the point where its check could still start: a slow one is abandoned and
// the checked image kept.
//
// Kill switch: VISUAL_CHECK_ENABLED=false skips the check (and so every re-render).

// Pinned: an unpinned specifier resolves to whatever is newest at deploy time,
// and a function that fails to boot blocks image generation outright.
import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";
import {
  backgroundDeadline as deadlineAfter,
  buildVisualCheckParams,
  detectImageMediaType,
  type FailedFact,
  initialRecordFor,
  MAX_CHECK_IMAGE_B64_CHARS,
  parseVisualCheck,
  pickBest,
  shouldRetry,
  verdictFor,
  visualCheckRecord,
  type VisualCheckRecord,
  type VisualCheckStatus,
} from "./visualCheckCore.ts";

// One import site for integrators: imagePayload, record builders, types.
export * from "./visualCheckCore.ts";

const DEFAULT_CHECK_TIMEOUT_MS = 40_000;
const MIN_SDK_TIMEOUT_MS = 1_000;
/** Before any check has run, a check is assumed to take this long. */
export const CHECK_ESTIMATE_MS = 20_000;
/** A check is never started with less time than this before the deadline: it could not finish. */
export const MIN_CHECK_WINDOW_MS = 10_000;
/** A background re-render is predicted to take at least this long (the request's render was not timed here). */
export const RENDER_ESTIMATE_MS = 30_000;

export interface CheckImageResult {
  status: VisualCheckStatus;
  failed: FailedFact[];
  unclear: number;
  reason: string | null;
  ms: number;
}

export interface CheckImageOptions {
  /** Hard cap for the Claude call in ms (default 40000). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RenderOutput {
  b64: string;
  model?: string | null;
  /**
   * Keep this image unchecked, with this reason (e.g. "safe_fallback": a fixed
   * prompt that carries none of the facts, so checking it against them is
   * meaningless and a re-render would only repeat it).
   */
  skipCheck?: string | null;
  [key: string]: unknown;
}

/** The chosen render (every field the render returned) plus its stored record. */
export interface CheckedRender {
  b64: string;
  model: string | null;
  record: VisualCheckRecord;
  [key: string]: unknown;
}

export interface RenderWithVisualCheckInput {
  /**
   * Renders attempt `attemptIndex` (0, 1, 2 ...). null means the render failed.
   * A re-render (index > 0) gets `signal`, aborted when its time is up; pass it
   * to fetch so the abandoned request stops too.
   */
  render: (attemptIndex: number, signal?: AbortSignal) => Promise<RenderOutput | null>;
  /** The exact research facts (prompt_text strings) that went into the prompt. */
  facts: string[];
  /** Total renders allowed, the first included. */
  maxAttempts: number;
  /** Epoch ms after which no check or re-render may run. */
  deadlineAt: number;
  tag?: string;
  log?: (line: string) => void;
  now?: () => number;
  signal?: AbortSignal;
}

/** Stores a record on the row: a compare-and-swap on the stored image. false or a throw is logged, never retried. */
export type WriteRecord = (record: VisualCheckRecord, stored?: IndexedRender) => Promise<boolean | void> | boolean | void;

export interface CheckInBackgroundInput {
  /** The stored image. */
  b64: string;
  /** The exact facts that reached its prompt. */
  facts: string[];
  imageModel?: string | null;
  /** When the check was queued: an ISO string or epoch ms. Kept in the record as started_at. */
  startedAt?: string | number | null;
  /** Epoch ms after which no check may start: backgroundDeadline(invocationStart). */
  deadlineAt: number;
  writeRecord: WriteRecord;
  tag?: string;
  log?: (line: string) => void;
  now?: () => number;
  signal?: AbortSignal;
}

/** A render with its attempt index. Index 0 is the image the request stored. */
export interface IndexedRender extends RenderOutput {
  b64: string;
  model: string | null;
  index: number;
}

export interface RedoInBackgroundInput {
  /** The image the request rendered and stored (attempt 0). */
  first: RenderOutput;
  /** The exact facts that reached the prompt. */
  facts: string[];
  /** Renders attempt 1, 2 ... (vary the seed by the index); null means the render failed. Pass `signal` to fetch. */
  render: (attemptIndex: number, signal?: AbortSignal) => Promise<RenderOutput | null>;
  /** Total renders allowed, the stored first image included. */
  maxAttempts: number;
  /** Epoch ms after which no check or render may start: backgroundDeadline(invocationStart). */
  deadlineAt: number;
  /**
   * Replaces the stored image with `attempt`, storing `record` with it. Returns
   * true only when the row still held the previous image and was still pending;
   * false (or a throw) ends the loop without another render.
   */
  swap: (attempt: IndexedRender, record: VisualCheckRecord) => Promise<boolean> | boolean;
  /** Stores the final record for whichever image is stored (passed as the second argument). */
  writeRecord: WriteRecord;
  /**
   * Optional: whether the row is still pending with the stored image. Asked before
   * each re-render and again before its check; false ends the loop with reason
   * row_changed, so a post reviewed or replaced meanwhile costs no further render
   * or check. A throw is logged and the loop carries on: the swap still guards the row.
   */
  stillCurrent?: () => Promise<boolean> | boolean;
  /** When the check was queued: an ISO string or epoch ms. Kept in every record as started_at. */
  startedAt?: string | number | null;
  tag?: string;
  log?: (line: string) => void;
  now?: () => number;
  signal?: AbortSignal;
}

function env(name: string): string | undefined {
  try {
    // deno-lint-ignore no-explicit-any
    const v = (globalThis as any).Deno?.env?.get(name);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

function errName(e: unknown): string {
  return e instanceof Error ? e.name : typeof e;
}

/** VISUAL_CHECK_ENABLED=false (also 0/off/no, any case) turns the check off. */
function checkDisabled(): boolean {
  const v = env("VISUAL_CHECK_ENABLED");
  return typeof v === "string" && ["false", "0", "off", "no"].includes(v.trim().toLowerCase());
}

function cleanFacts(facts: unknown): string[] {
  if (!Array.isArray(facts)) return [];
  return facts.filter((f): f is string => typeof f === "string" && f.trim().length > 0).map((f) => f.trim());
}

/** An ISO string is kept, epoch ms becomes ISO, anything else is null. */
function isoTime(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  try {
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

// ── checkImage ───────────────────────────────────────────────────────────────

type Answer = { status: "pass" | "fail"; failed: FailedFact[]; unclear: number } | { status: "error"; reason: string };

async function askClaude(
  apiKey: string,
  facts: string[],
  imageB64: string,
  mediaType: NonNullable<ReturnType<typeof detectImageMediaType>>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Answer> {
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create(
      // deno-lint-ignore no-explicit-any
      buildVisualCheckParams({ facts, imageB64, mediaType }) as any,
      // No retry: inside a fixed deadline a second attempt can never finish.
      { timeout: Math.max(MIN_SDK_TIMEOUT_MS, timeoutMs), maxRetries: 0, signal },
    );
    const parsed = parseVisualCheck(response, facts.length);
    if (parsed.outcome !== "ok") return { status: "error", reason: parsed.outcome };
    const verdict = verdictFor(parsed.checks, facts);
    return { status: verdict.status, failed: verdict.failed, unclear: verdict.unclear };
  } catch (e) {
    if (e instanceof Anthropic.APIError) return { status: "error", reason: `api_error_${e.status ?? "connection"}` };
    return { status: "error", reason: `unexpected_${errName(e)}` };
  }
}

/**
 * Checks one image against its facts. Never throws. "skipped" when the check is
 * off, there are no facts, ANTHROPIC_API_KEY is missing, or the image is missing,
 * too large or not a known type. "error" on an API error, timeout, refusal or a
 * reply without the tool call.
 */
export async function checkImage(
  input: { imageB64: string; facts: string[] },
  opts: CheckImageOptions = {},
): Promise<CheckImageResult> {
  const started = Date.now();
  const finish = (status: VisualCheckStatus, reason: string | null, failed: FailedFact[] = [], unclear = 0) => {
    const ms = Date.now() - started;
    console.log(
      `[visual-check] status=${status} failed=${failed.length} unclear=${unclear} ms=${ms}${reason ? ` reason=${reason}` : ""}`,
    );
    return { status, failed, unclear, reason, ms };
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let detach = () => {};
  try {
    if (checkDisabled()) return finish("skipped", "disabled");
    const facts = cleanFacts(input?.facts);
    if (facts.length === 0) return finish("skipped", "no_facts");
    const apiKey = env("ANTHROPIC_API_KEY");
    if (!apiKey) return finish("skipped", "no_api_key");
    const imageB64 = typeof input?.imageB64 === "string" ? input.imageB64 : "";
    if (imageB64.length === 0) return finish("skipped", "no_image");
    if (imageB64.length > MAX_CHECK_IMAGE_B64_CHARS) return finish("skipped", "image_too_large");
    const mediaType = detectImageMediaType(imageB64);
    if (!mediaType) return finish("skipped", "unknown_media_type");
    const outer = opts?.signal;
    if (outer?.aborted) return finish("error", "aborted");

    const requested = Number(opts?.timeoutMs);
    const timeoutMs = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_CHECK_TIMEOUT_MS;
    const controller = new AbortController();
    // Our own timer, not only the SDK timeout: the call must end on time even
    // if the request ignores its abort signal.
    const stopped = new Promise<Answer>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ status: "error", reason: "timeout" });
      }, timeoutMs);
      if (outer) {
        const onAbort = () => {
          controller.abort();
          resolve({ status: "error", reason: "aborted" });
        };
        outer.addEventListener("abort", onAbort);
        detach = () => outer.removeEventListener("abort", onAbort);
      }
    });
    const answer = await Promise.race([askClaude(apiKey, facts, imageB64, mediaType, timeoutMs, controller.signal), stopped]);
    if (answer.status === "error") return finish("error", answer.reason);
    return finish(answer.status, null, answer.failed, answer.unclear);
  } catch (e) {
    return finish("error", `unexpected_${errName(e)}`);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    detach();
  }
}

// ── initialRecord ────────────────────────────────────────────────────────────

/**
 * The visual_check record stored with a new image, before any check: skipped
 * (no_facts, safe_fallback, or disabled when VISUAL_CHECK_ENABLED is off or
 * ANTHROPIC_API_KEY is missing) or running. Store it with the image, then start
 * the background check only when needsBackgroundCheck(record). startedAt is an
 * ISO string or epoch ms. Never throws.
 */
export function initialRecord(input: {
  factsUsed?: unknown;
  safeFallback?: unknown;
  imageModel?: string | null;
  startedAt?: string | number | null;
}): VisualCheckRecord {
  return initialRecordFor({
    factsUsed: input?.factsUsed,
    safeFallback: input?.safeFallback,
    imageModel: input?.imageModel,
    startedAt: isoTime(input?.startedAt),
    disabled: checkDisabled() || !env("ANTHROPIC_API_KEY"),
    checkedAt: new Date().toISOString(),
  });
}

// ── backgroundDeadline ───────────────────────────────────────────────────────

// Module code runs once per worker, when it boots, so this is when the worker
// started. Supabase stops a worker 400s after it started and routes new requests
// to it during its first 200s, so a request on a warm worker, and the work it hands
// to EdgeRuntime.waitUntil, gets less than 400s. null: count from each request.
let workerStartedAt: number | null = Date.now();

/**
 * Epoch ms after which background work starts no check or render: 360s
 * (BACKGROUND_BUDGET_MS) after the worker started, or after invocationStart when
 * that came first. Every background deadline uses it, bulk runs included. NaN when
 * invocationStart is not a finite number.
 */
export function backgroundDeadline(invocationStart: number): number {
  const start = typeof invocationStart === "number" && workerStartedAt !== null && workerStartedAt < invocationStart
    ? workerStartedAt
    : invocationStart;
  return deadlineAfter(start);
}

/**
 * Sets when this worker started (null: unknown, so each request counts from its own
 * start) and returns the value it replaced. The module sets it once, when it
 * loads; tests call this to run requests on a fresh worker or an older one.
 */
export function setWorkerStartedAt(epochMs: number | null): number | null {
  const previous = workerStartedAt;
  workerStartedAt = typeof epochMs === "number" && Number.isFinite(epochMs) ? epochMs : null;
  return previous;
}

// ── runInBackground ──────────────────────────────────────────────────────────

/**
 * Keeps `work` alive after the response through EdgeRuntime.waitUntil when the
 * runtime has it; otherwise the work just runs on. Registers synchronously, so
 * call it before the handler returns its Response. Never throws, and the promise
 * handed over (also returned) never rejects: a failure is logged.
 */
export function runInBackground(work: unknown, log?: (line: string) => void): Promise<void> {
  const say = (line: string) => {
    try {
      if (typeof log === "function") log(line);
      else console.log(line);
    } catch {
      // logging only
    }
  };
  const settled = Promise.resolve(work).then(
    () => undefined,
    (e) => say(`[visual-check] background task failed: ${errName(e)}`),
  );
  try {
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime && typeof runtime.waitUntil === "function") runtime.waitUntil(settled);
  } catch (e) {
    say(`[visual-check] EdgeRuntime.waitUntil threw ${errName(e)}: the background task may end with the response`);
  }
  return settled;
}

// ── Render and check steps (shared by the loops) ─────────────────────────────

type RenderFn = (attemptIndex: number, signal?: AbortSignal) => Promise<RenderOutput | null>;

interface LoopEnv {
  tag: string;
  log: (line: string) => void;
  now: () => number;
  deadlineAt: number;
  facts: string[];
  signal?: AbortSignal;
}

function loopEnv(
  input: { tag?: string; log?: (line: string) => void; now?: () => number; deadlineAt?: number; facts?: string[]; signal?: AbortSignal } | null | undefined,
): LoopEnv {
  return {
    tag: typeof input?.tag === "string" && input.tag.length > 0 ? input.tag : "image",
    log: (line: string) => {
      try {
        if (typeof input?.log === "function") input.log(line);
        else console.log(line);
      } catch {
        // logging only
      }
    },
    now: typeof input?.now === "function" ? input.now : () => Date.now(),
    deadlineAt: Number(input?.deadlineAt),
    facts: Array.isArray(input?.facts) ? input.facts : [],
    signal: input?.signal,
  };
}

function short(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function skipReason(out: RenderOutput): string | null {
  return typeof out?.skipCheck === "string" && out.skipCheck.length > 0 ? out.skipCheck : null;
}

/**
 * Renders attempt `index`. stopAt (re-renders only): epoch ms at which the render
 * is abandoned. Its signal is aborted, and the race also ends a render that
 * ignores the signal. A render that fails, throws or is abandoned gives out null.
 */
async function renderAttempt(
  loop: LoopEnv,
  render: RenderFn | undefined,
  index: number,
  stopAt?: number,
): Promise<{ out: RenderOutput | null; ms: number }> {
  const { now, log, tag } = loop;
  const t0 = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let out: RenderOutput | null | "stopped";
    if (stopAt === undefined) {
      out = await (render as RenderFn)(index);
    } else {
      const controller = new AbortController();
      const stopped = new Promise<"stopped">((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve("stopped");
        }, Math.max(0, stopAt - now()));
      });
      const pending = (async () => await (render as RenderFn)(index, controller.signal))();
      // A render abandoned at stopAt may still settle later; that result is ignored.
      pending.catch(() => {});
      out = await Promise.race([pending, stopped]);
    }
    const ms = now() - t0;
    if (out === "stopped") {
      log(`[visual-check] ${tag} render attempt=${index} stopped: no time left to check it`);
      return { out: null, ms };
    }
    if (!out || typeof out.b64 !== "string" || out.b64.length === 0) return { out: null, ms };
    return { out, ms };
  } catch (e) {
    log(`[visual-check] ${tag} render attempt=${index} threw ${errName(e)}`);
    return { out: null, ms: now() - t0 };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Checks one image, never past the deadline: too late for a check to finish means skipped/deadline. */
async function checkAttempt(loop: LoopEnv, index: number, b64: string): Promise<{ check: CheckImageResult; ms: number }> {
  const { now, log, tag, deadlineAt } = loop;
  const remaining = deadlineAt - now();
  if (Number.isFinite(remaining) && remaining < MIN_CHECK_WINDOW_MS) {
    // Too late for a check to finish: never send a Claude call that must time out.
    log(`[visual-check] ${tag} attempt=${index} status=skipped reason=deadline`);
    return { check: { status: "skipped", failed: [], unclear: 0, reason: "deadline", ms: 0 }, ms: 0 };
  }
  const timeoutMs = Number.isFinite(remaining) ? Math.min(DEFAULT_CHECK_TIMEOUT_MS, remaining) : DEFAULT_CHECK_TIMEOUT_MS;
  const t0 = now();
  const check = await checkImage({ imageB64: b64, facts: loop.facts }, { timeoutMs, signal: loop.signal });
  const failedNotes = check.failed.map((f) => `"${short(f.fact)}" saw "${short(f.observed)}"`).join("; ");
  log(`[visual-check] ${tag} attempt=${index} status=${check.status}${failedNotes ? ` ${failedNotes}` : ""}`);
  return { check, ms: now() - t0 };
}

// ── renderWithVisualCheck ────────────────────────────────────────────────────

interface Attempt {
  index: number;
  out: RenderOutput;
  verdict: { failed: FailedFact[]; unclear: number };
}

/**
 * Render, check, and re-render on a clear contradiction. Resolves null only when
 * the first render fails (the caller's own failure handling then runs). Never
 * throws. Every other result is the chosen render with `model` and `record`.
 * The prompt is the caller's to keep: `render` receives the attempt index, which
 * FLUX callers add to their seed so a retry draws a different picture, and for a
 * re-render the signal that ends it. A re-render abandoned at its deadline counts
 * as render_failed: the best checked image is kept.
 */
export async function renderWithVisualCheck(input: RenderWithVisualCheckInput): Promise<CheckedRender | null> {
  const loop = loopEnv(input);
  const { now, log, tag, deadlineAt } = loop;
  const maxAttempts = Math.max(1, Math.floor(Number(input?.maxAttempts)) || 1);

  let renders = 0;
  let first: RenderOutput | null = null;
  const checked: Attempt[] = [];

  const result = (out: RenderOutput, index: number, status: VisualCheckStatus, verdict: Attempt["verdict"], reason: string | null) => {
    const model = typeof out.model === "string" ? out.model : null;
    const record = visualCheckRecord({
      status,
      attempts: renders,
      chosenAttempt: index,
      failed: verdict.failed,
      unclear: verdict.unclear,
      reason,
      imageModel: model,
      checkedAt: new Date().toISOString(),
    });
    log(
      `[visual-check] ${tag} chose attempt=${index} of ${renders} status=${status} failed=${verdict.failed.length}${reason ? ` reason=${reason}` : ""}`,
    );
    return { ...out, b64: out.b64, model, record };
  };

  const renderAt = (index: number, stopAt?: number) => {
    renders++;
    return renderAttempt(loop, input?.render, index, stopAt);
  };

  try {
    const r0 = await renderAt(0);
    if (!r0.out) return null;
    first = r0.out;

    const skip0 = skipReason(r0.out);
    if (skip0) return result(r0.out, 0, "skipped", { failed: [], unclear: 0 }, skip0);
    // NaN deadline: the comparison is false, so the image is still checked once.
    if (now() > deadlineAt - CHECK_ESTIMATE_MS) return result(r0.out, 0, "skipped", { failed: [], unclear: 0 }, "deadline");

    const c0 = await checkAttempt(loop, 0, r0.out.b64);
    // pass, skipped or error: keep this image. A failed checker never costs a render.
    if (c0.check.status !== "fail") return result(r0.out, 0, c0.check.status, c0.check, c0.check.reason);
    checked.push({ index: 0, out: r0.out, verdict: c0.check });

    // Renders vary a lot (a gpt-image-2 call can take twice as long as the one
    // before), so the next one is predicted from the slowest so far.
    let longestRenderMs = r0.ms;
    let longestCheckMs = c0.ms;
    let stop = "";
    while (!stop) {
      // Time kept for the re-render's check: the slowest check so far, and never
      // less than a check can finish in.
      const checkReserveMs = Math.max(MIN_CHECK_WINDOW_MS, longestCheckMs);
      if (!shouldRetry({ attemptsSoFar: renders, maxAttempts, now: now(), deadlineAt, lastRenderMs: longestRenderMs, lastCheckMs: checkReserveMs })) {
        stop = renders >= maxAttempts ? "max_attempts" : "deadline";
        break;
      }
      const index = renders;
      // Past deadlineAt - checkReserveMs the image could not be checked, so it
      // could not be used: the render is abandoned there.
      const r = await renderAt(index, deadlineAt - checkReserveMs);
      if (!r.out) {
        stop = "render_failed";
        break;
      }
      longestRenderMs = Math.max(longestRenderMs, r.ms);
      const skip = skipReason(r.out);
      if (skip) {
        // Unchecked (e.g. SAFE_FALLBACK, which has none of the facts): the checked image is kept.
        stop = skip;
        break;
      }
      if (deadlineAt - now() < checkReserveMs) {
        stop = "deadline";
        break;
      }
      const c = await checkAttempt(loop, index, r.out.b64);
      longestCheckMs = Math.max(longestCheckMs, c.ms);
      if (c.check.status === "pass") return result(r.out, index, "pass", c.check, null);
      if (c.check.status !== "fail") {
        // Unchecked, so it cannot be compared with the checked attempts.
        stop = `check_${c.check.status}`;
        break;
      }
      checked.push({ index, out: r.out, verdict: c.check });
    }

    const best = pickBest(checked) as Attempt;
    return result(best.out, best.index, "fail", best.verdict, stop);
  } catch (e) {
    log(`[visual-check] ${tag} loop error ${errName(e)}`);
    try {
      const best = pickBest(checked);
      if (best) return result(best.out, best.index, "fail", best.verdict, "internal");
      if (first) return result(first, 0, "error", { failed: [], unclear: 0 }, "internal");
    } catch {
      // fall through
    }
    return null;
  }
}

// ── Background checks ────────────────────────────────────────────────────────

const NO_VERDICT = { failed: [] as FailedFact[], unclear: 0 };

function indexed(out: RenderOutput | null | undefined, index: number): IndexedRender {
  const o = out && typeof out === "object" ? out : ({} as RenderOutput);
  return {
    ...o,
    b64: typeof o.b64 === "string" ? o.b64 : "",
    model: typeof o.model === "string" && o.model.length > 0 ? o.model : null,
    index,
  };
}

/** Calls writeRecord once. A false result or a throw is logged and not retried. */
async function storeRecord(loop: LoopEnv, write: unknown, record: VisualCheckRecord, stored?: IndexedRender): Promise<void> {
  const what = `status=${record.status}`;
  if (typeof write !== "function") {
    loop.log(`[visual-check] ${loop.tag} record ${what} not stored: no writeRecord`);
    return;
  }
  try {
    const ok = await (write as WriteRecord)(record, stored);
    if (ok === false) loop.log(`[visual-check] ${loop.tag} record ${what} not stored: writeRecord returned false`);
  } catch (e) {
    loop.log(`[visual-check] ${loop.tag} record ${what} not stored: writeRecord threw ${errName(e)}`);
  }
}

/**
 * Flag only. Checks the stored image once and stores the result with
 * writeRecord (attempts 1, chosen_attempt 0, started_at kept). Never renders and
 * never rejects: a check too close to deadlineAt is skipped/deadline, a checker
 * failure is recorded as error. Resolves with the record it tried to store.
 */
export async function checkInBackground(input: CheckInBackgroundInput): Promise<VisualCheckRecord> {
  const loop = loopEnv(input);
  const { now, log, tag, deadlineAt } = loop;
  const startedAt = isoTime(input?.startedAt);
  const imageModel = typeof input?.imageModel === "string" ? input.imageModel : null;
  const build = (status: VisualCheckStatus, reason: string | null, verdict: { failed: FailedFact[]; unclear: number } = NO_VERDICT) =>
    visualCheckRecord({
      status,
      attempts: 1,
      chosenAttempt: 0,
      failed: verdict.failed,
      unclear: verdict.unclear,
      reason,
      imageModel,
      checkedAt: new Date().toISOString(),
      startedAt,
    });

  let record: VisualCheckRecord;
  try {
    // NaN deadline: the comparison is false, so the image is still checked once.
    if (now() > deadlineAt - CHECK_ESTIMATE_MS) {
      log(`[visual-check] ${tag} attempt=0 status=skipped reason=deadline`);
      record = build("skipped", "deadline");
    } else {
      const { check } = await checkAttempt(loop, 0, typeof input?.b64 === "string" ? input.b64 : "");
      record = build(check.status, check.reason, check);
    }
  } catch (e) {
    log(`[visual-check] ${tag} background check error ${errName(e)}`);
    record = build("error", "internal");
  }
  log(`[visual-check] ${tag} background check status=${record.status} failed=${record.failed.length}${record.reason ? ` reason=${record.reason}` : ""}`);
  await storeRecord(loop, input?.writeRecord, record);
  return record;
}

/**
 * Checks the stored image (attempt 0) and, while it clearly contradicts a fact,
 * re-renders (attempts 1, 2 ...) as long as maxAttempts and deadlineAt allow a
 * render plus its check. A re-render strictly better than the stored image (fewer
 * failed facts, or a pass) is offered to swap() with the record describing it;
 * only a swap that returns true makes it the stored image, and any other outcome
 * ends the loop with no further render. The loop also ends once the stored image
 * passes, and when stillCurrent answers false before a re-render or before its
 * check (reason row_changed). A checker error or skip on the first image renders
 * nothing. Finally writeRecord stores the record of whichever image is stored
 * (attempts = renders made, the request's first included; chosen_attempt = its
 * index). Never rejects.
 */
export async function redoInBackground(input: RedoInBackgroundInput): Promise<VisualCheckRecord> {
  const loop = loopEnv(input);
  const { now, log, tag, deadlineAt } = loop;
  const maxAttempts = Math.max(1, Math.floor(Number(input?.maxAttempts)) || 1);
  const startedAt = isoTime(input?.startedAt);

  // The request's render is attempt 0: it counts as a render.
  let renders = 1;
  let stored = indexed(input?.first, 0);
  let storedVerdict: { failed: FailedFact[]; unclear: number } | null = null;

  // True only when input.stillCurrent answers exactly false: the row was reviewed or
  // its image replaced, so `skipped` (the next render or check) is not paid for.
  const rowChanged = async (skipped: string): Promise<boolean> => {
    const stillCurrent = input?.stillCurrent;
    if (typeof stillCurrent !== "function") return false;
    try {
      if ((await stillCurrent()) !== false) return false;
    } catch (e) {
      log(`[visual-check] ${tag} stillCurrent threw ${errName(e)}: carrying on`);
      return false;
    }
    log(`[visual-check] ${tag} the row changed (reviewed or replaced): ${skipped}`);
    return true;
  };

  const recordFor = (image: IndexedRender, status: VisualCheckStatus, verdict: { failed: FailedFact[]; unclear: number }, reason: string | null) =>
    visualCheckRecord({
      status,
      attempts: renders,
      chosenAttempt: image.index,
      failed: verdict.failed,
      unclear: verdict.unclear,
      reason,
      imageModel: image.model,
      checkedAt: new Date().toISOString(),
      startedAt,
    });

  const finish = async (record: VisualCheckRecord): Promise<VisualCheckRecord> => {
    log(
      `[visual-check] ${tag} background kept attempt=${stored.index} of ${renders} status=${record.status} failed=${record.failed.length}${record.reason ? ` reason=${record.reason}` : ""}`,
    );
    await storeRecord(loop, input?.writeRecord, record, stored);
    return record;
  };

  try {
    const skip0 = skipReason(stored);
    if (skip0) return await finish(recordFor(stored, "skipped", NO_VERDICT, skip0));
    // NaN deadline: the comparison is false, so the image is still checked once.
    if (now() > deadlineAt - CHECK_ESTIMATE_MS) {
      log(`[visual-check] ${tag} attempt=0 status=skipped reason=deadline`);
      return await finish(recordFor(stored, "skipped", NO_VERDICT, "deadline"));
    }
    const c0 = await checkAttempt(loop, 0, stored.b64);
    // pass, skipped or error: the stored image stays and nothing is rendered.
    if (c0.check.status !== "fail") return await finish(recordFor(stored, c0.check.status, c0.check, c0.check.reason));
    storedVerdict = c0.check;

    let longestRenderMs = RENDER_ESTIMATE_MS;
    let longestCheckMs = c0.ms;
    let passed = false;
    let stop = "";
    while (!stop) {
      const checkReserveMs = Math.max(MIN_CHECK_WINDOW_MS, longestCheckMs);
      if (!shouldRetry({ attemptsSoFar: renders, maxAttempts, now: now(), deadlineAt, lastRenderMs: longestRenderMs, lastCheckMs: checkReserveMs })) {
        stop = renders >= maxAttempts ? "max_attempts" : "deadline";
        break;
      }
      // A post reviewed or regenerated meanwhile would refuse the swap anyway.
      if (await rowChanged(`no re-render after attempt=${stored.index}`)) {
        stop = "row_changed";
        break;
      }
      const index = renders;
      renders++;
      // Abandoned at deadlineAt - checkReserveMs, where its check could no longer start.
      const r = await renderAttempt(loop, input?.render, index, deadlineAt - checkReserveMs);
      if (!r.out) {
        stop = "render_failed";
        break;
      }
      longestRenderMs = Math.max(longestRenderMs, r.ms);
      const skip = skipReason(r.out);
      if (skip) {
        // Unchecked (e.g. SAFE_FALLBACK, which has none of the facts): never swapped in.
        stop = skip;
        break;
      }
      if (deadlineAt - now() < checkReserveMs) {
        stop = "deadline";
        break;
      }
      if (await rowChanged(`attempt=${index} is not checked`)) {
        stop = "row_changed";
        break;
      }
      const c = await checkAttempt(loop, index, r.out.b64);
      longestCheckMs = Math.max(longestCheckMs, c.ms);
      if (c.check.status !== "pass" && c.check.status !== "fail") {
        // Unchecked, so it cannot be compared with the stored image.
        stop = `check_${c.check.status}`;
        break;
      }
      if (c.check.status === "fail" && c.check.failed.length >= storedVerdict.failed.length) {
        log(`[visual-check] ${tag} attempt=${index} failed=${c.check.failed.length} is not better than stored attempt=${stored.index} failed=${storedVerdict.failed.length}`);
        continue;
      }
      const attempt = indexed(r.out, index);
      let swapped = false;
      try {
        swapped = (await input.swap(attempt, recordFor(attempt, c.check.status, c.check, null))) === true;
      } catch (e) {
        log(`[visual-check] ${tag} attempt=${index} swap threw ${errName(e)}`);
      }
      if (!swapped) {
        // The row was reviewed or changed (or the new image could not be stored): stop here.
        log(`[visual-check] ${tag} attempt=${index} not swapped in: the row keeps attempt=${stored.index}`);
        stop = "swap_failed";
        break;
      }
      stored = attempt;
      storedVerdict = c.check;
      if (c.check.status === "pass") {
        passed = true;
        break;
      }
    }
    if (passed) return await finish(recordFor(stored, "pass", storedVerdict, null));
    return await finish(recordFor(stored, "fail", storedVerdict, stop));
  } catch (e) {
    log(`[visual-check] ${tag} background loop error ${errName(e)}`);
    const record = storedVerdict ? recordFor(stored, "fail", storedVerdict, "internal") : recordFor(stored, "error", NO_VERDICT, "internal");
    await storeRecord(loop, input?.writeRecord, record, stored);
    return record;
  }
}
