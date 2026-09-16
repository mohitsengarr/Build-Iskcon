// Together render failures: which ones are worth another post, and what the
// reviewer is told when a whole chain fails.
//
// On 2026-09-16 (03:10-03:16 UTC) a reviewer clicked Regenerate on several
// gallery cards while a bulk run was going. Together answered "HTTP 429: Too
// many requests in a short window" on black-forest-labs/FLUX.2-pro and, seconds
// later, on the black-forest-labs/FLUX.1.1-pro fallback; other cards got "HTTP
// 400: Invalid content detected ... rejected by Black Forest Labs's content
// moderation system" and "HTTP 422: image may contain NSFW content". Every
// attempt in the chain failed, so the gallery alerted "Regenerate failed: All
// image attempts failed" for both — one sentence, no hint of which.
//
// The two need different handling. A 429 is transient: the same request goes
// through a few seconds later, so it is worth waiting and posting again before
// the chain gives up on that model. A moderation refusal is not: the same prompt
// is refused again however long we wait, so the prompt has to change and the
// reviewer has to be told that.
//
// Pure apart from the retry wait: the caller's request() does the fetch, this
// module has no Deno globals and no IO of its own, so node tests import it
// directly and setSleepForTests keeps them instant.

/** Why one Together post failed: worth another post, refused outright, or neither. */
export type TogetherFailure = "rate_limited" | "refused" | "error";

/** The wording Black Forest Labs's moderation uses, across the 400 and the 422. */
const REFUSAL_BODY = /nsfw|moderation|invalid content|flagged/i;

const RATE_LIMITED_MESSAGE =
  "Image generation is rate limited right now (Together HTTP 429): too many renders at once. Wait a minute and try again.";
const REFUSED_MESSAGE = "The image model refused this prompt (content moderation). Edit the prompt and try again.";

/**
 * What a non-2xx Together answer means. 429 and every 5xx are "rate_limited"
 * (the request itself is fine, the service is not; Together's own overload
 * answers are 5xx). A 400 or 422 whose body names moderation is "refused" — 400
 * and 422 also carry ordinary bad-request errors, so the body decides, not the
 * status. Anything else is "error": a key, a model name or a size we should not
 * keep re-posting.
 */
export function classifyTogetherFailure(status: number, body: string): TogetherFailure {
  const code = Math.floor(Number(status));
  if (!Number.isFinite(code)) return "error";
  if (code === 429 || (code >= 500 && code <= 599)) return "rate_limited";
  if ((code === 400 || code === 422) && REFUSAL_BODY.test(String(body ?? ""))) return "refused";
  return "error";
}

// Long enough for a short Together window to clear, short enough that three
// posts still fit inside one request: a gallery Regenerate is a person waiting.
const BACKOFF_MS = [2500, 6000];

/** How long to wait before re-posting attempt `attempt`, or null when it is not re-posted. */
export function backoffMs(attempt: number): number | null {
  const i = Math.floor(Number(attempt));
  if (!Number.isFinite(i) || i < 0) return null;
  return i < BACKOFF_MS.length ? BACKOFF_MS[i] : null;
}

/**
 * The message for a render chain where every attempt failed. One rate-limited
 * attempt anywhere in the chain wins: it is the cause the reviewer can act on
 * (wait and click again), and a chain that got a 429 on its first model has
 * usually got one on the fallback too. Otherwise a refusal names itself, so the
 * reviewer edits the prompt instead of clicking Regenerate at it. With neither,
 * the caller's own sentence stands.
 */
export function renderFailureMessage(failures: Array<TogetherFailure | null | undefined>, fallback: string): string {
  const list = Array.isArray(failures) ? failures : [];
  if (list.includes("rate_limited")) return RATE_LIMITED_MESSAGE;
  if (list.includes("refused")) return REFUSED_MESSAGE;
  return fallback;
}

type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let sleep: Sleep = realSleep;

/**
 * Replaces the wait between retries and returns the wait it replaced. Nothing in
 * production calls it; tests use it to record the waits a chain asked for
 * without spending them.
 */
export function setSleepForTests(fn?: ((ms: number) => Promise<void>) | null): (ms: number) => Promise<void> {
  const previous = sleep;
  sleep = typeof fn === "function" ? fn : realSleep;
  return previous;
}

/**
 * One Together attempt, re-posted while it is rate limited: at most 3 posts
 * (backoffMs runs out), and only for "rate_limited" — a refusal or an error is
 * handed back after the first post.
 *
 * Never throws, so a caller's attempt chain is never cut short by one bad post.
 * A request that throws, and a 2xx body that will not parse, come back as
 * "error" through onError; a caller that used to let those escape rethrows it
 * from there. onFailure gets the status, the first 200 characters of the body,
 * the failure and whether another post follows, so each function logs it in its
 * own words. A signal that has aborted (the visual check gave up on this
 * re-render) stops the retry rather than paying for a render nobody is waiting
 * for.
 */
export async function renderWithRetry(opts: {
  /** Posts one render to Together. Called again only while the attempt is rate limited. */
  request: () => Promise<Response>;
  onFailure?: (status: number, body: string, failure: TogetherFailure, willRetry: boolean) => void;
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
}): Promise<{ b64: string | null; failure: TogetherFailure | null }> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await opts.request();
    } catch (e) {
      opts.onError?.(e);
      return { b64: null, failure: "error" };
    }

    if (res.ok) {
      try {
        const b64 = (await res.json())?.data?.[0]?.b64_json || null;
        // A 2xx with no image is as useless as a failure, and re-posting it has
        // never helped: the chain moves on to the next model.
        return { b64, failure: b64 ? null : "error" };
      } catch (e) {
        opts.onError?.(e);
        return { b64: null, failure: "error" };
      }
    }

    const text = await res.text().catch(() => "");
    const failure = classifyTogetherFailure(res.status, text);
    const wait = failure === "rate_limited" ? backoffMs(attempt) : null;
    const willRetry = wait !== null && !opts.signal?.aborted;
    opts.onFailure?.(res.status, text.slice(0, 200), failure, willRetry);
    if (!willRetry) return { b64: null, failure };
    await sleep(wait);
    // The check can give up while we wait; that render is no longer wanted.
    if (opts.signal?.aborted) return { b64: null, failure };
  }
}
