// Wiring tests for the visual check in the three chapter-art functions:
// regenerate-chapter-art, bulk-generate-chapter-art and bulk-generate-chaitanya-art.
// Each index.ts is imported under node with its Deno-only specifiers stubbed
// (helpers/edge-function-hooks.mjs and helpers/npm-stub-hooks.mjs). The database
// (with stateful review rows), storage, fetch (Together, buildiskcon.com),
// EdgeRuntime.waitUntil and the Claude SDK are fakes, and Date.now can be moved
// forward to reach a deadline. The real _shared/sceneResearch.ts (canon only: no
// Firecrawl key) and _shared/visualCheck.ts run. No network, no real keys, no
// paid calls.
//
// Gallery-triggered generation (regenerate-chapter-art, and the chapter and
// sample modes of the bulk functions) renders once, stores the cover with its
// initial record and checks it after the response: the fake EdgeRuntime collects
// the background work, and a Claude answer held back until the Response is out
// shows that the request never waits for the check. Bulk mode still checks each
// cover before its insert.
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
type Handler = (req: Request) => Promise<Response>;

const FUNCTIONS = new URL("../supabase/functions/", import.meta.url);
const CANON = seededCanon();
const TOGETHER_API = "https://api.together.xyz/v1/images/generations";
const FLUX2 = "black-forest-labs/FLUX.2-pro";
const FLUX11 = "black-forest-labs/FLUX.1.1-pro";
const GPT_IMAGE = "openai/gpt-image-2";
const HORSES_FACT = "Arjuna's chariot is drawn by exactly four white horses, no more and no fewer";
/** What Together answered on 2026-09-16 when a Regenerate landed during a bulk run. */
const RATE_LIMIT_BODY = "HTTP 429: Too many requests in a short window. Our rate limits are dynamic.";
const NSFW_BODY = "HTTP 422: image may contain NSFW content";
const RATE_LIMITED_MESSAGE =
  "Image generation is rate limited right now (Together HTTP 429): too many renders at once. Wait a minute and try again.";
const REFUSED_MESSAGE = "The image model refused this prompt (content moderation). Edit the prompt and try again.";
const MISSING_COLUMN = { message: "Could not find the 'visual_check' column in the schema cache" };
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** The keys of renderWithVisualCheck's records, which bulk mode stores as before (no started_at). */
const LOOP_RECORD_KEYS = ["attempts", "checked_at", "chosen_attempt", "failed", "image_model", "reason", "status", "unclear"];
const sanitize = (t: string) =>
  t.replace(/\b(battle|war|fight|weapon|sword|arrow|kill|death|blood|fire|burn|destroy|attack|strike|naked|nude|tattered|humiliating|shocking|disorder|defeat)\b/gi, "blessing");

const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  TOGETHER_API_KEY: "together-test",
  ANTHROPIC_API_KEY: "anthropic-test",
};
const ENV: Record<string, string> = {};

// ── Image Playground configurations ──────────────────────────────────────────
// Each configuration below gets its own module instance of the bulk functions (a
// query string loads a separate copy). The functions read image_gen_config on
// every request; the "-reread" instances check that on one instance.
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
// Its own style text and steps, no fallback_model (the primary model is used),
// a portrait fallback size, and a prompt_max_len that lowers every limit.
const STYLE_CFG = {
  model: FLUX2,
  width: 1088,
  height: 1344,
  steps: 30,
  fallback_model: null,
  fallback_width: 768,
  fallback_height: 1024,
  cover_width: 1344,
  cover_height: 1088,
  style_positives: "gentle watercolour wash, pale morning light",
  style_negatives: "NOT gold leaf, NOT neon colours",
  extra_rules: "Every face is calm and serene",
  prompt_max_len: 1500,
  is_active: true,
};
// A long style text, FLUX.1.1-pro at a 1024x1280 fallback size, and a prompt_max_len above 2000.
const LONG_POSITIVES = Array.from({ length: 9 }, () => "gentle watercolour wash in pale morning light").join(", ");
const LONG_CFG = { ...STYLE_CFG, fallback_model: FLUX11, fallback_width: 1024, fallback_height: 1280, style_positives: LONG_POSITIVES, prompt_max_len: 3000 };
type Variant = "" | "-gpt" | "-style" | "-long";
const VARIANT_CFG: Record<Variant, unknown> = { "": null, "-gpt": GPT_CFG, "-style": STYLE_CFG, "-long": LONG_CFG };

const LOADS: Array<[string, string]> = [["regen", "regenerate-chapter-art/index.ts?visual-check"]];
for (const [name, fn] of [["bhagavatam", "bulk-generate-chapter-art"], ["chaitanya", "bulk-generate-chaitanya-art"]]) {
  for (const variant of Object.keys(VARIANT_CFG)) LOADS.push([`${name}${variant}`, `${fn}/index.ts?visual-check${variant}`]);
  LOADS.push([`${name}-reread`, `${fn}/index.ts?visual-check-reread`]);
}

/** A JPEG header plus the render's number, so every Together response is a distinct image. */
const jpeg = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, n]).toString("base64");

/** A running record with started_at blanked (checked separately against ISO). */
const running = (imageModel: string) => ({
  status: "running",
  attempts: 1,
  chosen_attempt: 0,
  failed: [],
  unclear: 0,
  reason: null,
  image_model: imageModel,
  checked_at: null,
  started_at: "",
});

/** Events in the order they happened: "waitUntil", "response", "check answered". */
let order: string[] = [];

// ── Fakes ────────────────────────────────────────────────────────────────────

interface Query {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  single: boolean;
  /** .eq(column, value) filters, in call order. */
  filters: Array<[string, unknown]>;
  /** A write followed by .select(): the written rows come back. */
  returning: boolean;
  /** .or() was called. */
  or: boolean;
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
      const q: Query = { table, op: "select", single: false, filters: [], returning: false, or: false };
      const b: Json = {
        select: () => {
          if (q.op !== "select") q.returning = true;
          return b;
        },
        eq: (column: string, value: unknown) => {
          q.filters.push([column, value]);
          return b;
        },
        in: () => b,
        is: () => b,
        or: () => {
          q.or = true;
          return b;
        },
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

/**
 * Applies an update to a stateful row when every .eq filter matches it, as
 * PostgREST does: a .select() gets the updated rows back, none when nothing matched.
 */
function applyUpdate(row: Json, q: Query) {
  const match = q.filters.every(([column, value]) => row[column] === value);
  if (match) Object.assign(row, q.values);
  return { data: q.returning ? (match ? [{ id: row.id }] : []) : null };
}

const CHAPTER_INDEX = [
  { globalNumber: 10, number: 10, skandh: 1, title: "Chapter Ten", batchNumber: 1, pageNumber: 1 },
  { globalNumber: 11, number: 11, skandh: 1, title: "Chapter Eleven", batchNumber: 1, pageNumber: 2 },
];

interface NetOptions {
  /** Whether Together call n (1-based) returns an image; default every call. */
  imageOk?: (n: number) => boolean;
  /** Answers call n with this HTTP status (and body) instead: how the 429 retry is tested. */
  status?: (n: number) => number | null;
  body?: (n: number) => string;
  /** Whether Together call n throws, as a dropped connection does. */
  throws?: (n: number) => boolean;
  /** Runs while Together call n is in flight, e.g. to move the clock forward. */
  onRender?: (n: number) => void;
}

function makeNet(opts: NetOptions = {}) {
  const together: Json[] = [];
  const fn = async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    if (u === TOGETHER_API) {
      together.push(JSON.parse(String(init.body)));
      const n = together.length;
      opts.onRender?.(n);
      if (opts.throws?.(n)) throw new TypeError("network down");
      const ok = opts.imageOk ? opts.imageOk(n) : true;
      const status = opts.status?.(n) ?? null;
      if (status) return new Response(opts.body?.(n) ?? "busy", { status });
      // The default failure is not re-posted: 429 and every 5xx now get another
      // post (_shared/togetherRetry.ts), and these tests count one post per attempt.
      return ok ? Response.json({ data: [{ b64_json: jpeg(n) }] }) : new Response("bad request", { status: 400 });
    }
    if (u.endsWith("/api/bhagwatham/chapter-index")) return Response.json({ chapters: CHAPTER_INDEX });
    throw new Error(`unexpected fetch ${u}`);
  };
  return { fn, together };
}

/** The numbered facts the check sent to Claude, in order. */
const factsSent = (params: Json): string[] =>
  [...String(params.messages[0].content[1].text).matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]);

/**
 * Answers Claude check call n from plan[n] (the last entry repeats): a number is
 * how many facts, from the first, the painting clearly contradicts; "api_error"
 * throws an APIError 529. With a gate, every answer waits for it.
 */
function makeClaude(plan: Array<number | "api_error">, gate?: Promise<unknown>) {
  const calls: Json[] = [];
  g.__anthropicCreate = async (params: Json, reqOpts: Json) => {
    calls.push({ params, reqOpts });
    const step = plan[Math.min(calls.length - 1, plan.length - 1)];
    if (gate) await gate;
    order.push("check answered");
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

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
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
        order.push("waitUntil");
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
    Date.now = realNow;
  });

  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    Object.assign(ENV, BASE_ENV);
    clockOffset = 0;
    waits = [];
    sleeps = [];
    logs = [];
    order = [];
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

  /**
   * Calls a handler and stops once its Response is returned: background work may
   * still be running. registered is how much work was handed to waitUntil by then.
   */
  async function send(name: string, body: unknown): Promise<{ status: number; json: Json; registered: number }> {
    const res = await handlers[name](
      new Request("http://functions.test/", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    );
    order.push("response");
    const registered = waits.length;
    return { status: res.status, json: await res.json(), registered };
  }

  /** Lets the work handed to EdgeRuntime.waitUntil finish. */
  const settle = () => Promise.all(waits.splice(0));

  async function call(name: string, body: unknown): Promise<{ status: number; json: Json; registered: number }> {
    const result = await send(name, body);
    await settle();
    return result;
  }

  // ── regenerate-chapter-art (flag only: one render, checked after the response)
  describe("regenerate-chapter-art", () => {
    const DRAFT =
      "Krishna, a youthful MALE charioteer with blue skin, holds the reins of Arjuna's chariot on the plain of Kurukshetra while Arjuna, a MALE prince, listens";
    const TABLE = "gita_chapter_art_review";

    function setup(o: NetOptions & { cfg?: unknown; missingColumn?: boolean } = {}) {
      // status and image_path are load-bearing since the Reject-scene work (bd355c17):
      // regenerate-chapter-art refuses a row that is not pending, and saves the new
      // cover with a compare-and-swap on both.
      const row: Json = { id: 5, chapter_number: 1, chapter_title: "Observing the Armies", status: "pending", image_path: "gita-old.jpg", visual_check: null };
      const db = makeDb({
        [TABLE]: (q) => {
          if (q.op === "select") return { data: { ...row } };
          if (q.op === "update" && o.missingColumn && "visual_check" in q.values) return { error: MISSING_COLUMN };
          if (q.op === "update") return applyUpdate(row, q);
          return {};
        },
        image_gen_config: () => ({ data: o.cfg ?? null }),
        scene_visual_canon: () => ({ data: CANON }),
      });
      const net = makeNet(o);
      g.__sb = db;
      g.fetch = net.fn;
      const updates = () => db.writes(TABLE, "update");
      return {
        db,
        net,
        row,
        updates,
        /** The request's own saves of the new image. */
        saves: () => updates().filter((q) => !q.returning),
        /** The background check's compare-and-swap writes. */
        checkWrites: () => updates().filter((q) => q.returning),
      };
    }
    const requestBody = (extra: Record<string, unknown>) => ({ book: "gita", id: 5, prompt: DRAFT, ...extra });
    const regen = (extra: Record<string, unknown> = {}) => call("regen", requestBody(extra));
    const sendRegen = (extra: Record<string, unknown> = {}) => send("regen", requestBody(extra));

    test("a render with facts in its prompt: one Together call, and the row and the response carry the running record", async () => {
      // Arrange
      const { db, net, saves } = setup();
      makeClaude([0]);
      // Act
      const { status, json } = await regen();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 1);
      assert.equal(db.uploads.length, 1);
      assert.equal(db.uploads[0].b64, jpeg(1));
      assert.deepEqual({ ...json.visual_check, started_at: "" }, running(FLUX2));
      assert.match(json.visual_check.started_at, ISO);
      assert.equal(saves().length, 1);
      assert.deepEqual(saves()[0].values.visual_check, json.visual_check);
    });

    test("the check is handed to EdgeRuntime.waitUntil before the Response is returned, and the Response does not wait for Claude", async () => {
      // Arrange: Claude's answer is held back until the Response is out
      const { row, checkWrites } = setup();
      const gate = deferred();
      makeClaude([0], gate.promise);
      let sent: Json = null;
      let writesBeforeAnswer = -1;
      let recordBeforeAnswer: Json = null;
      // Act
      try {
        sent = await sendRegen();
        writesBeforeAnswer = checkWrites().length;
        recordBeforeAnswer = structuredClone(row.visual_check);
      } finally {
        gate.release();
        await settle();
      }
      // Assert
      assert.equal(sent.status, 200, JSON.stringify(sent.json));
      assert.equal(sent.registered, 1);
      assert.deepEqual(order, ["waitUntil", "response", "check answered"]);
      assert.equal(writesBeforeAnswer, 0, "nothing is written before Claude answers");
      assert.equal(recordBeforeAnswer.status, "running");
      assert.equal(checkWrites().length, 1);
      assert.equal(row.visual_check.status, "pass");
    });

    test("the result is written by a compare-and-swap on id and image_path that sets visual_check only", async () => {
      // Arrange
      const { db, row, saves, checkWrites } = setup();
      const claude = makeClaude([0]);
      // Act
      const { json } = await regen();
      // Assert
      assert.equal(checkWrites().length, 1);
      const write = checkWrites()[0];
      assert.deepEqual(write.filters, [["id", 5], ["image_path", saves()[0].values.image_path]]);
      assert.deepEqual(Object.keys(write.values), ["visual_check"]);
      assert.equal(db.queries.some((q) => q.or), false, "no .or() on any query");
      assert.deepEqual({ ...write.values.visual_check, checked_at: "" }, {
        status: "pass",
        attempts: 1,
        chosen_attempt: 0,
        failed: [],
        unclear: 0,
        reason: null,
        image_model: FLUX2,
        checked_at: "",
        started_at: json.visual_check.started_at,
      });
      assert.match(write.values.visual_check.checked_at, ISO);
      assert.deepEqual(row.visual_check, write.values.visual_check);
      assert.equal(claude.length, 1);
      assert.ok(factsSent(claude[0].params).includes(HORSES_FACT), factsSent(claude[0].params).join("\n"));
      assert.equal(claude[0].params.messages[0].content[0].source.data, jpeg(1));
    });

    test("a stale result is ignored: a row whose image changed before the check finished keeps its own record", async () => {
      // Arrange: another regenerate replaces the image while Claude is still answering
      const { row, checkWrites } = setup();
      const gate = deferred();
      makeClaude([1], gate.promise);
      const later = { image_path: "gita-regen-5-later.jpg", visual_check: { status: "running", started_at: "later" } };
      // Act
      try {
        await sendRegen();
        Object.assign(row, structuredClone(later));
      } finally {
        gate.release();
        await settle();
      }
      // Assert
      assert.equal(checkWrites().length, 1, "one compare-and-swap, never retried");
      assert.equal(row.image_path, later.image_path);
      assert.deepEqual(row.visual_check, later.visual_check);
      assert.ok(logs.some((l) => l.startsWith(`[regen-chapter] ${TABLE} #5 visual_check not stored: the row no longer holds gita-regen-5-`)), logs.join("\n"));
    });

    test("a failed check only flags the row: no second render, and the contradicted fact is written", async () => {
      // Arrange
      const { net, row } = setup();
      const claude = makeClaude([1]);
      // Act
      await regen();
      // Assert
      assert.equal(net.together.length, 1);
      assert.equal(claude.length, 1);
      assert.equal(row.visual_check.status, "fail");
      assert.equal(row.visual_check.attempts, 1);
      assert.equal(row.visual_check.chosen_attempt, 0);
      assert.equal(row.visual_check.reason, null);
      assert.deepEqual(row.visual_check.failed, [{ fact: factsSent(claude[0].params)[0], observed: "contradicted 1" }]);
    });

    test("a check error is written as status error, with no second render", async () => {
      // Arrange
      const { net, row } = setup();
      const claude = makeClaude(["api_error"]);
      // Act
      const { status } = await regen();
      // Assert
      assert.equal(status, 200);
      assert.equal(net.together.length, 1);
      assert.equal(claude.length, 1);
      assert.equal(row.visual_check.status, "error");
      assert.equal(row.visual_check.reason, "api_error_529");
    });

    test("the check keeps to the invocation's 360s background budget: a render ending past it writes skipped/deadline, with no Claude call", async () => {
      // Arrange: 345s pass during the render, leaving less than a check's 20s estimate
      const { row } = setup({ onRender: () => (clockOffset += 345_000) });
      const claude = makeClaude([1]);
      // Act
      const { json } = await regen();
      // Assert
      assert.equal(json.visual_check.status, "running");
      assert.equal(claude.length, 0);
      assert.equal(row.visual_check.status, "skipped");
      assert.equal(row.visual_check.reason, "deadline");
    });

    test("a render ending 300s into the invocation is still checked: the old 130s request deadline is gone", async () => {
      // Arrange
      const { row } = setup({ onRender: () => (clockOffset += 300_000) });
      const claude = makeClaude([0]);
      // Act
      await regen();
      // Assert
      assert.equal(claude.length, 1);
      assert.equal(row.visual_check.status, "pass");
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
      test(`no fact in the prompt, ${c.name}: one render exactly as before, skipped/no_facts, and no background check`, async () => {
        // Arrange
        const { net, saves, checkWrites } = setup({ cfg: c.cfg });
        // Act
        const { status, json, registered } = await sendRegen({ apply_facts: false, apply_style: false });
        await settle();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.deepEqual(net.together, [c.body]);
        assert.equal(registered, 0);
        assert.deepEqual({ ...json.visual_check, started_at: "", checked_at: "" }, {
          status: "skipped",
          attempts: 1,
          chosen_attempt: 0,
          failed: [],
          unclear: 0,
          reason: "no_facts",
          image_model: c.body.model,
          checked_at: "",
          started_at: "",
        });
        assert.match(json.visual_check.checked_at, ISO);
        assert.match(json.visual_check.started_at, ISO);
        assert.deepEqual(saves()[0].values.visual_check, json.visual_check);
        assert.equal(checkWrites().length, 0);
      });
    }

    for (const off of [
      { name: "VISUAL_CHECK_ENABLED=false", env: { VISUAL_CHECK_ENABLED: "false" } },
      { name: "no ANTHROPIC_API_KEY", env: { ANTHROPIC_API_KEY: "" } },
    ]) {
      test(`the check switched off (${off.name}): skipped/disabled is stored and no check starts`, async () => {
        // Arrange
        Object.assign(ENV, off.env);
        const { net, saves } = setup();
        // Act
        const { status, json, registered } = await sendRegen();
        await settle();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(net.together.length, 1);
        assert.equal(registered, 0);
        assert.equal(json.visual_check.status, "skipped");
        assert.equal(json.visual_check.reason, "disabled");
        assert.deepEqual(saves()[0].values.visual_check, json.visual_check);
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
      assert.equal(claude.length, 1);
      assert.ok(factsSent(claude[0].params).includes(HORSES_FACT), factsSent(claude[0].params).join("\n"));
    });

    test("facts that did not fit in the prompt are not checked", async () => {
      // Arrange: the reviewer's words alone fill the 2000-char limit
      const { net } = setup();
      const long = Array.from({ length: 14 }, () => DRAFT).join(". ");
      // Act
      const { json, registered } = await sendRegen({ prompt: long });
      await settle();
      // Assert
      assert.ok(logs.some((l) => / facts=[1-9]\d* used=0 /.test(l)), logs.join("\n"));
      assert.equal(net.together.length, 1);
      assert.equal(registered, 0);
      assert.equal(json.visual_check.status, "skipped");
      assert.equal(json.visual_check.reason, "no_facts");
    });

    test("a missing visual_check column still saves the new image, without the record, and starts no check", async () => {
      // Arrange
      const { updates } = setup({ missingColumn: true });
      makeClaude([0]);
      // Act
      const { status, json, registered } = await sendRegen();
      await settle();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(registered, 0);
      assert.equal(updates().length, 2);
      assert.equal("visual_check" in updates()[1].values, false);
      assert.equal(updates()[1].values.image_path, updates()[0].values.image_path);
      assert.ok(logs.some((l) => l.startsWith("WARN [regen-chapter] update with visual_check failed")), logs.join("\n"));
    });

    test("a 429 is re-sent: the same request goes through on the second post and that image is stored", async () => {
      // Arrange: Together rate limits the first post, as it did when a Regenerate landed during a bulk run
      const { db, net, saves } = setup({ status: (n) => (n === 1 ? 429 : null), body: () => RATE_LIMIT_BODY });
      makeClaude([0]);
      // Act
      const { status, json } = await regen();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(net.together.length, 2);
      assert.deepEqual(net.together[1], net.together[0], "the retry is the same request, not the fallback model");
      assert.deepEqual(sleeps, [2500]);
      assert.equal(db.uploads.length, 1);
      assert.equal(db.uploads[0].b64, jpeg(2));
      assert.equal(saves().length, 1);
      assert.ok(
        logs.some((l) => l.startsWith(`[regen-chapter] ${FLUX2} HTTP 429:`) && l.includes(RATE_LIMIT_BODY) && l.endsWith("(rate_limited, retrying)")),
        logs.join("\n"),
      );
    });

    test("a chain that is rate limited throughout answers with the rate-limit wording, not \"All image attempts failed\"", async () => {
      // Arrange
      const { net, saves } = setup({ status: () => 429, body: () => RATE_LIMIT_BODY });
      // Act
      const { status, json, registered } = await sendRegen();
      // Assert
      assert.equal(status, 502);
      assert.equal(json.error, RATE_LIMITED_MESSAGE);
      assert.equal(net.together.length, 6, "two models, three posts each");
      assert.deepEqual(sleeps, [2500, 6000, 2500, 6000]);
      assert.equal(saves().length, 0);
      assert.equal(registered, 0);
    });

    test("a moderation refusal is not re-posted and says to edit the prompt", async () => {
      // Arrange
      const { net, saves } = setup({ status: () => 422, body: () => NSFW_BODY });
      // Act
      const { status, json } = await sendRegen();
      // Assert
      assert.equal(status, 502);
      assert.equal(json.error, REFUSED_MESSAGE);
      assert.equal(net.together.length, 2, "one post per model: the same prompt would only be refused again");
      assert.deepEqual(sleeps, []);
      assert.equal(saves().length, 0);
    });

    test("every image attempt failing answers 502, saves nothing and starts no check", async () => {
      // Arrange
      const { net, saves } = setup({ imageOk: () => false });
      // Act
      const { status, json, registered } = await sendRegen();
      // Assert
      assert.equal(status, 502);
      assert.equal(json.error, "All image attempts failed");
      assert.equal(net.together.length, 2);
      assert.equal(saves().length, 0);
      assert.equal(registered, 0);
    });

    test("a render that throws still answers 500 with its error, and starts no check", async () => {
      // Arrange
      const { saves } = setup({ throws: (n) => n === 1 });
      // Act
      const { status, json, registered } = await sendRegen();
      // Assert
      assert.equal(status, 500);
      assert.match(json.error, /network down/);
      assert.equal(saves().length, 0);
      assert.equal(registered, 0);
    });

    // Config fidelity: the fallback render follows the active configuration and
    // keeps the cover's shape (the configuration's fallback size is portrait).
    const FALLBACK_CASES: Array<{ name: string; cfg: unknown; primary: [number, number]; fallback: Record<string, unknown> }> = [
      {
        name: "no configuration: FLUX.1.1-pro at 1024x832",
        cfg: null,
        primary: [1344, 1088],
        fallback: { model: FLUX11, width: 1024, height: 832 },
      },
      {
        name: "a 768x1024 fallback size: 1024x832 with the configured fallback model and steps",
        cfg: { model: FLUX2, fallback_model: FLUX11, steps: 28, cover_width: 1344, cover_height: 1088, fallback_width: 768, fallback_height: 1024 },
        primary: [1344, 1088],
        fallback: { model: FLUX11, width: 1024, height: 832, steps: 28 },
      },
      {
        name: "a 1024x1280 fallback size: 1280x1024",
        cfg: { model: FLUX2, fallback_model: FLUX11, steps: 28, cover_width: 1344, cover_height: 1088, fallback_width: 1024, fallback_height: 1280 },
        primary: [1344, 1088],
        fallback: { model: FLUX11, width: 1280, height: 1024, steps: 28 },
      },
      {
        name: "no fallback_model: the primary model",
        cfg: { model: FLUX2, fallback_model: null, steps: null, cover_width: 1344, cover_height: 1088, fallback_width: 768, fallback_height: 1024 },
        primary: [1344, 1088],
        fallback: { model: FLUX2, width: 1024, height: 832 },
      },
      {
        name: "no cover size: the scene size and its own fallback size, as before",
        cfg: { model: FLUX2, fallback_model: FLUX11, steps: null, width: 1088, height: 1344, cover_width: null, cover_height: null, fallback_width: 768, fallback_height: 1024 },
        primary: [1088, 1344],
        fallback: { model: FLUX11, width: 768, height: 1024 },
      },
    ];
    for (const c of FALLBACK_CASES) {
      test(`config fidelity, ${c.name}`, async () => {
        // Arrange: the first model fails, so the fallback draws the cover
        const { net } = setup({ cfg: c.cfg, imageOk: (n) => n !== 1 });
        // Act
        const { status, json } = await regen({ apply_facts: false, apply_style: false });
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(net.together.length, 2);
        assert.deepEqual([net.together[0].width, net.together[0].height], c.primary);
        assert.deepEqual(net.together[1], { prompt: DRAFT, n: 1, response_format: "b64_json", ...c.fallback });
        assert.equal(json.visual_check.image_model, c.fallback.model);
      });
    }
  });

  // ── bulk cover functions (chapter/sample: flag only after the response; bulk: checked before insert)
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
  // Over the 1050-char head budget, with no research fact and no sanitizer word.
  const LONG_SCENE = { ...NARADA_SCENE, image_prompt: Array.from({ length: 15 }, () => NARADA_SCENE.image_prompt).join(". ") };
  const CHAITANYA_CHAPTERS = [
    { global_number: 5, part: "adi", number_in_part: 5, title: "Chapter Five", pdf_path: null, ocr_status: "done" },
    { global_number: 6, part: "adi", number_in_part: 6, title: "Chapter Six", pdf_path: null, ocr_status: "done" },
  ];
  const COVERS = [
    { fn: "bulk-generate-chapter-art", name: "bhagavatam", chapter: 10, reviewTable: "bhagavatam_chapter_art_review", scenesTable: "bhagavatam_chapter_scenes" },
    { fn: "bulk-generate-chaitanya-art", name: "chaitanya", chapter: 5, reviewTable: "chaitanya_chapter_art_review", scenesTable: "chaitanya_chapter_scenes" },
  ];

  for (const cover of COVERS) {
    describe(cover.fn, () => {
      function setup(
        o: NetOptions & { scene?: unknown; variant?: Variant; missingColumn?: boolean; cfgResult?: { data?: unknown; error?: { message: string } } } = {},
      ) {
        const rows: Json[] = [];
        const db = makeDb({
          image_gen_config: () => o.cfgResult ?? { data: VARIANT_CFG[o.variant ?? ""] },
          bhagwatham_personas: () => ({ data: [] }),
          chaitanya_chapters: (q) => ({ data: q.single ? CHAITANYA_CHAPTERS[0] : CHAITANYA_CHAPTERS }),
          [cover.scenesTable]: (q) => ({ data: q.op === "select" ? { scenes: [o.scene ?? CHARIOT_SCENE], used_scene_indexes: [] } : null }),
          [cover.reviewTable]: (q) => {
            if (q.op === "insert") {
              if (o.missingColumn && "visual_check" in q.values) return { error: MISSING_COLUMN };
              const row = { id: 7 + rows.length, ...q.values };
              rows.push(row);
              return { data: { id: row.id } };
            }
            if (q.op === "update") {
              const row = rows.find((r) => q.filters.some(([column, value]) => column === "id" && r.id === value));
              return row ? applyUpdate(row, q) : { data: q.returning ? [] : null };
            }
            return { data: q.single ? null : [] };
          },
          scene_visual_canon: () => ({ data: CANON }),
        });
        const net = makeNet(o);
        g.__sb = db;
        g.fetch = net.fn;
        return {
          db,
          net,
          rows,
          inserts: () => db.writes(cover.reviewTable, "insert"),
          /** The background check's compare-and-swap writes. */
          checkWrites: () => db.writes(cover.reviewTable, "update").filter((q) => q.returning),
        };
      }
      const chapterBody = { mode: "chapter", chapter_global_number: cover.chapter };
      const chapterMode = (variant: Variant = "") => call(`${cover.name}${variant}`, chapterBody);
      const sendChapter = (variant: Variant = "") => send(`${cover.name}${variant}`, chapterBody);
      const inPromptCount = () => {
        const line = logs.find((l) => l.startsWith(`[${cover.fn}] research `)) ?? "";
        return Number(/ inPrompt=(\d+) /.exec(line)?.[1] ?? NaN);
      };

      test("chapter mode inserts the cover with a running record and returns that record as visualCheck", async () => {
        // Arrange
        const { db, net, inserts } = setup();
        makeClaude([0]);
        // Act
        const { status, json, registered } = await sendChapter();
        await settle();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(net.together.length, 1);
        assert.equal(registered, 1);
        assert.deepEqual({ ...json.visualCheck, started_at: "" }, { ...running(FLUX2), safe_fallback: false });
        assert.match(json.visualCheck.started_at, ISO);
        assert.equal(inserts().length, 1);
        assert.deepEqual(inserts()[0].values.visual_check, json.visualCheck);
        assert.equal(db.uploads[0].b64, jpeg(1));
      });

      test("chapter mode hands the check to EdgeRuntime.waitUntil before the Response, and checks exactly the facts in the prompt after it", async () => {
        // Arrange: Claude's answer is held back until the Response is out
        const { net, rows, checkWrites } = setup();
        const gate = deferred();
        const claude = makeClaude([0], gate.promise);
        let sent: Json = null;
        let writesBeforeAnswer = -1;
        // Act
        try {
          sent = await sendChapter();
          writesBeforeAnswer = checkWrites().length;
        } finally {
          gate.release();
          await settle();
        }
        // Assert
        assert.equal(sent.json.ok, true, JSON.stringify(sent.json));
        assert.equal(sent.registered, 1);
        assert.deepEqual(order, ["waitUntil", "response", "check answered"]);
        assert.equal(writesBeforeAnswer, 0, "nothing is written before Claude answers");
        assert.equal(claude.length, 1);
        const facts = factsSent(claude[0].params);
        assert.ok(facts.includes(HORSES_FACT), facts.join("\n"));
        assert.ok(net.together[0].prompt.includes(HORSES_FACT));
        assert.equal(facts.length, inPromptCount(), logs.join("\n"));
        assert.equal(claude[0].params.messages[0].content[0].source.data, jpeg(1));
        assert.equal(rows[0].visual_check.status, "pass");
      });

      test("the result is written by a compare-and-swap on id and image_path, with safe_fallback kept false", async () => {
        // Arrange
        const { db, rows, inserts, checkWrites } = setup();
        makeClaude([0]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(checkWrites().length, 1);
        const write = checkWrites()[0];
        assert.deepEqual(write.filters, [["id", json.pendingId], ["image_path", inserts()[0].values.image_path]]);
        assert.deepEqual(Object.keys(write.values), ["visual_check"]);
        assert.equal(db.queries.some((q) => q.or), false, "no .or() on any query");
        assert.deepEqual({ ...write.values.visual_check, checked_at: "" }, {
          status: "pass",
          attempts: 1,
          chosen_attempt: 0,
          failed: [],
          unclear: 0,
          reason: null,
          image_model: FLUX2,
          checked_at: "",
          started_at: json.visualCheck.started_at,
          safe_fallback: false,
        });
        assert.match(write.values.visual_check.checked_at, ISO);
        assert.deepEqual(rows[0].visual_check, write.values.visual_check);
      });

      test("sample mode takes the same path: a running record in the response, then the check after it", async () => {
        // Arrange
        const { net, rows } = setup();
        makeClaude([0]);
        // Act
        const { status, json, registered } = await send(cover.name, { mode: "sample" });
        await settle();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(registered, 1);
        assert.equal(json.visualCheck.status, "running");
        assert.equal(net.together.length, 1);
        assert.equal(rows[0].visual_check.status, "pass");
      });

      test("a failed check only flags the cover: no re-render, and the contradicted fact is written", async () => {
        // Arrange
        const { net, rows } = setup();
        const claude = makeClaude([1]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(net.together.length, 1);
        assert.equal(claude.length, 1);
        assert.equal(rows[0].visual_check.status, "fail");
        assert.equal(rows[0].visual_check.attempts, 1);
        assert.equal(rows[0].visual_check.chosen_attempt, 0);
        assert.deepEqual(rows[0].visual_check.failed, [{ fact: factsSent(claude[0].params)[0], observed: "contradicted 1" }]);
      });

      test("a check error is written as status error, with no second render", async () => {
        // Arrange
        const { net, rows } = setup();
        const claude = makeClaude(["api_error"]);
        // Act
        await chapterMode();
        // Assert
        assert.equal(net.together.length, 1);
        assert.equal(claude.length, 1);
        assert.equal(rows[0].visual_check.status, "error");
        assert.equal(rows[0].visual_check.reason, "api_error_529");
      });

      test("a stale result is ignored: a cover replaced before the check finished keeps its own record", async () => {
        // Arrange: regenerate-chapter-art replaces the cover while Claude is still answering
        const { rows, checkWrites } = setup();
        const gate = deferred();
        makeClaude([1], gate.promise);
        const later = { image_path: "art-regen-7-later.jpg", visual_check: { status: "running", started_at: "later" } };
        // Act
        try {
          await sendChapter();
          Object.assign(rows[0], structuredClone(later));
        } finally {
          gate.release();
          await settle();
        }
        // Assert
        assert.equal(checkWrites().length, 1, "one compare-and-swap, never retried");
        assert.equal(rows[0].image_path, later.image_path);
        assert.deepEqual(rows[0].visual_check, later.visual_check);
        assert.ok(logs.some((l) => l.startsWith(`[${cover.fn}] visual_check for #7 not stored: the row no longer holds`)), logs.join("\n"));
      });

      test("the check keeps to the invocation's 360s background budget: a render ending past it writes skipped/deadline", async () => {
        // Arrange: 345s pass during the render
        const { rows } = setup({ onRender: () => (clockOffset += 345_000) });
        const claude = makeClaude([1]);
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(json.visualCheck.status, "running");
        assert.equal(claude.length, 0);
        assert.equal(rows[0].visual_check.status, "skipped");
        assert.equal(rows[0].visual_check.reason, "deadline");
      });

      test("no fact in the prompt: skipped/no_facts, no background check, and the FLUX request is exactly as before", async () => {
        // Arrange
        const { net, inserts } = setup({ scene: NARADA_SCENE });
        // Act
        const { json, registered } = await sendChapter();
        await settle();
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(inPromptCount(), 0, logs.join("\n"));
        assert.equal(registered, 0);
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
          assert.equal(body.prompt, sanitize(`${NARADA_SCENE.image_prompt}, ${tail}`));
        }
        assert.equal(json.visualCheck.status, "skipped");
        assert.equal(json.visualCheck.reason, "no_facts");
        assert.equal(json.visualCheck.safe_fallback, false);
        assert.deepEqual(inserts()[0].values.visual_check, json.visualCheck);
      });

      test("an openai/gpt-image-2 config sends no seed or steps; the FLUX fallback gets its seed, the configured steps and a cover-shaped size", async () => {
        // Arrange: the gpt-image-2 request fails, so the FLUX.1.1-pro fallback draws the image
        const { net, inserts } = setup({ variant: "-gpt", scene: NARADA_SCENE, imageOk: (n) => n !== 1 });
        // Act
        const { json } = await chapterMode("-gpt");
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(net.together.length, 2);
        assert.deepEqual(Object.keys(net.together[0]).sort(), ["height", "model", "n", "prompt", "response_format", "width"]);
        assert.equal(net.together[0].model, GPT_IMAGE);
        assert.equal(net.together[1].model, FLUX11);
        assert.equal(typeof net.together[1].seed, "number");
        assert.equal(net.together[1].steps, 28);
        assert.deepEqual([net.together[1].width, net.together[1].height], [1024, 832]);
        assert.equal(inserts()[0].values.visual_check.image_model, FLUX11);
      });

      test("an image drawn from SAFE_FALLBACK carries no facts: skipped/safe_fallback with safe_fallback true, and no background check", async () => {
        // Arrange
        const { net, inserts } = setup({ imageOk: (n) => n === 3 });
        const claude = makeClaude([1]);
        // Act
        const { json, registered } = await sendChapter();
        await settle();
        // Assert
        assert.equal(net.together.length, 3);
        assert.equal(registered, 0);
        assert.equal(claude.length, 0);
        assert.doesNotMatch(net.together[2].prompt, /four white horses/);
        assert.equal(json.visualCheck.status, "skipped");
        assert.equal(json.visualCheck.reason, "safe_fallback");
        assert.equal(json.visualCheck.attempts, 1);
        assert.equal(json.visualCheck.safe_fallback, true);
        assert.equal(json.visualCheck.image_model, FLUX11);
        assert.deepEqual(inserts()[0].values.visual_check, json.visualCheck);
      });

      test("a missing visual_check column still inserts the cover, without the record, and starts no check", async () => {
        // Arrange
        const { inserts, checkWrites } = setup({ missingColumn: true });
        makeClaude([0]);
        // Act
        const { json, registered } = await sendChapter();
        await settle();
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(registered, 0);
        assert.equal(inserts().length, 2);
        assert.equal("visual_check" in inserts()[1].values, false);
        assert.equal(inserts()[1].values.image_path, inserts()[0].values.image_path);
        assert.equal(checkWrites().length, 0);
        assert.ok(logs.some((l) => l.startsWith(`WARN [${cover.fn}] insert with visual_check failed`)), logs.join("\n"));
      });

      test("the check switched off (VISUAL_CHECK_ENABLED=false): skipped/disabled and no background check", async () => {
        // Arrange
        ENV.VISUAL_CHECK_ENABLED = "false";
        const { inserts } = setup();
        // Act
        const { json, registered } = await sendChapter();
        await settle();
        // Assert
        assert.equal(registered, 0);
        assert.equal(json.visualCheck.status, "skipped");
        assert.equal(json.visualCheck.reason, "disabled");
        assert.deepEqual(inserts()[0].values.visual_check, json.visualCheck);
      });

      test("config fidelity: every attempt sends the configured steps, the primary model stands in for a missing fallback_model, and the fallback keeps the cover's shape", async () => {
        // Arrange: only the SAFE_FALLBACK attempt draws, so all three requests are seen
        const { net, inserts } = setup({ variant: "-style", imageOk: (n) => n === 3 });
        // Act
        const { json, registered } = await sendChapter("-style");
        await settle();
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.deepEqual(net.together.map((b: Json) => [b.model, b.width, b.height, b.steps]), [
          [FLUX2, 1344, 1088, 30],
          [FLUX2, 1024, 832, 30],
          [FLUX2, 1024, 832, 30],
        ]);
        assert.equal(typeof net.together[0].seed, "number");
        assert.equal(net.together[1].seed, net.together[0].seed);
        assert.equal("seed" in net.together[2], false);
        assert.ok(net.together[2].prompt.startsWith("A wide landscape oil-painting scene from"), net.together[2].prompt.slice(0, 80));
        assert.equal(registered, 0);
        assert.equal(json.visualCheck.reason, "safe_fallback");
        assert.equal(json.visualCheck.image_model, FLUX2);
        assert.deepEqual(inserts()[0].values.visual_check, json.visualCheck);
      });

      test("config fidelity: a 1024x1280 fallback size falls back at 1280x1024, with the configured fallback model", async () => {
        // Arrange: the first model fails
        const { net } = setup({ variant: "-long", scene: NARADA_SCENE, imageOk: (n) => n !== 1 });
        // Act
        const { json } = await chapterMode("-long");
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.deepEqual(net.together.map((b: Json) => [b.model, b.width, b.height, b.steps]), [
          [FLUX2, 1344, 1088, 30],
          [FLUX11, 1280, 1024, 30],
        ]);
        assert.equal(json.visualCheck.image_model, FLUX11);
      });

      test("config fidelity: the configured style text takes the place of the function's own, and the book's rules and the wide composition stay", async () => {
        // Arrange
        const { net } = setup({ variant: "-style", scene: NARADA_SCENE });
        // Act
        const { json } = await chapterMode("-style");
        // Assert
        assert.equal(json.ok, true, JSON.stringify(json));
        const prompt: string = net.together[0].prompt;
        const styled = `${NARADA_SCENE.image_prompt}, ${STYLE_CFG.style_positives}, WIDE landscape composition, ${STYLE_CFG.style_negatives}. ${STYLE_CFG.extra_rules}. ABSOLUTE GENDER RULES`;
        assert.ok(prompt.startsWith(styled), prompt.slice(0, 300));
        assert.doesNotMatch(prompt, /museum-quality|Raja Ravi Varma/);
        assert.match(prompt, /ABSOLUTE ANACHRONISM RULES \((Vedic\/Puranic era|Medieval Bengal)/);
        if (cover.fn === "bulk-generate-chapter-art") {
          const expected = `${NARADA_SCENE.image_prompt}, ${STYLE_CFG.style_positives}, WIDE landscape composition, ${STYLE_CFG.style_negatives}. ${STYLE_CFG.extra_rules}. ${GENDER_RULES.substring(0, 200)} ${ANACHRONISM_RULES.substring(0, 540)}`;
          assert.equal(prompt, sanitize(expected));
        }
      });

      test("config fidelity: prompt_max_len is the prompt limit (none cuts near 2000, 1500 cuts at 1500, 3000 lets it pass 2000 uncut)", async () => {
        // Arrange
        const lengths: Record<string, number> = {};
        const prompts: Record<string, string> = {};
        // Act
        for (const variant of ["", "-style", "-long"] as Variant[]) {
          const { net } = setup({ variant, scene: LONG_SCENE });
          const { json } = await chapterMode(variant);
          assert.equal(json.ok, true, `${variant}: ${JSON.stringify(json)}`);
          prompts[variant] = net.together[0].prompt;
          lengths[variant] = prompts[variant].length;
        }
        // Assert
        assert.ok(lengths[""] >= 1980 && lengths[""] <= 2000, String(lengths[""]));
        assert.equal(lengths["-style"], 1500);
        assert.ok(lengths["-long"] > 2000 && lengths["-long"] <= 2980, String(lengths["-long"]));
        assert.ok(prompts["-long"].includes(`${LONG_POSITIVES}, WIDE landscape composition`), prompts["-long"].slice(1000, 1200));
        if (cover.fn === "bulk-generate-chapter-art") {
          const expected = `${LONG_SCENE.image_prompt.substring(0, 1050)}, ${LONG_POSITIVES}, WIDE landscape composition, ${STYLE_CFG.style_negatives}. ${STYLE_CFG.extra_rules}. ${GENDER_RULES.substring(0, 200)} ${ANACHRONISM_RULES.substring(0, 540)}`;
          assert.equal(prompts["-long"], sanitize(expected));
        }
      });

      test("a 429 is re-sent: the same request goes through on the second post and that cover is stored", async () => {
        // Arrange
        const { db, net, inserts } = setup({ status: (n) => (n === 1 ? 429 : null), body: () => RATE_LIMIT_BODY });
        makeClaude([0]);
        // Act
        const { status, json } = await chapterMode();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.equal(net.together.length, 2);
        assert.deepEqual(net.together[1], net.together[0], "the retry is the same request, not the fallback model");
        assert.deepEqual(sleeps, [2500]);
        assert.equal(db.uploads[0].b64, jpeg(2));
        assert.equal(inserts().length, 1);
      });

      test("a chain that is rate limited throughout fails the chapter with the rate-limit wording", async () => {
        // Arrange
        const { net, inserts } = setup({ status: () => 429, body: () => RATE_LIMIT_BODY });
        // Act
        const { json } = await chapterMode();
        // Assert
        assert.equal(json.ok, false, JSON.stringify(json));
        assert.equal(json.error, `Error: ${RATE_LIMITED_MESSAGE}`);
        assert.equal(net.together.length, 9, "three attempts, three posts each");
        assert.deepEqual(sleeps, [2500, 6000, 2500, 6000, 2500, 6000]);
        assert.equal(inserts().length, 0);
      });

      test("bulk mode is unchanged: the cover is checked before its insert, stops at 2 renders when every check fails, and needs no compare-and-swap", async () => {
        // Arrange
        const { net, inserts, checkWrites } = setup();
        makeClaude([1]);
        // Act
        const { status, json, registered } = await send(cover.name, { mode: "bulk", limit: 1 });
        await settle();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(registered, 1, "only the run itself is waitUntil work");
        assert.equal(net.together.length, 2);
        assert.equal(inserts().length, 1);
        const record = inserts()[0].values.visual_check;
        assert.deepEqual(Object.keys(record).sort(), [...LOOP_RECORD_KEYS, "safe_fallback"].sort());
        assert.equal(record.status, "fail");
        assert.equal(record.attempts, 2);
        assert.equal(record.reason, "max_attempts");
        assert.equal(checkWrites().length, 0);
      });

      test("bulk mode, a re-render never falls back to SAFE_FALLBACK: when its facts attempts fail the loop stops (render_failed) and keeps the checked cover", async () => {
        // Arrange: render 0 draws with FLUX.2-pro and fails its check; re-render 1's model and fallback requests both fail
        const { db, net, inserts } = setup({ imageOk: (n) => n === 1 || n === 4 });
        const claude = makeClaude([1]);
        // Act
        await call(cover.name, { mode: "bulk", limit: 1 });
        // Assert: no SAFE_FALLBACK image is paid for, since the loop could only discard it
        assert.equal(net.together.length, 3);
        for (const body of net.together) assert.match(body.prompt, /four white horses/);
        assert.equal(claude.length, 1);
        assert.equal(db.uploads[0].b64, jpeg(1));
        const record = inserts()[0].values.visual_check;
        assert.equal(record.status, "fail");
        assert.equal(record.attempts, 2);
        assert.equal(record.chosen_attempt, 0);
        assert.equal(record.reason, "render_failed");
        assert.equal(record.safe_fallback, false);
        assert.equal(record.image_model, FLUX2);
      });

      test("bulk mode still falls back to SAFE_FALLBACK on the first render, where nothing else could be stored", async () => {
        // Arrange: only the first render's SAFE_FALLBACK request draws
        const { net, inserts } = setup({ imageOk: (n) => n === 3 });
        const claude = makeClaude([1]);
        // Act
        await call(cover.name, { mode: "bulk", limit: 1 });
        // Assert
        assert.equal(net.together.length, 3);
        assert.doesNotMatch(net.together[2].prompt, /four white horses/);
        assert.equal(claude.length, 0, "a SAFE_FALLBACK image is not checked");
        const record = inserts()[0].values.visual_check;
        assert.equal(record.reason, "safe_fallback");
        assert.equal(record.safe_fallback, true);
      });

      test("chapter mode reads the configuration on every request: after a failed read (the function's own chain) the next request on the same instance uses the active row", async () => {
        // Arrange + Act: one module instance, a failed read, then a readable active row
        const failed = setup({ scene: NARADA_SCENE, cfgResult: { error: { message: "timeout" } } });
        const first = await call(`${cover.name}-reread`, chapterBody);
        const active = setup({ scene: NARADA_SCENE, cfgResult: { data: STYLE_CFG } });
        const second = await call(`${cover.name}-reread`, chapterBody);
        // Assert
        assert.equal(first.json.ok, true, JSON.stringify(first.json));
        assert.equal(second.json.ok, true, JSON.stringify(second.json));
        const [a] = failed.net.together;
        const [b] = active.net.together;
        assert.deepEqual([a.model, a.width, a.height, a.steps ?? null], [FLUX2, 1344, 1088, null]);
        assert.match(a.prompt, /museum-quality/);
        assert.deepEqual([b.model, b.width, b.height, b.steps], [FLUX2, 1344, 1088, 30]);
        assert.ok(b.prompt.includes(STYLE_CFG.style_positives), b.prompt.slice(0, 200));
        assert.doesNotMatch(b.prompt, /museum-quality/);
        assert.ok(logs.includes(`WARN [${cover.fn}] image_gen_config read failed (timeout); using the built-in defaults`), logs.join("\n"));
      });

      test("chapter mode picks up a newly approved configuration on the next request of the same instance", async () => {
        // Arrange + Act
        const old = setup({ scene: NARADA_SCENE, cfgResult: { data: GPT_CFG }, imageOk: () => true });
        await call(`${cover.name}-reread`, chapterBody);
        const approved = setup({ scene: NARADA_SCENE, cfgResult: { data: STYLE_CFG } });
        await call(`${cover.name}-reread`, chapterBody);
        // Assert
        assert.equal(old.net.together[0].model, GPT_IMAGE);
        assert.deepEqual([approved.net.together[0].model, approved.net.together[0].steps], [FLUX2, 30]);
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
