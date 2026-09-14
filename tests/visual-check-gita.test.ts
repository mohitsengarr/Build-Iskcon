// Handler-level tests for the visual check in generate-gita-chapter-art.
//
// The function's index.ts is imported under node with its Deno-only specifiers
// stubbed (helpers/edge-function-hooks.mjs, helpers/npm-stub-hooks.mjs). The real
// _shared/sceneResearch.ts and _shared/visualCheck.ts run. Research has no
// Firecrawl key here, so the facts are exactly the canon rows the fake
// scene_visual_canon returns. Together, the raw Claude brief call and the vision
// check (globalThis.__anthropicCreate) are faked. No network, no real keys.
//
// The check runs after the response: a chapter is stored with a "running" record
// and its check is handed to EdgeRuntime.waitUntil, faked here to collect the
// promises. call() awaits them unless told not to, and afterEach() opens any held
// check and awaits the rest, so no background work outlives its test. The fake
// database applies update filters to the rows it holds and returns rows only to a
// write that selects them, as PostgREST does, so the compare-and-swap write is
// tested against rows that changed.
//
// The module is loaded with a query string, so this file gets its own copy of the
// handler beside the one scene-research-wiring.test.ts loads. Globals are
// installed in before() and restored in after(); Date.now is replaced per test by
// a clock that stands still except when the fake Together moves it forward, so
// the time guards are tested at their exact boundaries.
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { seededCanon } from "./helpers/seed-canon.ts";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
register("./helpers/edge-function-hooks.mjs", import.meta.url);
// deno-lint-ignore no-explicit-any
const { APIError }: any = await import("./helpers/anthropic-stub.mjs");
// The same module instance the function imports: the tests set when the worker started.
// deno-lint-ignore no-explicit-any
const visualCheckIo: any = await import("../supabase/functions/_shared/visualCheck.ts");

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
// deno-lint-ignore no-explicit-any
type Json = any;

const FUNCTION_URL = new URL("../supabase/functions/generate-gita-chapter-art/index.ts?visual-check", import.meta.url).href;
const TOGETHER = "https://api.together.xyz/v1/images/generations";
const CLAUDE_RAW = "https://api.anthropic.com/v1/messages";
const TABLE = "gita_chapter_art_review";
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
const FLUX11 = "black-forest-labs/FLUX.1.1-pro";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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
/** Outside calls in the order they were made: "brief", "render n", "check n". */
let events: string[] = [];
/** open() of every gate a test made, so afterEach can release a check a failed test left held. */
const openGates: Array<() => void> = [];

type Filter = [string, unknown];
interface Write {
  table: string;
  op: string;
  values: Json;
  filters: Filter[];
  selected: boolean;
}

const missingColumnError = (code: string) => ({
  code,
  message:
    code === "42703"
      ? 'column "visual_check" of relation "gita_chapter_art_review" does not exist'
      : "Could not find the 'visual_check' column of 'gita_chapter_art_review' in the schema cache",
});

/**
 * gita_chapter_art_review rows live in `rows` (by id), as inserted and then
 * updated. An update changes every row its eq filters match; a write returns rows
 * only when it selects them. missingColumn fails every write that carries
 * visual_check: an insert with PGRST204, an update with that code.
 */
function makeDb(o: { canon?: unknown[]; cfg?: unknown; chaptersWithArt?: number[]; missingColumn?: string; updateError?: Json } = {}) {
  const writes: Write[] = [];
  const uploads: Array<{ path: string; bytes: Uint8Array }> = [];
  const rows = new Map<number, Json>();
  let nextId = 100;
  return {
    writes,
    uploads,
    rows,
    inserts: () => writes.filter((w) => w.table === TABLE && w.op === "insert").map((w) => w.values),
    updates: () => writes.filter((w) => w.table === TABLE && w.op === "update"),
    from(table: string) {
      let op = "select";
      let values: Json;
      let selected = false;
      const filters: Filter[] = [];
      const b: Json = {
        select: () => ((selected = true), b),
        eq: (col: string, v: unknown) => (filters.push([col, v]), b),
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
          if (op !== "select") writes.push({ table, op, values, filters: [...filters], selected });
          let data: unknown = null;
          let error: unknown = null;
          if (table === "scene_visual_canon") data = o.canon ?? CANON;
          else if (table === "image_gen_config") data = o.cfg ?? null;
          else if (table === TABLE) {
            if (op === "insert") {
              if (o.missingColumn && "visual_check" in values) error = missingColumnError("PGRST204");
              else {
                const id = nextId++;
                rows.set(id, { id, ...values });
                data = selected ? { id } : null;
              }
            } else if (op === "update") {
              if (o.missingColumn && "visual_check" in values) error = missingColumnError(o.missingColumn);
              else if (o.updateError) error = o.updateError;
              else {
                const hit = [...rows.values()].filter((r) => filters.every(([col, v]) => r[col] === v));
                for (const r of hit) Object.assign(r, values);
                data = selected ? hit.map((r) => ({ id: r.id })) : null;
              }
            } else {
              data = (o.chaptersWithArt ?? []).map((n) => ({ chapter_number: n }));
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

/**
 * Together answers render n (1-based request count) with image(n); null is an
 * HTTP 503. Each render moves the clock renderMs (a number, or a function of n).
 */
function makeFetch(o: { image?: (n: number) => string | null; renderMs?: number | ((n: number) => number) } = {}) {
  const together: Array<{ raw: string; body: Json }> = [];
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
  g.fetch = async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    if (u === TOGETHER) {
      const raw = String(init.body);
      together.push({ raw, body: JSON.parse(raw) });
      const n = together.length;
      events.push(`render ${n}`);
      clock.offset += typeof o.renderMs === "function" ? o.renderMs(n) : (o.renderMs ?? 0);
      const b64 = o.image ? o.image(n) : jpeg(n);
      return b64 ? json({ data: [{ b64_json: b64 }] }) : new Response("busy", { status: 503 });
    }
    if (u === CLAUDE_RAW) {
      events.push("brief");
      return json({ content: [{ type: "text", text: JSON.stringify(BRIEF) }] });
    }
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

/** The vision check answers call n with replies[n-1] (the last reply repeats). A gate holds every answer until it opens. */
function vision(replies: Reply[], o: { gate?: Promise<void> } = {}) {
  const calls: Array<{ params: Json; reqOpts: Json; details: string[] }> = [];
  g.__anthropicCreate = async (params: Json, reqOpts: Json) => {
    assert.equal(params?.tools?.[0]?.name, "record_visual_check", "only the visual check may call the SDK here");
    const text: string = params.messages[0].content[1].text;
    const details = [...text.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1]);
    calls.push({ params, reqOpts, details });
    events.push(`check ${calls.length}`);
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (o.gate) await o.gate;
    return reply(details);
  };
  return calls;
}

/** A promise that stays pending until open() is called. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = () => resolve();
  });
  openGates.push(open);
  return { opened, open };
}

/** Rejects when p is still pending after ms: a handler that waited for a held check fails instead of hanging. */
function within<T>(p: Promise<T>, ms = 5_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still pending after ${ms}ms`)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

const bytesOf = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));

// ── Suite ────────────────────────────────────────────────────────────────────

describe("generate-gita-chapter-art visual check", () => {
  const SAVED = ["Deno", "EdgeRuntime", "fetch", "__sb", "__anthropicCreate"];
  const saved: Record<string, { had: boolean; value: unknown }> = {};
  const realNow = Date.now;
  const realLog = console.log;
  const realWarn = console.warn;
  const realError = console.error;
  let handler: (req: Request) => Promise<Response>;
  let logs: string[] = [];
  let waits: Promise<unknown>[] = [];

  before(async () => {
    for (const k of SAVED) saved[k] = { had: k in g, value: g[k] };
    Object.assign(ENV, BASE_ENV);
    g.Deno = {
      env: { get: (k: string) => ENV[k] },
      serve: (h: typeof handler) => {
        handler = h;
      },
    };
    g.EdgeRuntime = {
      waitUntil: (p: Promise<unknown>) => {
        waits.push(p);
      },
    };
    await import(FUNCTION_URL);
    assert.equal(typeof handler, "function", "generate-gita-chapter-art did not register a handler");
  });

  // Each request counts its background deadline from its own start, as on a fresh
  // worker.
  let workerStartBefore: unknown = null;
  before(() => {
    workerStartBefore = visualCheckIo.setWorkerStartedAt(null);
  });

  after(() => {
    visualCheckIo.setWorkerStartedAt(workerStartBefore);
    for (const k of SAVED) {
      if (saved[k].had) g[k] = saved[k].value;
      else delete g[k];
    }
  });

  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    Object.assign(ENV, BASE_ENV);
    clock.offset = 0;
    const base = realNow();
    Date.now = () => base + clock.offset;
    logs = [];
    events = [];
    waits = [];
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

  afterEach(async () => {
    for (const open of openGates.splice(0)) open();
    await settle();
    Date.now = realNow;
    console.log = realLog;
    console.warn = realWarn;
    console.error = realError;
  });

  /** Waits for every background task handed to EdgeRuntime.waitUntil so far. */
  function settle() {
    return Promise.all(waits.splice(0));
  }

  /** Posts body. queued: how many background tasks the handler had handed to waitUntil when it returned. */
  async function call(body: unknown, o: { settle?: boolean } = {}): Promise<{ status: number; json: Json; queued: number }> {
    const res = await handler(
      new Request("http://functions.test/", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    );
    const queued = waits.length;
    const json = await res.json();
    if (o.settle !== false) await settle();
    return { status: res.status, json, queued };
  }

  test("facts in the prompt: one render, the row is stored running, the response carries that record, and the check's pass is written over it afterwards", async () => {
    // Arrange
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch();
    const checks = vision([allYes]);
    // Act
    const { status, json, queued } = await call({ chapter: 1 });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(together.length, 1);
    assert.equal(queued, 1, "the check is handed to EdgeRuntime.waitUntil before the handler returns");
    const [inserted] = db.inserts();
    assert.equal(inserted.status, "pending");
    const { started_at: startedAt, ...running } = inserted.visual_check;
    assert.deepEqual(running, { status: "running", attempts: 1, chosen_attempt: 0, failed: [], unclear: 0, reason: null, image_model: FLUX, checked_at: null });
    assert.match(startedAt, ISO);
    assert.deepEqual(json.generated, [
      {
        chapter: 1,
        id: 100,
        image_url: `https://storage.test/${inserted.image_path}`,
        visual_check: { status: "running", attempts: 1, chosen_attempt: 0, failed: 0, unclear: 0, reason: null, image_model: FLUX },
      },
    ]);
    assert.deepEqual(db.uploads[0].bytes, bytesOf(jpeg(1)));
    assert.equal(checks.length, 1);
    const { params, details } = checks[0];
    assert.deepEqual(params.messages[0].content[0].source, { type: "base64", media_type: "image/jpeg", data: jpeg(1) });
    assert.ok(details.some((d) => HORSES.test(d)), `canon horse fact expected in the check: ${details.join(" | ")}`);
    for (const d of details) assert.ok(together[0].body.prompt.includes(d), `checked fact missing from the prompt: ${d}`);
    const updates = db.updates();
    assert.equal(updates.length, 1);
    assert.deepEqual(Object.keys(updates[0].values), ["visual_check"], "the background write changes visual_check only");
    assert.deepEqual(updates[0].filters, [["id", 100], ["image_path", inserted.image_path]]);
    const { checked_at: checkedAt, ...final } = db.rows.get(100).visual_check;
    assert.deepEqual(final, { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], unclear: 0, reason: null, image_model: FLUX, started_at: startedAt });
    assert.match(checkedAt, ISO);
  });

  test("a contradicted fact is flagged on the row and never re-rendered: status fail with the fact and what the painting shows", async () => {
    // Arrange
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch();
    const checks = vision([horsesWrong, allYes]);
    // Act
    const { json } = await call({ chapter: 1 });
    // Assert
    assert.equal(together.length, 1, "flag only: no second render");
    assert.equal(checks.length, 1);
    assert.equal(db.uploads.length, 1);
    assert.equal(db.inserts().length, 1);
    const row = db.rows.get(json.generated[0].id);
    assert.equal(row.image_path, db.inserts()[0].image_path, "the stored image stays");
    const record = row.visual_check;
    assert.equal(record.status, "fail");
    assert.equal(record.attempts, 1);
    assert.equal(record.chosen_attempt, 0);
    assert.equal(record.reason, null);
    assert.equal(record.failed.length, 1);
    assert.match(record.failed[0].fact, HORSES);
    assert.equal(record.failed[0].observed, "3 horses counted");
    assert.equal(json.generated[0].visual_check.status, "running");
    assert.ok(logs.some((l) => l.startsWith("[visual-check] gita-art ch1 background check status=fail failed=1")), logs.join("\n"));
  });

  test("the response does not wait for the check: it is sent while the check is still open, and the record lands when the check ends", async () => {
    // Arrange
    const db = makeDb();
    g.__sb = db;
    makeFetch();
    const held = gate();
    const checks = vision([horsesWrong], { gate: held.opened });
    // Act
    const { status, json, queued } = await within(call({ chapter: 1 }, { settle: false }));
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(queued, 1);
    assert.equal(checks.length, 1, "the check has started");
    assert.equal(db.updates().length, 0, "nothing is written before the check ends");
    assert.equal(db.rows.get(json.generated[0].id).visual_check.status, "running");
    held.open();
    await settle();
    assert.equal(db.updates().length, 1);
    assert.equal(db.rows.get(json.generated[0].id).visual_check.status, "fail");
  });

  const REGENERATED = { status: "pass", attempts: 1, chosen_attempt: 0, failed: [], unclear: 0, reason: null, image_model: FLUX, checked_at: "2026-09-14T08:00:00.000Z" };
  for (const c of [
    {
      name: "a row regenerated before the check ended keeps the new image's record",
      change: (db: ReturnType<typeof makeDb>, id: number) => {
        Object.assign(db.rows.get(id), { image_path: `gita-regen-${id}-1.jpg`, visual_check: REGENERATED });
      },
    },
    {
      name: "a row deleted before the check ended stays deleted",
      change: (db: ReturnType<typeof makeDb>, id: number) => {
        db.rows.delete(id);
      },
    },
  ]) {
    test(`compare-and-swap on the stored image: ${c.name}, and the skipped write is logged`, async () => {
      // Arrange
      const db = makeDb();
      g.__sb = db;
      makeFetch();
      const held = gate();
      vision([horsesWrong], { gate: held.opened });
      const { json } = await within(call({ chapter: 1 }, { settle: false }));
      const id = json.generated[0].id;
      const storedPath = db.inserts()[0].image_path;
      c.change(db, id);
      // Act
      held.open();
      await settle();
      // Assert
      const updates = db.updates();
      assert.equal(updates.length, 1, "written once, never retried");
      assert.deepEqual(updates[0].filters, [["id", id], ["image_path", storedPath]]);
      if (db.rows.has(id)) assert.deepEqual(db.rows.get(id).visual_check, REGENERATED);
      else assert.equal(db.rows.size, 0);
      assert.ok(logs.includes(`WARN [gita-art] ch1 visual_check not stored: the row no longer holds ${storedPath}`), logs.join("\n"));
    });
  }

  for (const code of ["PGRST204", "42703"]) {
    test(`a missing visual_check column (${code} on the background write): the chapter is saved without the record, and the write is logged and ignored`, async () => {
      // Arrange
      const db = makeDb({ missingColumn: code });
      g.__sb = db;
      makeFetch();
      const checks = vision([allYes]);
      // Act
      const { status, json } = await call({ chapter: 1 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(json.ok, true, JSON.stringify(json));
      assert.deepEqual(json.errors, []);
      const inserts = db.inserts();
      assert.equal(inserts.length, 2);
      assert.ok("visual_check" in inserts[0]);
      const { visual_check: _dropped, ...withoutRecord } = inserts[0];
      assert.deepEqual(inserts[1], withoutRecord);
      assert.ok(logs.some((l) => l.startsWith("WARN [gita-art] insert with visual_check failed")), logs.join("\n"));
      assert.equal(json.generated[0].visual_check.status, "running");
      assert.equal(checks.length, 1);
      assert.equal(db.updates().length, 1, "written once, never retried");
      assert.equal("visual_check" in db.rows.get(json.generated[0].id), false);
      assert.ok(logs.includes("WARN [gita-art] ch1 visual_check not stored: the visual_check column is missing"), logs.join("\n"));
    });
  }

  test("any other error on the background write is logged and ignored", async () => {
    // Arrange
    const db = makeDb({ updateError: { code: "57014", message: "canceling statement due to statement timeout" } });
    g.__sb = db;
    makeFetch();
    vision([allYes]);
    // Act
    const { status, json } = await call({ chapter: 1 });
    // Assert
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(db.updates().length, 1, "written once, never retried");
    assert.equal(db.rows.get(json.generated[0].id).visual_check.status, "running");
    assert.ok(
      logs.includes("WARN [gita-art] ch1 visual_check not stored: update failed (57014 canceling statement due to statement timeout)"),
      logs.join("\n"),
    );
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
    assert.equal(db.rows.get(json.generated[0].id).visual_check.status, "pass");
  });

  for (const c of [
    { name: "an API error", reply: (() => { throw new APIError(529, "overloaded"); }) as Reply, reason: "api_error_529" },
    { name: "a refusal", reply: (() => ({ stop_reason: "refusal", content: [] })) as Reply, reason: "refusal" },
    { name: "a reply with no tool call", reply: (() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "looks fine" }] })) as Reply, reason: "no_tool" },
  ]) {
    test(`check error (${c.name}): recorded on the row as error, nothing re-rendered`, async () => {
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
      const record = db.rows.get(json.generated[0].id).visual_check;
      assert.equal(record.status, "error");
      assert.equal(record.attempts, 1);
      assert.equal(record.reason, c.reason);
      assert.equal(json.generated[0].visual_check.status, "running");
    });
  }

  test("VISUAL_CHECK_ENABLED=false: one render, stored skipped/disabled, and no background check", async () => {
    // Arrange
    ENV.VISUAL_CHECK_ENABLED = "false";
    const db = makeDb();
    g.__sb = db;
    const together = makeFetch();
    const checks = vision([horsesWrong]);
    // Act
    const { json, queued } = await call({ chapter: 1 });
    // Assert
    assert.equal(together.length, 1);
    assert.equal(queued, 0);
    assert.equal(checks.length, 0);
    assert.equal(db.updates().length, 0);
    const { checked_at: checkedAt, started_at: startedAt, ...rest } = db.inserts()[0].visual_check;
    assert.deepEqual(rest, { status: "skipped", attempts: 1, chosen_attempt: 0, failed: [], unclear: 0, reason: "disabled", image_model: FLUX });
    assert.match(checkedAt, ISO);
    assert.match(startedAt, ISO);
    assert.equal(json.generated[0].visual_check.reason, "disabled");
  });

  describe("multi-chapter runs", () => {
    test("the gallery's { missing: true, limit: 3 }: every chapter is stored running and its own check starts as its row is written", async () => {
      // Arrange: about 25s a chapter
      const db = makeDb();
      g.__sb = db;
      makeFetch({ renderMs: 25_000 });
      const checks = vision([allYes, horsesWrong, allYes]);
      // Act
      const { status, json, queued } = await call({ missing: true, limit: 3 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.deepEqual(json.generated.map((r: Json) => r.chapter), [1, 2, 3]);
      assert.deepEqual(json.errors, []);
      assert.deepEqual(json.skipped, []);
      assert.equal(queued, 3);
      assert.deepEqual(json.generated.map((r: Json) => r.visual_check.status), ["running", "running", "running"]);
      // Each check starts right after its own chapter is stored, before the next chapter's brief.
      assert.deepEqual(events, ["brief", "render 1", "check 1", "brief", "render 2", "check 2", "brief", "render 3", "check 3"]);
      assert.equal(checks.length, 3);
      const inserted = db.inserts();
      json.generated.forEach((r: Json, i: number) => {
        const update = db.updates().find((u) => u.filters[0][1] === r.id);
        assert.deepEqual(update?.filters, [["id", r.id], ["image_path", inserted[i].image_path]], `chapter ${r.chapter}`);
      });
      assert.deepEqual(json.generated.map((r: Json) => db.rows.get(r.id).visual_check.status), ["pass", "fail", "pass"]);
      const started = inserted.map((row: Json) => Date.parse(row.visual_check.started_at));
      assert.deepEqual([started[1] - started[0], started[2] - started[1]], [25_000, 25_000], "each chapter keeps its own started_at");
    });

    test("every check of a run shares request start + 360s: a chapter stored 345s in is marked skipped/deadline without a check", async () => {
      // Arrange: chapter 1 is stored 90s in (chapter 2 may still start), chapter 2 another 255s later
      const db = makeDb();
      g.__sb = db;
      makeFetch({ renderMs: (n) => (n === 1 ? 90_000 : 255_000) });
      const checks = vision([allYes]);
      // Act
      const { json, queued } = await call({ missing: true, limit: 2 });
      // Assert
      assert.deepEqual(json.generated.map((r: Json) => r.chapter), [1, 2]);
      assert.equal(queued, 2);
      assert.equal(checks.length, 1);
      assert.equal(checks[0].reqOpts.timeout, 40_000);
      const [first, second] = json.generated.map((r: Json) => db.rows.get(r.id).visual_check);
      assert.equal(first.status, "pass");
      assert.equal(second.status, "skipped");
      assert.equal(second.reason, "deadline");
      assert.equal(second.attempts, 1);
      assert.match(second.checked_at, ISO);
      assert.equal(json.generated[1].visual_check.status, "running");
    });

    test("boundary: a check queued 330s in gets the 30s left before request start + 360s as its timeout", async () => {
      // Arrange
      const db = makeDb();
      g.__sb = db;
      makeFetch({ renderMs: 330_000 });
      const checks = vision([allYes]);
      // Act
      const { json } = await call({ chapter: 1 });
      // Assert
      assert.equal(checks.length, 1);
      assert.equal(checks[0].reqOpts.timeout, 30_000);
      assert.equal(db.rows.get(json.generated[0].id).visual_check.status, "pass");
    });

    test("boundary: a later chapter still starts exactly 95s in, when it can just be stored by request start + 140s", async () => {
      // Arrange: another chapter needs about 45s
      const db = makeDb();
      g.__sb = db;
      makeFetch({ renderMs: 95_000 });
      vision([allYes]);
      // Act
      const { json } = await call({ missing: true, limit: 2 });
      // Assert
      assert.deepEqual(json.generated.map((r: Json) => r.chapter), [1, 2]);
      assert.deepEqual(json.skipped, []);
    });

    test("a later chapter that could not be stored before the request is cut (1ms past 95s) is not started: it is listed in skipped", async () => {
      // Arrange: chapter 1 is stored 95.001s in; another chapter needs about 45s, past request start + 140s
      const db = makeDb();
      g.__sb = db;
      const together = makeFetch({ renderMs: 95_001 });
      const checks = vision([allYes]);
      // Act
      const { status, json, queued } = await call({ missing: true, limit: 3 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(json.ok, true);
      assert.deepEqual(json.generated.map((r: Json) => r.chapter), [1]);
      assert.deepEqual(json.errors, []);
      assert.deepEqual(json.skipped, [{ chapter: 2, reason: "deadline" }, { chapter: 3, reason: "deadline" }]);
      assert.equal(together.length, 1, "no render is paid for a skipped chapter");
      assert.equal(events.filter((e) => e === "brief").length, 1, "no brief is paid for a skipped chapter");
      assert.equal(db.inserts().length, 1);
      assert.equal(queued, 1, "the stored chapter's check still runs");
      assert.equal(checks.length, 1);
    });

    test("a chapter whose renders all fail does not stop the next one, and only the stored chapter's check is queued", async () => {
      // Arrange: chapter 1's model and fallback both fail; chapter 2's first render works
      const db = makeDb();
      g.__sb = db;
      const together = makeFetch({ image: (n) => (n <= 2 ? null : jpeg(n)) });
      const checks = vision([allYes]);
      // Act
      const { json, queued } = await call({ missing: true, limit: 2 });
      // Assert
      assert.equal(together.length, 3);
      assert.deepEqual(json.errors, [{ chapter: 1, error: "Error: All image attempts failed for chapter 1" }]);
      assert.deepEqual(json.generated.map((r: Json) => r.chapter), [2]);
      assert.equal(queued, 1);
      assert.equal(checks.length, 1);
      assert.equal(checks[0].params.messages[0].content[0].source.data, jpeg(3));
    });
  });

  describe("no research facts", () => {
    const COVER_CFG = {
      model: FLUX,
      width: 1088,
      height: 1344,
      cover_width: 1344,
      cover_height: 1088,
      steps: 28,
      fallback_model: FLUX11,
      is_active: true,
    };

    for (const c of [
      { name: "no config (DEFAULTS)", cfg: null, model: FLUX, w: 1088, h: 1344, steps: null },
      { name: "a FLUX config with steps", cfg: COVER_CFG, model: FLUX, w: 1344, h: 1088, steps: 28 },
    ]) {
      test(`${c.name}: one render stored skipped/no_facts, no background check, and the Together request is byte-identical to the one sent before`, async () => {
        // Arrange
        const db = makeDb({ canon: [], cfg: c.cfg });
        g.__sb = db;
        const together = makeFetch();
        const checks = vision([horsesWrong]);
        // Act
        const { status, json, queued } = await call({ chapter: 1 });
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(together.length, 1);
        assert.equal(queued, 0);
        assert.equal(checks.length, 0);
        const [row] = db.inserts();
        assert.equal(together[0].raw, JSON.stringify(baselinePayload(row.prompt, c.model, c.w, c.h, c.steps)));
        assert.equal(row.visual_check.status, "skipped");
        assert.equal(row.visual_check.reason, "no_facts");
        assert.equal(row.visual_check.attempts, 1);
        assert.equal(db.updates().length, 0);
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
      const [row] = db.inserts();
      const expected = baselinePayload(row.prompt, "openai/gpt-image-2", 1344, 1088, null);
      assert.equal(together[0].raw, JSON.stringify(expected));
      assert.equal(row.visual_check.image_model, "openai/gpt-image-2");
    });
  });

  describe("config fidelity: every render follows the active image_gen_config row", () => {
    const PLAYGROUND = {
      model: FLUX,
      width: 1088,
      height: 1344,
      cover_width: 1344,
      cover_height: 1088,
      ig_width: 1344,
      ig_height: 768,
      steps: 30,
      fallback_model: FLUX11,
      fallback_width: 768,
      fallback_height: 1024,
      style_positives: "PLAYGROUND POSITIVES oil painting",
      style_negatives: "PLAYGROUND NEGATIVES not cartoon",
      extra_rules: "PLAYGROUND RULES vedic era only",
      prompt_max_len: 1800,
      is_active: true,
    };

    test("the model renders at the cover size with the config's steps, and the config's style and rules reach the prompt instead of DEFAULTS", async () => {
      // Arrange: no facts, so the prompt is scene, style and rules
      const db = makeDb({ canon: [], cfg: PLAYGROUND });
      g.__sb = db;
      const together = makeFetch();
      // Act
      await call({ chapter: 1 });
      // Assert
      assert.equal(together.length, 1);
      const { model, width, height, steps, prompt } = together[0].body;
      assert.deepEqual({ model, width, height, steps }, { model: FLUX, width: 1344, height: 1088, steps: 30 });
      for (const part of [PLAYGROUND.style_positives, PLAYGROUND.style_negatives, PLAYGROUND.extra_rules]) {
        assert.ok(prompt.includes(part), `${part} missing: ${prompt}`);
      }
      assert.equal(prompt.includes("Raja Ravi Varma"), false, "DEFAULTS style must not be used with an active row");
    });

    test("the config's prompt_max_len cuts a prompt without facts", async () => {
      // Arrange
      const db = makeDb({ canon: [], cfg: { ...PLAYGROUND, prompt_max_len: 300 } });
      g.__sb = db;
      const together = makeFetch();
      // Act
      await call({ chapter: 1 });
      // Assert
      const { prompt } = together[0].body;
      assert.ok(prompt.length <= 300, `${prompt.length} chars`);
      assert.ok(prompt.startsWith(BRIEF.imagePrompt), prompt);
    });

    test("with facts, the prompt is assembled to the config's prompt_max_len", async () => {
      // Arrange
      const db = makeDb({ cfg: PLAYGROUND });
      g.__sb = db;
      const together = makeFetch();
      vision([allYes]);
      // Act
      await call({ chapter: 1 });
      // Assert
      const line = logs.find((l) => l.startsWith("[gita-art] research key=")) ?? "";
      assert.match(line, / sent=\d+\/1800/, line);
      assert.ok(together[0].body.prompt.length <= 1800);
    });

    // The fallback keeps the cover's shape at the configured fallback size's scale:
    // its long side, the other side from the cover's proportions, rounded to 32
    // (regenerate-chapter-art and the bulk cover writers do the same).
    for (const c of [
      { name: "no active row: the DEFAULTS fallback model at the portrait render's shape", cfg: null, first: [1088, 1344], fallback: [FLUX11, 832, 1024], steps: undefined },
      { name: "a portrait 768x1024 fallback size keeps the landscape cover's shape: 1024x832", cfg: PLAYGROUND, first: [1344, 1088], fallback: [FLUX11, 1024, 832], steps: 30 },
      {
        name: "a landscape fallback size of the cover's shape is used as it is",
        cfg: { ...PLAYGROUND, fallback_width: 1024, fallback_height: 832 },
        first: [1344, 1088],
        fallback: [FLUX11, 1024, 832],
        steps: 30,
      },
      {
        name: "a 1024x1280 fallback size falls back at 1280x1024, as regenerate-chapter-art does",
        cfg: { ...PLAYGROUND, fallback_width: 1024, fallback_height: 1280 },
        first: [1344, 1088],
        fallback: [FLUX11, 1280, 1024],
        steps: 30,
      },
      {
        name: "no fallback size set: the cover's shape at 1024",
        cfg: { ...PLAYGROUND, fallback_width: null, fallback_height: null },
        first: [1344, 1088],
        fallback: [FLUX11, 1024, 832],
        steps: 30,
      },
      {
        name: "no cover size set: the portrait render keeps a portrait fallback of its shape",
        cfg: { ...PLAYGROUND, cover_width: null, cover_height: null, fallback_width: 1024, fallback_height: 768 },
        first: [1088, 1344],
        fallback: [FLUX11, 832, 1024],
        steps: 30,
      },
      {
        name: "no fallback model set: the config's model renders the fallback",
        cfg: { ...PLAYGROUND, fallback_model: null },
        first: [1344, 1088],
        fallback: [FLUX, 1024, 832],
        steps: 30,
      },
    ]) {
      test(`the model fails, then ${c.name}`, async () => {
        // Arrange
        const db = makeDb({ cfg: c.cfg });
        g.__sb = db;
        const together = makeFetch({ image: (n) => (n === 1 ? null : jpeg(n)) });
        vision([allYes]);
        // Act
        const { json } = await call({ chapter: 1 });
        // Assert
        assert.equal(together.length, 2);
        const [first, second] = together.map((t) => t.body);
        assert.deepEqual([first.model, first.width, first.height], [FLUX, ...c.first]);
        assert.deepEqual([second.model, second.width, second.height], c.fallback);
        assert.equal(second.steps, c.steps);
        assert.equal(second.prompt, first.prompt);
        assert.equal(json.generated[0].visual_check.image_model, c.fallback[0]);
      });
    }
  });

  describe("render failures", () => {
    test("the main model fails and the fallback renders: the fallback image is stored, recorded with its model and checked", async () => {
      // Arrange
      const db = makeDb();
      g.__sb = db;
      const together = makeFetch({ image: (n) => (n === 1 ? null : jpeg(n)) });
      const checks = vision([allYes]);
      // Act
      const { json } = await call({ chapter: 1 });
      // Assert
      assert.equal(together.length, 2);
      assert.equal(together[1].body.model, FLUX11);
      assert.deepEqual(db.uploads[0].bytes, bytesOf(jpeg(2)));
      assert.equal(db.inserts()[0].visual_check.image_model, FLUX11);
      assert.equal(json.generated[0].visual_check.image_model, FLUX11);
      assert.equal(checks.length, 1);
      assert.equal(checks[0].params.messages[0].content[0].source.data, jpeg(2));
      const record = db.rows.get(json.generated[0].id).visual_check;
      assert.equal(record.status, "pass");
      assert.equal(record.image_model, FLUX11);
    });

    test("every model failing: the chapter fails as before, with no row and no check", async () => {
      // Arrange
      const db = makeDb();
      g.__sb = db;
      const together = makeFetch({ image: () => null });
      const checks = vision([allYes]);
      // Act
      const { status, json, queued } = await call({ chapter: 1 });
      // Assert
      assert.equal(status, 200);
      assert.equal(json.ok, false);
      assert.equal(together.length, 2);
      assert.equal(queued, 0);
      assert.equal(checks.length, 0);
      assert.equal(db.inserts().length, 0);
      assert.deepEqual(json.errors, [{ chapter: 1, error: "Error: All image attempts failed for chapter 1" }]);
    });

    test("a Together request that throws fails the chapter with its own error, with no row and no check", async () => {
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
      const { json, queued } = await call({ chapter: 1 });
      // Assert
      assert.equal(queued, 0);
      assert.equal(checks.length, 0);
      assert.equal(db.inserts().length, 0);
      assert.deepEqual(json.errors, [{ chapter: 1, error: "TypeError: connection reset" }]);
    });
  });
});
