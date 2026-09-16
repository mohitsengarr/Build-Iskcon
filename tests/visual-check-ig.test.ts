// Visual check wiring in the three writers of ig_pending_review: instagram-post,
// bulk-generate-images (sample and bulk modes) and regenerate-pending-image.
//
// Supabase cuts a request at 150s, so a request stores its image with an initial
// visual_check record and the check runs after the response, in
// EdgeRuntime.waitUntil:
// - instagram-post is unattended: a clearly wrong image is re-rendered in the
//   background, and a better render replaces the stored one by a compare-and-swap
//   that needs the post still pending with the stored image;
// - regenerate-pending-image and bulk-generate-images sample mode are the
//   gallery's requests: a wrong image is only flagged on its row;
// - bulk-generate-images bulk mode already runs in waitUntil and checks before
//   its insert.
// Every render follows the active image_gen_config row (the config fidelity tests).
//
// Each index.ts is imported under node with its Deno-only specifiers stubbed
// (helpers/edge-function-hooks.mjs and helpers/npm-stub-hooks.mjs). The database
// (whose review row honours .eq, .is and .lt filters on updates), storage, fetch (Together,
// the raw Claude API, buildiskcon.com), the Anthropic SDK (the vision check),
// EdgeRuntime.waitUntil and Date.now are fakes. The real _shared/sceneResearch.ts
// and _shared/visualCheck.ts run. No network, no real keys, no paid calls.
//
// Every module is loaded with its own query string, so its copies never mix with
// the ones scene-research-wiring.test.ts loads. Globals are installed in before()
// and restored in after().
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
// The same module instance the functions import: the tests set when the worker started.
// deno-lint-ignore no-explicit-any
const visualCheckIo: any = await import("../supabase/functions/_shared/visualCheck.ts");
// The same module instance the functions import: the tests replace the retry wait,
// so a rate-limited chain costs nothing and the waits it asked for are asserted.
// deno-lint-ignore no-explicit-any
const togetherRetry: any = await import("../supabase/functions/_shared/togetherRetry.ts");

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
// deno-lint-ignore no-explicit-any
type Json = any;

const FUNCTIONS = new URL("../supabase/functions/", import.meta.url);
// bulk-generate-images/index.ts as it was before research was added, copied verbatim.
const BASELINE_BGI = new URL("./fixtures/baseline/bulk-generate-images.index.ts", import.meta.url).href;
const CANON = seededCanon();
const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
/** What Together answered on 2026-09-16 when a Regenerate landed during a bulk run. */
const RATE_LIMIT_BODY = "HTTP 429: Too many requests in a short window. Our rate limits are dynamic.";
const RATE_LIMITED_MESSAGE =
  "Image generation is rate limited right now (Together HTTP 429): too many renders at once. Wait a minute and try again.";
const FLUX2 = "black-forest-labs/FLUX.2-pro";
const FLUX11 = "black-forest-labs/FLUX.1.1-pro";
const GPT = "openai/gpt-image-2";
const HORSES = "exactly four white horses";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const RECORD_KEYS = ["attempts", "checked_at", "chosen_attempt", "failed", "image_model", "reason", "status", "unclear"];
// Keys on top of RECORD_KEYS: a record from the store-then-check flow carries
// started_at; instagram-post and bulk-generate-images add safe_fallback; bulk
// mode's records come from the in-run check loop, which has no started_at.
const IG_KEYS = ["safe_fallback", "started_at"];
const BULK_KEYS = ["safe_fallback"];
const REGEN_KEYS = ["started_at"];
const BODY_KEYS = ["model", "prompt", "width", "height", "n", "response_format"];
const MISSING_COLUMN = { code: "PGRST204", message: "Could not find the 'visual_check' column of 'ig_pending_review' in the schema cache" };
const FETCH_FAILED = { message: "TypeError: fetch failed" };
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
  ["ig-cfg", new URL("instagram-post/index.ts?visual-check-cfg", FUNCTIONS).href],
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
  /** [column, value] for every .eq() filter, in order. */
  eq: Array<[string, unknown]>;
  /** [column, value] for every .is() filter, in order. */
  is: Array<[string, unknown]>;
  /** [column, value] for every .lt() filter, in order. */
  lt: Array<[string, unknown]>;
  /** Every filter method called ("eq", "is", "or" ...), in order. */
  methods: string[];
  /** The columns given to .select(), or null when it was not called. */
  selected: string | null;
  values?: Json;
}
type TableFn = (q: Query) => unknown;

/**
 * A table function answers each query. It may return { __error } (the query
 * fails) or { __count } (a head count query).
 */
function makeDb(tables: Record<string, TableFn>) {
  const queries: Query[] = [];
  const uploads: Array<{ path: string; b64: string; upsert: unknown }> = [];
  const removed: string[] = [];
  /** "<op>:<table>" per query, "upload:<path>" and "remove:<paths>" per storage call, in order. */
  const events: string[] = [];
  return {
    queries,
    uploads,
    removed,
    events,
    writes: (table: string) => queries.filter((q) => q.table === table && q.op !== "select"),
    from(table: string) {
      const q: Query = { table, op: "select", single: false, eq: [], is: [], lt: [], methods: [], selected: null };
      const filter = (name: string) => (column?: string, value?: unknown) => {
        q.methods.push(name);
        if (name === "eq") q.eq.push([String(column), value]);
        if (name === "is") q.is.push([String(column), value]);
        if (name === "lt") q.lt.push([String(column), value]);
        return b;
      };
      const b: Json = {
        select: (columns?: string) => {
          q.selected = columns ?? "*";
          return b;
        },
        eq: filter("eq"),
        neq: filter("neq"),
        in: filter("in"),
        is: filter("is"),
        lt: filter("lt"),
        or: filter("or"),
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
          const special = out !== null && typeof out === "object" && !Array.isArray(out);
          const error = special && "__error" in out ? out.__error : null;
          const counted = special && "__count" in out;
          return Promise.resolve({ data: error || counted ? null : out, error, count: counted ? out.__count : 0 }).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array, opts?: { upsert?: unknown }) => {
          uploads.push({ path, b64: Buffer.from(bytes).toString("base64"), upsert: opts?.upsert });
          events.push(`upload:${path}`);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
        list: async () => ({ data: [], error: null }),
        remove: async (paths: string[]) => {
          removed.push(...paths);
          events.push(`remove:${paths.join(",")}`);
          return { data: [], error: null };
        },
      }),
    },
  };
}

/**
 * An update applied to `row` the way PostgREST applies it: only when every .eq
 * filter matches, every .is(column, null) column holds no value and every .lt
 * column holds a value below the filter's (ISO timestamps, compared as strings).
 * With .select() it returns the rows it changed.
 */
function updateRow(row: Json, q: Query): Json {
  const matches =
    q.eq.every(([column, value]) => row[column] === value) &&
    q.is.every(([column, value]) => (row[column] ?? null) === value) &&
    q.lt.every(([column, value]) => row[column] != null && String(row[column]) < String(value));
  if (matches) Object.assign(row, q.values);
  if (q.selected === null) return null;
  return matches ? [{ id: row.id }] : [];
}

const updates = (db: ReturnType<typeof makeDb>) => db.writes("ig_pending_review").filter((q) => q.op === "update");

const CHAPTER_INDEX = [
  { globalNumber: 10, number: 10, skandh: 1, title: "Chapter Ten", batchNumber: 1, pageNumber: 1 },
  { globalNumber: 293, number: 1, skandh: 11, title: "Chapter Two Ninety Three", batchNumber: 30, pageNumber: 1 },
];

/**
 * Together returns jpeg(n) for call n (or, when imageOk says no, a 400 that is not
 * re-posted); status(n) answers call n with that HTTP status and body(n) instead,
 * which is how the 429 retry is tested. Each call moves the clock on by renderMs.
 * onTogether(n) runs while call n is in flight.
 */
function makeNet(o: { claude: (body: Json) => string; imageOk?: (n: number) => boolean; renderMs?: number; onTogether?: (n: number) => void; status?: (n: number) => number | null; body?: (n: number) => string }) {
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
      o.onTogether?.(n);
      const ok = o.imageOk ? o.imageOk(n) : true;
      const status = o.status?.(n) ?? null;
      if (status) return new Response(o.body?.(n) ?? "busy", { status });
      // The default failure is not re-posted: 429 and every 5xx now get another
      // post (_shared/togetherRetry.ts), and these tests count one post per attempt.
      return ok ? json({ data: [{ b64_json: jpeg(n) }] }) : new Response("bad request", { status: 400 });
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
 * contradicts detail 1, "fail2" details 1 and 2. opts.before(n) runs (and is
 * awaited) before call n (1-based) is answered. Any other SDK call is an error.
 */
function visionQueue(replies: Reply[], opts: { before?: (n: number) => unknown } = {}) {
  const calls: Json[] = [];
  g.__anthropicCreate = async (params: Json, reqOpts: Json) => {
    if (params?.tools?.[0]?.name !== "record_visual_check") throw new Error(`unexpected SDK call ${params?.tools?.[0]?.name}`);
    calls.push({ params, reqOpts });
    const n = calls.length;
    if (opts.before) await opts.before(n);
    const r = replies[Math.min(n - 1, replies.length - 1)];
    if (r instanceof Error) throw r;
    if (r === "refusal") return { stop_reason: "refusal", content: [] };
    if (r === "no_tool") return { stop_reason: "end_turn", content: [{ type: "text", text: "cannot tell" }] };
    const count = detailCount(params);
    const wrong = r === "fail" ? 1 : r === "fail2" ? 2 : 0;
    const checks = Array.from({ length: count }, (_, i) => ({
      fact_index: i + 1,
      verdict: i < wrong ? "no" : "yes",
      observed: i < wrong ? `wrong detail ${i + 1}` : "shown",
    }));
    return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "record_visual_check", input: { checks } }] };
  };
  return calls;
}

/** A promise the test resolves when it chooses. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** Whether `p` has settled once the callbacks already queued have run. */
async function isSettled(p: Promise<unknown>): Promise<boolean> {
  let settled = false;
  p.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  return settled;
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
  if (rec.status === "running") assert.equal(rec.checked_at, null, "a running record has not been checked");
  else assert.match(rec.checked_at, ISO);
  if ("started_at" in rec) assert.match(rec.started_at, ISO);
}

// ── Shared scenes and configs ────────────────────────────────────────────────

const ARJUNA_SCENE =
  "Wide shot of Arjuna, a MALE warrior prince, standing on his chariot beside Krishna, a youthful MALE with blue skin, on the plain of Kurukshetra";
const DHRUVA_SCENE = "Wide shot of Dhruva, a young MALE prince, meditating alone in the forest of Madhuvana under golden light";
const INLINE_SCENE = "Wide shot of Vyasadeva, an elderly MALE sage, dictating in a Himalayan hermitage at first light";
/** What Claude answers when instagram-post has to write the post itself, with no usable stored scene. */
const INLINE_POST = { imagePrompt: INLINE_SCENE, caption: "A caption", hashtags: "#SrimadBhagavatam" };
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

  // Each request counts its background deadline from its own start, as on a fresh
  // worker; a test of an older worker sets the worker start itself.
  let workerStartBefore: unknown = null;
  /** Every wait a rate-limited chain asked for, in order; none of them is spent. */
  let sleeps: number[] = [];
  let sleepBefore: unknown = null;
  before(() => {
    workerStartBefore = visualCheckIo.setWorkerStartedAt(null);
    sleepBefore = togetherRetry.setSleepForTests(async (ms: number) => {
      sleeps.push(ms);
    });
  });

  after(() => {
    visualCheckIo.setWorkerStartedAt(workerStartBefore);
    togetherRetry.setSleepForTests(sleepBefore);
    for (const k of SAVED_GLOBALS) g[k] = saved[k];
  });

  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    Object.assign(ENV, BASE_ENV);
    waits = [];
    sleeps = [];
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

  /** Waits for every task handed to EdgeRuntime.waitUntil, including any registered meanwhile. */
  async function drain(): Promise<void> {
    while (waits.length > 0) await Promise.all(waits.splice(0));
  }

  /**
   * Calls a handler and returns once its response body is read. registered is
   * how many tasks it had handed to EdgeRuntime.waitUntil when it returned the
   * Response; background settles when they are done.
   */
  async function start(fn: string, body: unknown): Promise<{ status: number; json: Json; registered: number; background: Promise<void> }> {
    const res = await handlers[fn](
      new Request("http://functions.test/", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    );
    const registered = waits.length;
    const json = await res.json();
    return { status: res.status, json, registered, background: drain() };
  }

  /** start(), then waits for the background work too. */
  async function call(fn: string, body: unknown) {
    const r = await start(fn, body);
    await r.background;
    return r;
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
      o: {
        cfg?: unknown;
        cfgError?: unknown;
        scene?: string;
        canon?: unknown[];
        imageOk?: (n: number) => boolean;
        /** Answers Together call n with this HTTP status (and body): how the 429 retry is tested. */
        status?: (n: number) => number | null;
        body?: (n: number) => string;
        renderMs?: number;
        missingColumn?: boolean;
        verse?: string;
        rejected?: number;
        /** The whole scene list, when a rotation test needs more than one. */
        scenes?: unknown[];
        usedScenes?: number[];
        /** Scenes the editor turned down with "Reject scene" (bd355c17). */
        rejectedScenes?: number[];
        /** How the swap's update fails: lost (applied, response lost), error (not applied), unreadable (not applied, row unreadable). */
        swapResult?: "lost" | "error" | "unreadable";
        /** The redo's stillCurrent read of the post fails. */
        stillCurrentError?: boolean;
      } = {},
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
      /** The review row as the database holds it. */
      const row: Json = {};
      const db = makeDb({
        image_gen_config: () => (o.cfgError ? { __error: o.cfgError } : (o.cfg ?? null)),
        bhagwatham_personas: () => [],
        // Since bd355c17 the scene store is read twice: the scenes and the
        // rotation state, then rejected_scene_indexes on its own (so a database
        // without that column still loads its scenes).
        bhagavatam_chapter_scenes: (q) => {
          if (q.op !== "select") return null;
          if (q.selected?.includes("rejected_scene_indexes")) return { rejected_scene_indexes: o.rejectedScenes ?? [] };
          return { scenes: o.scenes ?? [scene], used_scene_indexes: o.usedScenes ?? [] };
        },
        bhaktigram_mahajan_aliases: () => [],
        ig_cron_state: () => ({ total_posted: 1, next_chapter: 293 }),
        ig_pending_review: (q) => {
          if (q.op === "insert") {
            if (o.missingColumn && "visual_check" in q.values) return { __error: MISSING_COLUMN };
            Object.assign(row, q.values, { id: 77 });
            return { id: 77 };
          }
          if (q.op === "update") {
            const isSwap = q.eq.some(([column]) => column === "status");
            if (isSwap && o.swapResult === "lost") {
              updateRow(row, q);
              return { __error: FETCH_FAILED };
            }
            if (isSwap && o.swapResult) return { __error: FETCH_FAILED };
            return updateRow(row, q);
          }
          if (q.selected === "image_path") {
            return o.swapResult === "unreadable" ? { __error: FETCH_FAILED } : { image_path: row.image_path ?? null };
          }
          if (q.selected === "id" && q.eq.some(([column]) => column === "id")) {
            // The redo's stillCurrent: the post when it still matches every filter.
            if (o.stillCurrentError) return { __error: FETCH_FAILED };
            return q.eq.every(([column, value]) => row[column] === value) && q.is.every(([column, value]) => (row[column] ?? null) === value) ? [{ id: row.id }] : [];
          }
          // The soft safety floor's count of rejected posts.
          return { __count: o.rejected ?? 0 };
        },
        scene_visual_canon: () => o.canon ?? CANON,
        scene_visual_research: () => null,
      });
      const net = makeNet({
        // max_tokens tells the calls apart: 600 is the verse, 300 the character
        // names and 1200 the inline scene — the last two only when no stored scene
        // could be used.
        claude: (body) => {
          if (body.max_tokens === 600) return o.verse ?? '{"sanskrit":null,"hindi":null}';
          if (body.max_tokens === 300) return '["Arjuna"]';
          if (body.max_tokens === 1200) return JSON.stringify(INLINE_POST);
          return "caption text";
        },
        imageOk: o.imageOk,
        status: o.status,
        body: o.body,
        renderMs: o.renderMs,
      });
      g.__sb = db;
      g.fetch = net.fn;
      return { db, net, row };
    }
    const inserted = (db: ReturnType<typeof makeDb>) => db.writes("ig_pending_review").find((q) => q.op === "insert")?.values;
    const researchFacts = () => factsLogged("[instagram-post] research key=");
    /** Every field except the image and its record. */
    const otherFields = (values: Json) => Object.fromEntries(Object.entries(values).filter(([k]) => !["image_url", "image_path", "visual_check"].includes(k)));

    test("responds before the background check: the post is stored with a running record, which the check replaces later", async () => {
      // Arrange: the vision check waits until the test lets it answer
      const { db, net, row } = setup();
      const hold = gate();
      const vision = visionQueue(["pass"], { before: () => hold.opened });
      // Act
      const res = await start("ig", { chapter_global_number: 293 });
      // Assert: the response came while the check was still pending
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.registered, 1, "the check was handed to EdgeRuntime.waitUntil before the response");
      assert.equal(await isSettled(res.background), false, "the check is still running");
      assert.equal(net.together.length, 1);
      assertRecord(
        res.json.visualCheck,
        { status: "running", attempts: 1, chosen_attempt: 0, failed: [], unclear: 0, reason: null, image_model: FLUX2, safe_fallback: false },
        IG_KEYS,
      );
      assert.deepEqual(row.visual_check, res.json.visualCheck);
      assert.equal(updates(db).length, 0);
      // Act: let the check answer
      hold.open();
      await res.background;
      // Assert
      assert.equal(vision.length, 1);
      assertRecord(row.visual_check, { status: "pass", attempts: 1, chosen_attempt: 0, reason: null, image_model: FLUX2, safe_fallback: false }, IG_KEYS);
      assert.equal(row.visual_check.started_at, res.json.visualCheck.started_at);
    });

    test("a triggerRegenerate-style caller gets success and pendingReviewId while the redo is still running", async () => {
      // Arrange: the first check fails, so the redo re-renders after the response
      const { net } = setup();
      const hold = gate();
      visionQueue(["fail", "pass"], { before: () => hold.opened });
      // Act: read the body the way approve-instagram-post's triggerRegenerate does
      const res = await start("ig", { chapter_global_number: 293 });
      const { success, pendingReviewId, skipped, error } = res.json;
      // Assert
      assert.equal(res.status, 200);
      assert.deepEqual({ success, pendingReviewId, skipped, error }, { success: true, pendingReviewId: 77, skipped: undefined, error: undefined });
      assert.equal(net.together.length, 1, "nothing is re-rendered before the response");
      hold.open();
      await res.background;
      assert.equal(net.together.length, 2, "the re-render ran after the response");
    });

    // ── Scene rotation never picks a rejected scene (bd355c17) ──────────────
    // instagram-post shares the Bhagavatam rotation with bulk-generate-chapter-art,
    // so a scene the editor turned down on a chapter cover is skipped here too.
    // It used to come back: rotation cycled to the top-ranked scene once every
    // scene had been used.

    describe("rejected scenes", () => {
      const scenesOf = (...prompts: string[]) =>
        prompts.map((image_prompt, i) => ({
          title: `Scene ${i}`,
          summary: "A summary",
          characters: ["Arjuna"],
          setting: "Kurukshetra",
          mood: "grave",
          image_prompt,
          rank: i + 1,
        }));
      const sceneLine = () => logs.find((l) => l.startsWith("Using pre-extracted scene #")) ?? "";

      test("a rejected scene is never picked: the post uses the next scene", async () => {
        // Arrange: scene #0 was rejected, nothing has been used yet
        const { net } = setup({ scenes: scenesOf(ARJUNA_SCENE, DHRUVA_SCENE), rejectedScenes: [0] });
        visionQueue(["pass"]);
        // Act
        const res = await call("ig", { chapter_global_number: 293 });
        // Assert
        assert.equal(res.status, 200, JSON.stringify(res.json));
        assert.match(sceneLine(), /^Using pre-extracted scene #1 \(rank 2\): "Scene 1"$/);
        assert.ok(net.together[0].prompt.startsWith(DHRUVA_SCENE), net.together[0].prompt.slice(0, 160));
        assert.equal(res.json.usedScene.index, 1);
        assert.equal(res.json.sceneSource, "pre-extracted");
      });

      test("a rejected scene is not picked even when every scene has been used and the cycle resets", async () => {
        // Arrange: both scenes used, so rotation resets — and scene #0 was rejected
        const { net } = setup({ scenes: scenesOf(ARJUNA_SCENE, DHRUVA_SCENE), usedScenes: [0, 1], rejectedScenes: [0] });
        visionQueue(["pass"]);
        // Act
        const res = await call("ig", { chapter_global_number: 293 });
        // Assert
        assert.match(sceneLine(), /^Using pre-extracted scene #1 \(rank 2\): "Scene 1" \[cycle reset\]$/);
        assert.ok(net.together[0].prompt.startsWith(DHRUVA_SCENE), net.together[0].prompt.slice(0, 160));
        assert.deepEqual(res.json.usedScene, { index: 1, title: "Scene 1", cycleReset: true });
      });

      test("the cycle still resets to the top-ranked scene when none was rejected", async () => {
        // Arrange: the same exhausted rotation, with nothing rejected
        const { net } = setup({ scenes: scenesOf(ARJUNA_SCENE, DHRUVA_SCENE), usedScenes: [0, 1], rejectedScenes: [] });
        visionQueue(["pass"]);
        // Act
        const res = await call("ig", { chapter_global_number: 293 });
        // Assert
        assert.match(sceneLine(), /^Using pre-extracted scene #0 \(rank 1\): "Scene 0" \[cycle reset\]$/);
        assert.ok(net.together[0].prompt.startsWith(ARJUNA_SCENE), net.together[0].prompt.slice(0, 160));
        assert.equal(res.json.usedScene.index, 0);
      });

      test("every scene rejected: the post falls back to an inline scene, and sceneSource says so", async () => {
        // Arrange
        const { net } = setup({ scenes: scenesOf(ARJUNA_SCENE, DHRUVA_SCENE), rejectedScenes: [0, 1] });
        visionQueue(["pass"]);
        // Act
        const res = await call("ig", { chapter_global_number: 293 });
        // Assert
        assert.equal(res.status, 200, JSON.stringify(res.json));
        assert.equal(sceneLine(), "", "no stored scene was used");
        assert.ok(logs.includes("Every extracted scene was rejected — falling back to inline Claude generation"), logs.join("\n"));
        assert.equal(res.json.usedScene, null);
        // Before bd355c17 this said "pre-extracted" whenever a scene row existed,
        // even on the inline path.
        assert.equal(res.json.sceneSource, "inline-claude");
        assert.equal(net.together[0].prompt.startsWith(ARJUNA_SCENE), false, "no rejected scene is drawn");
      });
    });

    test("the soft safety floor still answers success false and skipped true, with no render and no background work", async () => {
      // Arrange: 50 rejected posts for the chapter
      const { db, net } = setup({ rejected: 50 });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.success, false);
      assert.equal(res.json.skipped, true);
      assert.equal(res.registered, 0);
      assert.equal(net.together.length, 0);
      assert.equal(vision.length, 0);
      assert.equal(db.writes("ig_pending_review").length, 0);
    });

    test("pass: one render, one check against the research facts after the response, the record written by a compare-and-swap on the stored file", async () => {
      // Arrange
      const { db, net, row } = setup();
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
      assert.equal(db.uploads.length, 1);
      assert.equal(updates(db).length, 1);
      const [write] = updates(db);
      assert.deepEqual(Object.keys(write.values), ["visual_check"]);
      assert.deepEqual(write.eq, [["id", 77], ["image_path", db.uploads[0].path]]);
      assert.equal(write.selected, "id");
      assert.equal(db.queries.some((q) => q.methods.includes("or")), false, "no .or() filter on any query");
      assertRecord(row.visual_check, { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], reason: null, image_model: FLUX2, safe_fallback: false }, IG_KEYS);
      assert.equal(json.visualCheck.status, "running");
      assert.deepEqual(db.removed, []);
    });

    test("fail then pass: the re-render (same prompt, next seed) replaces the stored image by a compare-and-swap, and the replaced file is kept", async () => {
      // Arrange: a fixed clock, so both uploads happen in the same millisecond
      clock.fixed = realNow.call(Date);
      const { db, net, row } = setup();
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status, json } = await call("ig", { chapter_global_number: 293 });
      // Assert: the re-render
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 2);
      assert.equal(net.together[1].prompt, net.together[0].prompt);
      assert.equal(net.together[1].model, FLUX2);
      assert.equal(net.together[1].seed, net.together[0].seed + 1);
      assert.equal(net.signals[0], undefined);
      assert.ok(net.signals[1] instanceof AbortSignal, "a re-render's request can be aborted at its deadline");
      assert.deepEqual(vision.map(imageSent), [jpeg(1), jpeg(2)]);
      // Assert: a new file beside the stored one, never an overwrite
      assert.equal(db.uploads.length, 2);
      const [firstFile, secondFile] = db.uploads.map((u) => u.path);
      assert.match(secondFile, /^ig-canto11-ch1-\d+-r1\.jpg$/);
      assert.notEqual(secondFile, firstFile);
      assert.equal(db.uploads[1].b64, jpeg(2));
      assert.equal(db.uploads[1].upsert, false);
      // Assert: the swap, then the final record; the replaced file stays in storage
      assert.equal(updates(db).length, 2);
      const [swap, final] = updates(db);
      assert.deepEqual(Object.keys(swap.values).sort(), ["image_path", "image_url", "visual_check"]);
      assert.deepEqual(swap.eq, [["id", 77], ["status", "pending"], ["image_path", firstFile]]);
      assert.equal(swap.selected, "id");
      assertRecord(swap.values.visual_check, { status: "pass", attempts: 2, chosen_attempt: 1, reason: null }, IG_KEYS);
      assert.deepEqual(db.removed, [], "an approval that read the post before the swap may still be publishing the replaced file");
      assert.ok(logs.some((l) => l === `[instagram-post] #77 re-render 1 replaced ${firstFile} with ${secondFile}; ${firstFile} is kept in storage`), logs.join("\n"));
      assert.deepEqual(final.eq, [["id", 77], ["image_path", secondFile]]);
      assert.equal(row.image_path, secondFile);
      assert.equal(row.image_url, `https://storage.test/${secondFile}`);
      assertRecord(row.visual_check, { status: "pass", attempts: 2, chosen_attempt: 1, failed: [], reason: null, image_model: FLUX2, safe_fallback: false }, IG_KEYS);
      // Assert: every other field stays as inserted; the response described the first image
      assert.deepEqual(otherFields(row), { ...otherFields(inserted(db)), id: 77 });
      assert.equal(json.imageUrl, `https://storage.test/${firstFile}`);
      assert.equal(json.visualCheck.status, "running");
    });

    test("boundary: three failing renders stop at maxAttempts 3, and the post keeps the fewest-failed image", async () => {
      // Arrange: 2 facts wrong, then 1 (swapped in), then 2 again (not better)
      const { db, net, row } = setup();
      const vision = visionQueue(["fail2", "fail", "fail2"]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 3);
      assert.equal(vision.length, 3);
      assert.deepEqual(db.uploads.map((u) => u.b64), [jpeg(1), jpeg(2)], "only the better render is stored");
      assert.equal(row.image_path, db.uploads[1].path);
      assert.deepEqual(db.removed, [], "the replaced file is kept");
      assertRecord(row.visual_check, { status: "fail", attempts: 3, chosen_attempt: 1, reason: "max_attempts" }, IG_KEYS);
      assert.equal(row.visual_check.failed.length, 1);
      assert.equal(row.visual_check.failed[0].observed, "wrong detail 1");
    });

    test("seeds vary per redo attempt: re-renders 1 and 2 send FLUX the stored image's seed + 1 and + 2", async () => {
      // Arrange: every check finds the same one fact wrong, so no re-render is better
      const { db, net, row } = setup();
      visionQueue(["fail"]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 3);
      const [s0, s1, s2] = net.together.map((b) => b.seed);
      assert.ok(Number.isInteger(s0), String(s0));
      assert.deepEqual([s1, s2], [s0 + 1, s0 + 2]);
      for (const b of net.together) assert.equal(b.prompt, net.together[0].prompt);
      assert.equal(db.uploads.length, 1, "a render that is not better is never stored");
      assert.deepEqual(db.removed, []);
      assert.deepEqual(updates(db).map((q) => q.eq), [[["id", 77], ["image_path", db.uploads[0].path]]]);
      assertRecord(row.visual_check, { status: "fail", attempts: 3, chosen_attempt: 0, reason: "max_attempts", image_model: FLUX2 }, IG_KEYS);
    });

    for (const decision of ["approved", "rejected"]) {
      test(`the post is ${decision} during the redo: the compare-and-swap matches no row, the re-render's own file is deleted, nothing more renders`, async () => {
        // Arrange: the reviewer decides while re-render 1 is being checked
        const { db, net, row } = setup();
        const vision = visionQueue(["fail", "pass", "pass"], {
          before: (n) => {
            if (n === 2) row.status = decision;
          },
        });
        // Act
        const { status } = await call("ig", { chapter_global_number: 293 });
        // Assert
        assert.equal(status, 200);
        assert.equal(net.together.length, 2, "no render after the refused swap");
        assert.equal(vision.length, 2);
        assert.equal(db.uploads.length, 2);
        const [firstFile, ownFile] = db.uploads.map((u) => u.path);
        assert.deepEqual(updates(db)[0].eq, [["id", 77], ["status", "pending"], ["image_path", firstFile]]);
        assert.deepEqual(db.removed, [ownFile], "only the re-render's own upload is deleted");
        assert.equal(row.status, decision);
        assert.equal(row.image_path, firstFile);
        assert.equal(row.image_url, `https://storage.test/${firstFile}`);
        assertRecord(row.visual_check, { status: "fail", attempts: 2, chosen_attempt: 0, reason: "swap_failed", image_model: FLUX2, safe_fallback: false }, IG_KEYS);
      });
    }

    test("an approval publishing the stored image while the redo swaps in a better one still finds its file: the replaced file is never deleted", async () => {
      // Arrange: approve-instagram-post reads the post before re-render 1 is checked, and publishes that image_url after the swap
      const { db, row } = setup();
      let publishing = "";
      visionQueue(["fail", "pass"], {
        before: (n) => {
          if (n === 2) publishing = row.image_path;
        },
      });
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(publishing, db.uploads[0].path);
      assert.equal(row.image_path, db.uploads[1].path, "the swap landed while the approval was publishing");
      assert.equal(db.removed.includes(publishing), false, "Meta can still download the file the approval read, and the channel message keeps its image");
      assert.deepEqual(db.removed, []);
    });

    test("a post approved before its first check answers costs no re-render and no further check: stillCurrent finds it no longer pending", async () => {
      // Arrange: every check would fail the same fact
      const { db, net, row } = setup();
      const vision = visionQueue(["fail"], {
        before: (n) => {
          if (n === 1) row.status = "approved";
        },
      });
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1, "no FLUX re-render for a reviewed post");
      assert.equal(vision.length, 1, "no Opus check of a re-render");
      assert.equal(db.uploads.length, 1);
      const reads = db.queries.filter((q) => q.table === "ig_pending_review" && q.op === "select" && q.selected === "id" && q.eq.some(([c]) => c === "id"));
      assert.deepEqual(reads.map((q) => q.eq), [[["id", 77], ["status", "pending"], ["image_path", db.uploads[0].path]]]);
      assert.equal(row.status, "approved");
      assertRecord(row.visual_check, { status: "fail", attempts: 1, chosen_attempt: 0, reason: "row_changed", image_model: FLUX2, safe_fallback: false }, IG_KEYS);
    });

    test("a post an approval has claimed (reviewed_at stamped) is never swapped: the losing re-render is deleted and nothing more renders", async () => {
      // Arrange: approve-instagram-post claims the post while re-render 1 is being checked
      const { db, net, row } = setup();
      visionQueue(["fail", "pass"], {
        before: (n) => {
          if (n === 2) row.reviewed_at = "2026-09-14T10:00:00.000Z";
        },
      });
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(row.image_path, db.uploads[0].path, "the claimed post keeps the image its approval is publishing");
      assert.equal(net.together.length, 2, "no render after the swap lost");
      assert.ok(db.removed.includes(db.uploads[1].path), "the re-render that lost the swap is deleted");
      const swaps = updates(db).filter((q) => q.eq.some(([column]) => column === "status"));
      assert.equal(swaps.length, 1);
      assert.deepEqual(swaps[0].is, [["reviewed_at", null]]);
    });

    test("stillCurrent treats a claimed post as reviewed: no re-render once an approval has claimed it", async () => {
      // Arrange: the claim lands before the first check answers
      const { db, net, row } = setup();
      const vision = visionQueue(["fail"], {
        before: (n) => {
          if (n === 1) row.reviewed_at = "2026-09-14T10:00:00.000Z";
        },
      });
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1, "no FLUX re-render for a claimed post");
      assert.equal(vision.length, 1);
      const reads = db.queries.filter((q) => q.table === "ig_pending_review" && q.op === "select" && q.selected === "id" && q.eq.some(([column]) => column === "id"));
      assert.deepEqual(reads.map((q) => q.is), [[["reviewed_at", null]]]);
      assert.equal(row.image_path, db.uploads[0].path);
    });

    test("a stillCurrent read that fails is logged and the redo carries on: the swap's compare-and-swap still guards the post", async () => {
      // Arrange
      const { net, row } = setup({ stillCurrentError: true });
      visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 2);
      assertRecord(row.visual_check, { status: "pass", attempts: 2, chosen_attempt: 1, reason: null }, IG_KEYS);
      assert.ok(logs.some((l) => l.startsWith("WARN [instagram-post] #77 could not read the post (TypeError: fetch failed); carrying on")), logs.join("\n"));
    });

    test("a post made on a worker that started 330s earlier: the redo checks once in the 30s the worker has left and re-renders nothing", async () => {
      // Arrange: Supabase stops a worker 400s after it started, whichever request it is serving
      clock.fixed = realNow.call(Date);
      const { net, row } = setup();
      const vision = visionQueue(["fail", "pass"]);
      const previous = visualCheckIo.setWorkerStartedAt(clock.fixed - 330_000);
      // Act
      let res: Json;
      try {
        res = await call("ig", { chapter_global_number: 293 });
      } finally {
        visualCheckIo.setWorkerStartedAt(previous);
      }
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.equal(vision[0].reqOpts.timeout, 30_000);
      assertRecord(row.visual_check, { status: "fail", attempts: 1, chosen_attempt: 0, reason: "deadline" }, IG_KEYS);
    });

    test("a regenerate replaced the image during the redo: neither the swap nor the final record touches the row", async () => {
      // Arrange: regenerate-pending-image stores its own image while re-render 1 is checked
      const { db, net, row } = setup();
      const regenerated = { status: "running", attempts: 1 };
      visionQueue(["fail", "pass"], {
        before: (n) => {
          if (n === 2) Object.assign(row, { image_path: "pending-77-1.jpg", visual_check: regenerated });
        },
      });
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 2);
      assert.equal(row.image_path, "pending-77-1.jpg");
      assert.deepEqual(row.visual_check, regenerated);
      assert.deepEqual(db.removed, [db.uploads[1].path]);
      assert.ok(logs.some((l) => l.startsWith("[instagram-post] #77 visual_check not stored: the post no longer holds ")), logs.join("\n"));
    });

    const SWAP_ERRORS = [
      {
        swapResult: "lost",
        name: "the update landed but its response was lost: the row is read back, the swap counts and both files are kept",
        keeps: 1,
        removes: [],
        record: { status: "pass", attempts: 2, chosen_attempt: 1, reason: null },
      },
      {
        swapResult: "error",
        name: "the update failed: the row still holds the stored image, so the re-render's file is deleted",
        keeps: 0,
        removes: [1],
        record: { status: "fail", attempts: 2, chosen_attempt: 0, reason: "swap_failed" },
      },
      {
        swapResult: "unreadable",
        name: "the update failed and the row cannot be read: both files are kept, since either may be the stored one",
        keeps: 0,
        removes: [],
        record: { status: "fail", attempts: 2, chosen_attempt: 0, reason: "swap_failed" },
      },
    ] as const;
    for (const c of SWAP_ERRORS) {
      test(`swap error, ${c.name}`, async () => {
        // Arrange: the first image fails its check and re-render 1 passes
        const { db, row } = setup({ swapResult: c.swapResult });
        visionQueue(["fail", "pass"]);
        // Act
        const { status } = await call("ig", { chapter_global_number: 293 });
        // Assert
        assert.equal(status, 200);
        const files = db.uploads.map((u) => u.path);
        assert.equal(files.length, 2);
        assert.equal(row.image_path, files[c.keeps]);
        assert.deepEqual(db.removed, c.removes.map((i) => files[i]));
        assertRecord(row.visual_check, c.record, IG_KEYS);
      });
    }

    test("deadline: a render ending 330s after invocation start gives its check the 30s left before invocation start + 360s, and no re-render", async () => {
      // Arrange: the clock only moves when Together renders
      clock.fixed = realNow.call(Date);
      const { net, row } = setup({ renderMs: 330_000 });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status, json } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.equal(vision[0].reqOpts.timeout, 30_000, "the check ends by invocation start + 360s");
      assertRecord(row.visual_check, { status: "fail", attempts: 1, chosen_attempt: 0, reason: "deadline" }, IG_KEYS);
    });

    test("check error: an API error is recorded, the stored image kept, and nothing re-rendered", async () => {
      // Arrange
      const { db, net, row } = setup();
      const vision = visionQueue([new APIError(529, "overloaded")]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.equal(db.uploads.length, 1);
      assertRecord(
        row.visual_check,
        { status: "error", attempts: 1, chosen_attempt: 0, failed: [], reason: "api_error_529", image_model: FLUX2, safe_fallback: false },
        IG_KEYS,
      );
    });

    test("no facts: one render, no check or background work, and the Together request has exactly the pre-check shape and seed", async () => {
      // Arrange
      clock.fixed = 1_700_000_123_456;
      const { db, net, row } = setup({ scene: DHRUVA_SCENE, canon: [] });
      const vision = visionQueue(["fail"]);
      // Act
      const res = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(res.status, 200);
      assert.equal(researchFacts(), 0);
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
      assert.equal(net.together.length, 1);
      const body = net.together[0];
      assert.deepEqual(Object.keys(body), [...BODY_KEYS, "seed"]);
      assert.deepEqual({ ...body, prompt: "" }, { model: FLUX2, prompt: "", width: 1344, height: 768, n: 1, response_format: "b64_json", seed: 123_456 });
      assert.ok(body.prompt.startsWith(`${DHRUVA_SCENE}, museum-quality`), body.prompt.slice(0, 200));
      assertRecord(row.visual_check, { status: "skipped", attempts: 1, chosen_attempt: 0, reason: "no_facts", image_model: FLUX2, safe_fallback: false }, IG_KEYS);
      assert.deepEqual(res.json.visualCheck, row.visual_check);
      assert.equal(updates(db).length, 0);
    });

    test("a SAFE_FALLBACK image carries none of the facts: stored unchecked with no background work, and the record says so", async () => {
      // Arrange
      const { net, row } = setup({ imageOk: (n) => n === 3 });
      const vision = visionQueue(["fail"]);
      // Act
      const res = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(res.status, 200);
      assert.equal(net.together.length, 3);
      assert.ok(net.together[2].prompt.startsWith("A serene scene from Srimad Bhagavatam"));
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
      assertRecord(
        row.visual_check,
        { status: "skipped", attempts: 1, chosen_attempt: 0, failed: [], reason: "safe_fallback", image_model: FLUX11, safe_fallback: true },
        IG_KEYS,
      );
    });

    test("a re-render never falls back to SAFE_FALLBACK: when its facts attempts fail the redo stops (render_failed) and the checked first image stays", async () => {
      // Arrange: render 0 draws with FLUX.2-pro and fails its check; re-render 1's model and fallback requests both fail
      const { db, net, row } = setup({ imageOk: (n) => n === 1 || n === 4 });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("ig", { chapter_global_number: 293 });
      // Assert: no SAFE_FALLBACK image is paid for, since it could never be swapped in
      assert.equal(status, 200);
      assert.equal(net.together.length, 3);
      for (const body of net.together) assert.ok(body.prompt.includes(HORSES), body.prompt.slice(0, 80));
      assert.deepEqual(net.together.slice(1).map((b) => [b.model, b.seed]), [[FLUX2, net.together[0].seed + 1], [FLUX11, net.together[0].seed + 1]]);
      assert.equal(vision.length, 1);
      assert.equal(db.uploads.length, 1);
      assert.equal(row.image_path, db.uploads[0].path);
      assertRecord(row.visual_check, { status: "fail", attempts: 2, chosen_attempt: 0, reason: "render_failed", image_model: FLUX2, safe_fallback: false }, IG_KEYS);
    });

    test("a prompt with no room for any fact checks nothing: one render, reason no_facts, no background work", async () => {
      // Arrange: prompt_max_len 200 leaves the Arjuna scene no room for a single fact
      const { net, row } = setup({ cfg: { prompt_max_len: 200, is_active: true } });
      const vision = visionQueue(["fail"]);
      // Act
      const res = await call("ig-short", { chapter_global_number: 293 });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.ok(researchFacts() >= 1, "research found facts");
      assert.equal(net.together[0].prompt.includes(HORSES), false, "no fact reached the prompt");
      assert.equal(net.together.length, 1);
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
      assertRecord(row.visual_check, { status: "skipped", attempts: 1, reason: "no_facts", safe_fallback: false }, IG_KEYS);
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

    test("a missing visual_check column still saves the post, without the record, and starts no background check", async () => {
      // Arrange
      const { db } = setup({ missingColumn: true });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.success, true);
      assert.equal(res.json.pendingReviewId, 77);
      const rows = db.writes("ig_pending_review").filter((q) => q.op === "insert").map((q) => q.values);
      assert.equal(rows.length, 2);
      assert.ok("visual_check" in rows[0]);
      const { visual_check: _dropped, ...withoutRecord } = rows[0];
      assert.deepEqual(rows[1], withoutRecord);
      assert.ok(logs.some((l) => l.startsWith("WARN [instagram-post] insert with visual_check failed")), logs.join("\n"));
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
      assert.equal(updates(db).length, 0);
    });

    test("openai/gpt-image-2: no seed or steps in any request, the redo still re-renders and swaps, and the record names the model", async () => {
      // Arrange
      const { db, net, row } = setup({ cfg: GPT_CFG });
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
      assert.equal(row.image_path, db.uploads[1].path);
      assertRecord(row.visual_check, { status: "pass", attempts: 2, chosen_attempt: 1, image_model: GPT }, IG_KEYS);
    });

    test("a 429 is re-sent: the same request goes through on the second post and that image is stored", async () => {
      // Arrange: Together rate limits the first post, as it did during the 2026-09-16 bulk run
      const { db, net, row } = setup({ status: (n) => (n === 1 ? 429 : null), body: () => RATE_LIMIT_BODY });
      visionQueue(["pass"]);
      // Act
      const res = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(net.together.length, 2);
      assert.deepEqual(net.together[1], net.together[0], "the retry is the same request, not the fallback model");
      assert.deepEqual(sleeps, [2500]);
      assert.equal(db.uploads.length, 1);
      assert.equal(row.image_path, db.uploads[0].path);
      assert.ok(logs.some((l) => l.startsWith(`${FLUX2}: 429 `) && l.endsWith("(rate_limited, retrying)")), logs.join("\n"));
    });

    test("a chain that is rate limited throughout fails the post with the rate-limit wording", async () => {
      // Arrange
      const { db, net } = setup({ status: () => 429, body: () => RATE_LIMIT_BODY });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(res.status, 500);
      assert.equal(res.json.error, `Error: ${RATE_LIMITED_MESSAGE}`);
      assert.equal(net.together.length, 9, "three attempts, three posts each");
      assert.deepEqual(sleeps, [2500, 6000, 2500, 6000, 2500, 6000]);
      assert.equal(vision.length, 0);
      assert.equal(db.writes("ig_pending_review").length, 0);
    });

    test("negative: every attempt failing still fails the post, with no check, no review row and no background work", async () => {
      // Arrange
      const { db, net } = setup({ imageOk: () => false });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("ig", { chapter_global_number: 293 });
      // Assert
      assert.equal(res.status, 500);
      assert.match(res.json.error, /All FLUX attempts failed/);
      assert.equal(net.together.length, 3);
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
      assert.equal(db.writes("ig_pending_review").length, 0);
    });

    describe("config fidelity", () => {
      const IG_CFG = { ...FLUX_CFG, steps: 28, ig_width: 1344, ig_height: 768 };
      // FLUX_CFG's style and rules as instagram-post sends them: "sword" is rewritten.
      const CFG_TAIL = `, ${FLUX_CFG.style_positives}, NOT cartoon, NOT a firearm, NOT a blessing. ${FLUX_CFG.extra_rules}`;

      test("with an active configuration the prompt is the scene plus its style and rules, and its size and steps reach FLUX", async () => {
        // Arrange
        const { net } = setup({ cfg: IG_CFG, scene: DHRUVA_SCENE, canon: [] });
        visionQueue(["pass"]);
        // Act
        const { status, json } = await call("ig-cfg", { chapter_global_number: 293 });
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        const body = net.together[0];
        assert.ok(Number.isInteger(body.seed));
        assert.deepEqual(
          { ...body, seed: 0 },
          { model: FLUX2, prompt: `${DHRUVA_SCENE}${CFG_TAIL}`, width: 1344, height: 768, n: 1, response_format: "b64_json", seed: 0, steps: 28 },
        );
        assert.equal(body.prompt.includes("museum-quality"), false, "none of the built-in style");
        assert.equal(body.prompt.includes("ABSOLUTE GENDER RULES"), false, "none of the built-in rules");
      });

      test("with an active configuration and research facts, the facts follow the scene and the configuration's rules and style follow them", async () => {
        // Arrange
        const { net } = setup({ cfg: IG_CFG });
        const vision = visionQueue(["pass"]);
        // Act
        const { status } = await call("ig-cfg", { chapter_global_number: 293 });
        // Assert
        assert.equal(status, 200);
        const prompt: string = net.together[0].prompt;
        assert.ok(prompt.startsWith(ARJUNA_SCENE), prompt.slice(0, 160));
        const at = (text: string) => prompt.indexOf(text);
        assert.ok(at(HORSES) > 0, prompt);
        assert.ok(at("Warriors appear peaceful") > at(HORSES), prompt);
        assert.ok(at("warm golden oil painting") > at("Warriors appear peaceful"), prompt);
        assert.equal(prompt.includes("museum-quality"), false, prompt);
        assert.equal(prompt.includes("ABSOLUTE GENDER RULES"), false, prompt);
        assert.equal(net.together[0].steps, 28);
        assert.ok(checkedDetails(vision[0]).some((d) => d.includes(HORSES)));
      });

      test("fallback renders use the configuration's fallback model at the Instagram shape, SAFE_FALLBACK included", async () => {
        // Arrange: only the third request succeeds, so all three attempts are sent
        const { net } = setup({ cfg: { ...FLUX_CFG, ig_width: 1344, ig_height: 1088 }, imageOk: (n) => n === 3 });
        visionQueue(["pass"]);
        // Act
        const { status } = await call("ig-cfg", { chapter_global_number: 293 });
        // Assert
        assert.equal(status, 200);
        assert.deepEqual(net.together.map((b) => [b.model, b.width, b.height]), [[FLUX2, 1344, 1088], [FLUX11, 1024, 832], [FLUX11, 1024, 832]]);
        assert.ok(net.together[2].prompt.startsWith("A serene scene from Srimad Bhagavatam"));
      });

      test("the fallback keeps the post's shape at the scale of the configured fallback size: 832x1216 falls back at 1216x704, SAFE_FALLBACK included", async () => {
        // Arrange: only the third request succeeds, so all three attempts are sent
        const { net } = setup({ cfg: { ...FLUX_CFG, fallback_width: 832, fallback_height: 1216, ig_width: 1344, ig_height: 768 }, imageOk: (n) => n === 3 });
        visionQueue(["pass"]);
        // Act
        const { status } = await call("ig-cfg", { chapter_global_number: 293 });
        // Assert
        assert.equal(status, 200);
        assert.deepEqual(net.together.map((b) => [b.model, b.width, b.height]), [[FLUX2, 1344, 768], [FLUX11, 1216, 704], [FLUX11, 1216, 704]]);
      });

      test("a configured prompt_max_len above 2000 is used as it is", async () => {
        // Arrange: a scene that fits 2600 chars with the style, but not 2000
        const long = Array.from({ length: 20 }, () => DHRUVA_SCENE).join(". ");
        const expected = `${long}${CFG_TAIL}`;
        assert.ok(expected.length > 2000 && expected.length <= 2600, String(expected.length));
        const { net } = setup({ cfg: { ...IG_CFG, prompt_max_len: 2600 }, scene: long, canon: [] });
        visionQueue(["pass"]);
        // Act
        const { status } = await call("ig-cfg", { chapter_global_number: 293 });
        // Assert
        assert.equal(status, 200);
        assert.equal(net.together[0].prompt, expected);
      });

      test("the configuration is read on every request: after a failed read (built-in defaults) the next request uses the active row", async () => {
        // Arrange + Act: a failed read, then a readable active row in the same isolate
        const failed = setup({ cfgError: { message: "timeout" }, scene: DHRUVA_SCENE, canon: [] });
        visionQueue(["pass"]);
        const first = await call("ig-cfg", { chapter_global_number: 293 });
        const active = setup({ cfg: GPT_CFG, scene: DHRUVA_SCENE, canon: [] });
        const second = await call("ig-cfg", { chapter_global_number: 293 });
        // Assert
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        const [a] = failed.net.together;
        const [b] = active.net.together;
        assert.deepEqual([a.model, a.width, a.height], [FLUX2, 1344, 768]);
        assert.ok(a.prompt.startsWith(`${DHRUVA_SCENE}, museum-quality`), a.prompt.slice(0, 160));
        assert.deepEqual([b.model, b.width, b.height], [GPT, 1344, 1088]);
        assert.ok(logs.includes("WARN [instagram-post] image_gen_config read failed (timeout); using the built-in defaults"), logs.join("\n"));
      });
    });
  });

  // ── bulk-generate-images ───────────────────────────────────────────────────
  describe("bulk-generate-images", () => {
    function setup(
      o: {
        cfg?: unknown;
        imagePrompt?: string;
        canon?: unknown[];
        imageOk?: (n: number) => boolean;
        /** Answers Together call n with this HTTP status (and body): how the 429 retry is tested. */
        status?: (n: number) => number | null;
        body?: (n: number) => string;
        renderMs?: number;
        missingColumn?: boolean;
      } = {},
    ) {
      /** The last review row inserted, as the database holds it. */
      const row: Json = {};
      const db = makeDb({
        image_gen_config: () => o.cfg ?? null,
        bhagavatam_image_deletes: () => [],
        ig_pending_review: (q) => {
          if (q.op === "insert") {
            if (o.missingColumn && "visual_check" in q.values) return { __error: MISSING_COLUMN };
            Object.assign(row, q.values, { id: 41 });
            return { id: 41 };
          }
          if (q.op === "update") return updateRow(row, q);
          return [];
        },
        scene_visual_canon: () => o.canon ?? CANON,
        scene_visual_research: () => null,
      });
      const net = makeNet({
        claude: (body) => (body.max_tokens === 1200 ? JSON.stringify({ imagePrompt: o.imagePrompt ?? GITA_SCENE, caption: "c", hashtags: "#h" }) : "{}"),
        imageOk: o.imageOk,
        status: o.status,
        body: o.body,
        renderMs: o.renderMs,
      });
      g.__sb = db;
      g.fetch = net.fn;
      return { db, net, row };
    }
    const inserts = (db: ReturnType<typeof makeDb>) => db.writes("ig_pending_review").filter((q) => q.op === "insert").map((q) => q.values);

    test("sample mode: a 429 is re-sent and the same request goes through on the second post", async () => {
      // Arrange
      const { db, net } = setup({ status: (n) => (n === 1 ? 429 : null), body: () => RATE_LIMIT_BODY });
      visionQueue(["pass"]);
      // Act
      const res = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.ok, true, JSON.stringify(res.json));
      assert.equal(net.together.length, 2);
      assert.deepEqual(net.together[1], net.together[0], "the retry is the same request, not the fallback model");
      assert.deepEqual(sleeps, [2500]);
      assert.equal(db.uploads.length, 1);
      assert.ok(
        logs.some((l) => l.startsWith(`[bulk-generate-images] ${FLUX2}: HTTP 429 `) && l.endsWith("(rate_limited, retrying)")),
        logs.join("\n"),
      );
    });

    test("sample mode: a chain that is rate limited throughout answers with the rate-limit wording", async () => {
      // Arrange
      const { db, net } = setup({ status: () => 429, body: () => RATE_LIMIT_BODY });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(res.json.ok, false, JSON.stringify(res.json));
      assert.equal(res.json.error, `Error: ${RATE_LIMITED_MESSAGE}`);
      assert.equal(net.together.length, 9, "three attempts, three posts each");
      assert.deepEqual(sleeps, [2500, 6000, 2500, 6000, 2500, 6000]);
      assert.equal(vision.length, 0);
      assert.equal(db.uploads.length, 0);
    });

    test("sample mode: stored after one render with a running record; the check after the response writes pass by a compare-and-swap", async () => {
      // Arrange
      const { db, net, row } = setup();
      const vision = visionQueue(["pass"]);
      // Act
      const res = await start("bgi", { mode: "sample" });
      await res.background;
      // Assert: the response
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.json.ok, true, JSON.stringify(res.json));
      assert.equal(res.json.pendingId, 41);
      assert.equal(res.registered, 1, "the check was handed to EdgeRuntime.waitUntil before the response");
      assertRecord(res.json.visualCheck, { status: "running", attempts: 1, chosen_attempt: 0, image_model: FLUX2, safe_fallback: false }, IG_KEYS);
      assert.deepEqual(inserts(db)[0].visual_check, res.json.visualCheck);
      // Assert: the check and its write
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.ok(checkText(vision[0]).includes(HORSES), checkText(vision[0]));
      assert.equal(detailCount(vision[0].params), factsLogged("[bulk-generate-images] research key="));
      assert.equal(updates(db).length, 1);
      const [write] = updates(db);
      assert.deepEqual(Object.keys(write.values), ["visual_check"]);
      assert.deepEqual(write.eq, [["id", 41], ["image_path", db.uploads[0].path]]);
      assert.equal(write.selected, "id");
      assertRecord(row.visual_check, { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], reason: null, image_model: FLUX2, safe_fallback: false }, IG_KEYS);
      assert.equal(row.visual_check.started_at, res.json.visualCheck.started_at);
    });

    test("sample mode flags a failing image on its row and never re-renders it", async () => {
      // Arrange
      const { db, net, row } = setup();
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status, json } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.equal(db.uploads.length, 1);
      assert.deepEqual(db.removed, []);
      assert.equal(row.image_path, db.uploads[0].path);
      assertRecord(row.visual_check, { status: "fail", attempts: 1, chosen_attempt: 0, reason: null, image_model: FLUX2, safe_fallback: false }, IG_KEYS);
      assert.deepEqual(row.visual_check.failed.map((f: Json) => f.observed), ["wrong detail 1"]);
    });

    test("sample mode deadline: a render ending 345s after invocation start leaves no time for the check (skipped, reason deadline)", async () => {
      // Arrange: the clock only moves when Together renders
      clock.fixed = realNow.call(Date);
      const { net, row } = setup({ renderMs: 345_000 });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 0);
      assertRecord(row.visual_check, { status: "skipped", attempts: 1, reason: "deadline" }, IG_KEYS);
    });

    test("sample mode check error (refusal): recorded as error, with no second render", async () => {
      // Arrange
      const { net, row } = setup();
      const vision = visionQueue(["refusal"]);
      // Act
      const { status } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assertRecord(row.visual_check, { status: "error", attempts: 1, reason: "refusal" }, IG_KEYS);
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
      assertRecord(inserts(db)[0].visual_check, { status: "fail", attempts: 2, chosen_attempt: 0, reason: "max_attempts" }, BULK_KEYS);
      assert.equal(updates(db).length, 0, "bulk mode checks before its insert and writes nothing after");
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
      assertRecord(rows[0].visual_check, { status: "fail", attempts: 2, reason: "max_attempts" }, BULK_KEYS);
      assertRecord(rows[1].visual_check, { status: "fail", attempts: 1, reason: "deadline" }, BULK_KEYS);
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
      assertRecord(inserts(db)[0].visual_check, { status: "error", attempts: 1, reason: "api_error_500" }, BULK_KEYS);
    });

    test("bulk mode, a re-render never falls back to SAFE_FALLBACK: when its facts attempts fail the loop stops (render_failed) and keeps the checked image", async () => {
      // Arrange: render 0 draws and fails its check; re-render 1's model and fallback requests both fail
      const { db, net } = setup({ imageOk: (n) => n === 1 || n === 4 });
      const vision = visionQueue(["fail"]);
      // Act
      await call("bgi", { mode: "bulk", limit: 1 });
      // Assert: no SAFE_FALLBACK image is paid for, since the loop could only discard it
      assert.equal(net.together.length, 3);
      for (const body of net.together) assert.equal(body.prompt.startsWith("A wide oil-painting scene"), false, body.prompt.slice(0, 60));
      assert.equal(vision.length, 1);
      assertRecord(inserts(db)[0].visual_check, { status: "fail", attempts: 2, chosen_attempt: 0, reason: "render_failed", image_model: FLUX2, safe_fallback: false }, BULK_KEYS);
    });

    test("bulk mode on a worker that started 330s before the request: the run's deadline counts from the worker start, so nothing is re-rendered", async () => {
      // Arrange: renders take 10s
      clock.fixed = realNow.call(Date);
      const { db, net } = setup({ renderMs: 10_000 });
      const vision = visionQueue(["fail"]);
      const previous = visualCheckIo.setWorkerStartedAt(clock.fixed - 330_000);
      // Act
      try {
        await call("bgi", { mode: "bulk", limit: 1 });
      } finally {
        visualCheckIo.setWorkerStartedAt(previous);
      }
      // Assert: the render ends 10s in with 20s left, room for its check but not for another render
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.equal(vision[0].reqOpts.timeout, 20_000);
      assertRecord(inserts(db)[0].visual_check, { status: "fail", attempts: 1, chosen_attempt: 0, reason: "deadline" }, BULK_KEYS);
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
        assert.equal(headRes.registered, 0);
        // No fact reached the prompt, so nothing is checked; safe_fallback says the image came from SAFE_FALLBACK.
        assertRecord(head.row.visual_check, { status: "skipped", attempts: 1, reason: "no_facts", image_model: FLUX11, safe_fallback: true }, IG_KEYS);
      });
    }

    test("a prompt with no room for any fact checks nothing: one render, reason no_facts, no background work", async () => {
      // Arrange: prompt_max_len 200 leaves the scene no room for a single fact
      const { net, row } = setup({ cfg: { ...FLUX_CFG, prompt_max_len: 200 } });
      const vision = visionQueue(["fail"]);
      // Act
      const res = await call("bgi-short", { mode: "sample" });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.ok(factsLogged("[bulk-generate-images] research key=") >= 1, "research found facts");
      assert.equal(net.together[0].prompt.includes("Canonical details"), false, "no fact reached the prompt");
      assert.equal(net.together.length, 1);
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
      assertRecord(row.visual_check, { status: "skipped", attempts: 1, reason: "no_facts", safe_fallback: false }, IG_KEYS);
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

    test("a missing visual_check column still saves the image, without the record, and starts no background check", async () => {
      // Arrange
      const { db } = setup({ missingColumn: true });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(res.status, 200);
      assert.equal(res.json.ok, true, JSON.stringify(res.json));
      assert.equal(res.json.pendingId, 41);
      const rows = inserts(db);
      assert.equal(rows.length, 2);
      assert.ok("visual_check" in rows[0]);
      const { visual_check: _dropped, ...withoutRecord } = rows[0];
      assert.deepEqual(rows[1], withoutRecord);
      assert.ok(logs.some((l) => l.startsWith("WARN [bulk-generate-images] insert with visual_check failed")), logs.join("\n"));
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
    });

    test("openai/gpt-image-2 in bulk mode: the re-render sends no seed and no steps, at the configured Instagram size", async () => {
      // Arrange
      const { db, net } = setup({ cfg: GPT_CFG });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("bgi-gpt", { mode: "bulk", limit: 1 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 2);
      for (const body of net.together) {
        assert.deepEqual(Object.keys(body), BODY_KEYS);
        assert.deepEqual([body.model, body.width, body.height], [GPT, 1344, 1088]);
      }
      assert.equal(vision.length, 2);
      assertRecord(inserts(db)[0].visual_check, { status: "pass", attempts: 2, chosen_attempt: 1, image_model: GPT }, BULK_KEYS);
    });

    describe("config fidelity", () => {
      for (const mode of ["sample", "bulk"]) {
        test(`${mode} mode renders at the configuration's Instagram size with its steps; the fallbacks keep that shape with its fallback model`, async () => {
          // Arrange: only the third request succeeds, so all three attempts are sent
          const cfg = { ...FLUX_CFG, steps: 28, ig_width: 1344, ig_height: 768 };
          const { net } = setup({ cfg, imagePrompt: WAR_SCENE, canon: [], imageOk: (n) => n === 3 });
          visionQueue(["pass"]);
          // Act
          const { status, json } = await call("bgi-cfg", { mode, limit: 1 });
          // Assert
          assert.equal(status, 200, JSON.stringify(json));
          assert.deepEqual(
            net.together.map((b) => [b.model, b.width, b.height, b.steps]),
            [[FLUX2, 1344, 768, 28], [FLUX11, 1024, 576, 28], [FLUX11, 1024, 576, 28]],
          );
          assert.ok(net.together[2].prompt.startsWith("A wide oil-painting scene"), net.together[2].prompt.slice(0, 80));
        });
      }

      for (const mode of ["sample", "bulk"]) {
        test(`${mode} mode falls back in the post's shape at the scale of the configured fallback size: 832x1216 gives 1216x704`, async () => {
          // Arrange: only the third request succeeds, so both fallback attempts are sent
          const cfg = { ...FLUX_CFG, fallback_width: 832, fallback_height: 1216, ig_width: 1344, ig_height: 768 };
          const { net } = setup({ cfg, imagePrompt: WAR_SCENE, canon: [], imageOk: (n) => n === 3 });
          visionQueue(["pass"]);
          // Act
          const { status, json } = await call("bgi-cfg", { mode, limit: 1 });
          // Assert
          assert.equal(status, 200, JSON.stringify(json));
          assert.deepEqual(net.together.map((b) => [b.model, b.width, b.height]), [[FLUX2, 1344, 768], [FLUX11, 1216, 704], [FLUX11, 1216, 704]]);
        });
      }

      test("the configuration is read per request, not cached: the next request uses a newly active configuration", async () => {
        // Arrange + Act
        const first = setup({ cfg: FLUX_CFG, imagePrompt: WAR_SCENE, canon: [] });
        visionQueue(["pass"]);
        await call("bgi-cfg", { mode: "sample" });
        const second = setup({ cfg: GPT_CFG, imagePrompt: WAR_SCENE, canon: [] });
        await call("bgi-cfg", { mode: "sample" });
        // Assert
        const [a] = first.net.together;
        const [b] = second.net.together;
        assert.deepEqual([a.model, a.width, a.height], [FLUX2, 1024, 1280]);
        assert.deepEqual([b.model, b.width, b.height], [GPT, 1344, 1088]);
      });
    });
  });

  // ── regenerate-pending-image ───────────────────────────────────────────────
  describe("regenerate-pending-image", () => {
    const ROW = { id: 5, chapter_global_number: 293, chapter_title: "Chapter Two Ninety Three", image_path: "old.jpg", caption: "c", status: "pending" };

    function setup(
      o: {
        cfg?: unknown;
        canon?: unknown[];
        /** Fields that replace the stored row's. */
        row?: Json;
        imageOk?: (n: number) => boolean;
        renderMs?: number;
        missingColumn?: boolean;
        /** An error for the regenerate's own save of the new image. */
        updateError?: { message: string };
        /** An error for the background compare-and-swap only. */
        casError?: unknown;
        /** Runs while Together call n renders, e.g. the daily post's redo swapping in its image. */
        onTogether?: (n: number, row: Json) => void;
        /** Moves the row to another image just before every save of the new image lands. */
        moveImageOnSave?: boolean;
      } = {},
    ) {
      /** The review row as the database holds it; null once deleted. */
      const state: { row: Json } = { row: { ...ROW, ...o.row } };
      let moved = 0;
      const db = makeDb({
        ig_pending_review: (q) => {
          const row = state.row;
          if (q.op === "select") {
            if (!row) return null;
            return q.selected === "image_path" ? { image_path: row.image_path ?? null } : { ...row };
          }
          if (q.op !== "update") return null;
          if (!row) return q.selected === null ? null : [];
          // The background check writes visual_check alone; the regenerate saves the new image.
          const isSave = "image_url" in q.values;
          if (isSave && o.updateError) return { __error: o.updateError };
          if (!isSave && o.casError) return { __error: o.casError };
          if (o.missingColumn && "visual_check" in q.values) return { __error: MISSING_COLUMN };
          if (isSave && o.moveImageOnSave) row.image_path = `moved-${++moved}.jpg`;
          return updateRow(row, q);
        },
        image_gen_config: () => o.cfg ?? null,
        scene_visual_canon: () => o.canon ?? CANON,
        scene_visual_research: () => null,
      });
      const net = makeNet({ claude: () => "{}", imageOk: o.imageOk, renderMs: o.renderMs, onTogether: (n) => o.onTogether?.(n, state.row) });
      g.__sb = db;
      g.fetch = net.fn;
      return { db, net, row: state.row, state };
    }

    test("responds before the background check: the row already points at the new image with a running record, and the response names that image's path", async () => {
      // Arrange: the vision check waits until the test lets it answer
      const { db, net, row } = setup();
      const hold = gate();
      const vision = visionQueue(["pass"], { before: () => hold.opened });
      // Act
      const res = await start("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert: the response came while the check was still pending
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(res.registered, 1, "the check was handed to EdgeRuntime.waitUntil before the response");
      assert.equal(await isSettled(res.background), false, "the check is still running");
      assertRecord(
        res.json.visual_check,
        { status: "running", attempts: 1, chosen_attempt: 0, failed: [], unclear: 0, reason: null, image_model: FLUX2 },
        REGEN_KEYS,
      );
      assert.equal(row.image_path, db.uploads[0].path);
      assert.equal(res.json.image_url, `https://storage.test/${row.image_path}`);
      assert.equal(res.json.image_path, row.image_path, "the gallery sends this path when the reviewer approves or rejects");
      assert.deepEqual(row.visual_check, res.json.visual_check);
      assert.equal(net.together.length, 1);
      // Act: let the check answer
      hold.open();
      await res.background;
      // Assert
      assert.equal(vision.length, 1);
      assertRecord(row.visual_check, { status: "pass", attempts: 1, chosen_attempt: 0, reason: null, image_model: FLUX2 }, REGEN_KEYS);
    });

    test("pass: one render, one check against the research facts, written by a compare-and-swap on the new image file", async () => {
      // Arrange
      const { db, net, row } = setup();
      const vision = visionQueue(["pass"]);
      // Act
      const { status, json } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.ok(checkText(vision[0]).includes(HORSES), checkText(vision[0]));
      assert.equal(updates(db).length, 2);
      const [save, write] = updates(db);
      assert.deepEqual(save.eq, [["id", 5], ["status", "pending"], ["image_path", "old.jpg"]], "the new image is saved by a compare-and-swap on the image the row held");
      assert.deepEqual(save.is, [["reviewed_at", null]], "and only over a post no approval or rejection has claimed");
      assert.equal(save.selected, "id");
      assert.deepEqual(Object.keys(write.values), ["visual_check"]);
      assert.deepEqual(write.eq, [["id", 5], ["image_path", db.uploads[0].path]]);
      assert.equal(write.selected, "id");
      assert.equal(db.queries.some((q) => q.methods.includes("or")), false, "no .or() filter on any query");
      assertRecord(row.visual_check, { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], reason: null, image_model: FLUX2 }, REGEN_KEYS);
      assert.equal(json.visual_check.status, "running");
    });

    test("a failing check is flagged on the row: no re-render, no second upload, and the reviewer's new image stays", async () => {
      // Arrange
      const { db, net, row } = setup();
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assert.equal(db.uploads.length, 1);
      assert.equal(row.image_path, db.uploads[0].path);
      assert.deepEqual(db.removed, ["old.jpg"]);
      assertRecord(row.visual_check, { status: "fail", attempts: 1, chosen_attempt: 0, reason: null, image_model: FLUX2 }, REGEN_KEYS);
      assert.deepEqual(row.visual_check.failed.map((f: Json) => f.observed), ["wrong detail 1"]);
    });

    test("a later regenerate replaced the image before the check answered: that row never gets this image's record", async () => {
      // Arrange: another regenerate stores its image while this check runs
      const { db, row } = setup();
      const later = { status: "running", attempts: 1 };
      visionQueue(["fail"], {
        before: () => {
          Object.assign(row, { image_path: "pending-5-later.jpg", visual_check: later });
        },
      });
      // Act
      const { status } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200);
      assert.equal(row.image_path, "pending-5-later.jpg");
      assert.deepEqual(row.visual_check, later);
      assert.equal(updates(db).length, 2, "one compare-and-swap, never retried");
      assert.ok(logs.includes(`[regen] visual_check not stored for #5: the post no longer holds ${db.uploads[0].path}`), logs.join("\n"));
    });

    test("the daily post's redo swaps in a better image while this regenerate renders: the save lands on the image the row holds now, and both older files are deleted", async () => {
      // Arrange: instagram-post's swap moves the row to its -r1 file after this regenerate read the row
      const swapped = "ig-canto11-ch1-1757844000000-r1.jpg";
      const { db, row } = setup({
        onTogether: (_n, r) => {
          Object.assign(r, { image_path: swapped, image_url: `https://storage.test/${swapped}` });
        },
      });
      visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      const saves = updates(db).filter((q) => "image_url" in q.values);
      assert.deepEqual(saves.map((q) => q.eq), [[["id", 5], ["status", "pending"], ["image_path", "old.jpg"]], [["id", 5], ["status", "pending"], ["image_path", swapped]]]);
      assert.deepEqual(saves.map((q) => q.is), [[["reviewed_at", null]], [["reviewed_at", null]]], "every try needs the post still unclaimed");
      assert.equal(row.image_path, db.uploads[0].path);
      assert.deepEqual([...db.removed].sort(), [swapped, "old.jpg"].sort(), "no file is left in storage without a row");
      assert.equal(db.queries.some((q) => q.methods.includes("or")), false, "no .or() filter on a PATCH");
      assertRecord(row.visual_check, { status: "pass", attempts: 1, chosen_attempt: 0, image_model: FLUX2 }, REGEN_KEYS);
    });

    test("a post with no image_path yet is saved by a compare-and-swap on image_path is null", async () => {
      // Arrange
      const { db, row } = setup({ row: { image_path: null } });
      visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      const [save] = updates(db).filter((q) => "image_url" in q.values);
      assert.deepEqual(save.eq, [["id", 5], ["status", "pending"]]);
      assert.deepEqual(save.is, [["reviewed_at", null], ["image_path", null]]);
      assert.equal(row.image_path, db.uploads[0].path);
      assert.deepEqual(db.removed, []);
    });

    test("a post whose image changes before every save is left alone after 3 tries: 409, the new upload deleted, and no check", async () => {
      // Arrange
      const { db, row } = setup({ moveImageOnSave: true });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 409, JSON.stringify(res.json));
      assert.match(res.json.error, /changed while it was regenerated/);
      assert.equal(updates(db).filter((q) => "image_url" in q.values).length, 3);
      assert.equal(row.image_path, "moved-3.jpg");
      assert.deepEqual(db.removed, [db.uploads[0].path]);
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
    });

    test("a post deleted while it was regenerated: 404, the new upload deleted, and no check", async () => {
      // Arrange
      const s = setup({
        onTogether: () => {
          s.state.row = null;
        },
      });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 404, JSON.stringify(res.json));
      assert.deepEqual(s.db.removed, [s.db.uploads[0].path]);
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
    });

    // Claims are stamped from the test clock when a test runs: a fixed date would
    // become a claim older than 10 minutes, which a regenerate treats as dead.
    const stampedNow = () => new Date(Date.now()).toISOString();
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

    for (const c of [
      { name: "claimed by an approval or rejection (reviewed_at stamped)", change: () => ({ reviewed_at: stampedNow() }) },
      { name: "approved", change: () => ({ status: "approved", reviewed_at: stampedNow() }) },
      { name: "rejected", change: () => ({ status: "rejected", reviewed_at: stampedNow() }) },
    ]) {
      test(`a post ${c.name} while it is regenerated keeps its image: the save matches no row and stops at once with 409 reviewed, only the new upload is deleted, and no check`, async () => {
        // Arrange: approve-instagram-post claims (or finishes reviewing) the post while FLUX renders
        const { db, row } = setup({
          onTogether: (_n, r) => {
            Object.assign(r, c.change());
          },
        });
        const vision = visionQueue(["pass"]);
        // Act
        const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
        // Assert
        assert.equal(res.status, 409, JSON.stringify(res.json));
        assert.equal(res.json.status, "reviewed");
        assert.match(res.json.error, /approved or rejected while it was regenerated/);
        const saves = updates(db).filter((q) => "image_url" in q.values);
        assert.equal(saves.length, 1, "a claimed post is never retried");
        assert.deepEqual(saves[0].eq, [["id", 5], ["status", "pending"], ["image_path", "old.jpg"]]);
        assert.deepEqual(saves[0].is, [["reviewed_at", null]]);
        assert.equal(row.image_path, "old.jpg", "the stored image stays on the row");
        assert.deepEqual(db.removed, [db.uploads[0].path], "only the new upload is deleted, never the stored image");
        assert.equal(res.registered, 0);
        assert.equal(vision.length, 0);
      });
    }

    for (const c of [
      {
        name: "a fresh claim on it (reviewed_at stamped)",
        row: () => ({ reviewed_at: stampedNow() }),
        error: /is being approved or rejected, so its image was not regenerated\. If it is still pending 10 minutes after that started, regenerate it again/,
      },
      { name: "a claim 9 minutes old (its request may still be running)", row: () => ({ reviewed_at: minutesAgo(9) }), error: /is being approved or rejected/ },
      {
        name: "a claim 11 minutes old whose approval started publishing",
        row: () => ({ reviewed_at: minutesAgo(11), publish_started_at: minutesAgo(11) }),
        error: /started publishing it at \S+ and did not finish; its image was not regenerated\. Check Instagram before approving it again/,
      },
      { name: "status approved", row: () => ({ status: "approved", reviewed_at: stampedNow() }), error: /was already approved; its image was not regenerated/ },
    ]) {
      test(`a post with ${c.name} when the regenerate starts is refused before any research, render or upload: 409 reviewed`, async () => {
        // Arrange
        const { db, net, row } = setup({ row: c.row() });
        const vision = visionQueue(["pass"]);
        // Act
        const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
        // Assert
        assert.equal(res.status, 409, JSON.stringify(res.json));
        assert.equal(res.json.status, "reviewed");
        assert.match(res.json.error, c.error);
        assert.equal(net.together.length, 0);
        assert.deepEqual(db.uploads, []);
        assert.equal(updates(db).length, 0);
        assert.deepEqual(db.removed, []);
        assert.deepEqual(db.queries.map((q) => q.table), ["ig_pending_review"], "only the row was read: no configuration or research query");
        assert.equal(row.image_path, "old.jpg");
        assert.equal(res.registered, 0);
        assert.equal(vision.length, 0);
      });
    }

    test("a post whose claim is older than 10 minutes with no publish marker (its request died before publishing) is regenerated: the save takes the dead claim over by a compare-and-swap and clears it", async () => {
      // Arrange
      const claimedAt = minutesAgo(11);
      const { db, row } = setup({ row: { reviewed_at: claimedAt, publish_started_at: null } });
      visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      const saves = updates(db).filter((q) => "image_url" in q.values);
      assert.equal(saves.length, 1);
      const [save] = saves;
      assert.deepEqual(save.eq, [["id", 5], ["status", "pending"], ["image_path", "old.jpg"]]);
      assert.deepEqual(save.is, [["publish_started_at", null]], "never over a claim whose approval started publishing");
      assert.deepEqual(save.lt.map(([column]) => column), ["reviewed_at"]);
      const cutoff = String(save.lt[0][1]);
      assert.match(cutoff, ISO);
      assert.ok(claimedAt < cutoff, `the claim (${claimedAt}) must still be older than the cutoff (${cutoff}) when the save lands`);
      assert.ok(Date.parse(cutoff) <= Date.now() - 10 * 60_000, "the cutoff is 10 minutes before the save");
      assert.equal(save.values.reviewed_at, null, "the save clears the dead claim");
      assert.equal(row.reviewed_at, null);
      assert.equal(row.image_path, db.uploads[0].path);
      assert.equal(res.json.image_path, row.image_path);
      assert.deepEqual(db.removed, ["old.jpg"]);
      assert.equal(db.queries.some((q) => q.methods.includes("or")), false, "no .or() filter on a PATCH");
    });

    test("a dead claim that an approval takes over while the image renders stops the save: 409 reviewed, the approval's claim and the stored image kept, only the new upload deleted", async () => {
      // Arrange: the claim is 11 minutes old when the regenerate reads the post, and approve-instagram-post re-stamps it mid-render
      let takenOver = "";
      const { db, row } = setup({
        row: { reviewed_at: minutesAgo(11), publish_started_at: null },
        onTogether: (_n, r) => {
          takenOver = stampedNow();
          r.reviewed_at = takenOver;
        },
      });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 409, JSON.stringify(res.json));
      assert.equal(res.json.status, "reviewed");
      const saves = updates(db).filter((q) => "image_url" in q.values);
      assert.equal(saves.length, 1, "a live claim is never retried");
      assert.deepEqual(saves[0].is, [["publish_started_at", null]]);
      assert.equal(row.reviewed_at, takenOver, "the approval's claim is left alone");
      assert.equal(row.image_path, "old.jpg", "the stored image stays on the row");
      assert.deepEqual(db.removed, [db.uploads[0].path], "only the new upload is deleted");
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
    });

    test("a dead claim released while the image renders: the save is retried over the unclaimed post and lands", async () => {
      // Arrange
      const { db, row } = setup({
        row: { reviewed_at: minutesAgo(11), publish_started_at: null },
        onTogether: (_n, r) => {
          r.reviewed_at = null;
        },
      });
      visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      const saves = updates(db).filter((q) => "image_url" in q.values);
      assert.deepEqual(saves.map((q) => q.is), [[["publish_started_at", null]], [["reviewed_at", null]]]);
      assert.equal("reviewed_at" in saves[1].values, false, "the save over an unclaimed post writes no reviewed_at");
      assert.equal(row.image_path, db.uploads[0].path);
    });

    test("a visual_check column gone by the time of the background write is logged and ignored, never retried", async () => {
      // Arrange
      const { db } = setup({ casError: MISSING_COLUMN });
      visionQueue(["pass"]);
      // Act
      const { status } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200);
      assert.equal(updates(db).length, 2);
      assert.ok(logs.includes("WARN [regen] visual_check not stored for #5: the visual_check column is missing"), logs.join("\n"));
    });

    test("deadline: a render ending 345s after invocation start leaves no time for the check, recorded as skipped with reason deadline", async () => {
      // Arrange: the clock only moves when Together renders
      clock.fixed = realNow.call(Date);
      const { net, row } = setup({ renderMs: 345_000 });
      const vision = visionQueue(["fail", "pass"]);
      // Act
      const { status } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 0);
      assertRecord(row.visual_check, { status: "skipped", attempts: 1, reason: "deadline" }, REGEN_KEYS);
    });

    test("check error: a reply without the tool call is recorded as error and costs no second render", async () => {
      // Arrange
      const { net, row } = setup();
      const vision = visionQueue(["no_tool"]);
      // Act
      const { status } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(vision.length, 1);
      assertRecord(row.visual_check, { status: "error", attempts: 1, reason: "no_tool" }, REGEN_KEYS);
    });

    test("apply_facts false: no facts, one render, no check or background work, and the request is exactly the pre-check payload", async () => {
      // Arrange
      const cfg = { steps: 28, style_positives: "warm golden oil painting", style_negatives: "NOT cartoon", extra_rules: "Vedic era only.", is_active: true };
      const { db, net, row } = setup({ cfg });
      const vision = visionQueue(["fail"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE, apply_facts: false });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.equal(vision.length, 0);
      assert.equal(res.registered, 0);
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
      assertRecord(row.visual_check, { status: "skipped", attempts: 1, reason: "no_facts" }, REGEN_KEYS);
      assert.equal(updates(db).length, 1);
    });

    test("research facts that did not fit in the prompt are not checked", async () => {
      // Arrange: the reviewer's text alone fills the 2000-char limit, so no fact is added
      const { net, row } = setup();
      const vision = visionQueue(["fail"]);
      const long = Array.from({ length: 14 }, () => ARJUNA_SCENE).join(". ");
      // Act
      const res = await call("regen", { id: 5, prompt: long });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      assert.ok(logs.some((l) => / facts=[1-9]\d* used=0 /.test(l)), logs.join("\n"));
      assert.equal(res.json.facts_included, 0);
      assert.equal(vision.length, 0);
      assert.equal(res.registered, 0);
      assert.equal(net.together.length, 1);
      assertRecord(row.visual_check, { status: "skipped", attempts: 1, reason: "no_facts" }, REGEN_KEYS);
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

    test("a missing visual_check column still saves the new image, removes the old one only once the row points away, and starts no check", async () => {
      // Arrange
      const { db } = setup({ missingColumn: true });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 200, JSON.stringify(res.json));
      const saves = updates(db).map((q) => q.values);
      assert.equal(saves.length, 2);
      assert.ok("visual_check" in saves[0]);
      const { visual_check: _dropped, ...withoutRecord } = saves[0];
      assert.deepEqual(saves[1], withoutRecord);
      assert.ok(logs.some((l) => l.startsWith("WARN [regen] update with visual_check failed")), logs.join("\n"));
      assert.ok(db.events.indexOf("remove:old.jpg") > db.events.lastIndexOf("update:ig_pending_review"), db.events.join(","));
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
    });

    test("negative: an update that fails keeps the old image in storage and starts no check", async () => {
      // Arrange
      const { db } = setup({ updateError: { message: "connection reset" } });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 500);
      assert.match(res.json.error, /Update failed: connection reset/);
      assert.deepEqual(db.removed, []);
      assert.equal(res.registered, 0);
      assert.equal(vision.length, 0);
    });

    test("openai/gpt-image-2 with steps configured: neither attempt sends steps or seed, and the fallback keeps the Instagram shape", async () => {
      // Arrange: the first attempt fails, so the fallback is sent too
      const { net, row } = setup({ cfg: GPT_CFG, imageOk: (n) => n === 2 });
      const vision = visionQueue(["pass"]);
      // Act
      const { status } = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 2);
      for (const body of net.together) assert.deepEqual(Object.keys(body), BODY_KEYS);
      // GPT_CFG's 1088x1344 fallback size has a 1344 long side: the fallback keeps the 1344x1088 post's shape at that scale
      assert.deepEqual(net.together.map((b) => [b.model, b.width, b.height]), [[GPT, 1344, 1088], [GPT, 1344, 1088]]);
      assert.equal(vision.length, 1);
      assertRecord(row.visual_check, { status: "pass", attempts: 1, image_model: GPT }, REGEN_KEYS);
    });

    test("negative: every render failing returns 502 with no check, no row update and no background work", async () => {
      // Arrange
      const { db, net } = setup({ imageOk: () => false });
      const vision = visionQueue(["pass"]);
      // Act
      const res = await call("regen", { id: 5, prompt: ARJUNA_SCENE });
      // Assert
      assert.equal(res.status, 502);
      assert.match(res.json.error, /All image attempts failed/);
      assert.equal(net.together.length, 2);
      assert.equal(vision.length, 0);
      assert.equal(res.registered, 0);
      assert.equal(updates(db).length, 0);
    });

    describe("config fidelity", () => {
      for (const c of [
        {
          name: "an Instagram size",
          cfg: { ...FLUX_CFG, steps: 28, ig_width: 1344, ig_height: 768 },
          sent: [[FLUX2, 1344, 768, 28], [FLUX11, 1024, 576, 28]],
        },
        {
          name: "an Instagram size and an 832x1216 fallback size (the fallback keeps the post's shape at that scale)",
          cfg: { ...FLUX_CFG, steps: 28, ig_width: 1344, ig_height: 768, fallback_width: 832, fallback_height: 1216 },
          sent: [[FLUX2, 1344, 768, 28], [FLUX11, 1216, 704, 28]],
        },
        {
          name: "no Instagram size",
          cfg: { ...FLUX_CFG, steps: 28 },
          sent: [[FLUX2, 1024, 1280, 28], [FLUX11, 768, 1024, 28]],
        },
      ]) {
        test(`with ${c.name} configured, both attempts use the configuration's models, sizes and steps`, async () => {
          // Arrange: the first attempt fails, so the fallback is sent too
          const { net } = setup({ cfg: c.cfg, imageOk: (n) => n === 2 });
          visionQueue(["pass"]);
          // Act
          const { status } = await call("regen", { id: 5, prompt: DHRUVA_SCENE, apply_facts: false });
          // Assert
          assert.equal(status, 200);
          assert.deepEqual(net.together.map((b) => [b.model, b.width, b.height, b.steps]), c.sent);
        });
      }
    });
  });
});
