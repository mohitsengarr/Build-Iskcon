// Offline tests for the visual-check IO wrapper (_shared/visualCheck.ts).
// No network, no real keys, no paid calls: npm:@anthropic-ai/sdk resolves to a
// stub (tests/helpers) whose create() calls globalThis.__anthropicCreate.
// Globals (Deno.env, __anthropicCreate, console.log, and EdgeRuntime for
// runInBackground) are installed in before() and restored in after(), so this
// file never overlaps the other suites.
// Run: node --experimental-strip-types --test tests/
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
// deno-lint-ignore no-explicit-any
const io: any = await import("../supabase/functions/_shared/visualCheck.ts");
// deno-lint-ignore no-explicit-any
const { APIError }: any = await import("./helpers/anthropic-stub.mjs");

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const ENV: Record<string, string> = {};

const FACTS = [
  "Arjuna's chariot is drawn by exactly four white horses",
  "Arjuna holds the Gandiva bow",
  "Krishna holds the reins",
];
const FLUX2 = "black-forest-labs/FLUX.2-pro";
const STARTED_AT = "2026-09-14T10:00:00.000Z";
// deno-lint-ignore no-explicit-any
type Json = any;

// A PNG header plus one attempt-specific byte, so each render is a distinct image.
const png = (tagByte = 0) =>
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, tagByte]).toString("base64");
const PNG_B64 = png();

type Check = { fact_index: number; verdict: string; observed: string };
const toolReply = (checks: Check[]) => ({
  stop_reason: "tool_use",
  content: [{ type: "thinking", thinking: "" }, { type: "tool_use", id: "t1", name: "record_visual_check", input: { checks } }],
});
const allYes = (): Check[] => FACTS.map((_, i) => ({ fact_index: i + 1, verdict: "yes", observed: "shown" }));
/** A reply where the first `n` facts are clearly contradicted. */
const failing = (n: number): Check[] =>
  FACTS.map((_, i) => ({ fact_index: i + 1, verdict: i < n ? "no" : "yes", observed: i < n ? `wrong ${i + 1}` : "shown" }));

function useGlobals() {
  const saved: Record<string, unknown> = {};
  const lines: string[] = [];
  before(() => {
    saved.Deno = g.Deno;
    saved.create = g.__anthropicCreate;
    saved.log = console.log;
    g.Deno = { env: { get: (k: string) => ENV[k] } };
    console.log = (...a: unknown[]) => {
      if (String(a[0]).startsWith("[visual-check]")) lines.push(String(a[0]));
      else (saved.log as (...x: unknown[]) => void)(...a);
    };
  });
  after(() => {
    g.Deno = saved.Deno;
    g.__anthropicCreate = saved.create;
    console.log = saved.log as typeof console.log;
  });
  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    ENV.ANTHROPIC_API_KEY = "sk-test";
    lines.length = 0;
    g.__anthropicCreate = async () => {
      throw new Error("Claude must not be called");
    };
  });
  return lines;
}

/**
 * Rejects after `ms` of real time. It uses setInterval, which the setTimeout mock
 * leaves alone, so a render that is never abandoned fails its own test instead
 * of emptying the event loop and cancelling the rest of the file.
 */
function realTimeLimit(ms: number, what: string) {
  let id: ReturnType<typeof setInterval> | undefined;
  const promise = new Promise<never>((_, reject) => {
    id = setInterval(() => reject(new Error(`${what} did not finish within ${ms}ms of real time`)), ms);
  });
  return { promise, clear: () => clearInterval(id) };
}

/** Records every create() call and answers from `replies` in order (a function reply is called). */
function claudeQueue(replies: unknown[], onCall?: () => void) {
  // deno-lint-ignore no-explicit-any
  const calls: any[] = [];
  g.__anthropicCreate = async (params: unknown, reqOpts: unknown, clientOpts: unknown) => {
    calls.push({ params, reqOpts, clientOpts });
    onCall?.();
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (typeof r === "function") return (r as () => unknown)();
    return r;
  };
  return calls;
}

describe("checkImage", () => {
  const lines = useGlobals();

  test("pass: sends the image and numbered facts with no SDK retry, and logs one line", async () => {
    // Arrange
    const calls = claudeQueue([toolReply(allYes())]);
    // Act
    const r = await io.checkImage({ imageB64: PNG_B64, facts: FACTS });
    // Assert
    assert.equal(r.status, "pass");
    assert.deepEqual(r.failed, []);
    assert.equal(r.unclear, 0);
    assert.equal(r.reason, null);
    assert.equal(typeof r.ms, "number");
    assert.equal(calls.length, 1);
    const { params, reqOpts, clientOpts } = calls[0];
    assert.equal(clientOpts.apiKey, "sk-test");
    assert.equal(params.model, "claude-opus-5");
    assert.deepEqual(params.messages[0].content[0].source, { type: "base64", media_type: "image/png", data: PNG_B64 });
    assert.match(params.messages[0].content[1].text, /1\. Arjuna's chariot is drawn by exactly four white horses/);
    assert.equal(reqOpts.maxRetries, 0);
    assert.equal(reqOpts.timeout, 40_000);
    assert.ok(reqOpts.signal instanceof AbortSignal);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[visual-check\] status=pass failed=0 unclear=0 ms=\d+$/);
  });

  test("fail: a clear contradiction is reported with the fact and what was seen", async () => {
    claudeQueue([toolReply([{ fact_index: 1, verdict: "no", observed: "3 horses counted" }, ...allYes().slice(1)])]);
    const r = await io.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.equal(r.status, "fail");
    assert.deepEqual(r.failed, [{ fact: FACTS[0], observed: "3 horses counted" }]);
    assert.match(lines[0], /status=fail failed=1 unclear=0/);
  });

  test("empty and non-string facts are dropped before numbering", async () => {
    const calls = claudeQueue([toolReply([{ fact_index: 1, verdict: "no", observed: "bow in Krishna's hand" }])]);
    const r = await io.checkImage({ imageB64: PNG_B64, facts: ["", "  Arjuna holds the Gandiva bow ", null, "Krishna holds the reins"] });
    assert.match(calls[0].params.messages[0].content[1].text, /1\. Arjuna holds the Gandiva bow\n2\. Krishna holds the reins/);
    assert.deepEqual(r.failed, [{ fact: "Arjuna holds the Gandiva bow", observed: "bow in Krishna's hand" }]);
    assert.equal(r.unclear, 1);
  });

  const skips: Array<[string, () => void, { imageB64: unknown; facts: unknown }, string]> = [
    ["VISUAL_CHECK_ENABLED=false", () => (ENV.VISUAL_CHECK_ENABLED = "false"), { imageB64: PNG_B64, facts: FACTS }, "disabled"],
    ["VISUAL_CHECK_ENABLED=OFF", () => (ENV.VISUAL_CHECK_ENABLED = "OFF"), { imageB64: PNG_B64, facts: FACTS }, "disabled"],
    ["no facts", () => {}, { imageB64: PNG_B64, facts: [] }, "no_facts"],
    ["only blank facts", () => {}, { imageB64: PNG_B64, facts: ["", "   "] }, "no_facts"],
    ["facts not an array", () => {}, { imageB64: PNG_B64, facts: null }, "no_facts"],
    ["missing ANTHROPIC_API_KEY", () => delete ENV.ANTHROPIC_API_KEY, { imageB64: PNG_B64, facts: FACTS }, "no_api_key"],
    ["no image", () => {}, { imageB64: "", facts: FACTS }, "no_image"],
    ["unknown media type", () => {}, { imageB64: Buffer.from("not an image at all").toString("base64"), facts: FACTS }, "unknown_media_type"],
  ];
  for (const [name, arrange, input, reason] of skips) {
    test(`skipped without calling Claude: ${name}`, async () => {
      // Arrange
      arrange();
      // Act
      const r = await io.checkImage(input);
      // Assert
      assert.equal(r.status, "skipped");
      assert.equal(r.reason, reason);
      assert.deepEqual(r.failed, []);
      assert.match(lines[0], new RegExp(`status=skipped failed=0 unclear=0 ms=\\d+ reason=${reason}`));
    });
  }

  test("VISUAL_CHECK_ENABLED=true still checks", async () => {
    ENV.VISUAL_CHECK_ENABLED = "true";
    claudeQueue([toolReply(allYes())]);
    const r = await io.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.equal(r.status, "pass");
  });

  test("boundary: an image of exactly 5,000,000 base64 chars is sent; one more char is skipped", async () => {
    const calls = claudeQueue([toolReply(allYes())]);
    const atCap = PNG_B64 + "A".repeat(io.MAX_CHECK_IMAGE_B64_CHARS - PNG_B64.length);
    const r1 = await io.checkImage({ imageB64: atCap, facts: FACTS });
    const r2 = await io.checkImage({ imageB64: atCap + "A", facts: FACTS });
    assert.equal(r1.status, "pass");
    assert.equal(r2.status, "skipped");
    assert.equal(r2.reason, "image_too_large");
    assert.equal(calls.length, 1);
  });

  test("API error -> error with the status, never rejects", async () => {
    g.__anthropicCreate = async () => {
      throw new APIError(529, "overloaded");
    };
    const r = await io.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.equal(r.status, "error");
    assert.equal(r.reason, "api_error_529");
    assert.match(lines[0], /status=error failed=0 unclear=0 ms=\d+ reason=api_error_529/);
  });

  test("a non-API exception -> error", async () => {
    g.__anthropicCreate = async () => {
      throw new TypeError("boom");
    };
    const r = await io.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.equal(r.status, "error");
    assert.equal(r.reason, "unexpected_TypeError");
  });

  test("timeout: a call that never settles and ignores its signal still resolves with error", async () => {
    // Arrange
    // deno-lint-ignore no-explicit-any
    let seenSignal: any;
    g.__anthropicCreate = (_p: unknown, reqOpts: { signal: AbortSignal }) => {
      seenSignal = reqOpts.signal;
      return new Promise(() => {});
    };
    const t0 = Date.now();
    // Act
    const r = await io.checkImage({ imageB64: PNG_B64, facts: FACTS }, { timeoutMs: 60 });
    // Assert
    assert.equal(r.status, "error");
    assert.equal(r.reason, "timeout");
    assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0}ms`);
    assert.equal(seenSignal.aborted, true, "the request is aborted on timeout");
  });

  test("the caller's abort signal ends the call with error", async () => {
    g.__anthropicCreate = () => new Promise(() => {});
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const r = await io.checkImage({ imageB64: PNG_B64, facts: FACTS }, { timeoutMs: 5000, signal: controller.signal });
    assert.equal(r.status, "error");
    assert.equal(r.reason, "aborted");
  });

  test("refusal -> error", async () => {
    claudeQueue([{ stop_reason: "refusal", content: [] }]);
    const r = await io.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.equal(r.status, "error");
    assert.equal(r.reason, "refusal");
  });

  test("no tool call -> error", async () => {
    claudeQueue([{ stop_reason: "end_turn", content: [{ type: "text", text: "Looks right to me." }] }]);
    const r = await io.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.equal(r.status, "error");
    assert.equal(r.reason, "no_tool");
  });

  test("negative: null input never rejects", async () => {
    const r = await io.checkImage(null);
    assert.equal(r.status, "skipped");
  });
});

describe("renderWithVisualCheck", () => {
  const lines = useGlobals();

  /** A fake clock and a render that returns a distinct image per attempt and advances the clock. */
  function setup({
    renderMs = 40_000,
    checkMs = 15_000,
    budgetMs = 130_000,
    results = null as null | Array<"ok" | "null" | "throw">,
    model = "openai/gpt-image-2",
  } = {}) {
    let clock = 1_000_000;
    const start = clock;
    const indexes: number[] = [];
    const logs: string[] = [];
    const render = async (i: number) => {
      indexes.push(i);
      clock += renderMs;
      const kind = results ? results[Math.min(i, results.length - 1)] : "ok";
      if (kind === "throw") throw new Error("together 500");
      if (kind === "null") return null;
      return { b64: png(i + 1), model, seed: 100 + i };
    };
    return {
      indexes,
      logs,
      advanceCheck: () => (clock += checkMs),
      setClock: (v: number) => (clock = v),
      input: (extra: Record<string, unknown> = {}) => ({
        render,
        facts: FACTS,
        maxAttempts: 3,
        deadlineAt: start + budgetMs,
        tag: "gita:ch1",
        log: (l: string) => logs.push(l),
        now: () => clock,
        ...extra,
      }),
    };
  }

  test("pass on the first try: one render, one check, attempt 0 kept", async () => {
    // Arrange
    const s = setup();
    const calls = claudeQueue([toolReply(allYes())], s.advanceCheck);
    // Act
    const r = await io.renderWithVisualCheck(s.input());
    // Assert
    assert.deepEqual(s.indexes, [0]);
    assert.equal(calls.length, 1);
    assert.equal(r.b64, png(1));
    assert.equal(r.model, "openai/gpt-image-2");
    assert.equal(r.seed, 100, "fields the render returned are kept");
    assert.equal(r.record.status, "pass");
    assert.equal(r.record.attempts, 1);
    assert.equal(r.record.chosen_attempt, 0);
    assert.deepEqual(r.record.failed, []);
    assert.equal(r.record.reason, null);
    assert.equal(r.record.image_model, "openai/gpt-image-2");
    assert.ok(!Number.isNaN(Date.parse(r.record.checked_at)));
    assert.ok(s.logs.some((l) => l.startsWith("[visual-check] gita:ch1 chose attempt=0 of 1 status=pass")));
  });

  test("fail then pass: two renders, the passing image is returned", async () => {
    const s = setup();
    const calls = claudeQueue([toolReply(failing(1)), toolReply(allYes())], s.advanceCheck);
    const r = await io.renderWithVisualCheck(s.input());
    assert.deepEqual(s.indexes, [0, 1]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].params.messages[0].content[0].source.data, png(2), "the second check sees the second image");
    assert.equal(r.b64, png(2));
    assert.equal(r.seed, 101);
    assert.equal(r.record.status, "pass");
    assert.equal(r.record.attempts, 2);
    assert.equal(r.record.chosen_attempt, 1);
    assert.deepEqual(r.record.failed, []);
    assert.ok(s.logs.some((l) => l.includes('attempt=0 status=fail "Arjuna\'s chariot is drawn by exactly four white horses" saw "wrong 1"')));
  });

  test("all fail: every attempt is used and the fewest-failed image is kept with status fail", async () => {
    // Arrange: attempt 1 has one failed fact, attempts 0 and 2 have two
    const s = setup({ budgetMs: 400_000 });
    claudeQueue([toolReply(failing(2)), toolReply(failing(1)), toolReply(failing(2))], s.advanceCheck);
    // Act
    const r = await io.renderWithVisualCheck(s.input());
    // Assert
    assert.deepEqual(s.indexes, [0, 1, 2], "attemptIndex passed 0, 1, 2");
    assert.equal(r.b64, png(2));
    assert.equal(r.record.status, "fail");
    assert.equal(r.record.attempts, 3);
    assert.equal(r.record.chosen_attempt, 1);
    assert.deepEqual(r.record.failed, [{ fact: FACTS[0], observed: "wrong 1" }]);
    assert.equal(r.record.reason, "max_attempts");
  });

  test("all fail with equal counts: the earliest image is kept", async () => {
    const s = setup({ budgetMs: 400_000 });
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const r = await io.renderWithVisualCheck(s.input());
    assert.deepEqual(s.indexes, [0, 1, 2]);
    assert.equal(r.record.chosen_attempt, 0);
    assert.equal(r.b64, png(1));
  });

  test("a checker error on the first image keeps it without another render", async () => {
    const s = setup();
    g.__anthropicCreate = async () => {
      throw new APIError(500, "server error");
    };
    const r = await io.renderWithVisualCheck(s.input());
    assert.deepEqual(s.indexes, [0]);
    assert.equal(r.b64, png(1));
    assert.equal(r.record.status, "error");
    assert.equal(r.record.reason, "api_error_500");
    assert.equal(r.record.attempts, 1);
  });

  test("a skipped check (kill switch) keeps the first image without another render", async () => {
    ENV.VISUAL_CHECK_ENABLED = "false";
    const s = setup();
    const r = await io.renderWithVisualCheck(s.input());
    assert.deepEqual(s.indexes, [0]);
    assert.equal(r.record.status, "skipped");
    assert.equal(r.record.reason, "disabled");
  });

  test("a checker error on a retry stops the loop and keeps the best checked image", async () => {
    const s = setup({ budgetMs: 400_000 });
    claudeQueue(
      [
        toolReply(failing(1)),
        () => {
          throw new APIError(529, "overloaded");
        },
      ],
      s.advanceCheck,
    );
    const r = await io.renderWithVisualCheck(s.input());
    assert.deepEqual(s.indexes, [0, 1]);
    assert.equal(r.b64, png(1));
    assert.equal(r.record.status, "fail");
    assert.equal(r.record.chosen_attempt, 0);
    assert.equal(r.record.attempts, 2);
    assert.equal(r.record.reason, "check_error");
  });

  test("the deadline blocks a retry that would not fit", async () => {
    // Arrange: after attempt 0 the clock is at +55s; another 40s render + 15s check + 5s margin needs +115s > 110s
    const s = setup({ budgetMs: 110_000 });
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    // Act
    const r = await io.renderWithVisualCheck(s.input());
    // Assert
    assert.deepEqual(s.indexes, [0]);
    assert.equal(calls.length, 1);
    assert.equal(r.record.status, "fail");
    assert.equal(r.record.attempts, 1);
    assert.equal(r.record.reason, "deadline");
  });

  test("boundary: a retry that exactly fits the deadline runs", async () => {
    const s = setup({ budgetMs: 55_000 + 40_000 + 15_000 + 5_000 });
    claudeQueue([toolReply(failing(1)), toolReply(allYes())], s.advanceCheck);
    const r = await io.renderWithVisualCheck(s.input());
    assert.deepEqual(s.indexes, [0, 1]);
    assert.equal(r.record.status, "pass");
  });

  test("boundary: too close to the deadline for any check -> skipped with reason deadline", async () => {
    // Render ends at +40s; the deadline is +59.999s, less than the 20s check estimate away
    const s = setup({ budgetMs: 59_999 });
    const r = await io.renderWithVisualCheck(s.input());
    assert.equal(r.b64, png(1));
    assert.equal(r.record.status, "skipped");
    assert.equal(r.record.reason, "deadline");
    assert.equal(r.record.attempts, 1);
  });

  test("the check timeout never runs past the deadline", async () => {
    const s = setup({ budgetMs: 70_000 });
    const calls = claudeQueue([toolReply(allYes())], s.advanceCheck);
    await io.renderWithVisualCheck(s.input());
    assert.equal(calls[0].reqOpts.timeout, 30_000);
  });

  // deno-lint-ignore no-explicit-any
  test("a re-render still running when its check could no longer start is abandoned: its signal aborts and the checked image is kept", async (t: any) => {
    // Arrange: render 0 takes 40s and its check 15s (t=55s). A re-render may start
    // (55 + 40 + 15 + 5 <= 130) but never answers: at 130 - 15 = 115s it is abandoned.
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let clock = 1_000_000;
    const start = clock;
    const signals: Array<AbortSignal | undefined> = [];
    const logs: string[] = [];
    const calls = claudeQueue([toolReply(failing(1))], () => (clock += 15_000));
    const render = async (i: number, signal?: AbortSignal) => {
      signals.push(signal);
      if (i === 0) {
        clock += 40_000;
        return { b64: png(1), model: "openai/gpt-image-2" };
      }
      setImmediate(() => t.mock.timers.tick(10 * 60_000));
      return new Promise<never>(() => {}); // ignores its signal
    };
    // Act
    const limit = realTimeLimit(2000, "renderWithVisualCheck");
    // deno-lint-ignore no-explicit-any
    let r: any;
    try {
      r = await Promise.race([
        io.renderWithVisualCheck({
          render,
          facts: FACTS,
          maxAttempts: 3,
          deadlineAt: start + 130_000,
          tag: "gita:ch1",
          log: (l: string) => logs.push(l),
          now: () => clock,
        }),
        limit.promise,
      ]);
    } finally {
      limit.clear();
    }
    // Assert
    assert.equal(signals.length, 2);
    assert.equal(signals[0], undefined, "the first render has no deadline of its own");
    assert.ok(signals[1] instanceof AbortSignal);
    assert.equal(signals[1]?.aborted, true, "the abandoned render's requests are aborted");
    assert.equal(calls.length, 1, "the abandoned render is never checked");
    assert.equal(r.b64, png(1));
    assert.equal(r.record.status, "fail");
    assert.equal(r.record.attempts, 2);
    assert.equal(r.record.chosen_attempt, 0);
    assert.equal(r.record.reason, "render_failed");
    assert.ok(logs.some((l) => l.includes("render attempt=1 stopped")), logs.join("\n"));
  });

  test("a re-render that ends too close to the deadline for its check is not checked: no Claude call that must time out", async () => {
    // Arrange: render 0 40s + check 15s = 55s; render 1 takes 69s and ends at 124s, 6s before the deadline
    let clock = 1_000_000;
    const start = clock;
    const calls = claudeQueue([toolReply(failing(1)), toolReply(allYes())], () => (clock += 15_000));
    const render = async (i: number) => {
      clock += i === 0 ? 40_000 : 69_000;
      return { b64: png(i + 1), model: "openai/gpt-image-2" };
    };
    // Act
    const r = await io.renderWithVisualCheck({ render, facts: FACTS, maxAttempts: 3, deadlineAt: start + 130_000, log: () => {}, now: () => clock });
    // Assert
    assert.equal(calls.length, 1);
    assert.equal(r.b64, png(1));
    assert.equal(r.record.status, "fail");
    assert.equal(r.record.attempts, 2);
    assert.equal(r.record.chosen_attempt, 0);
    assert.equal(r.record.reason, "deadline");
  });

  test("the next re-render is predicted from the slowest render so far, not the last one", async () => {
    // Arrange: render 0 takes 100s, render 1 10s, checks 5s, deadline 230s. After
    // render 1 (t=120s) another 100s render plus a check would pass the deadline.
    let clock = 1_000_000;
    const start = clock;
    const indexes: number[] = [];
    const calls = claudeQueue([toolReply(failing(1))], () => (clock += 5_000));
    const render = async (i: number) => {
      indexes.push(i);
      clock += i === 0 ? 100_000 : 10_000;
      return { b64: png(i + 1), model: "openai/gpt-image-2" };
    };
    // Act
    const r = await io.renderWithVisualCheck({ render, facts: FACTS, maxAttempts: 3, deadlineAt: start + 230_000, log: () => {}, now: () => clock });
    // Assert
    assert.deepEqual(indexes, [0, 1]);
    assert.equal(calls.length, 2);
    assert.equal(r.record.attempts, 2);
    assert.equal(r.record.reason, "deadline");
  });

  test("a first render marked skipCheck is kept unchecked with that reason and never re-rendered", async () => {
    // Arrange
    const s = setup({ budgetMs: 400_000 });
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    let renders = 0;
    const render = async () => {
      renders++;
      return { b64: png(1), model: "black-forest-labs/FLUX.1.1-pro", skipCheck: "safe_fallback" };
    };
    // Act
    const r = await io.renderWithVisualCheck(s.input({ render }));
    // Assert
    assert.equal(renders, 1);
    assert.equal(calls.length, 0);
    assert.equal(r.b64, png(1));
    assert.equal(r.record.status, "skipped");
    assert.equal(r.record.reason, "safe_fallback");
    assert.equal(r.record.attempts, 1);
    assert.equal(r.record.image_model, "black-forest-labs/FLUX.1.1-pro");
  });

  test("a re-render marked skipCheck ends the loop and keeps the checked image", async () => {
    // Arrange
    const s = setup({ budgetMs: 400_000 });
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const indexes: number[] = [];
    const render = async (i: number) => {
      indexes.push(i);
      return { b64: png(i + 1), model: "flux", skipCheck: i === 0 ? null : "safe_fallback" };
    };
    // Act
    const r = await io.renderWithVisualCheck(s.input({ render }));
    // Assert
    assert.deepEqual(indexes, [0, 1]);
    assert.equal(calls.length, 1);
    assert.equal(r.b64, png(1));
    assert.equal(r.record.status, "fail");
    assert.equal(r.record.attempts, 2);
    assert.equal(r.record.chosen_attempt, 0);
    assert.equal(r.record.reason, "safe_fallback");
  });

  test("attempt 0 returning null resolves null without a check", async () => {
    const s = setup({ results: ["null"] });
    const r = await io.renderWithVisualCheck(s.input());
    assert.equal(r, null);
    assert.deepEqual(s.indexes, [0]);
  });

  test("attempt 0 throwing resolves null without a check", async () => {
    const s = setup({ results: ["throw"] });
    const r = await io.renderWithVisualCheck(s.input());
    assert.equal(r, null);
    assert.ok(s.logs.some((l) => l.includes("render attempt=0 threw Error")));
  });

  test("a later render throwing keeps the best image so far", async () => {
    const s = setup({ results: ["ok", "throw"], budgetMs: 400_000 });
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const r = await io.renderWithVisualCheck(s.input());
    assert.deepEqual(s.indexes, [0, 1]);
    assert.equal(r.b64, png(1));
    assert.equal(r.record.status, "fail");
    assert.equal(r.record.attempts, 2);
    assert.equal(r.record.chosen_attempt, 0);
    assert.equal(r.record.reason, "render_failed");
  });

  test("a later render returning null keeps the best image so far", async () => {
    const s = setup({ results: ["ok", "null"], budgetMs: 400_000 });
    claudeQueue([toolReply(failing(2))], s.advanceCheck);
    const r = await io.renderWithVisualCheck(s.input());
    assert.equal(r.b64, png(1));
    assert.equal(r.record.reason, "render_failed");
  });

  test("boundary: maxAttempts 2 (background runs) stops after one re-render", async () => {
    const s = setup({ budgetMs: 400_000 });
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const r = await io.renderWithVisualCheck(s.input({ maxAttempts: 2 }));
    assert.deepEqual(s.indexes, [0, 1]);
    assert.equal(r.record.attempts, 2);
    assert.equal(r.record.reason, "max_attempts");
  });

  test("negative: maxAttempts 1 or missing never re-renders", async () => {
    const s = setup({ budgetMs: 400_000 });
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const r1 = await io.renderWithVisualCheck(s.input({ maxAttempts: 1 }));
    const r2 = await io.renderWithVisualCheck(s.input({ maxAttempts: undefined }));
    assert.deepEqual(s.indexes, [0, 0]);
    assert.equal(r1.record.status, "fail");
    assert.equal(r2.record.attempts, 1);
  });

  test("negative: a missing deadline still checks once but never re-renders", async () => {
    const s = setup();
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const r = await io.renderWithVisualCheck(s.input({ deadlineAt: undefined }));
    assert.deepEqual(s.indexes, [0]);
    assert.equal(r.record.status, "fail");
  });

  test("negative: a throwing log function and a render result without a model never break the loop", async () => {
    const s = setup();
    claudeQueue([toolReply(allYes())], s.advanceCheck);
    const r = await io.renderWithVisualCheck(
      s.input({
        render: async () => ({ b64: PNG_B64 }),
        log: () => {
          throw new Error("log sink down");
        },
      }),
    );
    assert.equal(r.model, null);
    assert.equal(r.record.image_model, null);
    assert.equal(r.record.status, "pass");
  });

  test("without a log function the loop lines go to console.log", async () => {
    const s = setup();
    claudeQueue([toolReply(allYes())], s.advanceCheck);
    await io.renderWithVisualCheck(s.input({ log: undefined }));
    assert.ok(lines.some((l) => l.startsWith("[visual-check] gita:ch1 chose attempt=0")));
  });
});

describe("initialRecord", () => {
  useGlobals();

  test("facts reached the prompt and the check can run -> running, without calling Claude", () => {
    // Arrange: beforeEach sets ANTHROPIC_API_KEY and makes any Claude call throw
    // Act
    const rec = io.initialRecord({ factsUsed: FACTS, safeFallback: false, imageModel: FLUX2, startedAt: STARTED_AT });
    // Assert
    assert.deepEqual(rec, {
      status: "running",
      attempts: 1,
      chosen_attempt: 0,
      failed: [],
      unclear: 0,
      reason: null,
      image_model: FLUX2,
      checked_at: null,
      started_at: STARTED_AT,
    });
    assert.equal(io.needsBackgroundCheck(rec), true);
  });

  test("VISUAL_CHECK_ENABLED=false -> skipped/disabled, stamped with checked_at", () => {
    ENV.VISUAL_CHECK_ENABLED = "false";
    const rec = io.initialRecord({ factsUsed: FACTS, imageModel: FLUX2, startedAt: STARTED_AT });
    assert.equal(rec.status, "skipped");
    assert.equal(rec.reason, "disabled");
    assert.equal(rec.started_at, STARTED_AT);
    assert.ok(!Number.isNaN(Date.parse(rec.checked_at)), String(rec.checked_at));
    assert.equal(io.needsBackgroundCheck(rec), false);
  });

  test("a missing ANTHROPIC_API_KEY -> skipped/disabled", () => {
    delete ENV.ANTHROPIC_API_KEY;
    const rec = io.initialRecord({ factsUsed: FACTS, imageModel: FLUX2, startedAt: STARTED_AT });
    assert.equal(rec.status, "skipped");
    assert.equal(rec.reason, "disabled");
  });

  test("no facts -> no_facts and a SAFE_FALLBACK image -> safe_fallback, even with the check off", () => {
    ENV.VISUAL_CHECK_ENABLED = "off";
    assert.equal(io.initialRecord({ factsUsed: [], imageModel: FLUX2 }).reason, "no_facts");
    assert.equal(io.initialRecord({ factsUsed: FACTS, safeFallback: true, imageModel: FLUX2 }).reason, "safe_fallback");
  });

  test("boundary: startedAt as epoch ms is stored as ISO; an ISO string is kept; anything else is null", () => {
    const at = (startedAt: unknown) => io.initialRecord({ factsUsed: FACTS, imageModel: FLUX2, startedAt }).started_at;
    assert.equal(at(Date.parse(STARTED_AT)), STARTED_AT);
    assert.equal(at(STARTED_AT), STARTED_AT);
    assert.equal(at(undefined), null);
    assert.equal(at(Number.NaN), null);
    assert.equal(at(8.64e15 + 1), null, "out of the Date range");
  });

  test("negative: a null input never throws", () => {
    const rec = io.initialRecord(null);
    assert.equal(rec.status, "skipped");
    assert.equal(rec.reason, "no_facts");
    assert.equal(rec.started_at, null);
  });
});

describe("runInBackground", () => {
  let savedRuntime: unknown;
  let hadRuntime = false;
  before(() => {
    hadRuntime = "EdgeRuntime" in g;
    savedRuntime = g.EdgeRuntime;
  });
  after(() => {
    if (hadRuntime) g.EdgeRuntime = savedRuntime;
    else delete g.EdgeRuntime;
  });
  beforeEach(() => {
    delete g.EdgeRuntime;
  });

  /** Runs `fn`, waits two macrotasks, and returns every unhandled rejection seen meanwhile. */
  async function unhandledDuring(fn: () => Promise<void>): Promise<unknown[]> {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown) => seen.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      await fn();
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    return seen;
  }

  test("with EdgeRuntime: the work is handed to waitUntil before runInBackground returns, and held until it ends", async () => {
    // Arrange
    const handed: Array<Promise<unknown>> = [];
    g.EdgeRuntime = { waitUntil: (p: Promise<unknown>) => handed.push(p) };
    let finishWork!: (v: string) => void;
    const work = new Promise<string>((resolve) => (finishWork = resolve));
    // Act
    const returned = io.runInBackground(work);
    // Assert: registered synchronously, before any await
    assert.equal(handed.length, 1);
    assert.ok(handed[0] instanceof Promise);
    assert.equal(returned, handed[0], "the promise handed to waitUntil is the one returned");
    let settled = false;
    handed[0].then(() => (settled = true));
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false, "still held while the work runs");
    finishWork("done");
    await handed[0];
    assert.equal(settled, true);
  });

  test("a rejecting work: waitUntil still gets a promise that resolves, the failure is logged, nothing is unhandled", async () => {
    // Arrange
    const handed: Array<Promise<unknown>> = [];
    g.EdgeRuntime = { waitUntil: (p: Promise<unknown>) => handed.push(p) };
    const logs: string[] = [];
    // Act
    const unhandled = await unhandledDuring(async () => {
      io.runInBackground(Promise.reject(new TypeError("boom")), (l: string) => logs.push(l));
      assert.equal(handed.length, 1);
      await assert.doesNotReject(handed[0]);
    });
    // Assert
    assert.deepEqual(unhandled, []);
    assert.deepEqual(logs, ["[visual-check] background task failed: TypeError"]);
  });

  test("without EdgeRuntime: a rejecting work is caught, so nothing is unhandled and nothing throws", async () => {
    const logs: string[] = [];
    const unhandled = await unhandledDuring(async () => {
      const returned = io.runInBackground(Promise.reject(new Error("late failure")), (l: string) => logs.push(l));
      await assert.doesNotReject(returned);
    });
    assert.deepEqual(unhandled, []);
    assert.deepEqual(logs, ["[visual-check] background task failed: Error"]);
  });

  test("without EdgeRuntime: the work still runs to its end", async () => {
    let done = false;
    const work = (async () => {
      await new Promise((r) => setImmediate(r));
      done = true;
    })();
    await io.runInBackground(work);
    assert.equal(done, true);
  });

  test("an EdgeRuntime whose waitUntil throws, or that has none, never breaks the caller", async () => {
    // Arrange
    g.EdgeRuntime = {
      waitUntil: () => {
        throw new Error("runtime gone");
      },
    };
    const logs: string[] = [];
    // Act
    let returned: Promise<void> | undefined;
    assert.doesNotThrow(() => {
      returned = io.runInBackground(Promise.resolve("x"), (l: string) => logs.push(l));
    });
    // Assert
    await assert.doesNotReject(returned as Promise<void>);
    assert.match(logs[0], /^\[visual-check\] EdgeRuntime\.waitUntil threw Error/);
    g.EdgeRuntime = {};
    await assert.doesNotReject(io.runInBackground(Promise.resolve(1)));
  });

  test("negative: a plain value and a throwing log function are accepted", async () => {
    await assert.doesNotReject(io.runInBackground(42));
    const unhandled = await unhandledDuring(async () => {
      await assert.doesNotReject(
        io.runInBackground(Promise.reject(new Error("x")), () => {
          throw new Error("log sink down");
        }),
      );
    });
    assert.deepEqual(unhandled, []);
  });
});

describe("checkInBackground", () => {
  useGlobals();

  /** A fake clock, a writeRecord that records every call, and a render spy that must never run. */
  function setup({ budgetMs = 360_000, checkMs = 15_000, write = true as boolean | "throw" } = {}) {
    let clock = 1_000_000;
    const start = clock;
    const writes: Json[] = [];
    const logs: string[] = [];
    let renders = 0;
    return {
      writes,
      logs,
      renders: () => renders,
      advanceCheck: () => (clock += checkMs),
      input: (extra: Record<string, unknown> = {}) => ({
        b64: png(1),
        facts: FACTS,
        imageModel: FLUX2,
        startedAt: STARTED_AT,
        deadlineAt: start + budgetMs,
        writeRecord: async (record: Json) => {
          writes.push(record);
          if (write === "throw") throw new Error("db down");
          return write;
        },
        // Not part of the contract: passed only to prove a flag-only check never renders.
        render: async () => {
          renders++;
          return { b64: png(9), model: FLUX2 };
        },
        tag: "scene 7",
        log: (l: string) => logs.push(l),
        now: () => clock,
        ...extra,
      }),
    };
  }

  test("pass: one check of the stored image and one write of the final record, started_at kept", async () => {
    // Arrange
    const s = setup();
    const calls = claudeQueue([toolReply(allYes())], s.advanceCheck);
    // Act
    const rec = await io.checkInBackground(s.input());
    // Assert
    assert.equal(calls.length, 1);
    assert.equal(calls[0].params.messages[0].content[0].source.data, png(1));
    assert.deepEqual(s.writes, [rec]);
    const { checked_at, ...rest } = rec;
    assert.deepEqual(rest, { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], unclear: 0, reason: null, image_model: FLUX2, started_at: STARTED_AT });
    assert.ok(!Number.isNaN(Date.parse(checked_at)), String(checked_at));
    assert.equal(s.renders(), 0);
    assert.ok(s.logs.some((l) => l.startsWith("[visual-check] scene 7 background check status=pass failed=0")), s.logs.join("\n"));
  });

  test("fail: the contradicted facts are flagged, nothing is rendered and the image is checked only once", async () => {
    const s = setup();
    const calls = claudeQueue([toolReply(failing(2)), toolReply(allYes())], s.advanceCheck);
    const rec = await io.checkInBackground(s.input());
    assert.equal(calls.length, 1);
    assert.equal(s.renders(), 0, "flag only: never renders");
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 1);
    assert.equal(rec.chosen_attempt, 0);
    assert.deepEqual(rec.failed, [
      { fact: FACTS[0], observed: "wrong 1" },
      { fact: FACTS[1], observed: "wrong 2" },
    ]);
    assert.equal(rec.reason, null);
    assert.equal(rec.started_at, STARTED_AT);
    assert.deepEqual(s.writes, [rec]);
  });

  test("checker error: the error is recorded and written, nothing is rendered", async () => {
    const s = setup();
    g.__anthropicCreate = async () => {
      throw new APIError(529, "overloaded");
    };
    const rec = await io.checkInBackground(s.input());
    assert.equal(rec.status, "error");
    assert.equal(rec.reason, "api_error_529");
    assert.equal(rec.started_at, STARTED_AT);
    assert.deepEqual(s.writes, [rec]);
    assert.equal(s.renders(), 0);
  });

  test("the kill switch turned on after the response: skipped/disabled is written without calling Claude", async () => {
    ENV.VISUAL_CHECK_ENABLED = "false";
    const s = setup();
    const rec = await io.checkInBackground(s.input());
    assert.equal(rec.status, "skipped");
    assert.equal(rec.reason, "disabled");
    assert.deepEqual(s.writes, [rec]);
  });

  test("deadline: less than CHECK_ESTIMATE_MS left -> skipped/deadline, written, without calling Claude", async () => {
    // Arrange
    const s = setup({ budgetMs: io.CHECK_ESTIMATE_MS - 1 });
    const calls = claudeQueue([toolReply(allYes())]);
    // Act
    const rec = await io.checkInBackground(s.input());
    // Assert
    assert.equal(calls.length, 0);
    assert.equal(rec.status, "skipped");
    assert.equal(rec.reason, "deadline");
    assert.equal(rec.attempts, 1);
    assert.equal(rec.started_at, STARTED_AT);
    assert.ok(!Number.isNaN(Date.parse(rec.checked_at)));
    assert.deepEqual(s.writes, [rec]);
  });

  test("no time left: a deadline already passed -> skipped/deadline without calling Claude", async () => {
    const s = setup({ budgetMs: -5_000 });
    const calls = claudeQueue([toolReply(allYes())]);
    const rec = await io.checkInBackground(s.input());
    assert.equal(calls.length, 0);
    assert.equal(rec.status, "skipped");
    assert.equal(rec.reason, "deadline");
    assert.deepEqual(s.writes, [rec]);
  });

  test("boundary: exactly CHECK_ESTIMATE_MS left still checks, with the timeout cut to the time left", async () => {
    const s = setup({ budgetMs: io.CHECK_ESTIMATE_MS });
    const calls = claudeQueue([toolReply(allYes())]);
    const rec = await io.checkInBackground(s.input());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].reqOpts.timeout, 20_000);
    assert.equal(rec.status, "pass");
  });

  test("the check timeout is min(40000, time left)", async () => {
    const calls = claudeQueue([toolReply(allYes())]);
    await io.checkInBackground(setup({ budgetMs: 25_000 }).input());
    await io.checkInBackground(setup().input());
    assert.equal(calls[0].reqOpts.timeout, 25_000);
    assert.equal(calls[1].reqOpts.timeout, 40_000);
  });

  test("writeRecord returning false is logged once and not retried; the record is still returned", async () => {
    const s = setup({ write: false });
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const rec = await io.checkInBackground(s.input());
    assert.equal(s.writes.length, 1);
    assert.equal(rec.status, "fail");
    assert.ok(s.logs.includes("[visual-check] scene 7 record status=fail not stored: writeRecord returned false"), s.logs.join("\n"));
  });

  test("writeRecord throwing is logged once and not retried; checkInBackground still resolves", async () => {
    const s = setup({ write: "throw" });
    claudeQueue([toolReply(allYes())], s.advanceCheck);
    const rec = await io.checkInBackground(s.input());
    assert.equal(s.writes.length, 1);
    assert.equal(rec.status, "pass");
    assert.ok(s.logs.includes("[visual-check] scene 7 record status=pass not stored: writeRecord threw Error"), s.logs.join("\n"));
  });

  test("startedAt given as epoch ms is kept as ISO in the final record", async () => {
    const s = setup();
    claudeQueue([toolReply(allYes())], s.advanceCheck);
    const rec = await io.checkInBackground(s.input({ startedAt: Date.parse(STARTED_AT) }));
    assert.equal(rec.started_at, STARTED_AT);
    assert.equal(s.writes[0].started_at, STARTED_AT);
  });

  test("negative: a missing deadline still checks the image once, with the default 40s timeout", async () => {
    const s = setup();
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const rec = await io.checkInBackground(s.input({ deadlineAt: undefined }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].reqOpts.timeout, 40_000);
    assert.equal(rec.status, "fail");
    assert.equal(s.renders(), 0);
  });

  test("negative: no writeRecord, a throwing log and a null input never reject", async () => {
    // Arrange
    claudeQueue([toolReply(allYes())]);
    const s = setup();
    // Act
    const noWrite = await io.checkInBackground(
      s.input({
        writeRecord: undefined,
        log: () => {
          throw new Error("log sink down");
        },
      }),
    );
    const bare = await io.checkInBackground(null);
    // Assert
    assert.equal(noWrite.status, "pass");
    assert.equal(bare.status, "skipped");
    assert.equal(bare.reason, "no_facts");
  });
});

describe("redoInBackground", () => {
  useGlobals();

  /**
   * A fake clock; renders 1, 2 ... return a distinct image per index (png(i + 1)) and
   * advance the clock; swap and writeRecord record every call.
   */
  function setup({
    renderMs = 10_000,
    checkMs = 15_000,
    budgetMs = 360_000,
    results = null as null | Array<"ok" | "null" | "throw">,
    swapResult = true as unknown,
  } = {}) {
    let clock = 1_000_000;
    const start = clock;
    const indexes: number[] = [];
    const signals: Array<AbortSignal | undefined> = [];
    const swaps: Json[] = [];
    const writes: Json[] = [];
    const logs: string[] = [];
    const render = async (i: number, signal?: AbortSignal) => {
      indexes.push(i);
      signals.push(signal);
      clock += renderMs;
      const kind = results ? results[Math.min(i - 1, results.length - 1)] : "ok";
      if (kind === "throw") throw new Error("together 500");
      if (kind === "null") return null;
      return { b64: png(i + 1), model: FLUX2, seed: 100 + i };
    };
    return {
      indexes,
      signals,
      swaps,
      writes,
      logs,
      advanceCheck: () => (clock += checkMs),
      input: (extra: Record<string, unknown> = {}) => ({
        first: { b64: png(1), model: FLUX2, seed: 100 },
        facts: FACTS,
        render,
        maxAttempts: 3,
        deadlineAt: start + budgetMs,
        swap: async (attempt: Json, record: Json) => {
          swaps.push({ attempt, record });
          if (swapResult === "throw") throw new Error("storage down");
          return swapResult;
        },
        writeRecord: async (record: Json, stored: Json) => {
          writes.push({ record, stored });
          return true;
        },
        startedAt: STARTED_AT,
        tag: "instagram-post",
        log: (l: string) => logs.push(l),
        now: () => clock,
        ...extra,
      }),
    };
  }

  test("the stored image passes: no render, no swap, one write describing attempt 0", async () => {
    // Arrange
    const s = setup();
    const calls = claudeQueue([toolReply(allYes())], s.advanceCheck);
    // Act
    const rec = await io.redoInBackground(s.input());
    // Assert
    assert.equal(calls.length, 1);
    assert.equal(calls[0].params.messages[0].content[0].source.data, png(1));
    assert.deepEqual(s.indexes, []);
    assert.equal(s.swaps.length, 0);
    assert.equal(s.writes.length, 1);
    assert.deepEqual(s.writes[0].record, rec);
    assert.equal(s.writes[0].stored.index, 0);
    assert.equal(s.writes[0].stored.b64, png(1));
    const { checked_at, ...rest } = rec;
    assert.deepEqual(rest, { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], unclear: 0, reason: null, image_model: FLUX2, started_at: STARTED_AT });
    assert.ok(!Number.isNaN(Date.parse(checked_at)), String(checked_at));
  });

  test("fail, then a render with fewer failed facts: swapped in once, final record attempts 2 chosen 1", async () => {
    // Arrange: the stored image contradicts two facts, re-render 1 only one
    const s = setup();
    const calls = claudeQueue([toolReply(failing(2)), toolReply(failing(1))], s.advanceCheck);
    // Act
    const rec = await io.redoInBackground(s.input({ maxAttempts: 2 }));
    // Assert
    assert.deepEqual(s.indexes, [1]);
    assert.ok(s.signals[0] instanceof AbortSignal, "a background re-render always gets its abort signal");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].params.messages[0].content[0].source.data, png(2), "the re-render is checked");
    assert.equal(s.swaps.length, 1);
    const { attempt, record } = s.swaps[0];
    assert.equal(attempt.b64, png(2));
    assert.equal(attempt.model, FLUX2);
    assert.equal(attempt.seed, 101, "fields the render returned reach the swap");
    assert.equal(attempt.index, 1);
    assert.equal(record.status, "fail");
    assert.equal(record.attempts, 2);
    assert.equal(record.chosen_attempt, 1);
    assert.deepEqual(record.failed, [{ fact: FACTS[0], observed: "wrong 1" }]);
    assert.equal(record.image_model, FLUX2);
    assert.equal(record.started_at, STARTED_AT);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 1);
    assert.deepEqual(rec.failed, [{ fact: FACTS[0], observed: "wrong 1" }]);
    assert.equal(rec.reason, "max_attempts");
    assert.equal(rec.started_at, STARTED_AT);
    assert.equal(s.writes.length, 1);
    assert.deepEqual(s.writes[0].record, rec);
    assert.equal(s.writes[0].stored.index, 1);
    assert.equal(s.writes[0].stored.b64, png(2));
  });

  test("fail, then a passing render: swapped in, and the loop stops although attempts remain", async () => {
    const s = setup();
    const calls = claudeQueue([toolReply(failing(1)), toolReply(allYes())], s.advanceCheck);
    const rec = await io.redoInBackground(s.input({ maxAttempts: 3 }));
    assert.deepEqual(s.indexes, [1]);
    assert.equal(calls.length, 2);
    assert.equal(s.swaps.length, 1);
    assert.equal(s.swaps[0].record.status, "pass");
    assert.equal(s.swaps[0].record.reason, null);
    assert.equal(rec.status, "pass");
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 1);
    assert.deepEqual(rec.failed, []);
    assert.equal(rec.reason, null);
    assert.equal(s.writes.length, 1);
    assert.equal(s.writes[0].stored.index, 1);
  });

  test("fail, then a worse render: nothing is swapped and the final record keeps attempt 0", async () => {
    const s = setup();
    claudeQueue([toolReply(failing(1)), toolReply(failing(2))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input({ maxAttempts: 2 }));
    assert.deepEqual(s.indexes, [1]);
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 0);
    assert.deepEqual(rec.failed, [{ fact: FACTS[0], observed: "wrong 1" }]);
    assert.equal(rec.reason, "max_attempts");
    assert.equal(s.writes.length, 1);
    assert.equal(s.writes[0].stored.index, 0);
    assert.ok(s.logs.some((l) => l.includes("attempt=1 failed=2 is not better than stored attempt=0 failed=1")), s.logs.join("\n"));
  });

  test("boundary: a render with as many failed facts is not better, so the stored image stays", async () => {
    const s = setup();
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input({ maxAttempts: 2 }));
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.attempts, 2);
  });

  test("a worse render and then a better one: only the better one is swapped in", async () => {
    const s = setup();
    claudeQueue([toolReply(failing(2)), toolReply(failing(3)), toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input({ maxAttempts: 3 }));
    assert.deepEqual(s.indexes, [1, 2], "attemptIndex passed 1, 2");
    assert.equal(s.swaps.length, 1);
    assert.equal(s.swaps[0].attempt.index, 2);
    assert.equal(s.swaps[0].record.attempts, 3);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 3);
    assert.equal(rec.chosen_attempt, 2);
    assert.equal(rec.failed.length, 1);
    assert.equal(rec.reason, "max_attempts");
  });

  test("swap returns false: the loop stops without another render and the final record describes the image still stored", async () => {
    // Arrange: re-render 1 is better, but the row was reviewed meanwhile
    const s = setup({ swapResult: false });
    const calls = claudeQueue([toolReply(failing(2)), toolReply(failing(1)), toolReply(allYes())], s.advanceCheck);
    // Act
    const rec = await io.redoInBackground(s.input({ maxAttempts: 3 }));
    // Assert
    assert.deepEqual(s.indexes, [1], "no render after the refused swap");
    assert.equal(calls.length, 2);
    assert.equal(s.swaps.length, 1);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 0);
    assert.deepEqual(rec.failed, [
      { fact: FACTS[0], observed: "wrong 1" },
      { fact: FACTS[1], observed: "wrong 2" },
    ]);
    assert.equal(rec.reason, "swap_failed");
    assert.equal(s.writes.length, 1);
    assert.equal(s.writes[0].stored.index, 0);
    assert.equal(s.writes[0].stored.b64, png(1));
    assert.ok(s.logs.some((l) => l.includes("attempt=1 not swapped in: the row keeps attempt=0")), s.logs.join("\n"));
  });

  test("a swap that throws counts as false", async () => {
    const s = setup({ swapResult: "throw" });
    claudeQueue([toolReply(failing(2)), toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input({ maxAttempts: 3 }));
    assert.deepEqual(s.indexes, [1]);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "swap_failed");
    assert.equal(s.writes.length, 1);
    assert.ok(s.logs.some((l) => l.includes("attempt=1 swap threw Error")), s.logs.join("\n"));
  });

  test("boundary: only a swap that returns exactly true replaces the stored image", async () => {
    const s = setup({ swapResult: 1 });
    claudeQueue([toolReply(failing(2)), toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input({ maxAttempts: 3 }));
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "swap_failed");
  });

  test("a re-render that throws ends the loop: nothing swapped, attempt 0 kept, render_failed", async () => {
    const s = setup({ results: ["throw"] });
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input());
    assert.deepEqual(s.indexes, [1]);
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "render_failed");
    assert.equal(s.writes.length, 1);
    assert.ok(s.logs.some((l) => l.includes("render attempt=1 threw Error")));
  });

  test("a re-render that returns null ends the loop the same way", async () => {
    const s = setup({ results: ["null"] });
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input());
    assert.deepEqual(s.indexes, [1]);
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.reason, "render_failed");
    assert.equal(rec.attempts, 2);
  });

  test("the deadline blocks a re-render that would not fit", async () => {
    // Arrange: the check ends at +15s; a re-render needs 30s (estimate) + 15s (check) + 5s margin: +65s > +64.999s
    const s = setup({ budgetMs: 15_000 + io.RENDER_ESTIMATE_MS + 15_000 + 5_000 - 1 });
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    // Act
    const rec = await io.redoInBackground(s.input());
    // Assert
    assert.deepEqual(s.indexes, []);
    assert.equal(calls.length, 1);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 1);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "deadline");
    assert.equal(s.writes.length, 1);
  });

  test("boundary: a re-render that exactly fits the deadline runs", async () => {
    const s = setup({ budgetMs: 15_000 + io.RENDER_ESTIMATE_MS + 15_000 + 5_000 });
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input());
    assert.deepEqual(s.indexes, [1]);
    assert.equal(rec.attempts, 2);
    assert.equal(rec.reason, "deadline", "no time for a third render");
  });

  test("maxAttempts caps the renders: 1 or missing never re-renders, 3 renders at most twice", async () => {
    // Arrange
    const one = setup();
    const missing = setup();
    const three = setup();
    claudeQueue([toolReply(failing(1))], one.advanceCheck);
    // Act
    const r1 = await io.redoInBackground(one.input({ maxAttempts: 1 }));
    const r2 = await io.redoInBackground(missing.input({ maxAttempts: undefined }));
    const r3 = await io.redoInBackground(three.input({ maxAttempts: 3 }));
    // Assert
    assert.deepEqual(one.indexes, []);
    assert.equal(r1.reason, "max_attempts");
    assert.equal(r1.attempts, 1);
    assert.deepEqual(missing.indexes, []);
    assert.equal(r2.attempts, 1);
    assert.deepEqual(three.indexes, [1, 2]);
    assert.equal(r3.attempts, 3);
    assert.equal(r3.reason, "max_attempts");
  });

  test("a checker error on the stored image: recorded and written, no render, no swap", async () => {
    const s = setup();
    g.__anthropicCreate = async () => {
      throw new APIError(500, "server error");
    };
    const rec = await io.redoInBackground(s.input());
    assert.deepEqual(s.indexes, []);
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.status, "error");
    assert.equal(rec.reason, "api_error_500");
    assert.equal(rec.attempts, 1);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.started_at, STARTED_AT);
    assert.equal(s.writes.length, 1);
    assert.deepEqual(s.writes[0].record, rec);
  });

  test("a skipped check on the stored image (kill switch): recorded, no render", async () => {
    ENV.VISUAL_CHECK_ENABLED = "false";
    const s = setup();
    const rec = await io.redoInBackground(s.input());
    assert.deepEqual(s.indexes, []);
    assert.equal(rec.status, "skipped");
    assert.equal(rec.reason, "disabled");
    assert.equal(s.writes.length, 1);
  });

  test("too close to the deadline for the first check: skipped/deadline without calling Claude or rendering", async () => {
    const s = setup({ budgetMs: io.CHECK_ESTIMATE_MS - 1 });
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input());
    assert.equal(calls.length, 0);
    assert.deepEqual(s.indexes, []);
    assert.equal(rec.status, "skipped");
    assert.equal(rec.reason, "deadline");
    assert.equal(s.writes.length, 1);
  });

  test("a stored image marked skipCheck is recorded with that reason, never checked or re-rendered", async () => {
    const s = setup();
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input({ first: { b64: png(1), model: "black-forest-labs/FLUX.1.1-pro", skipCheck: "safe_fallback" } }));
    assert.equal(calls.length, 0);
    assert.deepEqual(s.indexes, []);
    assert.equal(rec.status, "skipped");
    assert.equal(rec.reason, "safe_fallback");
    assert.equal(rec.image_model, "black-forest-labs/FLUX.1.1-pro");
  });

  test("a checker error on a re-render stops the loop and keeps the stored image", async () => {
    const s = setup();
    claudeQueue(
      [
        toolReply(failing(1)),
        () => {
          throw new APIError(529, "overloaded");
        },
      ],
      s.advanceCheck,
    );
    const rec = await io.redoInBackground(s.input());
    assert.deepEqual(s.indexes, [1]);
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "check_error");
  });

  test("a re-render from SAFE_FALLBACK is never checked or swapped in", async () => {
    // Arrange
    const s = setup();
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const render = async (i: number) => ({ b64: png(i + 1), model: "black-forest-labs/FLUX.1.1-pro", skipCheck: "safe_fallback" });
    // Act
    const rec = await io.redoInBackground(s.input({ render }));
    // Assert
    assert.equal(calls.length, 1);
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "safe_fallback");
  });

  test("a re-render that ends too close to the deadline for its check is not checked", async () => {
    // Arrange: check 15s, then an 80s render ends at +95s, 5s before the deadline
    const s = setup({ budgetMs: 100_000, renderMs: 80_000 });
    const calls = claudeQueue([toolReply(failing(1)), toolReply(allYes())], s.advanceCheck);
    // Act
    const rec = await io.redoInBackground(s.input());
    // Assert
    assert.deepEqual(s.indexes, [1]);
    assert.equal(calls.length, 1);
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "deadline");
  });

  // deno-lint-ignore no-explicit-any
  test("a re-render still running where its check could no longer start is abandoned: its signal aborts at deadlineAt minus the check reserve", async (t: any) => {
    // Arrange: the stored image's check takes 15s (t=15s). A re-render may start
    // (15 + 30 + 15 + 5 <= 360) but never answers: it is abandoned at 360 - 15 = 345s,
    // 330s after it started.
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let clock = 1_000_000;
    const start = clock;
    const signals: Array<AbortSignal | undefined> = [];
    const aborted: { before?: boolean; at?: boolean } = {};
    const swaps: unknown[] = [];
    const writes: Json[] = [];
    const logs: string[] = [];
    const calls = claudeQueue([toolReply(failing(1))], () => (clock += 15_000));
    const render = async (_i: number, signal?: AbortSignal) => {
      signals.push(signal);
      setImmediate(() => {
        t.mock.timers.tick(330_000 - 1);
        aborted.before = signal?.aborted === true;
        t.mock.timers.tick(1);
        aborted.at = signal?.aborted === true;
      });
      return new Promise<never>(() => {}); // ignores its signal
    };
    // Act
    const limit = realTimeLimit(2000, "redoInBackground");
    let rec: Json;
    try {
      rec = await Promise.race([
        io.redoInBackground({
          first: { b64: png(1), model: FLUX2 },
          facts: FACTS,
          render,
          maxAttempts: 3,
          deadlineAt: start + 360_000,
          swap: async (...a: unknown[]) => {
            swaps.push(a);
            return true;
          },
          writeRecord: async (record: Json) => {
            writes.push(record);
            return true;
          },
          startedAt: STARTED_AT,
          tag: "instagram-post",
          log: (l: string) => logs.push(l),
          now: () => clock,
        }),
        limit.promise,
      ]);
    } finally {
      limit.clear();
    }
    // Assert
    assert.equal(signals.length, 1);
    assert.ok(signals[0] instanceof AbortSignal);
    assert.equal(aborted.before, false, "not abandoned while its check could still start");
    assert.equal(aborted.at, true, "abandoned exactly at deadlineAt minus the check reserve");
    assert.equal(calls.length, 1, "the abandoned render is never checked");
    assert.equal(swaps.length, 0);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "render_failed");
    assert.deepEqual(writes, [rec]);
    assert.ok(logs.some((l) => l.includes("render attempt=1 stopped")), logs.join("\n"));
  });

  test("negative: a missing deadline checks the stored image once and never re-renders", async () => {
    const s = setup();
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const rec = await io.redoInBackground(s.input({ deadlineAt: undefined }));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].reqOpts.timeout, 40_000);
    assert.deepEqual(s.indexes, []);
    assert.equal(rec.status, "fail");
    assert.equal(rec.reason, "deadline");
  });

  test("the final writeRecord returning false is logged once and not retried", async () => {
    const s = setup();
    claudeQueue([toolReply(allYes())], s.advanceCheck);
    let writes = 0;
    const rec = await io.redoInBackground(
      s.input({
        writeRecord: async () => {
          writes++;
          return false;
        },
      }),
    );
    assert.equal(writes, 1);
    assert.equal(rec.status, "pass");
    assert.ok(s.logs.includes("[visual-check] instagram-post record status=pass not stored: writeRecord returned false"), s.logs.join("\n"));
  });

  test("the post is reviewed before the first check answers: stillCurrent false stops the loop before any re-render, reason row_changed", async () => {
    // Arrange: every check fails the same fact, so without stillCurrent two re-renders and two more checks follow
    const s = setup();
    const calls = claudeQueue([toolReply(failing(1))], s.advanceCheck);
    let asked = 0;
    // Act
    const rec = await io.redoInBackground(
      s.input({
        stillCurrent: async () => {
          asked++;
          return false;
        },
      }),
    );
    // Assert
    assert.deepEqual(s.indexes, [], "no render is paid for a reviewed post");
    assert.equal(calls.length, 1, "only the stored image's check");
    assert.equal(asked, 1);
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 1);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "row_changed");
    assert.deepEqual(s.writes.map((w) => w.record), [rec]);
    assert.equal(s.writes[0].stored.index, 0);
    assert.ok(s.logs.some((l) => l.includes("the row changed (reviewed or replaced): no re-render after attempt=0")), s.logs.join("\n"));
  });

  test("the post is reviewed while a re-render draws: stillCurrent false before its check, so that render is never checked or swapped", async () => {
    // Arrange: still current before the render, not before its check
    const s = setup();
    const calls = claudeQueue([toolReply(failing(1)), toolReply(allYes())], s.advanceCheck);
    const answers = [true, false];
    // Act
    const rec = await io.redoInBackground(s.input({ stillCurrent: () => answers.shift() }));
    // Assert
    assert.deepEqual(s.indexes, [1]);
    assert.equal(calls.length, 1);
    assert.equal(s.swaps.length, 0);
    assert.equal(rec.attempts, 2);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.reason, "row_changed");
    assert.ok(s.logs.some((l) => l.includes("the row changed (reviewed or replaced): attempt=1 is not checked")), s.logs.join("\n"));
  });

  test("stillCurrent is asked before every re-render and before its check while the post stays current", async () => {
    // Arrange
    const s = setup();
    claudeQueue([toolReply(failing(1))], s.advanceCheck);
    const asked: number[] = [];
    // Act
    const rec = await io.redoInBackground(
      s.input({
        stillCurrent: () => {
          asked.push(s.indexes.length);
          return true;
        },
      }),
    );
    // Assert: renders done when asked: before render 1 (0), before check 1 (1), before render 2 (1), before check 2 (2)
    assert.deepEqual(asked, [0, 1, 1, 2]);
    assert.deepEqual(s.indexes, [1, 2]);
    assert.equal(rec.reason, "max_attempts");
  });

  test("a stillCurrent that throws or answers anything but false is logged or ignored, and the loop carries on", async () => {
    // Arrange
    const throwing = setup();
    const undecided = setup();
    claudeQueue([toolReply(failing(1))], throwing.advanceCheck);
    // Act
    const r1 = await io.redoInBackground(
      throwing.input({
        stillCurrent: async () => {
          throw new Error("db down");
        },
      }),
    );
    const r2 = await io.redoInBackground(undecided.input({ stillCurrent: () => undefined, maxAttempts: 2 }));
    // Assert
    assert.deepEqual(throwing.indexes, [1, 2]);
    assert.equal(r1.reason, "max_attempts");
    assert.ok(throwing.logs.some((l) => l.includes("stillCurrent threw Error: carrying on")), throwing.logs.join("\n"));
    assert.deepEqual(undecided.indexes, [1]);
    assert.equal(r2.reason, "max_attempts");
  });

  test("negative: a null input, a throwing log and a missing writeRecord or swap never reject", async () => {
    // Arrange
    const s = setup();
    claudeQueue([toolReply(failing(2)), toolReply(failing(1))], s.advanceCheck);
    // Act
    const bare = await io.redoInBackground(null);
    const noSwap = await io.redoInBackground(
      s.input({
        swap: undefined,
        writeRecord: undefined,
        log: () => {
          throw new Error("log sink down");
        },
      }),
    );
    // Assert
    assert.equal(bare.status, "skipped");
    assert.equal(bare.reason, "no_facts");
    assert.equal(noSwap.status, "fail");
    assert.equal(noSwap.chosen_attempt, 0);
    assert.equal(noSwap.reason, "swap_failed");
  });
});

describe("backgroundDeadline counts from the worker start", () => {
  useGlobals();
  const W = 1_757_844_000_000;
  const S = 1_000;

  /** Runs fn with the worker start set to `at`, then puts the previous value back. */
  async function onWorker<T>(at: number | null, fn: () => T | Promise<T>): Promise<T> {
    const previous = io.setWorkerStartedAt(at);
    try {
      return await fn();
    } finally {
      io.setWorkerStartedAt(previous);
    }
  }

  test("a request served by a worker that started 180s earlier gets 360s from the worker start, not from the request", async () => {
    // Arrange / Act
    const deadline = await onWorker(W, () => io.backgroundDeadline(W + 180 * S));
    // Assert
    assert.equal(deadline, W + 360 * S);
  });

  test("boundary: the request that started the worker keeps its full 360s; a request start before the worker start counts from the request", async () => {
    const same = await onWorker(W, () => io.backgroundDeadline(W));
    const earlier = await onWorker(W, () => io.backgroundDeadline(W - 5 * S));
    assert.equal(same, W + 360 * S);
    assert.equal(earlier, W - 5 * S + 360 * S);
  });

  test("an unknown worker start counts from the request, and a start that is not a finite number is unknown", async () => {
    // Arrange / Act
    const unknown = await onWorker(null, () => io.backgroundDeadline(W + 180 * S));
    const notANumber = await onWorker(Number.NaN, () => io.backgroundDeadline(W + 180 * S));
    // Assert
    assert.equal(unknown, W + 540 * S);
    assert.equal(notANumber, W + 540 * S);
  });

  test("negative: a request start that is not a finite number still gives NaN, so nothing is re-rendered", async () => {
    // deno-lint-ignore no-explicit-any
    for (const v of [undefined, null, Number.NaN, "1757844000000"] as any[]) {
      assert.ok(Number.isNaN(await onWorker(W, () => io.backgroundDeadline(v))), String(v));
    }
  });

  test("the module records when the worker started, and setWorkerStartedAt returns the value it replaced", async () => {
    // Arrange / Act
    const loadedAt = io.setWorkerStartedAt(null);
    const back = io.setWorkerStartedAt(loadedAt);
    // Assert
    assert.equal(back, null);
    assert.ok(loadedAt === null || (Number.isFinite(loadedAt) && loadedAt <= Date.now()), String(loadedAt));
  });

  test("a redo on a worker that started 180s before its request stops at the worker's 360s: no re-render that the 400s kill would cut off", async () => {
    // Arrange: fake clock in worker age; the response went out at 260s; checks take 35s, renders 20s
    let clock = W + 260 * S;
    const indexes: number[] = [];
    const writes: Json[] = [];
    claudeQueue([toolReply(failing(1))], () => (clock += 35 * S));
    const deadlineAt = await onWorker(W, () => io.backgroundDeadline(W + 180 * S));
    // Act
    const rec = await io.redoInBackground({
      first: { b64: png(1), model: FLUX2 },
      facts: FACTS,
      render: async (i: number) => {
        indexes.push(i);
        clock += 20 * S;
        return { b64: png(i + 1), model: FLUX2 };
      },
      maxAttempts: 3,
      deadlineAt,
      swap: async () => true,
      writeRecord: async (record: Json) => {
        writes.push({ record, at: clock });
        return true;
      },
      startedAt: STARTED_AT,
      tag: "instagram-post",
      log: () => {},
      now: () => clock,
    });
    // Assert: check 0 ends at 295s; a 30s render, a 35s check and 5s of margin would pass 360s
    assert.deepEqual(indexes, []);
    assert.equal(rec.status, "fail");
    assert.equal(rec.attempts, 1);
    assert.equal(rec.reason, "deadline");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].at, W + 295 * S, "the final record is written well before the worker is stopped at 400s");
  });
});

describe("visualCheck.ts imports", () => {
  test("imports exactly the pinned SDK version, once, and re-exports the core", () => {
    // Arrange
    const src = readFileSync(new URL("../supabase/functions/_shared/visualCheck.ts", import.meta.url), "utf8");
    // Act
    const specifiers = [...src.matchAll(/from\s+"(npm:@anthropic-ai\/sdk[^"]*)"/g)].map((m) => m[1]);
    // Assert
    assert.ok(src.split("\n").includes('import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";'));
    assert.deepEqual(specifiers, ["npm:@anthropic-ai/sdk@0.125.0"]);
    assert.equal(typeof io.imagePayload, "function");
    assert.equal(typeof io.visualCheckRecord, "function");
  });
});
