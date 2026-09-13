// Offline tests for the visual-check IO wrapper (_shared/visualCheck.ts).
// No network, no real keys, no paid calls: npm:@anthropic-ai/sdk resolves to a
// stub (tests/helpers) whose create() calls globalThis.__anthropicCreate.
// Globals (Deno.env, __anthropicCreate, console.log) are installed in before()
// and restored in after(), so this file never overlaps the other suites.
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
