// Handler-level tests for the visual check in generate-gita-chapter-art.
//
// The function's index.ts is imported under node with its Deno-only specifiers
// stubbed (helpers/edge-function-hooks.mjs, helpers/npm-stub-hooks.mjs). The real
// _shared/sceneResearch.ts and _shared/visualCheck.ts run. Research has no
// Firecrawl key here, so the facts are exactly the canon rows the fake
// scene_visual_canon returns. Together, the raw Claude brief call and the vision
// check (globalThis.__anthropicCreate) are faked. No network, no real keys.
//
// The module is loaded with a query string, so this file gets its own copy of the
// handler beside the one scene-research-wiring.test.ts loads. Globals are
// installed in before() and restored in after(); Date.now is replaced per test by
// a clock the fakes move forward, to simulate slow renders and checks.
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { seededCanon } from "./helpers/seed-canon.ts";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
register("./helpers/edge-function-hooks.mjs", import.meta.url);
// deno-lint-ignore no-explicit-any
const { APIError }: any = await import("./helpers/anthropic-stub.mjs");

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
// deno-lint-ignore no-explicit-any
type Json = any;

const FUNCTION_URL = new URL("../supabase/functions/generate-gita-chapter-art/index.ts?visual-check", import.meta.url).href;
const TOGETHER = "https://api.together.xyz/v1/images/generations";
const CLAUDE_RAW = "https://api.anthropic.com/v1/messages";
const CANON = seededCanon();
const ENV: Record<string, string> = {};
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  TOGETHER_API_KEY: "together-test",
  ANTHROPIC_API_KEY: "anthropic-test",
};
const BRIEF = {
  imagePrompt:
    "Krishna, a youthful MALE charioteer with blue skin, holds the reins of Arjuna's chariot on the plain of Kurukshetra while Arjuna, a MALE warrior, listens",
  caption: "What the chapter teaches.",
  hashtags: "#BhagavadGita",
};
const HORSES = /four white horses/;
// Two more Arjuna's-chariot canon facts: with them the facts block passes its
// 450 chars, so assemblePrompt leaves both out of the prompt.
const EXTRA_CANON = [
  { ...CANON[0], id: 901, attribute: "wheels", prompt_text: "the wheels of Arjuna's chariot are dark sandalwood with golden rims and bronze hubs" },
  { ...CANON[0], id: 902, attribute: "rail", prompt_text: "the rail of Arjuna's chariot is carved teak inlaid with ivory lotus flowers and pearls" },
];
const FLUX = "black-forest-labs/FLUX.2-pro";

// A JPEG header plus one render-specific byte, so each render is a distinct image.
const jpeg = (tag: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, tag]).toString("base64");

// generate-gita-chapter-art's tryGenerate body before the visual check, copied
// verbatim, so the no-facts request can be compared with what used to be sent.
// deno-lint-ignore no-explicit-any
function baselinePayload(prompt: string, model: string, w: number, h: number, steps: any) {
  // deno-lint-ignore no-explicit-any
  const payload: any = {
    model,
    prompt,
    width: w,
    height: h,
    n: 1,
    response_format: "b64_json"
  };
  if (steps && steps > 0) payload.steps = steps;
  return payload;
}

// ── Fakes ────────────────────────────────────────────────────────────────────

const clock = { offset: 0 };

function makeDb(o: { canon?: unknown[]; cfg?: unknown; chaptersWithArt?: number[]; missingColumn?: boolean } = {}) {
  const writes: Array<{ table: string; op: string; values: Json }> = [];
  const uploads: Array<{ path: string; bytes: Uint8Array }> = [];
  return {
    writes,
    uploads,
    inserts: (table: string) => writes.filter((w) => w.table === table && w.op === "insert").map((w) => w.values),
    from(table: string) {
      let op = "select";
      let values: Json;
      const b: Json = {
        select: () => b,
        eq: () => b,
        in: () => b,
        is: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => b,
        single: () => b,
        insert: (v: Json) => ((op = "insert"), (values = v), b),
        update: (v: Json) => ((op = "update"), (values = v), b),
        upsert: (v: Json) => ((op = "upsert"), (values = v), b),
        then(res: Json, rej: Json) {
          if (op !== "select") writes.push({ table, op, values });
          let data: unknown = null;
          let error: unknown = null;
          if (table === "scene_visual_canon") data = o.canon ?? CANON;
          else if (table === "image_gen_config") data = o.cfg ?? null;
          else if (table === "gita_chapter_art_review") {
            if (op === "insert" && o.missingColumn && "visual_check" in values) {
              error = { code: "PGRST204", message: "Could not find the 'visual_check' column of 'gita_chapter_art_review' in the schema cache" };
            } else {
              data = op === "insert" ? { id: 100 + writes.length } : (o.chaptersWithArt ?? []).map((n) => ({ chapter_number: n }));
            }
          }
          return Promise.resolve({ data, error }).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => {
          uploads.push({ path, bytes });
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
      }),
    },
  };
}

/** Together answers render n (1-based request count) with image(n); null is an HTTP 503. Each request moves the clock renderMs. */
function makeFetch(o: { image?: (n: number) => string | null; renderMs?: number } = {}) {
  const together: Array<{ raw: string; body: Json; signal?: AbortSignal }> = [];
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  g.fetch = async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    if (u === TOGETHER) {
      const raw = String(init.body);
      together.push({ raw, body: JSON.parse(raw), signal: init.signal ?? undefined });
      clock.offset += o.renderMs ?? 0;
      const b64 = o.image ? o.image(together.length) : jpeg(together.length);
      return b64 ? json({ data: [{ b64_json: b64 }] }) : new Response("busy", { status: 503 });
    }
    if (u === CLAUDE_RAW) return json({ content: [{ type: "text", text: JSON.stringify(BRIEF) }] });
    throw new Error(`unexpected fetch ${u}`);
  };
  return together;
}

type Check = { fact_index: number; verdict: string; observed: string };
type Reply = (details: string[]) => unknown;
const toolReply = (checks: Check[]) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id: "t1", name: "record_visual_check", input: { checks } }],
});
const allYes: Reply = (details) => toolReply(details.map((_, i) => ({ fact_index: i + 1, verdict: "yes", observed: "shown" })));
const horsesWrong: Reply = (details) =>
  toolReply(
    details.map((d, i) =>
      HORSES.test(d) ? { fact_index: i + 1, verdict: "no", observed: "3 horses counted" } : { fact_index: i + 1, verdict: "yes", observed: "shown" }
    ),
  );

/** The vision check answers call n with replies[n-1] (the last reply repeats). Each call moves the clock checkMs. */
function vision(replies: Reply[], o: { checkMs?: number } = {}) {
  const calls: Array<{ params: Json; details: string[] }> = [];
  g.__anthropicCreate = async (params: Json) => {
    assert.equal(params?.tools?.[0]?.name, "record_visual_check", "only the visual check may call the SDK here");
    const text: string = params.messages[0].content[1].text;
    const details = [...text.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]);
    calls.push({ params, details });
    clock.offset += o.checkMs ?? 0;
    return replies[Math.min(calls.length - 1, replies.length - 1)](details);
  };
  return calls;
}

const bytesOf = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));

// ── Suite ────────────────────────────────────────────────────────────────────

describe("generate-gita-chapter-art visual check", () => {
  const SAVED = ["Deno", "fetch", "__sb", "__anthropicCreate"];
  const saved: Record<string, unknown> = {};
  const realNow = Date.now;
  const realLog = console.log;
  const realWarn = console.warn;
  const realError = console.error;
  let handler: (req: Request) => Promise<Response>;
  let logs: string[] = [];

  before(async () => {
    for (const k of SAVED) saved[k] = g[k];
    Object.assign(ENV, BASE_ENV);
    g.Deno = {
      env: { get: (k: string) => ENV[k] },
      serve: (h: typeof handler) => {
        handler = h;
      },
    };
    await import(FUNCTION_URL);
    assert.equal(typeof handler, "function", "generate-gita-chapter-art did not register a handler");
  });

  after(() => {
    for (const k of SAVED) g[k] = saved[k];
  });

  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    Object.assign(ENV, BASE_ENV);
    clock.offset = 0;
    Date.now = () => realNow() + clock.offset;
    logs = [];
    g.__anthropicCreate = async () => {
      throw new Error("the vision check must not be called");
    };
    const capture = (prefix: string) => (...a: unknown[]) => {
      logs.push(prefix + a.map(String).join(" "));
    };
    console.log = capture("");
    console.warn = capture("WARN ");
    console.error = capture("ERROR ");
  });

  afterEach(() => {
    Date.now = realNow;
    console.log = realLog;
    console.warn = realWarn;
    console.error = realError;
  });

  async function call(body: unknown): Promise<{ status: number; json: Json }> {
    const res = await handler(
      new Request("http://functions.test/", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    );
    return { status: res.status, json: await res.json() };
  }

  test("pass on the first render: one Together call, the render's facts are checked, the record is stored and summarised", async () => {
    // Arrange
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch();
    const checks = vision([allYes]);
    // Act
    const { status, json } = await call({ chapter: 1 });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(together.length, 1);
    assert.equal(checks.length, 1);
    const { params, details } = checks[0];
    assert.deepEqual(params.messages[0].content[0].source, { type: "base64", media_type: "image/jpeg", data: jpeg(1) });
    assert.ok(details.some((d) => HORSES.test(d)), `canon horse fact expected in the check: ${details.join(" | ")}`);
    for (const d of details) assert.ok(together[0].body.prompt.includes(d), `checked fact missing from the prompt: ${d}`);
    const [row] = db.inserts("gita_chapter_art_review");
    assert.equal(row.status, "pending");
    assert.equal(row.visual_check.status, "pass");
    assert.equal(row.visual_check.attempts, 1);
    assert.equal(row.visual_check.chosen_attempt, 0);
    assert.deepEqual(row.visual_check.failed, []);
    assert.equal(row.visual_check.reason, null);
    assert.equal(row.visual_check.image_model, FLUX);
    assert.match(row.visual_check.checked_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(json.generated[0].visual_check, {
      status: "pass",
      attempts: 1,
      chosen_attempt: 0,
      failed: 0,
      unclear: 0,
      reason: null,
      image_model: FLUX,
    });
    assert.deepEqual(db.uploads[0].bytes, bytesOf(jpeg(1)));
  });

  test("fail then pass: two Together calls with the same prompt, a new seed on the re-render, and the second image stored", async () => {
    // Arrange
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch();
    const checks = vision([horsesWrong, allYes]);
    // Act
    const { status, json } = await call({ chapter: 1 });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(together.length, 2);
    assert.equal(checks.length, 2);
    assert.equal(checks[1].params.messages[0].content[0].source.data, jpeg(2));
    assert.equal(together[1].body.prompt, together[0].body.prompt);
    assert.equal("seed" in together[0].body, false, "render 0 sends no seed, as before");
    assert.equal(Number.isInteger(together[1].body.seed), true, "a FLUX re-render gets a new seed");
    assert.equal(together[0].signal, undefined);
    assert.ok(together[1].signal instanceof AbortSignal, "a re-render's request can be aborted at its deadline");
    assert.equal(db.uploads.length, 1);
    assert.deepEqual(db.uploads[0].bytes, bytesOf(jpeg(2)));
    const [row] = db.inserts("gita_chapter_art_review");
    assert.equal(row.visual_check.status, "pass");
    assert.equal(row.visual_check.attempts, 2);
    assert.equal(row.visual_check.chosen_attempt, 1);
    assert.deepEqual(row.visual_check.failed, []);
    assert.equal(json.generated[0].visual_check.attempts, 2);
    assert.equal(json.generated[0].visual_check.chosen_attempt, 1);
    assert.ok(logs.some((l) => /^\[visual-check\] gita-art ch1 attempt=0 status=fail .*saw "3 horses counted"/.test(l)), logs.join("\n"));
  });

  test("three failing renders: stops at 3, keeps the first, stores status fail with the failed fact", async () => {
    // Arrange
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch();
    vision([horsesWrong]);
    // Act
    const { json } = await call({ chapter: 1 });
    // Assert
    assert.equal(together.length, 3);
    assert.deepEqual(db.uploads[0].bytes, bytesOf(jpeg(1)));
    const [row] = db.inserts("gita_chapter_art_review");
    assert.equal(row.visual_check.status, "fail");
    assert.equal(row.visual_check.attempts, 3);
    assert.equal(row.visual_check.chosen_attempt, 0);
    assert.equal(row.visual_check.reason, "max_attempts");
    assert.equal(row.visual_check.failed.length, 1);
    assert.match(row.visual_check.failed[0].fact, HORSES);
    assert.equal(row.visual_check.failed[0].observed, "3 horses counted");
    assert.equal(json.generated[0].visual_check.failed, 1);
  });

  test("deadline reached after a failed check: no second render, status fail, reason deadline", async () => {
    // Arrange: a 40s render and a 60s check leave 30s, less than another render plus check
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch({ renderMs: 40_000 });
    const checks = vision([horsesWrong], { checkMs: 60_000 });
    // Act
    const { status, json } = await call({ chapter: 1 });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(together.length, 1);
    assert.equal(checks.length, 1);
    const [row] = db.inserts("gita_chapter_art_review");
    assert.equal(row.visual_check.status, "fail");
    assert.equal(row.visual_check.attempts, 1);
    assert.equal(row.visual_check.reason, "deadline");
    assert.equal(json.generated[0].visual_check.reason, "deadline");
  });

  test("render finishing inside the last 20s before the deadline: no check, status skipped, reason deadline", async () => {
    // Arrange
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch({ renderMs: 115_000 });
    const checks = vision([allYes]);
    // Act
    const { status } = await call({ chapter: 1 });
    // Assert
    assert.equal(status, 200);
    assert.equal(together.length, 1);
    assert.equal(checks.length, 0);
    const [row] = db.inserts("gita_chapter_art_review");
    assert.equal(row.visual_check.status, "skipped");
    assert.equal(row.visual_check.reason, "deadline");
  });

  test("facts the prompt has no room for are not checked", async () => {
    // Arrange: two more canon facts push the facts block past its 450 chars
    const db = makeDb({ canon: [...CANON, ...EXTRA_CANON] });
    g.__sb = db;
    const together = makeFetch();
    const checks = vision([allYes]);
    // Act
    const { status, json } = await call({ chapter: 1 });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    const line = logs.find((l) => l.startsWith("[gita-art] research key=")) ?? "";
    const researched = Number(/ facts=(\d+) /.exec(line)?.[1]);
    assert.match(line, /dropped=facts\[\d\]/, line);
    assert.equal(checks.length, 1);
    const { details } = checks[0];
    assert.ok(details.length > 0 && details.length < researched, `${details.length} checked of ${researched}: ${line}`);
    for (const d of details) assert.ok(together[0].body.prompt.includes(d), `checked fact missing from the prompt: ${d}`);
    for (const e of EXTRA_CANON) assert.equal(details.includes(e.prompt_text), false, e.prompt_text);
    assert.equal(db.inserts("gita_chapter_art_review")[0].visual_check.status, "pass");
  });

  test("a multi-chapter run does not start a chapter that could not finish before the deadline: it is listed in skipped", async () => {
    // Arrange: chapter 1 fails its first check and is re-rendered, 42s + 15s + 42s + 15s = 114s.
    // Another chapter needs about 60s, so chapters 2 and 3 would end past request start + 130s.
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch({ renderMs: 42_000 });
    const checks = vision([horsesWrong, allYes], { checkMs: 15_000 });
    // Act
    const { status, json } = await call({ missing: true, limit: 3 });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.ok, true);
    assert.deepEqual(json.generated.map((r: Json) => r.chapter), [1]);
    assert.deepEqual(json.errors, []);
    assert.deepEqual(json.skipped, [{ chapter: 2, reason: "deadline" }, { chapter: 3, reason: "deadline" }]);
    assert.equal(together.length, 2, "no brief or render is paid for a skipped chapter");
    assert.equal(checks.length, 2);
    assert.equal(db.inserts("gita_chapter_art_review").length, 1);
  });

  test("boundary: a later chapter still starts while one more chapter fits before the deadline", async () => {
    // Arrange: chapter 1 takes 42s + 15s = 57s, so chapter 2 starts (57s <= 130s - 60s)
    const db = makeDb();
    g.__sb = db;
    makeFetch({ renderMs: 42_000 });
    vision([allYes], { checkMs: 15_000 });
    // Act
    const { json } = await call({ missing: true, limit: 2 });
    // Assert
    assert.deepEqual(json.generated.map((r: Json) => r.chapter), [1, 2]);
    assert.deepEqual(json.skipped, []);
  });

  test("a missing visual_check column still saves the chapter, without the record", async () => {
    // Arrange
    const db = makeDb({ missingColumn: true });
    g.__sb = db;
    makeFetch();
    vision([allYes]);
    // Act
    const { status, json } = await call({ chapter: 1 });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.ok, true, JSON.stringify(json));
    assert.deepEqual(json.errors, []);
    const rows = db.inserts("gita_chapter_art_review");
    assert.equal(rows.length, 2);
    assert.ok("visual_check" in rows[0]);
    const { visual_check: _dropped, ...withoutRecord } = rows[0];
    assert.deepEqual(rows[1], withoutRecord);
    assert.equal(json.generated[0].visual_check.status, "pass");
    assert.ok(logs.some((l) => l.startsWith("WARN [gita-art] insert with visual_check failed")), logs.join("\n"));
  });

  test("a multi-chapter run shares one deadline: chapter 2 skips its check once time is short", async () => {
    // Arrange: chapter 1 renders (60s) and passes (5s); chapter 2's render ends at 125s
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch({ renderMs: 60_000 });
    const checks = vision([allYes], { checkMs: 5_000 });
    // Act
    const { status, json } = await call({ missing: true, limit: 2 });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assert.deepEqual(json.generated.map((r: Json) => r.chapter), [1, 2]);
    assert.equal(together.length, 2);
    assert.equal(checks.length, 1);
    const rows = db.inserts("gita_chapter_art_review");
    assert.equal(rows[0].visual_check.status, "pass");
    assert.equal(rows[1].visual_check.status, "skipped");
    assert.equal(rows[1].visual_check.reason, "deadline");
    assert.deepEqual(json.generated.map((r: Json) => r.visual_check.status), ["pass", "skipped"]);
  });

  for (const c of [
    { name: "an API error", reply: (() => { throw new APIError(529, "overloaded"); }) as Reply, reason: "api_error_529" },
    { name: "a refusal", reply: (() => ({ stop_reason: "refusal", content: [] })) as Reply, reason: "refusal" },
    { name: "a reply with no tool call", reply: (() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "looks fine" }] })) as Reply, reason: "no_tool" },
  ]) {
    test(`check error (${c.name}): no second render, the image is kept with status error`, async () => {
      // Arrange
      const db = makeDb();
      g.__sb = db;
      const together = makeFetch();
      const checks = vision([c.reply]);
      // Act
      const { status, json } = await call({ chapter: 1 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(together.length, 1);
      assert.equal(checks.length, 1);
      assert.deepEqual(db.uploads[0].bytes, bytesOf(jpeg(1)));
      const [row] = db.inserts("gita_chapter_art_review");
      assert.equal(row.visual_check.status, "error");
      assert.equal(row.visual_check.attempts, 1);
      assert.equal(row.visual_check.reason, c.reason);
      assert.equal(json.generated[0].visual_check.status, "error");
    });
  }

  test("VISUAL_CHECK_ENABLED=false: one render, no check, status skipped, reason disabled", async () => {
    // Arrange
    ENV.VISUAL_CHECK_ENABLED = "false";
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch();
    const checks = vision([horsesWrong]);
    // Act
    await call({ chapter: 1 });
    // Assert
    assert.equal(together.length, 1);
    assert.equal(checks.length, 0);
    const [row] = db.inserts("gita_chapter_art_review");
    assert.equal(row.visual_check.status, "skipped");
    assert.equal(row.visual_check.reason, "disabled");
  });

  describe("no research facts", () => {
    const COVER_CFG = {
      model: FLUX,
      width: 1088,
      height: 1344,
      cover_width: 1344,
      cover_height: 1088,
      steps: 28,
      fallback_model: "black-forest-labs/FLUX.1.1-pro",
      is_active: true,
    };

    for (const c of [
      { name: "no config (DEFAULTS)", cfg: null, model: FLUX, w: 1088, h: 1344, steps: null },
      { name: "a FLUX config with steps", cfg: COVER_CFG, model: FLUX, w: 1344, h: 1088, steps: 28 },
    ]) {
      test(`${c.name}: one render, no check, and the Together request is byte-identical to the one sent before`, async () => {
        // Arrange
        const db = makeDb({ canon: [], cfg: c.cfg });
        g.__sb = db;
        const together = makeFetch();
        const checks = vision([horsesWrong]);
        // Act
        const { status, json } = await call({ chapter: 1 });
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(checks.length, 0);
        assert.equal(together.length, 1);
        const [row] = db.inserts("gita_chapter_art_review");
        assert.equal(together[0].raw, JSON.stringify(baselinePayload(row.prompt, c.model, c.w, c.h, c.steps)));
        assert.equal(row.visual_check.status, "skipped");
        assert.equal(row.visual_check.reason, "no_facts");
        assert.equal(row.visual_check.attempts, 1);
        assert.equal(json.generated[0].visual_check.status, "skipped");
      });
    }

    test("openai/gpt-image-2 with steps configured: the body is the old one without steps or seed", async () => {
      // Arrange
      const cfg = { ...COVER_CFG, model: "openai/gpt-image-2" };
      const db = makeDb({ canon: [], cfg });
      g.__sb = db;
      const together = makeFetch();
      // Act
      await call({ chapter: 1 });
      // Assert
      assert.equal(together.length, 1);
      const [row] = db.inserts("gita_chapter_art_review");
      const expected = baselinePayload(row.prompt, "openai/gpt-image-2", 1344, 1088, null);
      assert.equal(together[0].raw, JSON.stringify(expected));
      assert.equal(row.visual_check.image_model, "openai/gpt-image-2");
    });
  });

  describe("render failures keep the old handling", () => {
    test("the main model fails and the fallback renders: the fallback image is checked and its model recorded", async () => {
      // Arrange
      const db = makeDb();
      g.__sb = db;
      const together = makeFetch({ image: (n) => (n === 1 ? null : jpeg(n)) });
      const checks = vision([allYes]);
      // Act
      const { json } = await call({ chapter: 1 });
      // Assert
      assert.equal(together.length, 2);
      assert.equal(together[1].body.model, "black-forest-labs/FLUX.1.1-pro");
      assert.equal(checks.length, 1);
      assert.equal(checks[0].params.messages[0].content[0].source.data, jpeg(2));
      const [row] = db.inserts("gita_chapter_art_review");
      assert.equal(row.visual_check.image_model, "black-forest-labs/FLUX.1.1-pro");
      assert.equal(row.visual_check.attempts, 1);
      assert.equal(json.generated[0].visual_check.image_model, "black-forest-labs/FLUX.1.1-pro");
    });

    test("every model failing: the chapter fails as before, with no row and no check", async () => {
      // Arrange
      const db = makeDb();
      g.__sb = db;
      const together = makeFetch({ image: () => null });
      const checks = vision([allYes]);
      // Act
      const { status, json } = await call({ chapter: 1 });
      // Assert
      assert.equal(status, 200);
      assert.equal(json.ok, false);
      assert.equal(together.length, 2);
      assert.equal(checks.length, 0);
      assert.equal(db.inserts("gita_chapter_art_review").length, 0);
      assert.deepEqual(json.errors, [{ chapter: 1, error: "Error: All image attempts failed for chapter 1" }]);
    });

    test("a Together request that throws on the first render fails the chapter with its own error", async () => {
      // Arrange
      const db = makeDb();
      g.__sb = db;
      makeFetch();
      const inner = g.fetch;
      g.fetch = async (url: string | URL, init?: RequestInit) => {
        if (String(url) === TOGETHER) throw new TypeError("connection reset");
        return inner(url, init);
      };
      const checks = vision([allYes]);
      // Act
      const { json } = await call({ chapter: 1 });
      // Assert
      assert.equal(checks.length, 0);
      assert.equal(db.inserts("gita_chapter_art_review").length, 0);
      assert.deepEqual(json.errors, [{ chapter: 1, error: "TypeError: connection reset" }]);
    });

    test("a re-render that fails keeps the checked first image", async () => {
      // Arrange
      const db = makeDb();
      g.__sb = db;
      const together = makeFetch({ image: (n) => (n === 1 ? jpeg(1) : null) });
      vision([horsesWrong]);
      // Act
      const { json } = await call({ chapter: 1 });
      // Assert
      assert.equal(together.length, 3, "render 1 tries the model and the fallback");
      assert.deepEqual(db.uploads[0].bytes, bytesOf(jpeg(1)));
      const [row] = db.inserts("gita_chapter_art_review");
      assert.equal(row.visual_check.status, "fail");
      assert.equal(row.visual_check.attempts, 2);
      assert.equal(row.visual_check.chosen_attempt, 0);
      assert.equal(row.visual_check.reason, "render_failed");
      assert.equal(json.generated[0].visual_check.reason, "render_failed");
    });
  });
});
