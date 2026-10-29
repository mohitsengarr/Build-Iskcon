// SEN-975 (owner, 2026-10-29: "merge visual and krishna checks on sonnet").
// The image check after a render also answers the Krishna question; both checks
// ask Sonnet first and Opus only when Sonnet is unsure. A database trigger copies
// the image check's Krishna answer to krishna_check, pinned to the image it was
// stored with. No network: npm:@anthropic-ai/sdk resolves to tests/helpers'
// stub, whose create() calls globalThis.__anthropicCreate.
// Run: node --experimental-strip-types --test tests/
import { after, before, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
const models = await import("../supabase/functions/_shared/checkModels.ts");
const kcore = await import("../supabase/functions/_shared/krishnaCheckCore.ts");
const vcore = await import("../supabase/functions/_shared/visualCheckCore.ts");
// deno-lint-ignore no-explicit-any
const vio: any = await import("../supabase/functions/_shared/visualCheck.ts");
// deno-lint-ignore no-explicit-any
const kio: any = await import("../supabase/functions/_shared/krishnaCheck.ts");
// deno-lint-ignore no-explicit-any
const { APIError }: any = await import("./helpers/anthropic-stub.mjs");

// deno-lint-ignore no-explicit-any
type Json = any;
// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";
const FACTS = ["Arjuna's chariot is drawn by exactly four white horses", "Arjuna holds the Gandiva bow"];
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 7]).toString("base64");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

const krishna = (extra: Record<string, unknown> = {}) => ({
  krishna_visible: true, form: "krishna", prominence: "main", observed: "Krishna drives Arjuna's chariot.", ...extra,
});
const NOT_KRISHNA = { krishna_visible: false, form: "vishnu_or_narayana", prominence: "none", observed: "Four-armed Vishnu on Garuda." };
const yesChecks = () => FACTS.map((_, i) => ({ fact_index: i + 1, verdict: "yes", observed: "shown" }));
const noFirst = () => [{ fact_index: 1, verdict: "no", observed: "3 horses counted" }, { fact_index: 2, verdict: "yes", observed: "shown" }];
const noBoth = () => FACTS.map((_, i) => ({ fact_index: i + 1, verdict: "no", observed: `wrong ${i + 1}` }));

/** A reply to the merged question. */
const merged = (o: { checks?: unknown[]; krishna?: unknown; sure?: unknown; model?: string; usage?: unknown } = {}) => ({
  stop_reason: "tool_use",
  ...(o.model ? { model: o.model } : {}),
  ...(o.usage ? { usage: o.usage } : {}),
  content: [
    { type: "thinking", thinking: "" },
    { type: "tool_use", id: "t1", name: "record_visual_check", input: { checks: o.checks ?? yesChecks(), krishna: o.krishna ?? krishna(), sure: o.sure ?? true } },
  ],
});
/** A reply to the Krishna-only question. */
const krishnaReply = (input: Record<string, unknown>, model?: string) => ({
  stop_reason: "tool_use",
  ...(model ? { model } : {}),
  content: [{ type: "tool_use", id: "k1", name: kcore.KRISHNA_TOOL_NAME, input }],
});
const NO_TOOL = { stop_reason: "end_turn", content: [{ type: "text", text: "Looks right." }] };

/** Answers each create() by the model asked: replies[model] in order (a function is called). */
function claudeByModel(replies: Record<string, unknown[]>) {
  const calls: Json[] = [];
  const seen: Record<string, number> = {};
  g.__anthropicCreate = async (params: Json, reqOpts: Json) => {
    calls.push({ params, reqOpts });
    const list = replies[params.model] ?? [];
    const i = seen[params.model] = (seen[params.model] ?? -1) + 1;
    const r = list[Math.min(i, list.length - 1)];
    if (r === undefined) throw new Error(`${params.model} must not be asked`);
    if (typeof r === "function") return (r as () => unknown)();
    return r;
  };
  return calls;
}

function useGlobals() {
  const saved: Record<string, unknown> = {};
  const lines: string[] = [];
  const ENV: Record<string, string> = {};
  before(() => {
    saved.Deno = g.Deno;
    saved.create = g.__anthropicCreate;
    saved.log = console.log;
    g.Deno = { env: { get: (k: string) => ENV[k] } };
    console.log = (...a: unknown[]) => {
      const line = String(a[0]);
      if (line.startsWith("[visual-check]") || line.startsWith("[krishna-check]")) lines.push(line);
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

// ── Pure: models, question, answer, escalation rule, record ─────────────────

describe("checkModels", () => {
  test("Sonnet is asked first and Opus 5.5 is the second opinion", () => {
    assert.equal(models.CHECK_MODEL, SONNET);
    assert.equal(models.ESCALATION_MODEL, OPUS);
  });

  test("both models get the same server-side fallback, medium effort and no thinking override", () => {
    for (const m of [SONNET, OPUS] as const) {
      const f = models.checkCallFields(m) as Record<string, unknown>;
      assert.deepEqual(f, { model: m, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium" } });
      assert.equal("thinking" in f, false);
    }
    assert.equal(models.checkCallFields().model, SONNET, "the default is Sonnet");
  });

  test("answeredBy prefers the reply's own model (a server-side fallback may have answered)", () => {
    assert.equal(models.answeredBy({ model: "claude-opus-4-8" }, SONNET), "claude-opus-4-8");
    assert.equal(models.answeredBy({}, SONNET), SONNET);
    assert.equal(models.answeredBy(null, OPUS), OPUS);
    assert.equal(models.answeredBy({ model: "" }, OPUS), OPUS, "boundary: an empty model is not a model");
  });

  test("usageNote gives in/out tokens, or nothing when the reply has no usage", () => {
    assert.equal(models.usageNote({ usage: { input_tokens: 1800, output_tokens: 240 } }), "1800/240");
    assert.equal(models.usageNote({ usage: { input_tokens: 1800 } }), "");
    assert.equal(models.usageNote(undefined), "");
  });
});

describe("the merged question", () => {
  const text = () => (vcore.buildVisualCheckParams({ facts: FACTS, imageB64: PNG_B64, mediaType: "image/png" }).messages[0].content[1] as { text: string }).text;

  test("the tool answers the facts, the Krishna fields and sure, all required", () => {
    const schema = vcore.VISUAL_CHECK_TOOL.input_schema as Json;
    assert.deepEqual([...schema.required].sort(), ["checks", "krishna", "sure"]);
    assert.deepEqual(schema.properties.krishna, kcore.KRISHNA_ANSWER_SCHEMA);
    assert.equal(schema.properties.sure.type, "boolean");
  });

  test("the text keeps the numbered facts and adds the same Krishna rules the Krishna check uses", () => {
    const body = text();
    assert.ok(body.includes(`1. ${FACTS[0]}\n2. ${FACTS[1]}`));
    for (const rule of kcore.krishnaRules().filter(Boolean)) assert.ok(body.includes(rule), rule.slice(0, 60));
    assert.ok(body.includes(kcore.SURE_RULE));
    assert.match(body, /record_visual_check tool once, with one entry per detail and the detail's number as fact_index, the krishna fields and sure/);
  });

  test("the second opinion sends the identical question to Opus", () => {
    const a = vcore.buildVisualCheckParams({ facts: FACTS, imageB64: PNG_B64, mediaType: "image/png" });
    const b = vcore.buildVisualCheckParams({ facts: FACTS, imageB64: PNG_B64, mediaType: "image/png", model: OPUS });
    assert.equal(b.model, OPUS);
    assert.deepEqual({ ...b, model: a.model }, a);
  });
});

describe("readOpinion", () => {
  test("a merged reply gives sure and the Krishna answer, sure carried into the answer", () => {
    const o = vcore.readOpinion(merged({ sure: false }));
    assert.deepEqual(o, { merged: true, sure: false, krishna: { ...krishna(), sure: false } });
  });

  test("a reply in the older shape (checks only) is not merged and has no Krishna answer", () => {
    const old = { stop_reason: "tool_use", content: [{ type: "tool_use", name: "record_visual_check", input: { checks: yesChecks() } }] };
    assert.deepEqual(vcore.readOpinion(old), { merged: false, sure: null, krishna: null });
  });

  test("boundary: a malformed Krishna part leaves krishna null but the reply still merged", () => {
    assert.deepEqual(vcore.readOpinion(merged({ krishna: { ...krishna(), form: "shiva" } })), { merged: true, sure: true, krishna: null });
    assert.deepEqual(vcore.readOpinion(merged({ krishna: "Krishna" })), { merged: true, sure: true, krishna: null });
  });

  test("negative: no tool call, a null reply or a non-boolean sure gives nothing", () => {
    assert.deepEqual(vcore.readOpinion(NO_TOOL), { merged: false, sure: null, krishna: null });
    assert.deepEqual(vcore.readOpinion(null), { merged: false, sure: null, krishna: null });
    assert.equal(vcore.readOpinion(merged({ sure: "yes" })).merged, false);
  });
});

describe("when Opus is asked", () => {
  const ok = (sure: boolean | null, k: unknown = { ...krishna(), sure }) => ({ outcome: "ok" as const, sure, krishna: k as never });

  test("a sure, consistent answer is final: Opus is not asked", () => {
    assert.equal(vcore.secondOpinionNeeded(ok(true)), false);
    assert.equal(vcore.secondOpinionNeeded(ok(true, { ...NOT_KRISHNA, sure: true })), false);
  });

  test("Sonnet unsure, or a Krishna answer that contradicts itself, asks Opus", () => {
    assert.equal(vcore.secondOpinionNeeded(ok(false)), true);
    assert.equal(vcore.secondOpinionNeeded(ok(true, { ...krishna({ form: "jagannath" }), sure: true })), true);
  });

  test("no tool call asks Opus; a refusal does not (the server already re-ran it)", () => {
    assert.equal(vcore.secondOpinionNeeded({ outcome: "no_tool", sure: null, krishna: null }), true);
    assert.equal(vcore.secondOpinionNeeded({ outcome: "refusal", sure: null, krishna: null }), false);
  });

  test("boundary: an answer in the older shape (no sure, no Krishna) is never escalated", () => {
    assert.equal(vcore.secondOpinionNeeded({ outcome: "ok", sure: null, krishna: null }), false);
  });
});

describe("krishnaInconsistent", () => {
  test("happy: Krishna shown in His own form, or not shown with another figure named, is consistent", () => {
    assert.equal(kcore.krishnaInconsistent(krishna() as never), false);
    assert.equal(kcore.krishnaInconsistent(krishna({ form: "radha_krishna", prominence: "background" }) as never), false);
    assert.equal(kcore.krishnaInconsistent(NOT_KRISHNA as never), false);
    assert.equal(kcore.krishnaInconsistent({ ...NOT_KRISHNA, form: "none" } as never), false);
  });

  test("Krishna shown but in another figure's form, or with no prominence, contradicts itself", () => {
    assert.equal(kcore.krishnaInconsistent(krishna({ form: "chaitanya" }) as never), true);
    assert.equal(kcore.krishnaInconsistent(krishna({ form: "none" }) as never), true);
    assert.equal(kcore.krishnaInconsistent(krishna({ prominence: "none" }) as never), true);
  });

  test("Krishna not shown while His form or a main/secondary place is named contradicts itself", () => {
    assert.equal(kcore.krishnaInconsistent({ ...NOT_KRISHNA, form: "child_krishna" } as never), true);
    assert.equal(kcore.krishnaInconsistent({ ...NOT_KRISHNA, prominence: "secondary" } as never), true);
  });

  test("boundary: Krishna not shown with prominence background is a small figure, not a contradiction", () => {
    assert.equal(kcore.krishnaInconsistent({ ...NOT_KRISHNA, prominence: "background" } as never), false);
  });

  test("krishnaNeedsSecondOpinion: unsure or inconsistent; a missing answer or no sure key is not escalated", () => {
    assert.equal(kcore.krishnaNeedsSecondOpinion({ ...krishna(), sure: false } as never), true);
    assert.equal(kcore.krishnaNeedsSecondOpinion(krishna({ form: "rama" }) as never), true);
    assert.equal(kcore.krishnaNeedsSecondOpinion(krishna() as never), false, "older answers have no sure key");
    assert.equal(kcore.krishnaNeedsSecondOpinion(null), false);
  });
});

describe("the Krishna-only question", () => {
  test("its tool also requires sure, and the text explains it", () => {
    assert.ok(kcore.KRISHNA_TOOL.input_schema.required.includes("sure"));
    assert.ok(kcore.buildKrishnaText().includes(kcore.SURE_RULE));
  });

  test("Sonnet by default, Opus on request, with room for thinking", () => {
    const p = kcore.buildKrishnaParams({ imageB64: "AAAA", mediaType: "image/jpeg" });
    assert.equal(p.model, SONNET);
    assert.equal(p.max_tokens, 6000);
    assert.deepEqual(p.tool_choice, { type: "auto" });
    assert.equal(kcore.buildKrishnaParams({ imageB64: "AAAA", mediaType: "image/jpeg", model: OPUS }).model, OPUS);
  });

  test("parseKrishnaCheck reads sure; an answer without it is still an answer", () => {
    const out = kcore.parseKrishnaCheck(krishnaReply({ ...krishna(), sure: false })) as Json;
    assert.equal(out.outcome, "ok");
    assert.equal(out.answer.sure, false);
    const old = kcore.parseKrishnaCheck(krishnaReply(krishna())) as Json;
    assert.equal("sure" in old.answer, false);
  });
});

describe("visualCheckRecord with an opinion", () => {
  const base = { status: "pass" as const, attempts: 1, chosenAttempt: 0, imageModel: "black-forest-labs/FLUX.2-pro", checkedAt: "2026-10-29T10:00:00.000Z" };

  test("a merged answer stores the model, whether Opus was asked and the Krishna answer with its model", () => {
    const rec = vcore.visualCheckRecord({ ...base, checkModel: OPUS, escalated: true, krishna: { ...krishna(), sure: true } as never });
    assert.equal(rec.check_model, OPUS);
    assert.equal(rec.escalated, true);
    assert.deepEqual(rec.krishna, { ...krishna(), sure: true, model: OPUS });
  });

  test("without a check model the record keeps its older shape", () => {
    const rec = vcore.visualCheckRecord({ ...base, krishna: krishna() as never });
    assert.deepEqual(Object.keys(rec), ["status", "attempts", "chosen_attempt", "failed", "unclear", "reason", "image_model", "checked_at"]);
  });

  test("boundary: a dropped Krishna answer keeps check_model and escalated but no krishna key", () => {
    const rec = vcore.visualCheckRecord({ ...base, checkModel: SONNET, escalated: false, krishna: null });
    assert.equal(rec.check_model, SONNET);
    assert.equal(rec.escalated, false);
    assert.equal("krishna" in rec, false);
  });

  test("opinionOf reads a check result and ignores anything without a check model", () => {
    assert.deepEqual(vcore.opinionOf({ checkModel: SONNET, escalated: false, krishna: krishna() }), { checkModel: SONNET, escalated: false, krishna: krishna() });
    assert.deepEqual(vcore.opinionOf({ failed: [], unclear: 0 }), {});
    assert.deepEqual(vcore.opinionOf(null), {});
  });
});

// ── IO: the image check asks Sonnet, then Opus only when unsure ─────────────

describe("checkImage second opinion", () => {
  const lines = useGlobals();

  test("Sonnet sure: one call, its verdict and Krishna answer are the result", async () => {
    // Arrange
    const calls = claudeByModel({ [SONNET]: [merged({ usage: { input_tokens: 1900, output_tokens: 310 } })] });
    // Act
    const r = await vio.checkImage({ imageB64: PNG_B64, facts: FACTS });
    // Assert
    assert.deepEqual(calls.map((c) => c.params.model), [SONNET]);
    assert.equal(r.status, "pass");
    assert.deepEqual([r.checkModel, r.escalated], [SONNET, false]);
    assert.deepEqual(r.krishna, { ...krishna(), sure: true });
    assert.match(lines[0], / model=claude-sonnet-5-5 tokens=1900\/310$/);
  });

  test("Sonnet unsure: Opus is asked with the same question and its answer replaces Sonnet's", async () => {
    const calls = claudeByModel({
      [SONNET]: [merged({ checks: noFirst(), sure: false })],
      [OPUS]: [merged({ checks: yesChecks(), krishna: NOT_KRISHNA, sure: true })],
    });
    const r = await vio.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.deepEqual(calls.map((c) => c.params.model), [SONNET, OPUS]);
    assert.equal(calls[1].params.messages[0].content[1].text, calls[0].params.messages[0].content[1].text);
    assert.equal(r.status, "pass", "Opus saw four horses");
    assert.deepEqual([r.checkModel, r.escalated], [OPUS, true]);
    assert.deepEqual(r.krishna, { ...NOT_KRISHNA, sure: true });
    assert.match(lines[0], / second_opinion=claude-opus-5-5/);
    assert.ok(calls[1].reqOpts.timeout < 40_000 && calls[1].reqOpts.timeout >= vio.MIN_SECOND_OPINION_MS, "Opus gets the time that is left");
  });

  test("a Krishna answer that contradicts itself is escalated even when Sonnet says it is sure", async () => {
    const calls = claudeByModel({ [SONNET]: [merged({ krishna: krishna({ form: "jagannath" }) })], [OPUS]: [merged()] });
    const r = await vio.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.equal(calls.length, 2);
    assert.equal(r.checkModel, OPUS);
  });

  test("Opus fails: Sonnet's verdict on the facts stands and its unsure Krishna answer is dropped", async () => {
    claudeByModel({ [SONNET]: [merged({ checks: noFirst(), sure: false })], [OPUS]: [() => { throw new APIError(529, "overloaded"); }] });
    const r = await vio.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.equal(r.status, "fail");
    assert.deepEqual(r.failed, [{ fact: FACTS[0], observed: "3 horses counted" }]);
    assert.deepEqual([r.checkModel, r.escalated, r.krishna], [SONNET, false, null]);
    assert.match(lines[0], / second_opinion=failed_api_error_529$/);
  });

  test("boundary: too little time left for Opus keeps Sonnet's verdict without asking", async () => {
    const calls = claudeByModel({ [SONNET]: [merged({ sure: false })] });
    const r = await vio.checkImage({ imageB64: PNG_B64, facts: FACTS }, { timeoutMs: vio.MIN_SECOND_OPINION_MS });
    assert.equal(calls.length, 1);
    assert.deepEqual([r.status, r.checkModel, r.krishna], ["pass", SONNET, null]);
    assert.match(lines[0], / second_opinion=no_time$/);
  });

  test("Opus that never answers is cut off before the check's own limit, so Sonnet's answer is kept", async () => {
    // Arrange: fake setTimeout so the cut-off can be reached without waiting.
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const calls = claudeByModel({ [SONNET]: [merged({ checks: noFirst(), sure: false })], [OPUS]: [() => new Promise(() => {})] });
      // Act
      const pending = vio.checkImage({ imageB64: PNG_B64, facts: FACTS }, { timeoutMs: 20_000 });
      for (let i = 0; i < 50 && calls.length < 2; i++) await new Promise((res) => setImmediate(res));
      assert.equal(calls.length, 2, "Opus was asked");
      mock.timers.tick(19_500);
      const r = await pending;
      // Assert
      assert.deepEqual([r.status, r.reason, r.checkModel, r.krishna], ["fail", null, SONNET, null]);
      assert.match(lines[0], / second_opinion=failed_timeout$/);
    } finally {
      mock.timers.reset();
    }
  });

  test("negative: a refusal is not asked again, and an API error from Sonnet is not escalated", async () => {
    let calls = claudeByModel({ [SONNET]: [{ stop_reason: "refusal", content: [] }] });
    assert.equal((await vio.checkImage({ imageB64: PNG_B64, facts: FACTS })).reason, "refusal");
    assert.equal(calls.length, 1);
    calls = claudeByModel({ [SONNET]: [() => { throw new APIError(500, "boom"); }] });
    assert.equal((await vio.checkImage({ imageB64: PNG_B64, facts: FACTS })).reason, "api_error_500");
    assert.equal(calls.length, 1);
  });

  test("Sonnet calls no tool and Opus answers: Opus's answer is used", async () => {
    claudeByModel({ [SONNET]: [NO_TOOL], [OPUS]: [merged()] });
    const r = await vio.checkImage({ imageB64: PNG_B64, facts: FACTS });
    assert.deepEqual([r.status, r.checkModel, r.escalated], ["pass", OPUS, true]);
  });
});

describe("records carry the Krishna answer of the image they describe", () => {
  useGlobals();
  const quietLog = () => {};

  test("checkInBackground stores the model, escalation and Krishna answer with the record", async () => {
    claudeByModel({ [SONNET]: [merged()] });
    const writes: Json[] = [];
    const rec = await vio.checkInBackground({
      b64: PNG_B64, facts: FACTS, imageModel: "flux", startedAt: "2026-10-29T10:00:00.000Z",
      deadlineAt: Date.now() + 300_000, writeRecord: (r: Json) => (writes.push(r), true), log: quietLog,
    });
    assert.deepEqual(writes, [rec]);
    assert.deepEqual([rec.status, rec.check_model, rec.escalated], ["pass", SONNET, false]);
    assert.deepEqual(rec.krishna, { ...krishna(), sure: true, model: SONNET });
  });

  test("redo: a worse re-render is not kept, and the final record keeps the STORED image's Krishna answer", async () => {
    // Arrange: the stored image fails one fact and shows Krishna; the re-render fails both and shows Vishnu.
    claudeByModel({ [SONNET]: [merged({ checks: noFirst() }), merged({ checks: noBoth(), krishna: NOT_KRISHNA })] });
    const writes: Json[] = [];
    const swaps: Json[] = [];
    // Act
    const rec = await vio.redoInBackground({
      first: { b64: PNG_B64, model: "flux" }, facts: FACTS, maxAttempts: 2, deadlineAt: Date.now() + 300_000,
      render: async () => ({ b64: PNG_B64, model: "flux" }),
      swap: (a: Json, r: Json) => (swaps.push({ a, r }), true),
      writeRecord: (r: Json) => (writes.push(r), true), log: quietLog,
    });
    // Assert
    assert.equal(swaps.length, 0);
    assert.equal(rec.chosen_attempt, 0);
    assert.deepEqual(rec.krishna, { ...krishna(), sure: true, model: SONNET });
    assert.deepEqual(writes, [rec]);
  });

  test("redo: a better re-render is swapped in with ITS Krishna answer, and the final record agrees", async () => {
    claudeByModel({ [SONNET]: [merged({ checks: noFirst() }), merged({ checks: yesChecks(), krishna: krishna({ form: "radha_krishna" }) })] });
    const swaps: Json[] = [];
    const rec = await vio.redoInBackground({
      first: { b64: PNG_B64, model: "flux" }, facts: FACTS, maxAttempts: 2, deadlineAt: Date.now() + 300_000,
      render: async () => ({ b64: PNG_B64, model: "flux" }),
      swap: (a: Json, r: Json) => (swaps.push({ a, r }), true),
      writeRecord: () => true, log: quietLog,
    });
    assert.equal(swaps.length, 1);
    assert.equal(swaps[0].r.krishna.form, "radha_krishna");
    assert.deepEqual([rec.status, rec.chosen_attempt, rec.krishna.form], ["pass", 1, "radha_krishna"]);
  });
});

// ── IO: the posting gate's own Krishna call ─────────────────────────────────

describe("askKrishna second opinion", () => {
  useGlobals();
  const fetchImpl = (async () => new Response(JPEG)) as unknown as typeof fetch;
  const ask = () => kio.askKrishna("https://sb.test/x.jpg", { apiKey: "sk-test", fetchImpl, log: () => {} });

  test("Sonnet sure: one call and the answer names Sonnet", async () => {
    const calls = claudeByModel({ [SONNET]: [krishnaReply({ ...krishna(), sure: true })] });
    const r = await ask();
    assert.deepEqual(calls.map((c) => c.params.model), [SONNET]);
    assert.deepEqual([r.ok, r.model, r.answer.form], [true, SONNET, "krishna"]);
  });

  test("Sonnet unsure: Opus answers and its answer is the one returned", async () => {
    const calls = claudeByModel({ [SONNET]: [krishnaReply({ ...krishna(), sure: false })], [OPUS]: [krishnaReply({ ...NOT_KRISHNA, sure: true })] });
    const r = await ask();
    assert.deepEqual(calls.map((c) => c.params.model), [SONNET, OPUS]);
    assert.deepEqual([r.ok, r.model, r.answer.krishna_visible], [true, OPUS, false]);
  });

  test("Sonnet unsure and Opus fails: nothing is returned, so nothing is posted", async () => {
    claudeByModel({ [SONNET]: [krishnaReply({ ...krishna(), sure: false })], [OPUS]: [() => { throw new APIError(529, "overloaded"); }] });
    assert.deepEqual(await ask(), { ok: false, reason: "unsure_and_api_error_529" });
  });

  test("a malformed Sonnet answer asks Opus; a refusal or an API error does not", async () => {
    let calls = claudeByModel({ [SONNET]: [krishnaReply({ ...krishna({ form: "shiva" }), sure: true })], [OPUS]: [krishnaReply({ ...krishna(), sure: true })] });
    assert.equal((await ask()).model, OPUS);
    assert.equal(calls.length, 2);
    calls = claudeByModel({ [SONNET]: [{ stop_reason: "refusal", content: [] }] });
    assert.deepEqual(await ask(), { ok: false, reason: "refusal" });
    assert.equal(calls.length, 1);
    calls = claudeByModel({ [SONNET]: [() => { throw new APIError(500, "boom"); }] });
    assert.deepEqual(await ask(), { ok: false, reason: "api_error_500" });
    assert.equal(calls.length, 1);
  });

  test("ensureKrishnaCheck stores the model that actually answered", async () => {
    const row: Json = { id: 7, image_path: "p.jpg", image_url: "https://sb.test/p.jpg", krishna_check: null };
    const db = {
      from: () => {
        const q: Json = { update: (v: Json) => ((q.v = v), q), eq: () => q, select: () => q, then: (res: Json) => (Object.assign(row, q.v), Promise.resolve({ data: [{ id: 7 }], error: null }).then(res)) };
        return q;
      },
    };
    await kio.ensureKrishnaCheck({ supabase: db, table: "ig_pending_review", row: { ...row }, ask: async () => ({ ok: true, answer: krishna(), model: OPUS }), log: () => {} });
    assert.equal(row.krishna_check.model, OPUS);
  });
});

// ── The trigger that copies the image check's Krishna answer ────────────────

describe("migration 20261029120000: krishna_check from visual_check", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261029120000_krishna_check_from_visual_check.sql", import.meta.url), "utf8");
  const listAfter = (marker: RegExp) => {
    const m = sql.match(marker);
    assert.ok(m, String(marker));
    return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  };

  test("accepts exactly the forms and prominences the Krishna check knows", () => {
    assert.deepEqual(listAfter(/k ->> 'form', ''\) not in \(([^)]*)\)/), [...kcore.KRISHNA_FORMS]);
    assert.deepEqual(listAfter(/k ->> 'prominence', ''\) not in \(([^)]*)\)/), [...kcore.PROMINENCES]);
  });

  test("writes a record of the current version, pinned to NEW.image_path, marked as copied", () => {
    assert.match(sql, new RegExp(`'version', ${kcore.KRISHNA_CHECK_VERSION},`));
    assert.match(sql, /'image_path', new\.image_path,/);
    assert.match(sql, /'source', 'visual_check'/);
  });

  test("runs on the three posting tables only, when visual_check is written", () => {
    const tables = [...sql.matchAll(/before insert or update of visual_check on public\.([a-z_]+)/g)].map((m) => m[1]);
    assert.deepEqual(tables.sort(), [...kio.KRISHNA_TABLES].sort());
  });

  test("negative: changes nothing when visual_check is unchanged, and pins its search_path and grants", () => {
    assert.match(sql, /new\.visual_check is not distinct from old\.visual_check then\s+return new;/);
    assert.match(sql, /set search_path = ''/);
    assert.match(sql, /revoke all on function public\.krishna_check_from_visual_check\(\) from public, anon, authenticated, service_role;/);
    assert.equal(/raise\s+(exception|error)/i.test(sql), false, "it never raises: a bad answer leaves krishna_check alone");
  });
});
