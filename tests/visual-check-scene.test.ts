// Handler tests for the visual check in generate-scene-image.
// The edge function's index.ts is imported under node with its Deno-only
// specifiers stubbed (helpers/edge-function-hooks.mjs, helpers/npm-stub-hooks.mjs).
// Database and storage are fakes (globalThis.__sb), fetch is a fake for Together
// and the raw Claude (Haiku) call, and the Claude SDK stub answers the vision
// check (globalThis.__anthropicCreate). The real _shared/sceneResearch.ts and
// _shared/visualCheck.ts run. No network, no real keys, no paid calls.
//
// Research runs canon-only (no FIRECRAWL_API_KEY), so an Arjuna scene gets the
// seeded chariot facts and a Dhruva scene gets none, and every SDK call seen
// here is a vision check.
//
// Globals, including Date.now (faked so render time can be simulated), are
// installed in before()/beforeEach() and restored in afterEach()/after().
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { seededCanon } from "./helpers/seed-canon.ts";
import { sanitizeForImageModel } from "../supabase/functions/_shared/sceneResearchCore.ts";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
register("./helpers/edge-function-hooks.mjs", import.meta.url);

// deno-lint-ignore no-explicit-any
const { APIError }: any = await import("./helpers/anthropic-stub.mjs");

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
// deno-lint-ignore no-explicit-any
type Json = any;
type Handler = (req: Request) => Promise<Response>;

const FN_URL = new URL("../supabase/functions/generate-scene-image/index.ts?visual-check-scene", import.meta.url).href;
const TOGETHER = "https://api.together.xyz/v1/images/generations";
const HAIKU = "https://api.anthropic.com/v1/messages";
const CANON = seededCanon();
const SCENE_ID = 7;
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  TOGETHER_API_KEY: "together-test",
  ANTHROPIC_API_KEY: "anthropic-test",
};
const ENV: Record<string, string> = {};

const ARJUNA_VISUAL =
  "Arjuna, a MALE warrior prince, stands on his chariot beside Krishna, a youthful MALE charioteer with blue skin, on the plain of Kurukshetra";
const DHRUVA_VISUAL = "Dhruva, a young MALE prince, meditates alone in the forest of Madhuvana under golden light";
// Two more Arjuna's-chariot canon facts: with them the facts block passes its
// 450 chars, so assemblePrompt leaves both out of the prompt.
const EXTRA_CANON = [
  { ...CANON[0], id: 901, attribute: "wheels", prompt_text: "the wheels of Arjuna's chariot are dark sandalwood with golden rims and bronze hubs" },
  { ...CANON[0], id: 902, attribute: "rail", prompt_text: "the rail of Arjuna's chariot is carved teak inlaid with ivory lotus flowers and pearls" },
];

const FLUX_CFG = {
  model: "black-forest-labs/FLUX.2-pro",
  width: 1088,
  height: 1344,
  steps: null as number | null,
  style_positives: "devotional oil painting, visible brushstrokes, golden light",
  style_negatives: "NOT cartoon, NOT CGI",
  extra_rules: "Vedic era only, no modern clothing.",
  prompt_max_len: 2000,
  fallback_model: "black-forest-labs/FLUX.1.1-pro",
  fallback_width: 768,
  fallback_height: 1024,
  is_active: true,
};
const GPT_CFG = { ...FLUX_CFG, model: "openai/gpt-image-2", width: 1344, height: 1088, fallback_model: "openai/gpt-image-2" };

/** A JPEG header plus one render-specific byte, so each Together response is a distinct image. */
const jpeg = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, n]).toString("base64");

// ── Fakes ────────────────────────────────────────────────────────────────────

interface Query {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  filters: Array<[string, unknown]>;
  values?: Json;
}

function makeDb(o: { cfg: unknown; rejectVisualCheckColumn?: boolean; canon?: unknown[] }) {
  const queries: Query[] = [];
  const uploads: Array<{ path: string; bytes: Uint8Array }> = [];
  const scene = { id: SCENE_ID, book: "Bhagavad Gita", selected_text: "अर्जुन अपने रथ पर खड़े हैं", status: "pending" };
  return {
    queries,
    uploads,
    sceneUpdates: () => queries.filter((q) => q.table === "reader_scenes" && q.op === "update").map((q) => q.values),
    from(table: string) {
      const q: Query = { table, op: "select", filters: [] };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => b,
        eq: (col: string, v: unknown) => {
          q.filters.push([col, v]);
          return b;
        },
        in: (col: string, v: unknown) => {
          q.filters.push([col, v]);
          return b;
        },
        is: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => b,
        single: () => b,
        insert: (v: unknown) => {
          q.op = "insert";
          q.values = v;
          return b;
        },
        update: (v: unknown) => {
          q.op = "update";
          q.values = v;
          return b;
        },
        upsert: (v: unknown) => {
          q.op = "upsert";
          q.values = v;
          return b;
        },
        // deno-lint-ignore no-explicit-any
        then(res: any, rej: any) {
          queries.push(q);
          let data: unknown = null;
          let error: unknown = null;
          if (table === "reader_scenes" && q.op === "select") data = scene;
          if (table === "image_gen_config") data = o.cfg;
          if (table === "scene_visual_canon") data = o.canon ?? CANON;
          if (table === "reader_scenes" && q.op === "update" && o.rejectVisualCheckColumn && "visual_check" in (q.values ?? {})) {
            error = { code: "PGRST204", message: "Could not find the 'visual_check' column of 'reader_scenes' in the schema cache" };
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

type Check = { fact_index: number; verdict: string; observed: string };

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

describe("generate-scene-image visual check", () => {
  const SAVED_GLOBALS = ["Deno", "fetch", "__sb", "__anthropicCreate"];
  const saved: Record<string, unknown> = {};
  const realNow = Date.now;
  const realLog = console.log;
  const realWarn = console.warn;
  const realError = console.error;
  let handler: Handler | null = null;
  let clockOffset = 0;
  let logs: string[] = [];

  before(async () => {
    for (const k of SAVED_GLOBALS) saved[k] = g[k];
    for (const k of Object.keys(ENV)) delete ENV[k];
    Object.assign(ENV, BASE_ENV);
    g.Deno = {
      env: { get: (k: string) => ENV[k] },
      serve: (h: Handler) => {
        handler = h;
      },
    };
    await import(FN_URL);
    assert.equal(typeof handler, "function", "generate-scene-image did not register a handler");
  });

  after(() => {
    for (const k of SAVED_GLOBALS) g[k] = saved[k];
  });

  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    Object.assign(ENV, BASE_ENV);
    clockOffset = 0;
    Date.now = () => realNow() + clockOffset;
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

  /** Fake network. `renderMs` / `haikuMs` move the fake clock forward to simulate slow calls. */
  function setup(o: {
    visual: string;
    cfg?: unknown;
    imageOk?: (n: number) => boolean;
    renderMs?: number;
    haikuMs?: number;
    rejectVisualCheckColumn?: boolean;
    canon?: unknown[];
  }) {
    const db = makeDb({ cfg: o.cfg ?? FLUX_CFG, rejectVisualCheckColumn: o.rejectVisualCheckColumn, canon: o.canon });
    const together: Json[] = [];
    const signals: Array<AbortSignal | undefined> = [];
    const images: string[] = [];
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
    g.fetch = async (url: string | URL, init: RequestInit = {}) => {
      const u = String(url);
      const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
      if (u === HAIKU) {
        clockOffset += o.haikuMs ?? 0;
        return json({ content: [{ type: "text", text: o.visual }] });
      }
      if (u === TOGETHER) {
        together.push(body);
        signals.push(init.signal ?? undefined);
        clockOffset += o.renderMs ?? 0;
        const n = together.length;
        if (o.imageOk && !o.imageOk(n)) return new Response("busy", { status: 503 });
        const b64 = jpeg(n);
        images.push(b64);
        return json({ data: [{ b64_json: b64 }] });
      }
      throw new Error(`unexpected fetch ${u}`);
    };
    g.__sb = db;
    return { db, together, signals, images };
  }

  /** Answers each vision check from `answer(callIndex, factCount)` and records the params. */
  function vision(answer: (call: number, factCount: number) => unknown) {
    const calls: Json[] = [];
    g.__anthropicCreate = async (params: Json, reqOpts: Json) => {
      calls.push({ params, reqOpts });
      const text: string = params.messages[0].content[1].text;
      const factCount = [...text.matchAll(/^\d+\. /gm)].length;
      const r = answer(calls.length, factCount);
      if (r instanceof Error) throw r;
      return r;
    };
    return calls;
  }
  const toolReply = (checks: Check[]) => ({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "t1", name: "record_visual_check", input: { checks } }],
  });
  /** A reply where the first `failing` facts are clearly contradicted and the rest are shown. */
  const reply = (factCount: number, failing = 0) =>
    toolReply(
      Array.from({ length: factCount }, (_, i) => ({
        fact_index: i + 1,
        verdict: i < failing ? "no" : "yes",
        observed: i < failing ? `3 horses counted (${i + 1})` : "shown",
      })),
    );
  /** The facts the check was asked about, in order. */
  const checkedFacts = (call: Json): string[] =>
    [...String(call.params.messages[0].content[1].text).matchAll(/^\d+\. (.*)$/gm)].map((m) => m[1]);

  async function run(): Promise<{ status: number; json: Json }> {
    const res = await (handler as Handler)(
      new Request("http://functions.test/", { method: "POST", body: JSON.stringify({ scene_id: SCENE_ID }), headers: { "content-type": "application/json" } }),
    );
    return { status: res.status, json: await res.json() };
  }

  /** The final reader_scenes update that stored the image. */
  const storedUpdate = (db: ReturnType<typeof makeDb>) => db.sceneUpdates().filter((v) => v.status === "generated").at(-1);
  const researchLine = () => logs.find((l) => l.startsWith("[scene] research key=")) ?? "";
  const uploadedB64 = (db: ReturnType<typeof makeDb>) => Buffer.from(db.uploads.at(-1)!.bytes).toString("base64");

  // ── No facts: the request to Together is the pre-check request ─────────────

  describe("with no research facts", () => {
    // The body the function sent before the visual check existed: the
    // pre-research prompt, and steps only when set.
    const legacyBody = (cfg: typeof FLUX_CFG, withSteps: boolean) => {
      const prompt = sanitizeForImageModel(
        `${DHRUVA_VISUAL}, ${cfg.style_positives}, ${cfg.style_negatives}. ${cfg.extra_rules}`.slice(0, cfg.prompt_max_len),
      );
      const body: Record<string, unknown> = { model: cfg.model, prompt, width: cfg.width, height: cfg.height, n: 1, response_format: "b64_json" };
      if (withSteps && cfg.steps && cfg.steps > 0) body.steps = cfg.steps;
      return body;
    };

    const CASES: Array<{ name: string; cfg: typeof FLUX_CFG; withSteps: boolean }> = [
      { name: "FLUX, no steps", cfg: FLUX_CFG, withSteps: true },
      { name: "FLUX with steps: steps still sent", cfg: { ...FLUX_CFG, steps: 28 }, withSteps: true },
      { name: "openai/gpt-image-2 with steps configured: no steps, no seed", cfg: { ...GPT_CFG, steps: 28 }, withSteps: false },
    ];
    for (const c of CASES) {
      test(`${c.name}: one render, no vision check, and the Together body is exactly the pre-check request`, async () => {
        // Arrange
        const { db, together } = setup({ visual: DHRUVA_VISUAL, cfg: c.cfg });
        // Act
        const { status, json } = await run();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.match(researchLine(), / facts=0 /, logs.join("\n"));
        assert.equal(together.length, 1);
        assert.deepEqual(together[0], legacyBody(c.cfg, c.withSteps));
        const record = storedUpdate(db).visual_check;
        assert.equal(record.status, "skipped");
        assert.equal(record.reason, "no_facts");
        assert.equal(record.attempts, 1);
        assert.equal(record.chosen_attempt, 0);
        assert.equal(record.image_model, c.cfg.model);
      });
    }

    test("the first model failing still falls back inside one render, and the record names the fallback model", async () => {
      // Arrange
      const { db, together, images } = setup({ visual: DHRUVA_VISUAL, imageOk: (n) => n !== 1 });
      // Act
      const { status, json } = await run();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.deepEqual(together.map((b) => b.model), [FLUX_CFG.model, FLUX_CFG.fallback_model]);
      assert.deepEqual([together[1].width, together[1].height], [FLUX_CFG.fallback_width, FLUX_CFG.fallback_height]);
      assert.equal(uploadedB64(db), images[0]);
      assert.equal(storedUpdate(db).visual_check.image_model, FLUX_CFG.fallback_model);
      assert.equal(json.model_used, FLUX_CFG.model, "model_used is unchanged: the configured model");
    });

    test("every image attempt failing still fails the scene, with no vision check and no visual_check written", async () => {
      // Arrange
      const { db, together } = setup({ visual: ARJUNA_VISUAL, imageOk: () => false });
      // Act
      const { status, json } = await run();
      // Assert
      assert.equal(status, 502);
      assert.equal(json.error, "All image attempts failed");
      assert.equal(together.length, 2);
      assert.equal(db.uploads.length, 0);
      const updates = db.sceneUpdates();
      assert.deepEqual(updates.at(-1), { status: "failed", error_message: "All image attempts failed" });
      assert.equal(updates.some((v) => "visual_check" in v), false);
    });
  });

  // ── With facts: check, re-render, store ─────────────────────────────────────

  describe("with research facts", () => {
    test("pass on the first render: one Together call, the research facts are checked, and the record is stored and returned", async () => {
      // Arrange
      const { db, together, images } = setup({ visual: ARJUNA_VISUAL });
      const calls = vision((_, n) => reply(n));
      // Act
      const { status, json } = await run();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(together.length, 1);
      assert.equal(calls.length, 1);
      const facts = checkedFacts(calls[0]);
      assert.ok(facts.length > 0);
      assert.match(researchLine(), new RegExp(` facts=${facts.length} `), researchLine());
      assert.ok(facts.includes("Arjuna's chariot is drawn by exactly four white horses, no more and no fewer"), facts.join("\n"));
      for (const f of facts) assert.ok(together[0].prompt.includes(f), `fact not in the image prompt: ${f}`);
      assert.deepEqual(calls[0].params.messages[0].content[0].source, { type: "base64", media_type: "image/jpeg", data: images[0] });
      assert.equal("seed" in together[0], false, "the first render sends no seed");

      const update = storedUpdate(db);
      assert.equal(update.image_generated, true);
      assert.equal(update.image_prompt, together[0].prompt);
      const { checked_at, ...rest } = update.visual_check;
      assert.deepEqual(rest, {
        status: "pass",
        attempts: 1,
        chosen_attempt: 0,
        failed: [],
        unclear: 0,
        reason: null,
        image_model: FLUX_CFG.model,
      });
      assert.ok(!Number.isNaN(Date.parse(checked_at)), String(checked_at));
      assert.deepEqual(json.visual_check, update.visual_check, "the response carries the stored record");
      assert.equal(uploadedB64(db), images[0]);
    });

    test("fail then pass: two Together calls with the same prompt, the second image is stored, record attempts 2", async () => {
      // Arrange
      const { db, together, signals, images } = setup({ visual: ARJUNA_VISUAL });
      const calls = vision((call, n) => reply(n, call === 1 ? 1 : 0));
      // Act
      const { status, json } = await run();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(together.length, 2);
      assert.equal(calls.length, 2);
      assert.equal(together[1].prompt, together[0].prompt);
      assert.equal(signals[0], undefined);
      assert.ok(signals[1] instanceof AbortSignal, "a re-render's request can be aborted at its deadline");
      assert.equal("seed" in together[0], false);
      assert.ok(Number.isInteger(together[1].seed), "a FLUX re-render sends a new seed");
      assert.equal(calls[1].params.messages[0].content[0].source.data, images[1]);
      assert.equal(uploadedB64(db), images[1]);
      const record = storedUpdate(db).visual_check;
      assert.equal(record.status, "pass");
      assert.equal(record.attempts, 2);
      assert.equal(record.chosen_attempt, 1);
      assert.deepEqual(record.failed, []);
      assert.deepEqual(json.visual_check, record);
    });

    test("failing on all three renders keeps the one with the fewest failed facts", async () => {
      // Arrange: renders 1 and 3 fail two facts, render 2 fails one
      const { db, together, images } = setup({ visual: ARJUNA_VISUAL });
      vision((call, n) => reply(n, call === 2 ? 1 : 2));
      // Act
      const { status } = await run();
      // Assert
      assert.equal(status, 200);
      assert.equal(together.length, 3);
      assert.equal(uploadedB64(db), images[1]);
      const record = storedUpdate(db).visual_check;
      assert.equal(record.status, "fail");
      assert.equal(record.attempts, 3);
      assert.equal(record.chosen_attempt, 1);
      assert.equal(record.reason, "max_attempts");
      assert.equal(record.failed.length, 1);
      assert.match(record.failed[0].observed, /3 horses counted/);
    });

    test("facts the prompt has no room for are not checked", async () => {
      // Arrange: two more canon facts push the facts block past its 450 chars
      const { together } = setup({ visual: ARJUNA_VISUAL, canon: [...CANON, ...EXTRA_CANON] });
      const calls = vision((_, n) => reply(n));
      // Act
      const { status, json } = await run();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      const researched = Number(/ facts=(\d+) /.exec(researchLine())?.[1]);
      assert.match(researchLine(), /dropped=facts\[\d\]/, researchLine());
      assert.equal(calls.length, 1);
      const facts = checkedFacts(calls[0]);
      assert.ok(facts.length > 0 && facts.length < researched, `${facts.length} checked of ${researched}`);
      for (const f of facts) assert.ok(together[0].prompt.includes(f), `checked but not in the image prompt: ${f}`);
      for (const e of EXTRA_CANON) assert.equal(facts.includes(e.prompt_text), false, e.prompt_text);
    });

    // deno-lint-ignore no-explicit-any
    test("a re-render still running when its check could no longer start is abandoned: its request is aborted and the first image is stored", async (t: any) => {
      // Arrange: the first render fails its check; the re-render's request never
      // answers on its own and settles only when its signal aborts.
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const { db, together, signals, images } = setup({ visual: ARJUNA_VISUAL });
      const inner = g.fetch;
      g.fetch = async (url: string | URL, init: RequestInit = {}) => {
        if (String(url) !== TOGETHER || together.length === 0) return inner(url, init);
        together.push(JSON.parse(String(init.body)));
        signals.push(init.signal ?? undefined);
        return new Promise<Response>((_, reject) => {
          const abort = () => reject(new DOMException("The operation was aborted", "AbortError"));
          if (init.signal?.aborted) abort();
          else init.signal?.addEventListener("abort", abort);
          if (together.length === 2) setImmediate(() => t.mock.timers.tick(10 * 60_000));
        });
      };
      const calls = vision((_, n) => reply(n, 1));
      // Act
      const limit = realTimeLimit(2000, "the scene request");
      let res: { status: number; json: Json };
      try {
        res = await Promise.race([run(), limit.promise]);
      } finally {
        limit.clear();
      }
      const { status, json } = res;
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(calls.length, 1, "the abandoned render is never checked");
      assert.ok(signals[1] instanceof AbortSignal);
      assert.equal(signals[1]?.aborted, true);
      assert.equal(uploadedB64(db), images[0]);
      const record = storedUpdate(db).visual_check;
      assert.equal(record.status, "fail");
      assert.equal(record.attempts, 2);
      assert.equal(record.chosen_attempt, 0);
      assert.equal(record.reason, "render_failed");
      assert.ok(logs.some((l) => l.includes("render attempt=1 stopped")), logs.join("\n"));
    });

    test("openai/gpt-image-2 re-renders send no seed and no steps", async () => {
      // Arrange
      const { together } = setup({ visual: ARJUNA_VISUAL, cfg: { ...GPT_CFG, steps: 28 } });
      vision((call, n) => reply(n, call === 1 ? 1 : 0));
      // Act
      const { status } = await run();
      // Assert
      assert.equal(status, 200);
      assert.equal(together.length, 2);
      for (const b of together) {
        assert.deepEqual(Object.keys(b).sort(), ["height", "model", "n", "prompt", "response_format", "width"]);
      }
    });

    test("a render that ends past the check deadline is kept unchecked: no vision call, no second render", async () => {
      // Arrange: the render ends 115s after the request started (deadline 130s, check estimate 20s)
      const { db, together } = setup({ visual: ARJUNA_VISUAL, renderMs: 115_000 });
      const calls = vision((_, n) => reply(n, 1));
      // Act
      const { status, json } = await run();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(together.length, 1);
      assert.equal(calls.length, 0);
      const record = storedUpdate(db).visual_check;
      assert.equal(record.status, "skipped");
      assert.equal(record.reason, "deadline");
      assert.equal(record.attempts, 1);
    });

    test("the deadline counts from request start: slow research leaves no time for a re-render after a failed check", async () => {
      // Arrange: 70s to write the visual prompt, 30s to render. A re-render would
      // end at 100 + 30 + 5 = 135s > 130s. Counted from after research it would fit.
      const { db, together } = setup({ visual: ARJUNA_VISUAL, haikuMs: 70_000, renderMs: 30_000 });
      const calls = vision((_, n) => reply(n, 1));
      // Act
      const { status } = await run();
      // Assert
      assert.equal(status, 200);
      assert.equal(calls.length, 1, "the first render is still checked");
      assert.equal(together.length, 1, "no second render");
      const record = storedUpdate(db).visual_check;
      assert.equal(record.status, "fail");
      assert.equal(record.reason, "deadline");
      assert.equal(record.attempts, 1);
      assert.equal(record.failed.length, 1);
    });

    test("with enough time left the same failed check does re-render", async () => {
      // Arrange: 30s render, fast research: 30 + 30 + 5 <= 130
      const { together } = setup({ visual: ARJUNA_VISUAL, renderMs: 30_000 });
      vision((call, n) => reply(n, call === 1 ? 1 : 0));
      // Act
      const { status } = await run();
      // Assert
      assert.equal(status, 200);
      assert.equal(together.length, 2);
    });

    const CHECK_ERRORS: Array<[string, () => unknown, string]> = [
      ["an API error", () => new APIError(529, "overloaded"), "api_error_529"],
      ["a refusal", () => ({ stop_reason: "refusal", content: [] }), "refusal"],
      ["a reply without the tool call", () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "looks fine" }] }), "no_tool"],
    ];
    for (const [name, answer, reason] of CHECK_ERRORS) {
      test(`check error (${name}): the image is kept with no second render`, async () => {
        // Arrange
        const { db, together, images } = setup({ visual: ARJUNA_VISUAL });
        const calls = vision(() => answer());
        // Act
        const { status, json } = await run();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(calls.length, 1);
        assert.equal(together.length, 1);
        assert.equal(uploadedB64(db), images[0]);
        const record = storedUpdate(db).visual_check;
        assert.equal(record.status, "error");
        assert.equal(record.reason, reason);
        assert.equal(record.attempts, 1);
        assert.deepEqual(json.visual_check, record);
      });
    }

    test("VISUAL_CHECK_ENABLED=false: one render, no vision call, record skipped/disabled", async () => {
      // Arrange
      ENV.VISUAL_CHECK_ENABLED = "false";
      const { db, together } = setup({ visual: ARJUNA_VISUAL });
      const calls = vision((_, n) => reply(n, 1));
      // Act
      const { status } = await run();
      // Assert
      assert.equal(status, 200);
      assert.equal(calls.length, 0);
      assert.equal(together.length, 1);
      assert.equal(storedUpdate(db).visual_check.reason, "disabled");
    });
  });

  // ── Storage ─────────────────────────────────────────────────────────────────

  describe("storing the record", () => {
    test("the image update writes visual_check with the unchanged columns, in one update", async () => {
      // Arrange
      const { db, together } = setup({ visual: ARJUNA_VISUAL });
      vision((_, n) => reply(n));
      // Act
      const { json } = await run();
      // Assert
      const generated = db.sceneUpdates().filter((v) => v.status === "generated");
      assert.equal(generated.length, 1);
      const v = generated[0];
      assert.deepEqual(Object.keys(v).sort(), [
        "error_message",
        "generated_at",
        "image_generated",
        "image_prompt",
        "image_url",
        "status",
        "visual_check",
      ]);
      assert.equal(v.image_url, json.image_url);
      assert.equal(v.image_prompt, together[0].prompt);
      assert.equal(v.error_message, null);
      const scoped = db.queries.filter((q) => q.table === "reader_scenes" && q.op === "update");
      for (const q of scoped) assert.deepEqual(q.filters, [["id", SCENE_ID]]);
    });

    test("when the visual_check column is missing, the image is still saved without it", async () => {
      // Arrange
      const { db } = setup({ visual: ARJUNA_VISUAL, rejectVisualCheckColumn: true });
      vision((_, n) => reply(n));
      // Act
      const { status, json } = await run();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      const generated = db.sceneUpdates().filter((v) => v.status === "generated");
      assert.equal(generated.length, 2);
      assert.ok("visual_check" in generated[0]);
      const { visual_check: _dropped, ...withoutRecord } = generated[0];
      assert.deepEqual(generated[1], withoutRecord);
      assert.ok(logs.some((l) => l.startsWith("WARN [scene] save with visual_check failed")), logs.join("\n"));
      assert.equal(json.visual_check.status, "pass");
    });
  });
});
