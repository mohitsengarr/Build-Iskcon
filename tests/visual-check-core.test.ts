// Unit tests for the pure visual-check core (_shared/visualCheckCore.ts).
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildVisualCheckParams,
  detectImageMediaType,
  imagePayload,
  MAX_CHECK_IMAGE_B64_CHARS,
  MAX_OBSERVED_CHARS,
  parseVisualCheck,
  pickBest,
  RETRY_MARGIN_MS,
  shouldRetry,
  verdictFor,
  VISUAL_CHECK_TOOL,
  visualCheckRecord,
} from "../supabase/functions/_shared/visualCheckCore.ts";

const FACTS = [
  "Arjuna's chariot is drawn by exactly four white horses",
  "Arjuna holds the Gandiva bow",
  "Krishna holds the reins",
];

const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");
const PNG_B64 = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG_B64 = b64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

function toolMessage(checks: unknown, name = "record_visual_check") {
  return {
    stop_reason: "tool_use",
    content: [{ type: "thinking", thinking: "" }, { type: "tool_use", id: "t1", name, input: { checks } }],
  };
}

describe("VISUAL_CHECK_TOOL", () => {
  // deno-lint-ignore no-explicit-any
  function objects(schema: any, out: any[] = []): any[] {
    if (schema && typeof schema === "object") {
      if (schema.type === "object") out.push(schema);
      for (const v of Object.values(schema)) objects(v, out);
    }
    return out;
  }

  test("is a strict tool named record_visual_check", () => {
    // Arrange / Act
    const tool = VISUAL_CHECK_TOOL;
    // Assert
    assert.equal(tool.name, "record_visual_check");
    assert.equal(tool.strict, true);
    assert.equal(tool.input_schema.type, "object");
  });

  test("every object is closed and requires every one of its properties", () => {
    const objs = objects(VISUAL_CHECK_TOOL.input_schema);
    assert.equal(objs.length, 2, "the input object and the check item");
    for (const o of objs) {
      assert.equal(o.additionalProperties, false);
      assert.deepEqual([...o.required].sort(), Object.keys(o.properties).sort());
    }
  });

  test("a check is { fact_index: integer, verdict: yes|no|unclear, observed: string }", () => {
    const item = VISUAL_CHECK_TOOL.input_schema.properties.checks.items;
    assert.equal(VISUAL_CHECK_TOOL.input_schema.properties.checks.type, "array");
    assert.equal(item.properties.fact_index.type, "integer");
    assert.equal(item.properties.verdict.type, "string");
    assert.deepEqual(item.properties.verdict.enum, ["yes", "no", "unclear"]);
    assert.equal(item.properties.observed.type, "string");
  });
});

describe("buildVisualCheckParams", () => {
  test("model, effort, betas, fallbacks, tool and tool_choice match the proven Claude call", () => {
    // Arrange / Act
    const p = buildVisualCheckParams({ facts: FACTS, imageB64: PNG_B64, mediaType: "image/png" });
    // Assert
    assert.equal(p.model, "claude-opus-5");
    assert.equal(p.max_tokens, 8000);
    assert.deepEqual(p.output_config, { effort: "medium" });
    assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
    assert.equal(p.fallbacks, "default");
    assert.deepEqual(p.tools, [VISUAL_CHECK_TOOL]);
    assert.deepEqual(p.tool_choice, { type: "auto" });
  });

  test("one user message: the image block first, then the text with the facts numbered 1..n", () => {
    const p = buildVisualCheckParams({ facts: FACTS, imageB64: JPEG_B64, mediaType: "image/jpeg" });
    assert.equal(p.messages.length, 1);
    assert.equal(p.messages[0].role, "user");
    const [image, text] = p.messages[0].content;
    assert.deepEqual(image, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: JPEG_B64 } });
    assert.equal(text.type, "text");
    const body = (text as { text: string }).text;
    assert.ok(body.includes(`1. ${FACTS[0]}\n2. ${FACTS[1]}\n3. ${FACTS[2]}`), body);
  });

  test("the text defines yes/no/unclear, asks to count one by one and names the tool", () => {
    const body = (buildVisualCheckParams({ facts: FACTS, imageB64: PNG_B64, mediaType: "image/png" }).messages[0]
      .content[1] as { text: string }).text;
    assert.match(body, /"yes" if the painting clearly shows it/);
    assert.match(body, /"no" if the painting clearly contradicts it: a wrong count, the wrong person holding an object, or a required element missing/);
    assert.match(body, /"unclear" if you cannot tell/);
    assert.match(body, /count the items one by one and put the number you counted in observed/);
    assert.match(body, /record_visual_check/);
  });

  test("boundary: a fact with line breaks stays on its own numbered line, and numbering passes 9", () => {
    const facts = ["Krishna has\nblue skin", ...Array.from({ length: 10 }, (_, i) => `detail ${i + 2}`)];
    const body = (buildVisualCheckParams({ facts, imageB64: PNG_B64, mediaType: "image/png" }).messages[0].content[1] as {
      text: string;
    }).text;
    assert.ok(body.includes("1. Krishna has blue skin\n2. detail 2"));
    assert.ok(body.includes("\n11. detail 11"));
  });

  test("negative: no system prompt, no forced tool and no thinking override", () => {
    const p = buildVisualCheckParams({ facts: FACTS, imageB64: PNG_B64, mediaType: "image/png" }) as Record<string, unknown>;
    assert.equal("system" in p, false);
    assert.equal("thinking" in p, false);
    assert.notEqual((p.tool_choice as { type: string }).type, "tool");
  });
});

describe("parseVisualCheck", () => {
  test("reads the tool answer after a thinking block", () => {
    // Arrange
    const msg = toolMessage([
      { fact_index: 1, verdict: "no", observed: "3 horses counted" },
      { fact_index: 2, verdict: "yes", observed: "Arjuna holds a bow" },
    ]);
    // Act
    const r = parseVisualCheck(msg, 3);
    // Assert
    assert.equal(r.outcome, "ok");
    assert.deepEqual(r.checks, [
      { fact_index: 1, verdict: "no", observed: "3 horses counted" },
      { fact_index: 2, verdict: "yes", observed: "Arjuna holds a bow" },
    ]);
  });

  test("drops out-of-range and non-integer indexes", () => {
    const msg = toolMessage([
      { fact_index: 0, verdict: "no", observed: "zero" },
      { fact_index: 4, verdict: "no", observed: "past the end" },
      { fact_index: -1, verdict: "no", observed: "negative" },
      { fact_index: 1.5, verdict: "no", observed: "fraction" },
      { fact_index: "2", verdict: "no", observed: "string" },
      { fact_index: 3, verdict: "yes", observed: "reins" },
    ]);
    const r = parseVisualCheck(msg, 3);
    assert.deepEqual(r.checks.map((c) => c.fact_index), [3]);
  });

  test("a duplicate index keeps the first answer", () => {
    const msg = toolMessage([
      { fact_index: 1, verdict: "yes", observed: "four horses" },
      { fact_index: 1, verdict: "no", observed: "three horses" },
    ]);
    const r = parseVisualCheck(msg, 3);
    assert.deepEqual(r.checks, [{ fact_index: 1, verdict: "yes", observed: "four horses" }]);
  });

  test("an invalid verdict is not an answer, so a later valid one for that index still counts", () => {
    const msg = toolMessage([
      { fact_index: 2, verdict: "maybe", observed: "?" },
      { fact_index: 2, verdict: "no", observed: "Krishna holds the bow" },
    ]);
    const r = parseVisualCheck(msg, 3);
    assert.deepEqual(r.checks, [{ fact_index: 2, verdict: "no", observed: "Krishna holds the bow" }]);
  });

  test("boundary: observed is trimmed to one line and capped; a non-string observed becomes empty", () => {
    const msg = toolMessage([
      { fact_index: 1, verdict: "no", observed: `  three\nhorses ${"x".repeat(400)}` },
      { fact_index: 2, verdict: "unclear", observed: 42 },
    ]);
    const r = parseVisualCheck(msg, 2);
    assert.equal(r.checks[0].observed.length, MAX_OBSERVED_CHARS);
    assert.ok(r.checks[0].observed.startsWith("three horses "));
    assert.equal(r.checks[1].observed, "");
  });

  test("refusal -> outcome refusal with no checks", () => {
    const r = parseVisualCheck({ stop_reason: "refusal", content: [] }, 3);
    assert.deepEqual(r, { outcome: "refusal", checks: [] });
  });

  test("no tool call, another tool, a non-array checks field or no message -> no_tool", () => {
    assert.equal(parseVisualCheck({ stop_reason: "end_turn", content: [{ type: "text", text: "four horses" }] }, 3).outcome, "no_tool");
    assert.equal(parseVisualCheck(toolMessage([], "record_visual_facts"), 3).outcome, "no_tool");
    assert.equal(parseVisualCheck(toolMessage({ fact_index: 1 }), 3).outcome, "no_tool");
    assert.equal(parseVisualCheck(null, 3).outcome, "no_tool");
    assert.equal(parseVisualCheck({ stop_reason: "tool_use" }, 3).outcome, "no_tool");
  });

  test("an empty checks array is a valid answer with nothing in it", () => {
    assert.deepEqual(parseVisualCheck(toolMessage([]), 3), { outcome: "ok", checks: [] });
  });
});

describe("verdictFor", () => {
  const yes = (i: number) => ({ fact_index: i, verdict: "yes" as const, observed: "shown" });

  test("every fact yes -> pass", () => {
    // Arrange
    const checks = [yes(1), yes(2), yes(3)];
    // Act
    const v = verdictFor(checks, FACTS);
    // Assert
    assert.deepEqual(v, { status: "pass", failed: [], unclear: 0, answered: 3 });
  });

  test("a no fails, with the fact text and what was observed", () => {
    const checks = [{ fact_index: 1, verdict: "no" as const, observed: "3 horses counted" }, yes(2), yes(3)];
    const v = verdictFor(checks, FACTS);
    assert.equal(v.status, "fail");
    assert.deepEqual(v.failed, [{ fact: FACTS[0], observed: "3 horses counted" }]);
    assert.equal(v.answered, 3);
  });

  test("unclear does not fail", () => {
    const v = verdictFor([yes(1), { fact_index: 2, verdict: "unclear", observed: "bow hidden" }, yes(3)], FACTS);
    assert.deepEqual(v, { status: "pass", failed: [], unclear: 1, answered: 3 });
  });

  test("a fact with no check counts as unclear, never as failed", () => {
    const v = verdictFor([yes(1)], FACTS);
    assert.deepEqual(v, { status: "pass", failed: [], unclear: 2, answered: 1 });
  });

  test("boundary: no facts -> pass with zero counts; checks outside the fact list are ignored", () => {
    assert.deepEqual(verdictFor([], []), { status: "pass", failed: [], unclear: 0, answered: 0 });
    const v = verdictFor([{ fact_index: 9, verdict: "no", observed: "x" }], FACTS);
    assert.deepEqual(v, { status: "pass", failed: [], unclear: 3, answered: 0 });
  });

  test("negative: garbage checks input does not throw", () => {
    // deno-lint-ignore no-explicit-any
    const v = verdictFor(null as any, FACTS);
    assert.equal(v.status, "pass");
    assert.equal(v.unclear, 3);
  });
});

describe("detectImageMediaType", () => {
  test("jpeg, png, webp and gif from their magic bytes", () => {
    assert.equal(detectImageMediaType(JPEG_B64), "image/jpeg");
    assert.equal(detectImageMediaType(PNG_B64), "image/png");
    const webp = b64([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
    assert.equal(detectImageMediaType(webp), "image/webp");
    assert.equal(detectImageMediaType(b64([...Buffer.from("GIF89a"), 1, 0, 1, 0])), "image/gif");
    assert.equal(detectImageMediaType(b64([...Buffer.from("GIF87a"), 1, 0, 1, 0])), "image/gif");
  });

  test("real image headers as Together returns them", () => {
    assert.equal(detectImageMediaType("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwc"), "image/jpeg");
    assert.equal(detectImageMediaType("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4"), "image/png");
  });

  test("boundary: leading whitespace is ignored; URL-safe characters decode", () => {
    assert.equal(detectImageMediaType(`\n  ${PNG_B64}`), "image/png");
    assert.equal(detectImageMediaType(JPEG_B64.replace(/\+/g, "-").replace(/\//g, "_")), "image/jpeg");
  });

  test("garbage, other formats and non-strings -> null", () => {
    assert.equal(detectImageMediaType(Buffer.from("hello world, not an image").toString("base64")), null);
    assert.equal(detectImageMediaType("!!!! not base64 at all"), null);
    assert.equal(detectImageMediaType(""), null);
    assert.equal(detectImageMediaType(b64([...Buffer.from("%PDF-1.7"), 10, 10, 10, 10])), null);
    assert.equal(detectImageMediaType(b64([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")])), null);
    assert.equal(detectImageMediaType(b64([...Buffer.from("GIF88a"), 0, 0, 0, 0])), null);
    assert.equal(detectImageMediaType(null), null);
    assert.equal(detectImageMediaType(12345), null);
  });

  test("the size cap is 5,000,000 base64 characters", () => {
    assert.equal(MAX_CHECK_IMAGE_B64_CHARS, 5_000_000);
  });
});

describe("shouldRetry", () => {
  const base = { attemptsSoFar: 1, maxAttempts: 3, now: 1_000_000, lastRenderMs: 40_000, lastCheckMs: 20_000 };

  test("attempts remain and there is time for another render and check -> true", () => {
    // Arrange
    const input = { ...base, deadlineAt: base.now + 130_000 };
    // Act / Assert
    assert.equal(shouldRetry(input), true);
  });

  test("boundary: exactly now + render + check + 5000 at the deadline -> true; one ms later -> false", () => {
    const fits = base.now + base.lastRenderMs + base.lastCheckMs + RETRY_MARGIN_MS;
    assert.equal(RETRY_MARGIN_MS, 5_000);
    assert.equal(shouldRetry({ ...base, deadlineAt: fits }), true);
    assert.equal(shouldRetry({ ...base, deadlineAt: fits - 1 }), false);
  });

  test("boundary: at maxAttempts -> false however much time is left", () => {
    assert.equal(shouldRetry({ ...base, attemptsSoFar: 3, deadlineAt: base.now + 10_000_000 }), false);
    assert.equal(shouldRetry({ ...base, attemptsSoFar: 1, maxAttempts: 1, deadlineAt: base.now + 10_000_000 }), false);
    assert.equal(shouldRetry({ ...base, attemptsSoFar: 2, deadlineAt: base.now + 10_000_000 }), true);
  });

  test("negative: a missing or non-finite deadline never retries", () => {
    assert.equal(shouldRetry({ ...base, deadlineAt: Number.NaN }), false);
    // deno-lint-ignore no-explicit-any
    assert.equal(shouldRetry({ ...base, deadlineAt: undefined as any }), false);
  });
});

describe("pickBest", () => {
  const attempt = (id: string, failed: number) => ({ id, b64: id, verdict: { failed: Array(failed).fill({ fact: "f", observed: "o" }) } });

  test("the attempt with the fewest failed facts wins", () => {
    // Arrange
    const attempts = [attempt("a", 2), attempt("b", 1), attempt("c", 3)];
    // Act
    const best = pickBest(attempts);
    // Assert
    assert.equal(best, attempts[1]);
  });

  test("ties go to the earliest", () => {
    const attempts = [attempt("a", 3), attempt("b", 1), attempt("c", 1)];
    assert.equal(pickBest(attempts)?.id, "b");
    const allEqual = [attempt("x", 1), attempt("y", 1)];
    assert.equal(pickBest(allEqual)?.id, "x");
  });

  test("negative: no attempts -> null; an attempt without a verdict never beats one with a verdict", () => {
    assert.equal(pickBest([]), null);
    const best = pickBest([{ b64: "none", verdict: null }, attempt("ok", 5)]);
    assert.equal((best as { b64: string }).b64, "ok");
  });
});

describe("imagePayload", () => {
  test("black-forest-labs model gets seed and steps", () => {
    // Arrange / Act
    const body = imagePayload("black-forest-labs/FLUX.2-pro", "a painting", 1344, 1088, { seed: 42, steps: 28 });
    // Assert
    assert.deepEqual(body, {
      model: "black-forest-labs/FLUX.2-pro",
      prompt: "a painting",
      width: 1344,
      height: 1088,
      n: 1,
      response_format: "b64_json",
      seed: 42,
      steps: 28,
    });
  });

  test("openai/gpt-image-2 never gets seed or steps", () => {
    const body = imagePayload("openai/gpt-image-2", "a painting", 1344, 1088, { seed: 42, steps: 28 });
    assert.deepEqual(body, {
      model: "openai/gpt-image-2",
      prompt: "a painting",
      width: 1344,
      height: 1088,
      n: 1,
      response_format: "b64_json",
    });
    assert.equal("seed" in body, false);
    assert.equal("steps" in body, false);
  });

  test("boundary: steps 0 or negative is omitted; seed 0 is a real seed", () => {
    const zero = imagePayload("black-forest-labs/FLUX.1-schnell", "p", 1024, 1024, { seed: 0, steps: 0 });
    assert.equal(zero.seed, 0);
    assert.equal("steps" in zero, false);
    assert.equal("steps" in imagePayload("black-forest-labs/FLUX.1-schnell", "p", 1024, 1024, { steps: -4 }), false);
  });

  test("negative: null, NaN, Infinity and string values are not sent; no options is the plain body", () => {
    const body = imagePayload("black-forest-labs/FLUX.2-pro", "p", 1, 1, {
      seed: Number.NaN,
      // deno-lint-ignore no-explicit-any
      steps: "28" as any,
    });
    assert.equal("seed" in body, false);
    assert.equal("steps" in body, false);
    assert.equal("seed" in imagePayload("black-forest-labs/FLUX.2-pro", "p", 1, 1, { seed: Infinity, steps: null }), false);
    assert.deepEqual(Object.keys(imagePayload("black-forest-labs/FLUX.2-pro", "p", 1, 1)), [
      "model",
      "prompt",
      "width",
      "height",
      "n",
      "response_format",
    ]);
  });

  test("negative: a model that only contains the prefix later is not FLUX", () => {
    const body = imagePayload("together/black-forest-labs/FLUX", "p", 1, 1, { seed: 7, steps: 4 });
    assert.equal("seed" in body, false);
  });
});

describe("visualCheckRecord", () => {
  test("stores every field as plain JSON, with checkedAt passed through", () => {
    // Arrange
    const input = {
      status: "fail" as const,
      attempts: 3,
      chosenAttempt: 1,
      failed: [{ fact: FACTS[0], observed: "3 horses counted" }],
      unclear: 1,
      reason: "max_attempts",
      imageModel: "openai/gpt-image-2",
      checkedAt: "2026-09-13T10:00:00.000Z",
    };
    // Act
    const rec = visualCheckRecord(input);
    // Assert
    assert.deepEqual(rec, {
      status: "fail",
      attempts: 3,
      chosen_attempt: 1,
      failed: [{ fact: FACTS[0], observed: "3 horses counted" }],
      unclear: 1,
      reason: "max_attempts",
      image_model: "openai/gpt-image-2",
      checked_at: "2026-09-13T10:00:00.000Z",
    });
    assert.deepEqual(JSON.parse(JSON.stringify(rec)), rec);
  });

  test("boundary: optional fields default to empty values and are never invented", () => {
    const rec = visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0 });
    assert.deepEqual(rec, {
      status: "pass",
      attempts: 1,
      chosen_attempt: 0,
      failed: [],
      unclear: 0,
      reason: null,
      image_model: null,
      checked_at: null,
    });
  });

  test("negative: the failed list is copied, not shared, and bad counts become 0", () => {
    const failed = [{ fact: "f", observed: "o" }];
    // deno-lint-ignore no-explicit-any
    const rec = visualCheckRecord({ status: "skipped", attempts: Number.NaN, chosenAttempt: -2, failed, unclear: "x" as any });
    failed[0].fact = "changed";
    assert.equal(rec.failed[0].fact, "f");
    assert.equal(rec.attempts, 0);
    assert.equal(rec.chosen_attempt, 0);
    assert.equal(rec.unclear, 0);
  });
});

describe("visualCheckCore.ts purity", () => {
  test("imports nothing and touches no Deno global, so it runs under node and Deno alike", () => {
    const src = readFileSync(new URL("../supabase/functions/_shared/visualCheckCore.ts", import.meta.url), "utf8");
    assert.equal(/^\s*import\s/m.test(src), false);
    assert.equal(/\bDeno\./.test(src), false);
    assert.equal(/\bfetch\(/.test(src), false);
    assert.equal(/Date\.now\(|new Date\(/.test(src), false, "checkedAt must be passed in");
  });
});
