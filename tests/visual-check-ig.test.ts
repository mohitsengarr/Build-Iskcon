// Visual check wiring in the three writers of ig_pending_review: instagram-post,
// bulk-generate-images (sample and bulk modes) and regenerate-pending-image.
//
// Each index.ts is imported under node with its Deno-only specifiers stubbed
// (helpers/edge-function-hooks.mjs and helpers/npm-stub-hooks.mjs). The database,
// storage, fetch (Together, the raw Claude API, buildiskcon.com), the Anthropic
// SDK (the vision check) and Date.now are fakes. The real _shared/sceneResearch.ts
// and _shared/visualCheck.ts run. No network, no real keys, no paid calls.
//
// Every module is loaded with its own query string, so its per-isolate caches
// (image_gen_config) never mix with the copies scene-research-wiring.test.ts
// loads. Globals are installed in before() and restored in after().
// Run: node --experimental-strip-types --test tests/
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

const FUNCTIONS = new URL("../supabase/functions/", import.meta.url);
// bulk-generate-images/index.ts as it was before research was added, copied verbatim.
const BASELINE_BGI = new URL("./fixtures/baseline/bulk-generate-images.index.ts", import.meta.url).href;
const CANON = seededCanon();
const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const FLUX2 = "black-forest-labs/FLUX.2-pro";
const FLUX11 = "black-forest-labs/FLUX.1.1-pro";
const GPT = "openai/gpt-image-2";
const HORSES = "exactly four white horses";
const RECORD_KEYS = ["attempts", "checked_at", "chosen_attempt", "failed", "image_model", "reason", "status", "unclear"];
const BODY_KEYS = ["model", "prompt", "width", "height", "n", "response_format"];
const MISSING_COLUMN = { code: "PGRST204", message: "Could not find the 'visual_check' column of 'ig_pending_review' in the schema cache" };
// Two more Arjuna's-chariot canon facts: with them the facts block passes its
// 450 chars, so assemblePrompt leaves both out of the prompt.
const EXTRA_CANON = [
  { ...CANON[0], id: 901, attribute: "wheels", prompt_text: "the wheels of Arjuna's chariot are dark sandalwood with golden rims and bronze hubs" },
  { ...CANON[0], id: 902, attribute: "rail", prompt_text: "the rail of Arjuna's chariot is carved teak inlaid with ivory lotus flowers and pearls" },
];

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  TOGETHER_API_KEY: "together-test",
  ANTHROPIC_API_KEY: "anthropic-test",
};
const ENV: Record<string, string> = {};

const LOADS: Array<[string, string]> = [
  ["ig", new URL("instagram-post/index.ts?visual-check", FUNCTIONS).href],
  ["ig-gpt", new URL("instagram-post/index.ts?visual-check-gpt", FUNCTIONS).href],
  ["ig-short", new URL("instagram-post/index.ts?visual-check-short", FUNCTIONS).href],
  ["bgi", new URL("bulk-generate-images/index.ts?visual-check", FUNCTIONS).href],
  ["bgi-cfg", new URL("bulk-generate-images/index.ts?visual-check-cfg", FUNCTIONS).href],
  ["bgi-gpt", new URL("bulk-generate-images/index.ts?visual-check-gpt", FUNCTIONS).href],
  ["bgi-short", new URL("bulk-generate-images/index.ts?visual-check-short", FUNCTIONS).href],
  ["base-bgi", `${BASELINE_BGI}?visual-check`],
  ["base-bgi-cfg", `${BASELINE_BGI}?visual-check-cfg`],
  ["regen", new URL("regenerate-pending-image/index.ts?visual-check", FUNCTIONS).href],
];

type Handler = (req: Request) => Promise<Response>;
const handlers: Record<string, Handler> = {};

// ── Fakes ────────────────────────────────────────────────────────────────────

/** A JPEG header plus the Together call number, so every render is a distinct image. */
const jpeg = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, n & 0xff]).toString("base64");

// Date.now is faked so a render can "take" 100s without waiting.
const realNow = Date.now;
const clock = { offset: 0, fixed: null as number | null };

interface Query {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  single: boolean;
  values?: Json;
}
type TableFn = (q: Query) => unknown;

/** A table function returning { __error } answers that query with an error. */
function makeDb(tables: Record<string, TableFn>) {
  const queries: Query[] = [];
  const uploads: Array<{ path: string; b64: string }> = [];
  /** "<op>:<table>" per query and "remove" per storage removal, in order. */
  const events: string[] = [];
  return {
    queries,
    uploads,
    events,
    writes: (table: string) => queries.filter((q) => q.table === table && q.op !== "select"),
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
          events.push(`${q.op}:${table}`);
          const fn = tables[table];
          const out: Json = fn ? fn(q) : null;
          const error = out && typeof out === "object" && "__error" in out ? out.__error : null;
          return Promise.resolve({ data: error ? null : out, error, count: 0 }).then(res, rej);
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
        list: async () => ({ data: [], error: null }),
        remove: async () => {
          events.push("remove");
          return { data: [], error: null };
        },
      }),
    },
  };
}

const CHAPTER_INDEX = [
  { globalNumber: 10, number: 10, skandh: 1, title: "Chapter Ten", batchNumber: 1, pageNumber: 1 },
  { globalNumber: 293, number: 1, skandh: 11, title: "Chapter Two Ninety Three", batchNumber: 30, pageNumber: 1 },
];

/** Together returns jpeg(n) for call n (or 503 when imageOk says no); each call moves the clock on by renderMs. */
function makeNet(o: { claude: (body: Json) => string; imageOk?: (n: number) => boolean; renderMs?: number }) {
  const together: Json[] = [];
  /** The abort signal each Together request carried (undefined when none). */
  const signals: Array<AbortSignal | undefined> = [];
  /** "together", or "claude-<max_tokens>" for a raw Claude call, in the order the requests started. */
  const calls: string[] = [];
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  const fn = async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (u === TOGETHER_API) {
      together.push(body);
      signals.push(init.signal ?? undefined);
      calls.push("together");
      const n = together.length;
      clock.offset += o.renderMs ?? 0;
      const ok = o.imageOk ? o.imageOk(n) : true;
      return ok ? json({ data: [{ b64_json: jpeg(n) }] }) : new Response("busy", { status: 503 });
    }
    if (u === "https://api.anthropic.com/v1/messages") {
      calls.push(`claude-${body?.max_tokens}`);
      return json({ content: [{ type: "text", text: o.claude(body) }] });
    }
    if (u.endsWith("/api/bhagwatham/chapter-index")) return json({ chapters: CHAPTER_INDEX });
    if (u.includes("/api/bhagwatham/batch/")) return json({ pages: [{ text: "Chapter text." }] });
    throw new Error(`unexpected fetch ${u}`);
  };
  return { fn, together, signals, calls };
}

type Reply = "pass" | "fail" | "fail2" | "no_tool" | "refusal" | Error;

/** The numbered details in a vision check request. */
function detailCount(params: Json): number {
  const text: string = params.messages[0].content[1].text;
  return (text.split("\nDetails:\n")[1] ?? "").split("\n").filter((l) => /^\d+\. /.test(l)).length;
}

/**
 * Answers vision checks from `replies` in order (the last one repeats). "fail"
 * contradicts detail 1, "fail2" details 1 and 2. Any other SDK call is an error.
 */
function visionQueue(replies: Reply[]) {
  const calls: Json[] = [];
  g.__anthropicCreate = async (params: Json, reqOpts: Json) => {
    if (params?.tools?.[0]?.name !== "record_visual_check") throw new Error(`unexpected SDK call ${params?.tools?.[0]?.name}`);
    calls.push({ params, reqOpts });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r instanceof Error) throw r;
    if (r === "refusal") return { stop_reason: "refusal", content: [] };
    if (r === "no_tool") return { stop_reason: "end_turn", content: [{ type: "text", text: "cannot tell" }] };
    const n = detailCount(params);
    const wrong = r === "fail" ? 1 : r === "fail2" ? 2 : 0;
    const checks = Array.from({ length: n }, (_, i) => ({
      fact_index: i + 1,
      verdict: i < wrong ? "no" : "yes",
      observed: i < wrong ? `wrong detail ${i + 1}` : "shown",
    }));
    return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "record_visual_check", input: { checks } }] };
  };
  return calls;
}

const imageSent = (call: Json): string => call.params.messages[0].content[0].source.data;
const checkText = (call: Json): string => call.params.messages[0].content[1].text;
/** The numbered details a vision check was asked about, in order. */
const checkedDetails = (call: Json): string[] =>
  (checkText(call).split("\nDetails:\n")[1] ?? "").split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));

function assertRecord(rec: Json, want: Record<string, unknown>, extraKeys: string[] = []) {
  assert.ok(rec && typeof rec === "object", `no visual_check record: ${JSON.stringify(rec)}`);
  assert.deepEqual(Object.keys(rec).sort(), [...RECORD_KEYS, ...extraKeys].sort());
  for (const [k, v] of Object.entries(want)) assert.deepEqual(rec[k], v, `visual_check.${k} in ${JSON.stringify(rec)}`);
  assert.match(rec.checked_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
}

// ── Shared scenes and configs ────────────────────────────────────────────────

const ARJUNA_SCENE =
  "Wide shot of Arjuna, a MALE warrior prince, standing on his chariot beside Krishna, a youthful MALE with blue skin, on the plain of Kurukshetra";
const DHRUVA_SCENE = "Wide shot of Dhruva, a young MALE prince, meditating alone in the forest of Madhuvana under golden light";
const GITA_SCENE =
  "Krishna, a youthful MALE charioteer with blue skin, holds the reins of Arjuna's chariot on the plain of Kurukshetra while Arjuna, a MALE warrior, looks toward him";
const WAR_SCENE =
  "Wide shot of sages pouring ghee into the sacrificial fire toward warm golden light, while young warriors lay down their weapons and arrows beside a narrow river at the battlefield's edge";

const FLUX_CFG = {
  model: FLUX2,
  width: 1024,
  height: 1280,
  steps: null,
  style_positives: "warm golden oil painting, visible brushstrokes, light falling toward the sages",
  style_negatives: "NOT cartoon, NOT a firearm, NOT a sword",
  extra_rules: "Warriors appear peaceful and no arrows fly.",
  prompt_max_len: 2000,
  fallback_model: FLUX11,
  fallback_width: 768,
  fallback_height: 1024,
  is_active: true,
};
const GPT_CFG = {
  model: GPT,
  width: 1088,
  height: 1344,
  steps: 30,
  style_positives: "warm golden oil painting",
  style_negatives: "NOT cartoon",
  extra_rules: "Vedic era only.",
  prompt_max_len: 2000,
  fallback_model: GPT,
  fallback_width: 1088,
  fallback_height: 1344,
  ig_width: 1344,
  ig_height: 1088,
  is_active: true,
};

// ── Harness ──────────────────────────────────────────────────────────────────

describe("visual check wiring for ig_pending_review", () => {
  const saved: Record<string, unknown> = {};
  const SAVED_GLOBALS = ["Deno", "EdgeRuntime", "fetch", "__sb", "__anthropicCreate"];
  const realLog = console.log;
  const realWarn = console.warn;
  const realError = console.error;
  let waits: Promise<unknown>[] = [];
  let logs: string[] = [];

  before(async () => {
    for (const k of SAVED_GLOBALS) saved[k] = g[k];
    for (const k of Object.keys(ENV)) delete ENV[k];
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
    for (const [name, href] of LOADS) {
      loading = name;
      await import(href);
      assert.equal(typeof handlers[name], "function", `${name} did not register a handler`);
    }
  });

  after(() => {
    for (const k of SAVED_GLOBALS) g[k] = saved[k];
  });

  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    Object.assign(ENV, BASE_ENV);
    waits = [];
    logs = [];
    clock.offset = 0;
    clock.fixed = null;
    Date.now = () => (clock.fixed ?? realNow.call(Date)) + clock.offset;
    g.__anthropicCreate = async () => {
      throw new Error("no vision reply set for this test");
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

  async function call(fn: string, body: unknown): Promise<{ status: number; json: Json }> {
    const res = await handlers[fn](
      new Request("http://functions.test/", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    );
    const json = await res.json();
    await Promise.all(waits.splice(0));
    return { status: res.status, json };
  }

  const factsLogged = (prefix: string): number => {
    const line = logs.find((l) => l.startsWith(prefix)) ?? "";
    const m = / facts=(\d+) /.exec(line);
    assert.ok(m, `no research line starting ${prefix}\n${logs.join("\n")}`);
    return Number(m[1]);
  };

  // ── instagram-post ─────────────────────────────────────────────────────────
  describe("instagram-post", () => {
    function setup(
      o: { cfg?: unknown; scene?: string; canon?: unknown[]; imageOk?: (n: number) => boolean; renderMs?: number; missingColumn?: boolean; verse?: string } = {},
    ) {
      const scene = {
        title: "On the chariot",
        summary: "Arjuna and Krishna",
        characters: ["Arjuna", "Krishna"],
        setting: "Kurukshetra",
        mood: "grave",
        image_prompt: o.scene ?? ARJUNA_SCENE,
        rank: 1,
      };
      const db = makeDb({
        image_gen_config: () => o.cfg ?? null,
        bhagwatham_personas: () => [],
        bhagavatam_chapter_scenes: (q) => (q.op === "select" ? { scenes: [scene], used_scene_indexes: [] } : null),
        bhaktigram_mahajan_aliases: () => [],
        ig_cron_state: () => ({ total_posted: 1, next_chapter: 293 }),
        ig_pending_review: (q) => {
          if (q.op !== "insert") return null;
          return o.missingColumn && "visual_check" in q.values ? { __error: MISSING_COLUMN } : { id: 77 };
        },
        scene_visual_canon: () => o.canon ?? CANON,
        scene_visual_research: () => null,
      });
      const net = makeNet({
        claude: (body) => (body.max_tokens === 600 ? (o.verse ?? '{"sanskrit":null,"hindi":null}') : "caption text"),
        imageOk: o.imageOk,
        renderMs: o.renderMs,
      });
      g.__sb = db;
      g.fetch = net.fn;
      return { db, net };
    }
    const inserted = (db: ReturnType<typeof makeDb>) => db.writes("ig_pending_review").find((q) => q.op === "insert")?.values;
    const researchFacts = () => factsLogged("[instagram-post] research key=");

    test("pass on the first render: one Together call, one check against the research facts, record stored and returned", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue(["pass"]);
      // Act
      const { status, json } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.equal(imageSent(vision[0]), jpeg(1));
      assert.ok(checkText(vision[0]).includes(HORSES), checkText(vision[0]));
      assert.ok(researchFacts() >= 1);
      assert.equal(detailCount(vision[0].params), researchFacts());
      const row = inserted(db);
      assertRecord(row.visual_check, { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], reason: null, image_model: FLUX2, safe_fallback: false }, ["safe_fallback"]);
      assert.deepEqual(json.visualCheck, row.visual_check);
      assert.equal(db.uploads.length, 1);
      assert.equal(db.uploads[0].b64, jpeg(1));
    });

    test("fail then pass: the same prompt is re-rendered with the next seed and the second image is stored", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status, json } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 2);
      assert.equal(net.together[1].prompt, net.together[0].prompt);
      assert.equal(net.together[1].model, FLUX2);
      assert.equal(net.together[1].seed, net.together[0].seed + 1);
      assert.equal(net.signals[0], undefined);
      assert.ok(net.signals[1] instanceof AbortSignal, "a re-render's request can be aborted at its deadline");
      assert.deepEqual(vision.map(imageSent), [jpeg(1), jpeg(2)]);
      assert.equal(db.uploads.length, 1);
      assert.equal(db.uploads[0].b64, jpeg(2));
      const row = inserted(db);
      assertRecord(row.visual_check, { status: "pass", attempts: 2, chosen_attempt: 1, failed: [], reason: null, image_model: FLUX2, safe_fallback: false }, ["safe_fallback"]);
      assert.deepEqual(json.visualCheck, row.visual_check);
    });

    test("boundary: three failing renders stop at maxAttempts 3 and keep the fewest-failed image", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue(["fail2", "fail", "fail2"]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 3);
      assert.equal(vision.length, 3);
      assert.equal(db.uploads[0].b64, jpeg(2));
      const rec = inserted(db).visual_check;
      assertRecord(rec, { status: "fail", attempts: 3, chosen_attempt: 1, reason: "max_attempts" }, ["safe_fallback"]);
      assert.equal(rec.failed.length, 1);
      assert.equal(rec.failed[0].observed, "wrong detail 1");
    });

    test("deadline: a 100s render leaves no room before request start + 130s, so a failed check does not re-render", async () => {
      // Arrange: the clock only moves when Together renders
      clock.fixed = realNow.call(Date);
      const { db, net } = setup({ renderMs: 100_000 });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status, json } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.equal(vision[0].reqOpts.timeout, 30_000, "the check ends by the request deadline");
      assertRecord(inserted(db).visual_check, { status: "fail", attempts: 1, chosen_attempt: 0, reason: "deadline" }, ["safe_fallback"]);
    });

    test("check error: an API error keeps the first image without another render", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue([new APIError(529, "overloaded")]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.equal(db.uploads[0].b64, jpeg(1));
      assertRecord(inserted(db).visual_check, { status: "error", attempts: 1, chosen_attempt: 0, failed: [], reason: "api_error_529", image_model: FLUX2 }, ["safe_fallback"]);
    });

    test("no facts: one render, no check, and the Together request has exactly the pre-check shape and seed", async () => {
      // Arrange
      clock.fixed = 1_700_000_123_456;
      const { db, net } = setup({ scene: DHRUVA_SCENE, canon: [] });
      const vision = visionQueue(["fail"]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(researchFacts(), 0);
      assert.equal(vision.length, 0);
      assert.equal(net.together.length, 1);
      const body = net.together[0];
      assert.deepEqual(Object.keys(body), [...BODY_KEYS, "seed"]);
      assert.deepEqual({ ...body, prompt: "" }, { model: FLUX2, prompt: "", width: 1344, height: 768, n: 1, response_format: "b64_json", seed: 123_456 });
      assert.ok(body.prompt.startsWith(`${DHRUVA_SCENE}, museum-quality`), body.prompt.slice(0, 200));
      assertRecord(inserted(db).visual_check, { status: "skipped", attempts: 1, chosen_attempt: 0, reason: "no_facts", safe_fallback: false }, ["safe_fallback"]);
    });

    test("a SAFE_FALLBACK image carries none of the facts: it is kept unchecked, never re-rendered, and the record says so", async () => {
      // Arrange
      const { db, net } = setup({ imageOk: (n) => n === 3 });
      const vision = visionQueue(["fail"]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 3, "the same refused prompt is not sent through the chain again");
      assert.ok(net.together[2].prompt.startsWith("A serene scene from Srimad Bhagavatam"));
      assert.equal(vision.length, 0);
      assertRecord(
        inserted(db).visual_check,
        { status: "skipped", attempts: 1, chosen_attempt: 0, failed: [], reason: "safe_fallback", image_model: FLUX11, safe_fallback: true },
        ["safe_fallback"],
      );
    });

    test("a re-render that ends on SAFE_FALLBACK stops the loop and keeps the checked first image", async () => {
      // Arrange: render 0 draws with FLUX.2-pro and fails its check; render 1 only gets SAFE_FALLBACK
      const { db, net } = setup({ imageOk: (n) => n === 1 || n === 4 });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 4);
      assert.ok(net.together[3].prompt.startsWith("A serene scene from Srimad Bhagavatam"));
      assert.equal(vision.length, 1);
      assert.equal(db.uploads[0].b64, jpeg(1));
      assertRecord(
        inserted(db).visual_check,
        { status: "fail", attempts: 2, chosen_attempt: 0, reason: "safe_fallback", image_model: FLUX2, safe_fallback: false },
        ["safe_fallback"],
      );
    });

    test("a prompt with no room for any fact checks nothing: one render, reason no_facts", async () => {
      // Arrange: prompt_max_len 200 leaves the Arjuna scene no room for a single fact
      const { db, net } = setup({ cfg: { prompt_max_len: 200, is_active: true } });
      const vision = visionQueue(["fail"]);
      // Act
      const { status, json } = await call("ig-short", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.ok(researchFacts() >= 1, "research found facts");
      assert.equal(net.together[0].prompt.includes(HORSES), false, "no fact reached the prompt");
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 0);
      assertRecord(inserted(db).visual_check, { status: "skipped", attempts: 1, reason: "no_facts", safe_fallback: false }, ["safe_fallback"]);
    });

    test("facts left out of the prompt for room are not checked", async () => {
      // Arrange: two more canon facts push the facts block past its 450 chars
      const { net } = setup({ canon: [...CANON, ...EXTRA_CANON] });
      const vision = visionQueue(["pass"]);
      // Act
      const { status, json } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      const checked = checkedDetails(vision[0]);
      assert.ok(checked.length > 0 && checked.length < researchFacts(), `${checked.length} checked of ${researchFacts()}`);
      assert.ok(checked.some((d) => d.includes(HORSES)));
      for (const d of checked) assert.ok(net.together[0].prompt.includes(d), `checked but not in the prompt: ${d}`);
      for (const e of EXTRA_CANON) assert.equal(checked.includes(e.prompt_text), false, e.prompt_text);
    });

    test("the verse is fetched alongside the image, not after it: the Haiku call starts before the first render", async () => {
      // Arrange
      const verse = '{"sanskrit":"धर्मक्षेत्रे कुरुक्षेत्रे","hindi":"धर्मभूमि कुरुक्षेत्र में"}';
      const { db, net } = setup({ verse });
      visionQueue(["pass"]);
      // Act
      const { status, json } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      const verseAt = net.calls.indexOf("claude-600");
      const renderAt = net.calls.indexOf("together");
      assert.ok(verseAt >= 0 && renderAt >= 0, net.calls.join(","));
      assert.ok(verseAt < renderAt, `verse after the render: ${net.calls.join(",")}`);
      const row = inserted(db);
      assert.equal(row.shlok_sanskrit, "धर्मक्षेत्रे कुरुक्षेत्रे");
      assert.equal(row.anuvad_hindi, "धर्मभूमि कुरुक्षेत्र में");
    });

    test("a missing visual_check column still saves the post, without the record", async () => {
      // Arrange
      const { db } = setup({ missingColumn: true });
      visionQueue(["pass"]);
      // Act
      const { status, json } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(json.success, true);
      assert.equal(json.pendingReviewId, 77);
      const rows = db.writes("ig_pending_review").filter((q) => q.op === "insert").map((q) => q.values);
      assert.equal(rows.length, 2);
      assert.ok("visual_check" in rows[0]);
      const { visual_check: _dropped, ...withoutRecord } = rows[0];
      assert.deepEqual(rows[1], withoutRecord);
      assert.ok(logs.some((l) => l.startsWith("WARN [instagram-post] insert with visual_check failed")), logs.join("\n"));
    });

    test("openai/gpt-image-2: no seed or steps in any request, re-render still happens, record names the model", async () => {
      // Arrange
      const { db, net } = setup({ cfg: GPT_CFG });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status, json } = await call("ig-gpt", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 2);
      for (const body of net.together) {
        assert.deepEqual(Object.keys(body), BODY_KEYS);
        assert.equal(body.model, GPT);
        assert.equal(body.width, 1344);
        assert.equal(body.height, 1088);
      }
      assert.equal(vision.length, 2);
      assertRecord(inserted(db).visual_check, { status: "pass", attempts: 2, chosen_attempt: 1, image_model: GPT }, ["safe_fallback"]);
    });

    test("negative: every attempt failing still fails the post, with no check and no review row", async () => {
      // Arrange
      const { db, net } = setup({ imageOk: () => false });
      const vision = visionQueue(["pass"]);
      // Act
      const { status, json } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 500);
      assert.match(json.error, /All FLUX attempts failed/);
      assert.equal(net.together.length, 3);
      assert.equal(vision.length, 0);
      assert.equal(db.writes("ig_pending_review").length, 0);
    });
  });

  // ── bulk-generate-images ───────────────────────────────────────────────────
  describe("bulk-generate-images", () => {
    function setup(
      o: { cfg?: unknown; imagePrompt?: string; canon?: unknown[]; imageOk?: (n: number) => boolean; renderMs?: number; missingColumn?: boolean } = {},
    ) {
      const db = makeDb({
        image_gen_config: () => o.cfg ?? null,
        bhagavatam_image_deletes: () => [],
        ig_pending_review: (q) => {
          if (q.op !== "insert") return [];
          return o.missingColumn && "visual_check" in q.values ? { __error: MISSING_COLUMN } : { id: 41 };
        },
        scene_visual_canon: () => o.canon ?? CANON,
        scene_visual_research: () => null,
      });
      const net = makeNet({
        claude: (body) => (body.max_tokens === 1200 ? JSON.stringify({ imagePrompt: o.imagePrompt ?? GITA_SCENE, caption: "c", hashtags: "#h" }) : "{}"),
        imageOk: o.imageOk,
        renderMs: o.renderMs,
      });
      g.__sb = db;
      g.fetch = net.fn;
      return { db, net };
    }
    const inserts = (db: ReturnType<typeof makeDb>) => db.writes("ig_pending_review").filter((q) => q.op === "insert").map((q) => q.values);

    test("sample mode, pass on the first render: one Together call, record stored and returned", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue(["pass"]);
      // Act
      const { status, json } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(json.ok, true, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.ok(checkText(vision[0]).includes(HORSES), checkText(vision[0]));
      assert.equal(detailCount(vision[0].params), factsLogged("[bulk-generate-images] research key="));
      const [row] = inserts(db);
      assertRecord(row.visual_check, { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], reason: null, image_model: FLUX2, safe_fallback: false }, ["safe_fallback"]);
      assert.deepEqual(json.visualCheck, row.visual_check);
    });

    test("sample mode, fail then pass: the re-render keeps the prompt, sends FLUX a new seed, and the second image is stored", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status, json } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 2);
      assert.deepEqual(Object.keys(net.together[0]), BODY_KEYS, "attempt 0 sends no seed, as before");
      assert.deepEqual(Object.keys(net.together[1]), [...BODY_KEYS, "seed"]);
      assert.ok(Number.isInteger(net.together[1].seed));
      assert.equal(net.together[1].prompt, net.together[0].prompt);
      assert.ok(net.signals[1] instanceof AbortSignal, "a re-render's request can be aborted at its deadline");
      assert.equal(db.uploads[0].b64, jpeg(2));
      const [row] = inserts(db);
      assertRecord(row.visual_check, { status: "pass", attempts: 2, chosen_attempt: 1, reason: null }, ["safe_fallback"]);
      assert.deepEqual(json.visualCheck, row.visual_check);
    });

    test("sample mode deadline: a 100s render leaves no room before request start + 130s", async () => {
      // Arrange
      const { db, net } = setup({ renderMs: 100_000 });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assertRecord(inserts(db)[0].visual_check, { status: "fail", attempts: 1, reason: "deadline" }, ["safe_fallback"]);
    });

    test("sample mode check error (refusal): no second render, the image is stored", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue(["refusal"]);
      // Act
      const { status } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assertRecord(inserts(db)[0].visual_check, { status: "error", attempts: 1, reason: "refusal" }, ["safe_fallback"]);
    });

    test("bulk mode: the same 100s render gets its one re-render under the 360s run deadline, then stops at maxAttempts 2", async () => {
      // Arrange
      const { db, net } = setup({ renderMs: 100_000 });
      const vision = visionQueue(["fail"]);
      // Act
      const { status, json } = await call("bgi", { mode: "bulk", limit: 1 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 2);
      assert.equal(vision.length, 2);
      assertRecord(inserts(db)[0].visual_check, { status: "fail", attempts: 2, chosen_attempt: 0, reason: "max_attempts" }, ["safe_fallback"]);
    });

    test("bulk mode: every chapter of the run spends from one deadline, so a later chapter gets no re-render", async () => {
      // Arrange: one chapter at a time, 100s per render, every check fails
      const { db, net } = setup({ renderMs: 100_000 });
      const vision = visionQueue(["fail"]);
      // Act
      const { status } = await call("bgi", { mode: "bulk", limit: 2, concurrency: 1 });
      // Assert: chapter 1 renders at +100s and +200s; chapter 2 renders at +300s and 300+100+5 > 360
      assert.equal(status, 200);
      assert.equal(net.together.length, 3);
      assert.equal(vision.length, 3);
      const rows = inserts(db);
      assert.equal(rows.length, 2);
      assertRecord(rows[0].visual_check, { status: "fail", attempts: 2, reason: "max_attempts" }, ["safe_fallback"]);
      assertRecord(rows[1].visual_check, { status: "fail", attempts: 1, reason: "deadline" }, ["safe_fallback"]);
    });

    test("bulk mode check error: an API error costs no second render", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue([new APIError(500, "boom")]);
      // Act
      await call("bgi", { mode: "bulk", limit: 1 });
      // Assert
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assertRecord(inserts(db)[0].visual_check, { status: "error", attempts: 1, reason: "api_error_500" }, ["safe_fallback"]);
    });

    for (const c of [
      { name: "no config", fn: "bgi", base: "base-bgi", cfg: null },
      { name: "config", fn: "bgi-cfg", base: "base-bgi-cfg", cfg: FLUX_CFG },
    ]) {
      test(`no facts (${c.name}): one render, no check, and every Together request is identical to the pre-research baseline`, async () => {
        // Arrange: only the third request succeeds, so all three chain attempts are compared
        const base = setup({ cfg: c.cfg, imagePrompt: WAR_SCENE, canon: [], imageOk: (n) => n === 3 });
        visionQueue(["fail"]);
        const baseRes = await call(c.base, { mode: "sample" });
        const head = setup({ cfg: c.cfg, imagePrompt: WAR_SCENE, canon: [], imageOk: (n) => n === 3 });
        const vision = visionQueue(["fail"]);
        // Act
        const headRes = await call(c.fn, { mode: "sample" });
        // Assert
        assert.equal(baseRes.status, 200, JSON.stringify(baseRes.json));
        assert.equal(headRes.status, 200, JSON.stringify(headRes.json));
        assert.equal(base.net.together.length, 3);
        assert.deepEqual(head.net.together, base.net.together);
        assert.equal(vision.length, 0);
        // The image came from SAFE_FALLBACK, which is never checked.
        assertRecord(inserts(head.db)[0].visual_check, { status: "skipped", attempts: 1, reason: "safe_fallback", image_model: FLUX11, safe_fallback: true }, ["safe_fallback"]);
      });
    }

    test("a prompt with no room for any fact checks nothing: one render, reason no_facts", async () => {
      // Arrange: prompt_max_len 200 leaves the scene no room for a single fact
      const { db, net } = setup({ cfg: { ...FLUX_CFG, prompt_max_len: 200 } });
      const vision = visionQueue(["fail"]);
      // Act
      const { status, json } = await call("bgi-short", { mode: "sample" });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.ok(factsLogged("[bulk-generate-images] research key=") >= 1, "research found facts");
      assert.equal(net.together[0].prompt.includes("Canonical details"), false, "no fact reached the prompt");
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 0);
      assertRecord(inserts(db)[0].visual_check, { status: "skipped", attempts: 1, reason: "no_facts", safe_fallback: false }, ["safe_fallback"]);
    });

    test("facts left out of the prompt for room are not checked", async () => {
      // Arrange: two more canon facts push the facts block past its 450 chars
      const { net } = setup({ canon: [...CANON, ...EXTRA_CANON] });
      const vision = visionQueue(["pass"]);
      // Act
      const { status, json } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      const researched = factsLogged("[bulk-generate-images] research key=");
      const checked = checkedDetails(vision[0]);
      assert.ok(checked.length > 0 && checked.length < researched, `${checked.length} checked of ${researched}`);
      for (const d of checked) assert.ok(net.together[0].prompt.includes(d), `checked but not in the prompt: ${d}`);
      for (const e of EXTRA_CANON) assert.equal(checked.includes(e.prompt_text), false, e.prompt_text);
    });

    test("a missing visual_check column still saves the image, without the record", async () => {
      // Arrange
      const { db } = setup({ missingColumn: true });
      visionQueue(["pass"]);
      // Act
      const { status, json } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200);
      assert.equal(json.ok, true, JSON.stringify(json));
      assert.equal(json.pendingId, 41);
      const rows = inserts(db);
      assert.equal(rows.length, 2);
      assert.ok("visual_check" in rows[0]);
      const { visual_check: _dropped, ...withoutRecord } = rows[0];
      assert.deepEqual(rows[1], withoutRecord);
      assert.ok(logs.some((l) => l.startsWith("WARN [bulk-generate-images] insert with visual_check failed")), logs.join("\n"));
    });

    test("openai/gpt-image-2: the re-render sends no seed and no steps", async () => {
      // Arrange
      const { db, net } = setup({ cfg: GPT_CFG });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("bgi-gpt", { mode: "sample" });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 2);
      for (const body of net.together) assert.deepEqual(Object.keys(body), BODY_KEYS);
      assert.equal(vision.length, 2);
      assertRecord(inserts(db)[0].visual_check, { status: "pass", attempts: 2, chosen_attempt: 1, image_model: GPT }, ["safe_fallback"]);
    });
  });

  // ── regenerate-pending-image ───────────────────────────────────────────────
  describe("regenerate-pending-image", () => {
    const ROW = { id: 5, chapter_global_number: 293, chapter_title: "Chapter Two Ninety Three", image_path: "old.jpg", caption: "c" };

    function setup(
      o: { cfg?: unknown; canon?: unknown[]; imageOk?: (n: number) => boolean; renderMs?: number; missingColumn?: boolean; updateError?: { message: string } } = {},
    ) {
      const db = makeDb({
        ig_pending_review: (q) => {
          if (q.op === "select") return ROW;
          if (q.op === "update" && o.updateError) return { __error: o.updateError };
          if (q.op === "update" && o.missingColumn && "visual_check" in q.values) return { __error: MISSING_COLUMN };
          return null;
        },
        image_gen_config: () => o.cfg ?? null,
        scene_visual_canon: () => o.canon ?? CANON,
        scene_visual_research: () => null,
      });
      const net = makeNet({ claude: () => "{}", imageOk: o.imageOk, renderMs: o.renderMs });
      g.__sb = db;
      g.fetch = net.fn;
      return { db, net };
    }
    const updated = (db: ReturnType<typeof makeDb>) => db.writes("ig_pending_review").find((q) => q.op === "update")?.values;

    test("pass on the first render: record stored on the row and returned as visual_check", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue(["pass"]);
      // Act
      const { status, json } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.ok(checkText(vision[0]).includes(HORSES), checkText(vision[0]));
      const row = updated(db);
      assertRecord(row.visual_check, { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], reason: null, image_model: FLUX2 });
      assert.deepEqual(json.visual_check, row.visual_check);
      assert.equal(json.image_url, `https://storage.test/${row.image_path}`);
    });

    test("fail then pass: the second image replaces the row's image and the re-render sends FLUX a new seed", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status, json } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 2);
      assert.deepEqual(Object.keys(net.together[0]), BODY_KEYS);
      assert.deepEqual(Object.keys(net.together[1]), [...BODY_KEYS, "seed"]);
      assert.equal(net.together[1].prompt, net.together[0].prompt);
      assert.equal(net.signals[0], undefined);
      assert.ok(net.signals[1] instanceof AbortSignal, "a re-render's request can be aborted at its deadline");
      assert.equal(db.uploads.length, 1);
      assert.equal(db.uploads[0].b64, jpeg(2));
      const row = updated(db);
      assert.equal(row.image_path, db.uploads[0].path);
      assertRecord(row.visual_check, { status: "pass", attempts: 2, chosen_attempt: 1 });
      assert.deepEqual(json.visual_check, row.visual_check);
    });

    test("deadline: a 115s render leaves no time for a check, so it is skipped with reason deadline", async () => {
      // Arrange
      const { db, net } = setup({ renderMs: 115_000 });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 0);
      assertRecord(updated(db).visual_check, { status: "skipped", attempts: 1, reason: "deadline" });
    });

    test("check error: a reply without the tool call costs no second render", async () => {
      // Arrange
      const { db, net } = setup();
      const vision = visionQueue(["no_tool"]);
      // Act
      const { status } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assertRecord(updated(db).visual_check, { status: "error", attempts: 1, reason: "no_tool" });
    });

    test("apply_facts false: no facts, one render, no check, and the request is exactly the pre-check payload", async () => {
      // Arrange
      const cfg = { steps: 28, style_positives: "warm golden oil painting", style_negatives: "NOT cartoon", extra_rules: "Vedic era only.", is_active: true };
      const { db, net } = setup({ cfg });
      const vision = visionQueue(["fail"]);
      // Act
      const { status, json } = await call("regen", { id: 5, prompt: ARJUNA_SCENE, apply_facts: false });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(vision.length, 0);
      assert.equal(net.together.length, 1);
      assert.deepEqual(Object.keys(net.together[0]), [...BODY_KEYS, "steps"]);
      assert.deepEqual(net.together[0], {
        model: FLUX2,
        prompt: sanitizeForImageModel(`${ARJUNA_SCENE}, warm golden oil painting, NOT cartoon. Vedic era only.`),
        width: 1088,
        height: 1344,
        n: 1,
        response_format: "b64_json",
        steps: 28,
      });
      assertRecord(updated(db).visual_check, { status: "skipped", attempts: 1, reason: "no_facts" });
    });

    test("research facts that did not fit in the prompt are not checked", async () => {
      // Arrange: the reviewer's text alone fills the 2000-char limit, so no fact is added
      const { db, net } = setup();
      const vision = visionQueue(["fail"]);
      const long = Array.from({ length: 14 }, () => ARJUNA_SCENE).join(". ");
      // Act
      const { status, json } = await call("regen", { id: 5, prompt: long });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.ok(logs.some((l) => / facts=[1-9]\d* used=0 /.test(l)), logs.join("\n"));
      assert.equal(json.facts_included, 0);
      assert.equal(vision.length, 0);
      assert.equal(net.together.length, 1);
      assertRecord(updated(db).visual_check, { status: "skipped", attempts: 1, reason: "no_facts" });
    });

    test("a fact already written into the draft is checked, and sent once", async () => {
      // Arrange: a draft that already carries the canon horse fact
      const { net } = setup();
      const vision = visionQueue(["pass"]);
      const horsesFact = CANON[0].prompt_text;
      // Act
      const { status } = await call("regen", { id: 5, prompt: `${ARJUNA_SCENE}. Canonical details: ${horsesFact}.` });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together[0].prompt.split(HORSES).length - 1, 1, "the fact is sent once");
      assert.ok(checkedDetails(vision[0]).includes(horsesFact), checkText(vision[0]));
      for (const d of checkedDetails(vision[0])) assert.ok(net.together[0].prompt.includes(d), `checked but not in the prompt: ${d}`);
    });

    test("a missing visual_check column still saves the new image, and the old image is removed only once the row points at it", async () => {
      // Arrange
      const { db } = setup({ missingColumn: true });
      visionQueue(["pass"]);
      // Act
      const { status, json } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      const updates = db.writes("ig_pending_review").filter((q) => q.op === "update").map((q) => q.values);
      assert.equal(updates.length, 2);
      assert.ok("visual_check" in updates[0]);
      const { visual_check: _dropped, ...withoutRecord } = updates[0];
      assert.deepEqual(updates[1], withoutRecord);
      assert.ok(logs.some((l) => l.startsWith("WARN [regen] update with visual_check failed")), logs.join("\n"));
      assert.ok(db.events.indexOf("remove") > db.events.lastIndexOf("update:ig_pending_review"), db.events.join(","));
    });

    test("negative: an update that fails keeps the old image in storage", async () => {
      // Arrange
      const { db } = setup({ updateError: { message: "connection reset" } });
      visionQueue(["pass"]);
      // Act
      const { status, json } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 500);
      assert.match(json.error, /Update failed: connection reset/);
      assert.equal(db.events.includes("remove"), false, db.events.join(","));
    });

    test("openai/gpt-image-2 with steps configured: neither render sends steps or seed", async () => {
      // Arrange
      const { db, net } = setup({ cfg: GPT_CFG });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 2);
      for (const body of net.together) assert.deepEqual(Object.keys(body), BODY_KEYS);
      assert.equal(vision.length, 2);
      assertRecord(updated(db).visual_check, { status: "pass", attempts: 2, image_model: GPT });
    });

    test("negative: every render failing returns 502 with no check and no row update", async () => {
      // Arrange
      const { db, net } = setup({ imageOk: () => false });
      const vision = visionQueue(["pass"]);
      // Act
      const { status, json } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 502);
      assert.match(json.error, /All image attempts failed/);
      assert.equal(net.together.length, 2);
      assert.equal(vision.length, 0);
      assert.equal(updated(db), undefined);
    });
  });
});
