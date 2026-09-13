// Visual check: IO wrapper around visualCheckCore.ts.
//
// checkImage() asks Claude vision whether a rendered painting shows the research
// facts that went into its prompt. It NEVER throws: a missing key, an unknown or
// oversized image, an API error, a timeout, a refusal or a missing tool call all
// resolve with "skipped" or "error", and the caller keeps the image.
//
// renderWithVisualCheck() renders, checks, and re-renders while a fact is clearly
// contradicted ("no"), attempts remain and the deadline allows another render
// plus check. It keeps the image with the fewest failed facts. A checker that
// fails ("error") never costs another render: the image is kept as it is.
// A re-render gets an abort signal and may not run past the point where its
// check could still start: a slow one is abandoned and the checked image kept,
// so a request is never cut at 150s holding an image it could have stored.
//
// Kill switch: VISUAL_CHECK_ENABLED=false skips the check (and so every re-render).

// Pinned: an unpinned specifier resolves to whatever is newest at deploy time,
// and a function that fails to boot blocks image generation outright.
import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";
import {
  buildVisualCheckParams,
  detectImageMediaType,
  type FailedFact,
  MAX_CHECK_IMAGE_B64_CHARS,
  parseVisualCheck,
  pickBest,
  shouldRetry,
  verdictFor,
  visualCheckRecord,
  type VisualCheckRecord,
  type VisualCheckStatus,
} from "./visualCheckCore.ts";

// One import site for integrators: imagePayload, record builder, types.
export * from "./visualCheckCore.ts";

const DEFAULT_CHECK_TIMEOUT_MS = 40_000;
const MIN_SDK_TIMEOUT_MS = 1_000;
/** Before any check has run, a check is assumed to take this long. */
export const CHECK_ESTIMATE_MS = 20_000;
/** A check is never started with less time than this before the deadline: it could not finish. */
export const MIN_CHECK_WINDOW_MS = 10_000;

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

// ── renderWithVisualCheck ────────────────────────────────────────────────────

interface Attempt {
  index: number;
  out: RenderOutput;
  verdict: { failed: FailedFact[]; unclear: number };
}

function short(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
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
  const now = typeof input?.now === "function" ? input.now : () => Date.now();
  const log = (line: string) => {
    try {
      if (typeof input?.log === "function") input.log(line);
      else console.log(line);
    } catch {
      // logging only
    }
  };
  const tag = typeof input?.tag === "string" && input.tag.length > 0 ? input.tag : "image";
  const maxAttempts = Math.max(1, Math.floor(Number(input?.maxAttempts)) || 1);
  const deadlineAt = Number(input?.deadlineAt);
  const facts = Array.isArray(input?.facts) ? input.facts : [];

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

  // stopAt (re-renders only): epoch ms at which the render is abandoned. Its
  // signal is aborted, and the race also ends a render that ignores the signal.
  const renderAt = async (index: number, stopAt?: number): Promise<{ out: RenderOutput | null; ms: number }> => {
    renders++;
    const t0 = now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let out: RenderOutput | null | "stopped";
      if (stopAt === undefined) {
        out = await input.render(index);
      } else {
        const controller = new AbortController();
        const stopped = new Promise<"stopped">((resolve) => {
          timer = setTimeout(() => {
            controller.abort();
            resolve("stopped");
          }, Math.max(0, stopAt - now()));
        });
        const pending = (async () => await input.render(index, controller.signal))();
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
  };

  const skipReason = (out: RenderOutput): string | null =>
    typeof out.skipCheck === "string" && out.skipCheck.length > 0 ? out.skipCheck : null;

  const checkAt = async (index: number, b64: string): Promise<{ check: CheckImageResult; ms: number }> => {
    const remaining = deadlineAt - now();
    if (Number.isFinite(remaining) && remaining < MIN_CHECK_WINDOW_MS) {
      // Too late for a check to finish: never send a Claude call that must time out.
      log(`[visual-check] ${tag} attempt=${index} status=skipped reason=deadline`);
      return { check: { status: "skipped", failed: [], unclear: 0, reason: "deadline", ms: 0 }, ms: 0 };
    }
    const timeoutMs = Number.isFinite(remaining) ? Math.min(DEFAULT_CHECK_TIMEOUT_MS, remaining) : DEFAULT_CHECK_TIMEOUT_MS;
    const t0 = now();
    const check = await checkImage({ imageB64: b64, facts }, { timeoutMs, signal: input?.signal });
    const failedNotes = check.failed.map((f) => `"${short(f.fact)}" saw "${short(f.observed)}"`).join("; ");
    log(`[visual-check] ${tag} attempt=${index} status=${check.status}${failedNotes ? ` ${failedNotes}` : ""}`);
    return { check, ms: now() - t0 };
  };

  try {
    const r0 = await renderAt(0);
    if (!r0.out) return null;
    first = r0.out;

    const skip0 = skipReason(r0.out);
    if (skip0) return result(r0.out, 0, "skipped", { failed: [], unclear: 0 }, skip0);
    // NaN deadline: the comparison is false, so the image is still checked once.
    if (now() > deadlineAt - CHECK_ESTIMATE_MS) return result(r0.out, 0, "skipped", { failed: [], unclear: 0 }, "deadline");

    const c0 = await checkAt(0, r0.out.b64);
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
      const c = await checkAt(index, r.out.b64);
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
