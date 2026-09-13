// Wiring tests for the visual check in the three chapter-art functions:
// regenerate-chapter-art, bulk-generate-chapter-art and bulk-generate-chaitanya-art.
// Each index.ts is imported under node with its Deno-only specifiers stubbed
// (helpers/edge-function-hooks.mjs and helpers/npm-stub-hooks.mjs). The database,
// storage, fetch (Together, buildiskcon.com) and the Claude SDK are fakes, and
// Date.now can be moved forward to reach a deadline. The real
// _shared/sceneResearch.ts (canon only: no Firecrawl key) and
// _shared/visualCheck.ts run. No network, no real keys, no paid calls.
//
// Globals are installed in the suite's before() and restored in after().
// Run: node --experimental-strip-types --test tests/
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { seededCanon } from "./helpers/seed-canon.ts";
import { ANACHRONISM_RULES, GENDER_RULES } from "./fixtures/bulk-chapter-art-constants.ts";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
register("./helpers/edge-function-hooks.mjs", import.meta.url);
// deno-lint-ignore no-explicit-any
const { APIError }: any = await import("./helpers/anthropic-stub.mjs");

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
// deno-lint-ignore no-explicit-any
type Json = any;
type Handler = (req: Request) => Promise<Response>;

const FUNCTIONS = new URL("../supabase/functions/", import.meta.url);
const CANON = seededCanon();
const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const FLUX2 = "black-forest-labs/FLUX.2-pro";
const FLUX11 = "black-forest-labs/FLUX.1.1-pro";
const GPT_IMAGE = "openai/gpt-image-2";
const HORSES_FACT = "Arjuna's chariot is drawn by exactly four white horses, no more and no fewer";
const MISSING_COLUMN = { message: "Could not find the 'visual_check' column in the schema cache" };

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  TOGETHER_API_KEY: "together-test",
  ANTHROPIC_API_KEY: "anthropic-test",
};
const ENV: Record<string, string> = {};

// A query string loads a separate module instance: the bulk functions cache
// image_gen_config once per instance, so the gpt-image-2 config gets its own.
const LOADS: Array<[string, string]> = [
  ["regen", "regenerate-chapter-art/index.ts?visual-check"],
  ["bhagavatam", "bulk-generate-chapter-art/index.ts?visual-check"],
  ["bhagavatam-gpt", "bulk-generate-chapter-art/index.ts?visual-check-gpt"],
  ["chaitanya", "bulk-generate-chaitanya-art/index.ts?visual-check"],
  ["chaitanya-gpt", "bulk-generate-chaitanya-art/index.ts?visual-check-gpt"],
];

/** A JPEG header plus the render's number, so every Together response is a distinct image. */
const jpeg = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, n]).toString("base64");

// ── Fakes ────────────────────────────────────────────────────────────────────

interface Query {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  single: boolean;
  values?: Json;
}
type TableFn = (q: Query) => { data?: unknown; error?: { message: string } };

function makeDb(tables: Record<string, TableFn>) {
  const queries: Query[] = [];
  const uploads: Array<{ path: string; b64: string }> = [];
  return {
    queries,
    uploads,
    writes: (table: string, op: Query["op"]) => queries.filter((q) => q.table === table && q.op === op),
    from(table: string) {
      const q: Query = { table, op: "select", single: false };
      const b: Json = {
        select: () => b,
        eq: () => b,
        in: () => b,
        is: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => {
          q.single = true;
          return b;
        },
        single: () => {
          q.single = true;
          return b;
        },
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
        then(res: Json, rej: Json) {
          queries.push(q);
          const r = tables[table] ? tables[table](q) : {};
          return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: 0 }).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => {
          uploads.push({ path, b64: Buffer.from(bytes).toString("base64") });
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
        remove: async () => ({ error: null }),
      }),
    },
  };
}

const CHAPTER_INDEX = [
  { globalNumber: 10, number: 10, skandh: 1, title: "Chapter Ten", batchNumber: 1, pageNumber: 1 },
  { globalNumber: 11, number: 11, skandh: 1, title: "Chapter Eleven", batchNumber: 1, pageNumber: 2 },
];

interface NetOptions {
  /** Whether Together call n (1-based) returns an image; default every call. */
  imageOk?: (n: number) => boolean;
  /** Runs while Together call n is in flight, e.g. to move the clock forward. */
  onRender?: (n: number) => void;
}

function makeNet(opts: NetOptions = {}) {
  const together: Json[] = [];
  /** The abort signal each Together request carried (undefined when none). */
  const signals: Array<AbortSignal | undefined> = [];
  const fn = async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    if (u === TOGETHER_API) {
      together.push(JSON.parse(String(init.body)));
      signals.push(init.signal ?? undefined);
      const n = together.length;
      opts.onRender?.(n);
      const ok = opts.imageOk ? opts.imageOk(n) : true;
      return ok ? Response.json({ data: [{ b64_json: jpeg(n) }] }) : new Response("busy", { status: 503 });
    }
    if (u.endsWith("/api/bhagwatham/chapter-index")) return Response.json({ chapters: CHAPTER_INDEX });
    throw new Error(`unexpected fetch ${u}`);
  };
  return { fn, together, signals };
}

/** The numbered facts the check sent to Claude, in order. */
const factsSent = (params: Json): string[] =>
  [...String(params.messages[0].content[1].text).matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]);

/**
 * Answers Claude check call n from plan[n] (the last entry repeats): a number is
 * how many facts, from the first, the painting clearly contradicts; "api_error"
 * throws an APIError 529.
 */
function makeClaude(plan: Array<number | "api_error">) {
  const calls: Json[] = [];
  g.__anthropicCreate = async (params: Json, reqOpts: Json) => {
    calls.push({ params, reqOpts });
    const step = plan[Math.min(calls.length - 1, plan.length - 1)];
    if (step === "api_error") throw new APIError(529, "overloaded");
    const checks = factsSent(params).map((_, i) => ({
      fact_index: i + 1,
      verdict: i < step ? "no" : "yes",
      observed: i < step ? `contradicted ${i + 1}` : "shown",
    }));
    return { stop_reason: "tool_use", content: [{ type: "tool_use", id: `t${calls.length}`, name: "record_visual_check", input: { checks } }] };
  };
  return calls;
}

// ── Harness ──────────────────────────────────────────────────────────────────

describe("chapter-art visual check wiring", () => {
  const handlers: Record<string, Handler> = {};
  const SAVED_GLOBALS = ["Deno", "EdgeRuntime", "fetch", "__sb", "__anthropicCreate"];
  const saved: Record<string, unknown> = {};
  const realNow = Date.now;
  const realLog = console.log;
  const realWarn = console.warn;
  const realError = console.error;
  let clockOffset = 0;
  let waits: Promise<unknown>[] = [];
  let logs: string[] = [];

  before(async () => {
    for (const k of SAVED_GLOBALS) saved[k] = g[k];
    Object.assign(ENV, BASE_ENV);
    let loading = "";
    g.Deno = {
      env: { get: (k: string) => ENV[k] },
      serve: (h: Handler) => {
        handlers[loading] = h;
      },
    };
    g.EdgeRuntime = {
      waitUntil: (p: Promise<unknown>) => {
        waits.push(Promise.resolve(p));
      },
    };
    Date.now = () => realNow() + clockOffset;
    for (const [name, path] of LOADS) {
      loading = name;
      await import(new URL(path, FUNCTIONS).href);
      assert.equal(typeof handlers[name], "function", `${name} did not register a handler`);
    }
  });

  after(() => {
    for (const k of SAVED_GLOBALS) g[k] = saved[k];
    Date.now = realNow;
  });

  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    Object.assign(ENV, BASE_ENV);
    clockOffset = 0;
    waits = [];
    logs = [];
    g.__anthropicCreate = async () => {
      throw new Error("Claude must not be called");
    };
    const capture = (prefix: string) => (...a: unknown[]) => {
      logs.push(prefix + a.map(String).join(" "));
    };
    console.log = capture("");
    console.warn = capture("WARN ");
    console.error = capture("ERROR ");
  });

  afterEach(() => {
    console.log = realLog;
    console.warn = realWarn;
    console.error = realError;
  });

  async function call(name: string, body: unknown): Promise<{ status: number; json: Json }> {
    const res = await handlers[name](
      new Request("http://functions.test/", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    );
    const json = await res.json();
    await Promise.all(waits.splice(0));
    return { status: res.status, json };
  }

  // ── regenerate-chapter-art (sync: 3 renders, 130s) ─────────────────────────
  describe("regenerate-chapter-art", () => {
    const DRAFT =
      "Krishna, a youthful MALE charioteer with blue skin, holds the reins of Arjuna's chariot on the plain of Kurukshetra while Arjuna, a MALE prince, listens";
    const TABLE = "gita_chapter_art_review";

    function setup(o: NetOptions & { cfg?: unknown; missingColumn?: boolean } = {}) {
      const db = makeDb({
        [TABLE]: (q) => {
          if (q.op === "select") return { data: { id: 5, chapter_number: 1, chapter_title: "Observing the Armies", image_path: "gita-old.jpg" } };
          if (q.op === "update" && o.missingColumn && "visual_check" in q.values) return { error: MISSING_COLUMN };
          return {};
        },
        image_gen_config: () => ({ data: o.cfg ?? null }),
        scene_visual_canon: () => ({ data: CANON }),
      });
      const net = makeNet(o);
      g.__sb = db;
      g.fetch = net.fn;
      return { db, net, updates: () => db.writes(TABLE, "update") };
    }
    const regen = (extra: Record<string, unknown> = {}) => call("regen", { book: "gita", id: 5, prompt: DRAFT, ...extra });

    test("a passing first render: one Together call, and the record is stored on the row and returned", async () => {
      // Arrange
      const { db, net, updates } = setup();
      const claude = makeClaude([0]);
      // Act
      const { status, json } = await regen();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(claude.length, 1);
      assert.ok(factsSent(claude[0].params).includes(HORSES_FACT), factsSent(claude[0].params).join("\n"));
      assert.equal(claude[0].params.messages[0].content[0].source.data, jpeg(1));
      assert.equal(json.visual_check.status, "pass");
      assert.equal(json.visual_check.attempts, 1);
      assert.equal(json.visual_check.chosen_attempt, 0);
      assert.equal(json.visual_check.reason, null);
      assert.equal(json.visual_check.image_model, FLUX2);
      assert.deepEqual(json.visual_check.failed, []);
      assert.equal(updates().length, 1);
      assert.deepEqual(updates()[0].values.visual_check, json.visual_check);
      assert.equal(db.uploads[0].b64, jpeg(1));
    });

    test("fail then pass: two Together calls with the same body, the second image is stored, attempts 2", async () => {
      // Arrange
      const { db, net, updates } = setup();
      const claude = makeClaude([1, 0]);
      // Act
      const { status, json } = await regen();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 2);
      assert.equal(claude.length, 2);
      assert.deepEqual(net.together[1], net.together[0], "a retry keeps the prompt and sends no seed");
      assert.equal(net.signals[0], undefined);
      assert.ok(net.signals[1] instanceof AbortSignal, "a re-render's request can be aborted at its deadline");
      assert.equal(db.uploads.length, 1);
      assert.equal(db.uploads[0].b64, jpeg(2));
      assert.equal(json.visual_check.status, "pass");
      assert.equal(json.visual_check.attempts, 2);
      assert.equal(json.visual_check.chosen_attempt, 1);
      assert.deepEqual(updates()[0].values.visual_check, json.visual_check);
    });

    test("every check fails: stops at 3 renders and keeps the image with the fewest contradicted facts", async () => {
      // Arrange
      const { db, net } = setup();
      makeClaude([2, 1, 2]);
      // Act
      const { json } = await regen();
      // Assert
      assert.equal(net.together.length, 3);
      assert.equal(db.uploads[0].b64, jpeg(2));
      assert.equal(json.visual_check.status, "fail");
      assert.equal(json.visual_check.attempts, 3);
      assert.equal(json.visual_check.chosen_attempt, 1);
      assert.equal(json.visual_check.reason, "max_attempts");
      assert.equal(json.visual_check.failed.length, 1);
      assert.equal(json.visual_check.failed[0].observed, "contradicted 1");
    });

    test("a check error never costs a second render: the first image is kept with status error", async () => {
      // Arrange
      const { db, net } = setup();
      const claude = makeClaude(["api_error"]);
      // Act
      const { status, json } = await regen();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(claude.length, 1);
      assert.equal(db.uploads[0].b64, jpeg(1));
      assert.equal(json.visual_check.status, "error");
      assert.equal(json.visual_check.reason, "api_error_529");
    });

    test("a render that ends too close to the deadline is kept unchecked, with no second render", async () => {
      // Arrange: 115s pass during the render, leaving less than a check's 20s estimate
      const { net } = setup({ onRender: () => (clockOffset += 115_000) });
      const claude = makeClaude([1]);
      // Act
      const { json } = await regen();
      // Assert
      assert.equal(net.together.length, 1);
      assert.equal(claude.length, 0);
      assert.equal(json.visual_check.status, "skipped");
      assert.equal(json.visual_check.reason, "deadline");
    });

    test("a failed check with no time left for another render plus check keeps the image", async () => {
      // Arrange: a 70s render leaves room for the check but not for a second 70s render
      const { net } = setup({ onRender: () => (clockOffset += 70_000) });
      const claude = makeClaude([1, 0]);
      // Act
      const { json } = await regen();
      // Assert
      assert.equal(net.together.length, 1);
      assert.equal(claude.length, 1);
      assert.equal(json.visual_check.status, "fail");
      assert.equal(json.visual_check.attempts, 1);
      assert.equal(json.visual_check.reason, "deadline");
    });

    const NO_FACT_CASES: Array<{ name: string; cfg: unknown; body: Record<string, unknown> }> = [
      {
        name: "no config (FLUX.2-pro, no steps)",
        cfg: null,
        body: { model: FLUX2, prompt: DRAFT, width: 1344, height: 1088, n: 1, response_format: "b64_json" },
      },
      {
        name: "a FLUX config with steps still sends steps",
        cfg: { model: FLUX2, steps: 28 },
        body: { model: FLUX2, prompt: DRAFT, width: 1344, height: 1088, n: 1, response_format: "b64_json", steps: 28 },
      },
      {
        name: "an openai/gpt-image-2 config gets no steps",
        cfg: { model: GPT_IMAGE, steps: 28 },
        body: { model: GPT_IMAGE, prompt: DRAFT, width: 1344, height: 1088, n: 1, response_format: "b64_json" },
      },
    ];
    for (const c of NO_FACT_CASES) {
      test(`no fact in the prompt, ${c.name}: one render, no Claude call, and the Together body is exactly the legacy one`, async () => {
        // Arrange
        const { net, updates } = setup({ cfg: c.cfg });
        // Act
        const { status, json } = await regen({ apply_facts: false, apply_style: false });
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.deepEqual(net.together, [c.body]);
        assert.equal(json.visual_check.status, "skipped");
        assert.equal(json.visual_check.reason, "no_facts");
        assert.equal(json.visual_check.attempts, 1);
        assert.equal(json.visual_check.image_model, c.body.model);
        assert.deepEqual(updates()[0].values.visual_check, json.visual_check);
      });
    }

    test("a fact already written into the draft is still checked", async () => {
      // Arrange: a Gita draft pre-filled from a stored prompt that carried the fact
      const { net } = setup();
      const claude = makeClaude([0]);
      // Act
      await regen({ prompt: `${DRAFT}. Canonical details: ${HORSES_FACT}.` });
      // Assert
      assert.equal(net.together.length, 1);
      assert.equal(net.together[0].prompt.split("four white horses").length - 1, 1, "the fact is sent once");
      assert.ok(factsSent(claude[0].params).includes(HORSES_FACT), factsSent(claude[0].params).join("\n"));
    });

    test("facts that did not fit in the prompt are not checked", async () => {
      // Arrange: the reviewer's words alone fill the 2000-char limit
      const { net } = setup();
      const long = Array.from({ length: 14 }, () => DRAFT).join(". ");
      // Act
      const { json } = await regen({ prompt: long });
      // Assert
      assert.ok(logs.some((l) => / facts=[1-9]\d* used=0 /.test(l)), logs.join("\n"));
      assert.equal(net.together.length, 1);
      assert.equal(json.visual_check.status, "skipped");
      assert.equal(json.visual_check.reason, "no_facts");
    });

    test("a missing visual_check column still saves the new image, without the record", async () => {
      // Arrange
      const { updates } = setup({ missingColumn: true });
      makeClaude([0]);
      // Act
      const { status, json } = await regen();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(updates().length, 2);
      assert.equal("visual_check" in updates()[1].values, false);
      assert.equal(updates()[1].values.image_path, updates()[0].values.image_path);
      assert.ok(logs.some((l) => l.startsWith("WARN [regen-chapter] update with visual_check failed")), logs.join("\n"));
    });
  });

  // ── bulk cover functions (chapter/sample: 3 renders, 130s; bulk: 2, 360s shared)
  const CHARIOT_SCENE = {
    title: "Arjuna's chariot",
    summary: "Krishna drives",
    characters: ["Krishna", "Arjuna"],
    setting: "Kurukshetra",
    mood: "still",
    image_prompt:
      "Krishna, a youthful MALE charioteer with blue skin, holds the reins of Arjuna's chariot on the plain of Kurukshetra while Arjuna, a MALE prince, listens",
    rank: 1,
  };
  const NARADA_SCENE = {
    title: "Narada at the hermitage",
    summary: "Narada sings",
    characters: ["Narada"],
    setting: "forest hermitage",
    mood: "calm",
    image_prompt: "Narada Muni, an elderly MALE sage, plays his vina in a forest hermitage at dawn",
    rank: 1,
  };
  const CHAITANYA_CHAPTERS = [
    { global_number: 5, part: "adi", number_in_part: 5, title: "Chapter Five", pdf_path: null, ocr_status: "done" },
    { global_number: 6, part: "adi", number_in_part: 6, title: "Chapter Six", pdf_path: null, ocr_status: "done" },
  ];
  const COVERS = [
    { fn: "bulk-generate-chapter-art", name: "bhagavatam", chapter: 10, reviewTable: "bhagavatam_chapter_art_review", scenesTable: "bhagavatam_chapter_scenes" },
    { fn: "bulk-generate-chaitanya-art", name: "chaitanya", chapter: 5, reviewTable: "chaitanya_chapter_art_review", scenesTable: "chaitanya_chapter_scenes" },
  ];
  const GPT_CFG = {
    model: GPT_IMAGE,
    width: 1088,
    height: 1344,
    steps: 28,
    fallback_model: FLUX11,
    fallback_width: 1024,
    fallback_height: 768,
    cover_width: 1344,
    cover_height: 1088,
    is_active: true,
  };

  for (const cover of COVERS) {
    describe(cover.fn, () => {
      function setup(o: NetOptions & { scene?: unknown; cfg?: unknown; missingColumn?: boolean } = {}) {
        const db = makeDb({
          image_gen_config: () => ({ data: o.cfg ?? null }),
          bhagwatham_personas: () => ({ data: [] }),
          chaitanya_chapters: (q) => ({ data: q.single ? CHAITANYA_CHAPTERS[0] : CHAITANYA_CHAPTERS }),
          [cover.scenesTable]: (q) => ({ data: q.op === "select" ? { scenes: [o.scene ?? CHARIOT_SCENE], used_scene_indexes: [] } : null }),
          [cover.reviewTable]: (q) => {
            if (q.op === "insert") return o.missingColumn && "visual_check" in q.values ? { error: MISSING_COLUMN } : { data: { id: 7 } };
            return { data: q.single ? null : [] };
          },
          scene_visual_canon: () => ({ data: CANON }),
        });
        const net = makeNet(o);
        g.__sb = db;
        g.fetch = net.fn;
        return { db, net, inserts: () => db.writes(cover.reviewTable, "insert") };
      }
      const chapterMode = (name = cover.name) => call(name, { mode: "chapter", chapter_global_number: cover.chapter });
      const inPromptCount = () => {
        const line = logs.find((l) => l.startsWith(`[${cover.fn}] research `)) ?? "";
        return Number(/ inPrompt=(\d+) /.exec(line)?.[1] ?? NaN);
      };

      test("chapter mode, a passing first render: one Together call, the record is inserted and returned as visualCheck", async () => {
        // Arrange
        const { db, net, inserts } = setup();
        const claude = makeClaude([0]);
        // Act
        const { status, json } = await chapterMode();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(net.together.length, 1);
        assert.equal(claude.length, 1);
        const sent = factsSent(claude[0].params);
        assert.ok(sent.includes(HORSES_FACT), sent.join("\n"));
        assert.ok(net.together[0].prompt.includes(HORSES_FACT));
        assert.equal(sent.length, inPromptCount(), logs.join("\n"));
        const record = json.visualCheck;
        assert.equal(record.status, "pass");
        assert.equal(record.attempts, 1);
        assert.equal(record.chosen_attempt, 0);
        assert.equal(record.image_model, FLUX2);
        assert.equal(record.safe_fallback, false);
        assert.equal(inserts().length, 1);
        assert.deepEqual(inserts()[0].values.visual_check, record);
        assert.equal(db.uploads[0].b64, jpeg(1));
      });

      test("chapter mode, fail then pass: two Together calls, the seed moves by one, the second image is stored", async () => {
        // Arrange
        const { db, net, inserts } = setup();
        makeClaude([1, 0]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(net.together.length, 2);
        assert.equal(typeof net.together[0].seed, "number");
        assert.equal(net.together[1].seed, net.together[0].seed + 1);
        assert.equal(net.together[1].prompt, net.together[0].prompt);
        assert.ok(net.signals[1] instanceof AbortSignal, "a re-render's request can be aborted at its deadline");
        assert.equal(db.uploads.length, 1);
        assert.equal(db.uploads[0].b64, jpeg(2));
        assert.equal(json.visualCheck.status, "pass");
        assert.equal(json.visualCheck.attempts, 2);
        assert.equal(json.visualCheck.chosen_attempt, 1);
        assert.deepEqual(inserts()[0].values.visual_check, json.visualCheck);
      });

      test("chapter mode stops at 3 renders when every check fails", async () => {
        // Arrange
        const { net } = setup();
        makeClaude([1]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(net.together.length, 3);
        assert.equal(json.visualCheck.status, "fail");
        assert.equal(json.visualCheck.attempts, 3);
        assert.equal(json.visualCheck.chosen_attempt, 0);
        assert.equal(json.visualCheck.reason, "max_attempts");
      });

      test("chapter mode, a check error never costs a second render", async () => {
        // Arrange
        const { db, net } = setup();
        const claude = makeClaude(["api_error"]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(net.together.length, 1);
        assert.equal(claude.length, 1);
        assert.equal(db.uploads[0].b64, jpeg(1));
        assert.equal(json.visualCheck.status, "error");
        assert.equal(json.visualCheck.reason, "api_error_529");
      });

      test("chapter mode, a render that ends past the deadline estimate is kept unchecked with no second render", async () => {
        // Arrange
        const { net } = setup({ onRender: () => (clockOffset += 115_000) });
        const claude = makeClaude([1]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(net.together.length, 1);
        assert.equal(claude.length, 0);
        assert.equal(json.visualCheck.status, "skipped");
        assert.equal(json.visualCheck.reason, "deadline");
      });

      test("chapter mode, no fact in the prompt: one render, no Claude call, and the FLUX request is exactly as before", async () => {
        // Arrange
        const { net, inserts } = setup({ scene: NARADA_SCENE });
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(inPromptCount(), 0, logs.join("\n"));
        assert.equal(net.together.length, 1);
        const body = net.together[0];
        assert.deepEqual(Object.keys(body).sort(), ["height", "model", "n", "prompt", "response_format", "seed", "width"]);
        assert.deepEqual({ ...body, prompt: "", seed: 0 }, { model: FLUX2, prompt: "", width: 1344, height: 1088, n: 1, response_format: "b64_json", seed: 0 });
        assert.ok(Number.isInteger(body.seed) && body.seed >= 0 && body.seed < 1_000_000, String(body.seed));
        assert.ok(body.prompt.startsWith(NARADA_SCENE.image_prompt), body.prompt.slice(0, 120));
        assert.doesNotMatch(body.prompt, /Canonical details/);
        if (cover.fn === "bulk-generate-chapter-art") {
          // The compressed layout, byte for byte (constants: tests/fixtures/bulk-chapter-art-constants.ts).
          const stylePositives =
            "museum-quality 19th-century Indian devotional OIL PAINTING on canvas, Raja Ravi Varma 1880-1900 aesthetic, VISIBLE oil-paint brushstrokes, warm saffron palette, WIDE landscape composition";
          const styleNegatives = "NOT cartoon, NOT anime, NOT CGI, NOT 3D render, NOT digital illustration, NOT Pixar style, NOT Midjourney style, NOT photo-realistic";
          const tail = `${stylePositives}, ${styleNegatives}. ${GENDER_RULES.substring(0, 200)} ${ANACHRONISM_RULES.substring(0, 540)}`;
          const sanitize = (t: string) =>
            t.replace(/\b(battle|war|fight|weapon|sword|arrow|kill|death|blood|fire|burn|destroy|attack|strike|naked|nude|tattered|humiliating|shocking|disorder|defeat)\b/gi, "blessing");
          assert.equal(body.prompt, sanitize(`${NARADA_SCENE.image_prompt}, ${tail}`));
        }
        assert.equal(json.visualCheck.status, "skipped");
        assert.equal(json.visualCheck.reason, "no_facts");
        assert.deepEqual(inserts()[0].values.visual_check, json.visualCheck);
      });

      test("an openai/gpt-image-2 config sends no seed or steps, and a FLUX fallback still gets its seed", async () => {
        // Arrange: the gpt-image-2 request fails, so the FLUX.1.1-pro fallback draws the image
        const { net, inserts } = setup({ cfg: GPT_CFG, scene: NARADA_SCENE, imageOk: (n) => n !== 1 });
        // Act
        const { json } = await chapterMode(`${cover.name}-gpt`);
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(net.together.length, 2);
        assert.deepEqual(Object.keys(net.together[0]).sort(), ["height", "model", "n", "prompt", "response_format", "width"]);
        assert.equal(net.together[0].model, GPT_IMAGE);
        assert.equal(net.together[1].model, FLUX11);
        assert.equal(typeof net.together[1].seed, "number");
        assert.equal("steps" in net.together[1], false);
        assert.equal(inserts()[0].values.visual_check.image_model, FLUX11);
      });

      test("an image drawn from SAFE_FALLBACK carries no facts, so it is kept unchecked with safe_fallback true and never re-rendered", async () => {
        // Arrange
        const { net, inserts } = setup({ imageOk: (n) => n === 3 });
        const claude = makeClaude([1]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(net.together.length, 3);
        assert.equal(claude.length, 0);
        assert.doesNotMatch(net.together[2].prompt, /four white horses/);
        assert.equal(json.visualCheck.status, "skipped");
        assert.equal(json.visualCheck.reason, "safe_fallback");
        assert.equal(json.visualCheck.attempts, 1);
        assert.equal(json.visualCheck.safe_fallback, true);
        assert.equal(json.visualCheck.image_model, FLUX11);
        assert.deepEqual(inserts()[0].values.visual_check, json.visualCheck);
      });

      test("a re-render that ends on SAFE_FALLBACK stops the loop and keeps the checked cover", async () => {
        // Arrange: render 0 draws with FLUX.2-pro and fails its check; render 1 only gets SAFE_FALLBACK
        const { db, net } = setup({ imageOk: (n) => n === 1 || n === 4 });
        const claude = makeClaude([1]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(net.together.length, 4);
        assert.doesNotMatch(net.together[3].prompt, /four white horses/);
        assert.equal(claude.length, 1, "the SAFE_FALLBACK image is not checked");
        assert.equal(db.uploads[0].b64, jpeg(1));
        assert.equal(json.visualCheck.status, "fail");
        assert.equal(json.visualCheck.attempts, 2);
        assert.equal(json.visualCheck.chosen_attempt, 0);
        assert.equal(json.visualCheck.reason, "safe_fallback");
        assert.equal(json.visualCheck.safe_fallback, false);
        assert.equal(json.visualCheck.image_model, FLUX2);
      });

      test("a missing visual_check column still inserts the cover, without the record", async () => {
        // Arrange
        const { inserts } = setup({ missingColumn: true });
        makeClaude([0]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(inserts().length, 2);
        assert.equal("visual_check" in inserts()[1].values, false);
        assert.equal(inserts()[1].values.image_path, inserts()[0].values.image_path);
        assert.ok(logs.some((l) => l.startsWith(`WARN [${cover.fn}] insert with visual_check failed`)), logs.join("\n"));
      });

      test("bulk mode stops at 2 renders per chapter when every check fails", async () => {
        // Arrange
        const { net, inserts } = setup();
        makeClaude([1]);
        // Act
        const { status, json } = await call(cover.name, { mode: "bulk", limit: 1 });
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(net.together.length, 2);
        assert.equal(inserts().length, 1);
        const record = inserts()[0].values.visual_check;
        assert.equal(record.status, "fail");
        assert.equal(record.attempts, 2);
        assert.equal(record.reason, "max_attempts");
      });

      test("bulk mode shares one deadline across the run: a later chapter is not given a fresh 360s", async () => {
        // Arrange: 345s pass during the first chapter's render; the second chapter starts after that
        const { net, inserts } = setup({ onRender: (n) => (n === 1 ? (clockOffset += 345_000) : undefined) });
        const claude = makeClaude([0]);
        // Act
        const { json } = await call(cover.name, { mode: "bulk", limit: 2, concurrency: 1 });
        // Assert
        assert.equal(json.queued, 2, JSON.stringify(json));
        assert.equal(net.together.length, 2);
        assert.equal(claude.length, 0);
        assert.equal(inserts().length, 2);
        for (const q of inserts()) {
          assert.equal(q.values.visual_check.status, "skipped");
          assert.equal(q.values.visual_check.reason, "deadline");
        }
      });

      test("bulk mode with time left checks each chapter", async () => {
        // Arrange: the same run with no clock movement
        const { inserts } = setup();
        const claude = makeClaude([0]);
        // Act
        await call(cover.name, { mode: "bulk", limit: 2, concurrency: 1 });
        // Assert
        assert.equal(claude.length, 2);
        assert.deepEqual(inserts().map((q) => q.values.visual_check.status), ["pass", "pass"]);
      });
    });
  }
});
