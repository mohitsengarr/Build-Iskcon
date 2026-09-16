// Unit tests for the Together retry rules (_shared/togetherRetry.ts), used by
// every render function: generate-gita-chapter-art, generate-scene-image,
// regenerate-chapter-art, regenerate-pending-image, instagram-post,
// bulk-generate-images, bulk-generate-chapter-art and bulk-generate-chaitanya-art.
//
// The bodies below are the ones Together actually sent on 2026-09-16 03:10-03:16
// UTC, when a reviewer clicked Regenerate while a bulk run was going.
// setSleepForTests replaces the wait between retries, so a chain that asks for
// 2.5s and 6s costs nothing here and the waits it asked for are asserted.
// Run: node --experimental-strip-types --test tests/
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  backoffMs,
  classifyTogetherFailure,
  renderFailureMessage,
  renderWithRetry,
  setSleepForTests,
  type TogetherFailure,
} from "../supabase/functions/_shared/togetherRetry.ts";

const RATE_LIMIT_BODY =
  "HTTP 429: Too many requests in a short window. Our rate limits are dynamic and depend on the current load of the model.";
const MODERATION_BODY =
  "HTTP 400: Invalid content detected. The generated content was flagged and rejected by Black Forest Labs's content moderation system";
const NSFW_BODY = "HTTP 422: image may contain NSFW content";
const RATE_LIMITED_MESSAGE =
  "Image generation is rate limited right now (Together HTTP 429): too many renders at once. Wait a minute and try again.";
const REFUSED_MESSAGE = "The image model refused this prompt (content moderation). Edit the prompt and try again.";

describe("classifyTogetherFailure", () => {
  test("429 is rate limited, whatever the body says", () => {
    // Arrange / Act / Assert
    assert.equal(classifyTogetherFailure(429, RATE_LIMIT_BODY), "rate_limited");
    assert.equal(classifyTogetherFailure(429, ""), "rate_limited");
  });

  test("a 5xx is rate limited too: the request is fine, the service is not", () => {
    assert.equal(classifyTogetherFailure(500, "internal error"), "rate_limited");
    assert.equal(classifyTogetherFailure(503, "busy"), "rate_limited");
  });

  test("boundary: 499 and 600 are not 5xx, 500 and 599 are", () => {
    assert.equal(classifyTogetherFailure(499, ""), "error");
    assert.equal(classifyTogetherFailure(500, ""), "rate_limited");
    assert.equal(classifyTogetherFailure(599, ""), "rate_limited");
    assert.equal(classifyTogetherFailure(600, ""), "error");
  });

  test("the two moderation answers are refusals: the 400 from Black Forest Labs and the 422 NSFW one", () => {
    assert.equal(classifyTogetherFailure(400, MODERATION_BODY), "refused");
    assert.equal(classifyTogetherFailure(422, NSFW_BODY), "refused");
  });

  test("a 400 that is not about moderation is a plain error, so the prompt is not blamed", () => {
    assert.equal(classifyTogetherFailure(400, "model not found: black-forest-labs/FLUX.9"), "error");
    assert.equal(classifyTogetherFailure(422, "width must be a multiple of 32"), "error");
  });

  test("negative: an auth or route problem is an error, not something to re-post", () => {
    assert.equal(classifyTogetherFailure(401, "Invalid API key provided"), "error");
    assert.equal(classifyTogetherFailure(404, "Not Found"), "error");
  });

  test("negative: a status that is not a number, and a body that is not a string, still classify", () => {
    assert.equal(classifyTogetherFailure(Number.NaN, MODERATION_BODY), "error");
    assert.equal(classifyTogetherFailure(400, undefined as unknown as string), "error");
    assert.equal(classifyTogetherFailure(429, undefined as unknown as string), "rate_limited");
  });
});

describe("backoffMs", () => {
  test("two waits and then no more: 2.5s, 6s, null — at most three posts per attempt", () => {
    assert.equal(backoffMs(0), 2500);
    assert.equal(backoffMs(1), 6000);
    assert.equal(backoffMs(2), null);
    assert.equal(backoffMs(3), null);
  });

  test("negative: a negative or non-finite attempt number never waits", () => {
    assert.equal(backoffMs(-1), null);
    assert.equal(backoffMs(Number.NaN), null);
    assert.equal(backoffMs(Number.POSITIVE_INFINITY), null);
  });
});

describe("renderFailureMessage", () => {
  test("one rate-limited attempt anywhere in the chain wins: the reviewer is told to wait and try again", () => {
    assert.equal(renderFailureMessage(["refused", "rate_limited"], "All image attempts failed"), RATE_LIMITED_MESSAGE);
    assert.equal(renderFailureMessage(["rate_limited", "error"], "All image attempts failed"), RATE_LIMITED_MESSAGE);
  });

  test("with no rate limit, a refusal names itself so the reviewer edits the prompt", () => {
    assert.equal(renderFailureMessage(["error", "refused"], "All image attempts failed"), REFUSED_MESSAGE);
  });

  test("plain errors, an empty chain and a chain of nothings keep the caller's own sentence", () => {
    assert.equal(renderFailureMessage(["error", "error"], "All FLUX attempts failed"), "All FLUX attempts failed");
    assert.equal(renderFailureMessage([], "All image attempts failed for chapter 1"), "All image attempts failed for chapter 1");
    assert.equal(renderFailureMessage([null, undefined], "All FLUX attempts failed"), "All FLUX attempts failed");
  });

  test("negative: a chain that is not an array keeps the fallback", () => {
    assert.equal(renderFailureMessage(null as unknown as TogetherFailure[], "All image attempts failed"), "All image attempts failed");
  });
});

describe("renderWithRetry", () => {
  /** Every wait the chain asked for, in order; the sleep itself costs nothing. */
  let waits: number[] = [];
  const previousSleep = setSleepForTests(async (ms: number) => {
    waits.push(ms);
  });

  after(() => {
    setSleepForTests(previousSleep);
  });

  beforeEach(() => {
    waits = [];
  });

  const image = (b64: string) => Response.json({ data: [{ b64_json: b64 }] });
  const failed = (status: number, body: string) => new Response(body, { status });

  /** Answers post n (1-based) with answers[n - 1]; the last answer repeats. */
  function poster(answers: Array<Response | (() => Response) | Error>) {
    const posts: number[] = [];
    const request = () => {
      posts.push(posts.length + 1);
      const answer = answers[Math.min(posts.length - 1, answers.length - 1)];
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(typeof answer === "function" ? answer() : answer);
    };
    return { request, posts: () => posts.length };
  }

  /** The onFailure calls as [status, body, failure, willRetry]. */
  function reporter() {
    const seen: Array<[number, string, TogetherFailure, boolean]> = [];
    const errors: unknown[] = [];
    return {
      seen,
      errors,
      onFailure: (status: number, body: string, failure: TogetherFailure, willRetry: boolean) => {
        seen.push([status, body, failure, willRetry]);
      },
      onError: (e: unknown) => {
        errors.push(e);
      },
    };
  }

  test("an image on the first post is returned with no failure, one post and no wait", async () => {
    // Arrange
    const p = poster([image("AAAA")]);
    const r = reporter();
    // Act
    const out = await renderWithRetry({ request: p.request, onFailure: r.onFailure, onError: r.onError });
    // Assert
    assert.deepEqual(out, { b64: "AAAA", failure: null });
    assert.equal(p.posts(), 1);
    assert.deepEqual(waits, []);
    assert.deepEqual(r.seen, []);
  });

  test("a 429 followed by an image waits once and returns the image: the same request goes through seconds later", async () => {
    // Arrange
    const p = poster([failed(429, RATE_LIMIT_BODY), image("BBBB")]);
    const r = reporter();
    // Act
    const out = await renderWithRetry({ request: p.request, onFailure: r.onFailure, onError: r.onError });
    // Assert
    assert.deepEqual(out, { b64: "BBBB", failure: null });
    assert.equal(p.posts(), 2);
    assert.deepEqual(waits, [2500]);
    assert.deepEqual(r.seen, [[429, RATE_LIMIT_BODY, "rate_limited", true]]);
  });

  test("a 429 every time stops after three posts and two waits, with failure rate_limited", async () => {
    // Arrange
    const p = poster([failed(429, RATE_LIMIT_BODY)]);
    const r = reporter();
    // Act
    const out = await renderWithRetry({ request: p.request, onFailure: r.onFailure, onError: r.onError });
    // Assert
    assert.deepEqual(out, { b64: null, failure: "rate_limited" });
    assert.equal(p.posts(), 3);
    assert.deepEqual(waits, [2500, 6000]);
    assert.deepEqual(r.seen.map((s) => s[3]), [true, true, false], "the last line says it is not retrying");
  });

  test("a 5xx is retried the same way as a 429", async () => {
    const p = poster([failed(503, "busy"), image("CCCC")]);
    const out = await renderWithRetry({ request: p.request });
    assert.deepEqual(out, { b64: "CCCC", failure: null });
    assert.equal(p.posts(), 2);
    assert.deepEqual(waits, [2500]);
  });

  test("a 422 NSFW refusal is not re-posted: one post, no wait, failure refused", async () => {
    // Arrange
    const p = poster([failed(422, NSFW_BODY)]);
    const r = reporter();
    // Act
    const out = await renderWithRetry({ request: p.request, onFailure: r.onFailure, onError: r.onError });
    // Assert
    assert.deepEqual(out, { b64: null, failure: "refused" });
    assert.equal(p.posts(), 1);
    assert.deepEqual(waits, []);
    assert.deepEqual(r.seen, [[422, NSFW_BODY, "refused", false]]);
  });

  test("the 400 moderation refusal is not re-posted either", async () => {
    const p = poster([failed(400, MODERATION_BODY)]);
    const out = await renderWithRetry({ request: p.request });
    assert.deepEqual(out, { b64: null, failure: "refused" });
    assert.equal(p.posts(), 1);
    assert.deepEqual(waits, []);
  });

  test("a request that throws is an error through onError, not a throw of its own", async () => {
    // Arrange
    const boom = new TypeError("network down");
    const p = poster([boom]);
    const r = reporter();
    // Act
    const out = await renderWithRetry({ request: p.request, onFailure: r.onFailure, onError: r.onError });
    // Assert
    assert.deepEqual(out, { b64: null, failure: "error" });
    assert.equal(p.posts(), 1);
    assert.deepEqual(r.errors, [boom]);
    assert.deepEqual(r.seen, []);
    assert.deepEqual(waits, []);
  });

  test("a 2xx with no b64_json is an error, and the chain is free to move to the next model", async () => {
    // Arrange
    const p = poster([Response.json({ data: [] })]);
    const r = reporter();
    // Act
    const out = await renderWithRetry({ request: p.request, onFailure: r.onFailure, onError: r.onError });
    // Assert
    assert.deepEqual(out, { b64: null, failure: "error" });
    assert.equal(p.posts(), 1);
    assert.deepEqual(r.errors, [], "a well-formed answer with no image is not an exception");
  });

  test("a 2xx body that will not parse is an error through onError", async () => {
    // Arrange
    const p = poster([new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } })]);
    const r = reporter();
    // Act
    const out = await renderWithRetry({ request: p.request, onFailure: r.onFailure, onError: r.onError });
    // Assert
    assert.deepEqual(out, { b64: null, failure: "error" });
    assert.equal(r.errors.length, 1);
  });

  test("an aborted signal stops the retry: one post for a 429 that would otherwise be re-sent", async () => {
    // Arrange
    const p = poster([failed(429, RATE_LIMIT_BODY)]);
    const r = reporter();
    const signal = AbortSignal.abort();
    // Act
    const out = await renderWithRetry({ request: p.request, onFailure: r.onFailure, onError: r.onError, signal });
    // Assert
    assert.deepEqual(out, { b64: null, failure: "rate_limited" });
    assert.equal(p.posts(), 1);
    assert.deepEqual(waits, []);
    assert.deepEqual(r.seen, [[429, RATE_LIMIT_BODY, "rate_limited", false]]);
  });

  test("a signal that aborts during the wait stops before the next post", async () => {
    // Arrange
    const ctrl = new AbortController();
    const restore = setSleepForTests(async (ms: number) => {
      waits.push(ms);
      ctrl.abort();
    });
    const p = poster([failed(429, RATE_LIMIT_BODY)]);
    // Act
    const out = await renderWithRetry({ request: p.request, signal: ctrl.signal });
    setSleepForTests(restore);
    // Assert
    assert.deepEqual(out, { b64: null, failure: "rate_limited" });
    assert.equal(p.posts(), 1, "the render is no longer wanted, so it is not paid for");
    assert.deepEqual(waits, [2500]);
  });

  test("the reported body is the first 200 characters, so a long error page never fills the log", async () => {
    // Arrange
    const long = "x".repeat(500);
    const p = poster([failed(400, long)]);
    const r = reporter();
    // Act
    await renderWithRetry({ request: p.request, onFailure: r.onFailure });
    // Assert
    assert.equal(r.seen[0][1].length, 200);
  });

  test("onFailure and onError are optional: a chain with neither still answers", async () => {
    const p = poster([failed(429, RATE_LIMIT_BODY)]);
    assert.deepEqual(await renderWithRetry({ request: p.request }), { b64: null, failure: "rate_limited" });
    assert.equal(p.posts(), 3);
  });
});

describe("togetherRetry.ts purity and wiring", () => {
  const FUNCTIONS = [
    "generate-gita-chapter-art",
    "generate-scene-image",
    "regenerate-chapter-art",
    "regenerate-pending-image",
    "instagram-post",
    "bulk-generate-images",
    "bulk-generate-chapter-art",
    "bulk-generate-chaitanya-art",
  ];

  test("imports nothing and touches no Deno global, so it runs under node and Deno alike", () => {
    const src = readFileSync(new URL("../supabase/functions/_shared/togetherRetry.ts", import.meta.url), "utf8");
    assert.equal(/^\s*import\s/m.test(src), false);
    assert.equal(/\bDeno\./.test(src), false);
  });

  test("every render function posts through renderWithRetry and none reads the Together answer itself any more", () => {
    for (const fn of FUNCTIONS) {
      const src = readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), "utf8");
      assert.match(src, /from "\.\.\/_shared\/togetherRetry\.ts";/, fn);
      assert.match(src, /renderWithRetry\(\{/, fn);
      assert.match(src, /renderFailureMessage\(failures,/, fn);
      assert.doesNotMatch(src, /b64_json/, `${fn} takes the image from renderWithRetry, so only the shared module reads the body`);
    }
  });

  test("the chain's failures are collected per render chain, never in one module-level array", () => {
    for (const fn of FUNCTIONS) {
      const src = readFileSync(new URL(`../supabase/functions/${fn}/index.ts`, import.meta.url), "utf8");
      assert.match(src, /^ +(const failures(: TogetherFailure\[\])? = \[\];)$/m, `${fn} declares failures inside a function`);
      assert.doesNotMatch(src, /^const failures/m, `${fn} keeps no failures array at module level`);
    }
  });
});
