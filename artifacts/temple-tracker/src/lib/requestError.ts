// Why this file exists: over HTTP/2 `Response.statusText` is ALWAYS the empty
// string, so the usual `data?.error || res.statusText` renders a bare
// "Regenerate failed:" with no reason whenever the body carries no `error` key.
// That is exactly what a failure from the edge gateway looks like rather than
// from our own code: a 546 worker-limit kill answers with the gateway's own
// {code, message} shape, and a dropped connection answers with no JSON at all.
//
// Every failure message on the admin pages goes through here, so the reader is
// always told something — the server's own words when it sent any, and what the
// status code means when it did not.

/** Where a server — ours, PostgREST, or the gateway — may put the reason. */
const REASON_KEYS = ["error", "message", "msg", "error_description", "detail", "hint", "code"] as const;

/** What a status code means, in the reader's terms, when the body said nothing. */
const STATUS_NOTES: Record<number, string> = {
  400: "the server rejected the request.",
  401: "the request was not authorised.",
  403: "the server refused the request.",
  404: "that endpoint was not found.",
  408: "the server took too long to answer.",
  409: "something else changed this row first — refresh and look again.",
  413: "the request was too large.",
  429: "too many requests at once — wait a moment before trying again.",
  500: "the server hit an unhandled error.",
  502: "the connection to the server dropped mid-request.",
  503: "the server is unavailable right now.",
  504: "the server took too long to answer. Refresh — the work may have finished anyway.",
  // Supabase edge runtime: the worker was killed for exceeding its memory, CPU
  // or wall-clock budget. Starting several renders at once is what does it.
  546: "the server worker ran out of its budget, which happens when several renders run at once. Refresh — this one may have been saved before it was cut off — and start the next ones a couple at a time.",
};

const MAX_REASON_CHARS = 300;

/** The first meaningful line of a text body, or "" for HTML and blank text. */
function fromText(text: string): string {
  const trimmed = text.trim();
  // An HTML error page says nothing a reader can use; the status note is better.
  if (!trimmed || trimmed.startsWith("<")) return "";
  const line = trimmed.split("\n")[0].trim();
  return line.length > MAX_REASON_CHARS ? `${line.slice(0, MAX_REASON_CHARS)}…` : line;
}

/** The reason a body states, if it states one. Looks one level into nested errors. */
export function reasonFromBody(body: unknown, depth = 0): string {
  if (typeof body === "string") return fromText(body);
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  for (const key of REASON_KEYS) {
    const value = record[key];
    if (typeof value === "string") {
      const text = fromText(value);
      if (text) return text;
    }
    // Together and the Anthropic SDK nest it: { error: { message } }.
    if (value && typeof value === "object" && depth < 1) {
      const nested = reasonFromBody(value, depth + 1);
      if (nested) return nested;
    }
  }
  return "";
}

/**
 * A reason for a failed request that is never empty: the server's own words when
 * it sent any, otherwise the status code and what it means.
 */
export function describeFailure(status: number, body?: unknown): string {
  const reason = reasonFromBody(body);
  if (reason) return reason;
  if (!status || !Number.isFinite(status)) return "the browser never got a response from the server.";
  // A 2xx reaches here when the body came back without the result the caller
  // needed (no `ok`, no `success`), which "HTTP 200" would describe uselessly.
  if (status >= 200 && status < 300) return "the server answered without a result — refresh and look again.";
  const note = STATUS_NOTES[status];
  return note ? `HTTP ${status} — ${note}` : `HTTP ${status}`;
}

/** The same, for a thrown value (a dropped connection reaches the catch, not the body). */
export function describeThrown(err: unknown): string {
  const message = err instanceof Error ? err.message.trim() : String(err ?? "").trim();
  const offline = /failed to fetch|load failed|networkerror|network error/i.test(message);
  if (!message) return "the request failed before the server answered.";
  return offline ? `${message} — the browser could not reach the server.` : message;
}
