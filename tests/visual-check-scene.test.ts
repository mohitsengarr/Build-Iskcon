// Handler tests for the visual check in generate-scene-image.
// The edge function's index.ts is imported under node with its Deno-only
// specifiers stubbed (helpers/edge-function-hooks.mjs, helpers/npm-stub-hooks.mjs).
// Database and storage are fakes (globalThis.__sb) that hold the scene row, fetch
// is a fake for Together and the raw Claude (Haiku) call, the Claude SDK stub
// answers the vision check (globalThis.__anthropicCreate) and EdgeRuntime.waitUntil
// is a fake that collects the background work. The real _shared/sceneResearch.ts
// and _shared/visualCheck.ts run. No network, no real keys, no paid calls.
//
// The Gallery calls this function, so the check only flags: one render, the image
// stored and returned with a "running" (or skipped) record, then one vision check
// after the response that writes its record over it while the scene still holds
// that image. Nothing is ever re-rendered.
//
// Research runs canon-only (no FIRECRAWL_API_KEY), so an Arjuna scene gets the
// seeded chariot facts and a Dhruva scene gets none, and every SDK call seen
// here is a vision check.
//
// Globals, including Date.now (faked so slow calls can be simulated), are
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
// The same module instance the function imports: the tests set when the worker started.
// deno-lint-ignore no-explicit-any
const visualCheckIo: any = await import("../supabase/functions/_shared/visualCheck.ts");

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
const FOUR_HORSES = "Arjuna's chariot is drawn by exactly four white horses, no more and no fewer";
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
  fallback_model: "black-forest-labs/FLUX.1.1-pro" as string | null,
  fallback_width: 768 as number | null,
  fallback_height: 1024 as number | null,
  is_active: true,
};
const GPT_CFG = { ...FLUX_CFG, model: "openai/gpt-image-2", width: 1344, height: 1088, fallback_model: "openai/gpt-image-2" };
// An active row whose every render value differs from the function's built-in
// DEFAULTS, so a render that used a default instead of the row shows up.
const DISTINCT_CFG = {
  ...FLUX_CFG,
  model: "black-forest-labs/FLUX.2-flex",
  width: 1024,
  height: 1280,
  steps: 30,
  style_positives: "temple mural in mineral pigments",
  style_negatives: "NOT neon",
  extra_rules: "No lettering anywhere.",
  prompt_max_len: 150,
  fallback_model: "black-forest-labs/FLUX.1-dev",
  fallback_width: 832,
  fallback_height: 1040,
  ig_width: 1080,
  ig_height: 1350,
  cover_width: 1600,
  cover_height: 900,
};

const PGRST204 = { code: "PGRST204", message: "Could not find the 'visual_check' column of 'reader_scenes' in the schema cache" };

/** A JPEG header plus one render-specific byte, so each Together response is a distinct image. */
const jpeg = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, n]).toString("base64");

/** The prompt the function built before research existed: scene, style, rules, cut to prompt_max_len, sanitised. */
const legacyPrompt = (visual: string, cfg: typeof FLUX_CFG) =>
  sanitizeForImageModel(`${visual}, ${cfg.style_positives}, ${cfg.style_negatives}. ${cfg.extra_rules}`.slice(0, cfg.prompt_max_len));

// ── Fakes ────────────────────────────────────────────────────────────────────

interface Query {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  filters: Array<[string, unknown]>;
  values?: Json;
  /** The columns an update asked back for with .select(). */
  returning?: string;
}

/** A reader_scenes update failure: {code, message} comes back as the error, an Error is thrown. */
type Failure = { code: string; message: string } | Error | null;

/**
 * A fake database holding the one scene row. An update is applied only when every
 * .eq filter matches the row, and with .select() it returns the rows it updated.
 */
function makeDb(o: { cfg: unknown; cfgError?: Json; canon?: unknown[]; row?: Json; updateError?: (values: Json) => Failure }) {
  const queries: Query[] = [];
  const uploads: Array<{ path: string; bytes: Uint8Array }> = [];
  const row: Json = {
    id: SCENE_ID,
    book: "Bhagavad Gita",
    selected_text: "अर्जुन अपने रथ पर खड़े हैं",
    status: "pending",
    image_generated: false,
    image_url: null,
    visual_check: null,
    ...o.row,
  };
  return {
    queries,
    uploads,
    row,
    sceneUpdates: () => queries.filter((q) => q.table === "reader_scenes" && q.op === "update"),
    from(table: string) {
      const q: Query = { table, op: "select", filters: [] };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: (cols?: string) => {
          if (q.op === "update") q.returning = cols ?? "*";
          return b;
        },
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
          if (table === "reader_scenes" && q.op === "select") data = { ...row };
          if (table === "image_gen_config") {
            data = o.cfgError ? null : o.cfg;
            error = o.cfgError ?? null;
          }
          if (table === "scene_visual_canon") data = o.canon ?? CANON;
          if (table === "reader_scenes" && q.op === "update") {
            const failure = o.updateError?.(q.values) ?? null;
            if (failure instanceof Error) return Promise.reject(failure).then(res, rej);
            if (failure) {
              error = failure;
            } else {
              const matches = q.filters.every(([col, v]) => row[col] === v);
              if (matches) Object.assign(row, q.values);
              if (q.returning !== undefined) data = matches ? [{ id: row.id }] : [];
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

type Check = { fact_index: number; verdict: string; observed: string };

describe("generate-scene-image visual check", () => {
  const SAVED_GLOBALS = ["Deno", "fetch", "__sb", "__anthropicCreate", "EdgeRuntime"];
  const saved: Record<string, { had: boolean; value: unknown }> = {};
  const realNow = Date.now;
  const realLog = console.log;
  const realWarn = console.warn;
  const realError = console.error;
  let handler: Handler | null = null;
  let clockOffset = 0;
  let logs: string[] = [];
  /** Work the handler handed to EdgeRuntime.waitUntil. */
  let background: Array<Promise<unknown>> = [];
  let gates: Array<() => void> = [];

  before(async () => {
    for (const k of SAVED_GLOBALS) saved[k] = { had: k in g, value: g[k] };
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

  // Each request counts its background deadline from its own start, as on a fresh
  // worker.
  let workerStartBefore: unknown = null;
  before(() => {
    workerStartBefore = visualCheckIo.setWorkerStartedAt(null);
  });

  after(() => {
    visualCheckIo.setWorkerStartedAt(workerStartBefore);
    for (const k of SAVED_GLOBALS) {
      if (saved[k].had) g[k] = saved[k].value;
      else delete g[k];
    }
  });

  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    Object.assign(ENV, BASE_ENV);
    clockOffset = 0;
    Date.now = () => realNow() + clockOffset;
    logs = [];
    background = [];
    gates = [];
    g.EdgeRuntime = {
      waitUntil: (p: Promise<unknown>) => {
        background.push(p);
      },
    };
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
    // A test that failed before releasing its gate or awaiting its background work
    // must not leak that work into the next test.
    for (const release of gates) release();
    await Promise.allSettled(background);
    Date.now = realNow;
    console.log = realLog;
    console.warn = realWarn;
    console.error = realError;
  });

  /** Fake network. `renderMs` / `haikuMs` move the fake clock forward to simulate slow calls. */
  function setup(o: {
    visual: string;
    cfg?: unknown;
    cfgError?: Json;
    imageOk?: (n: number) => boolean;
    renderMs?: number;
    haikuMs?: number;
    canon?: unknown[];
    row?: Json;
    updateError?: (values: Json) => Failure;
  }) {
    const db = makeDb({
      cfg: "cfg" in o ? o.cfg : FLUX_CFG,
      cfgError: o.cfgError,
      canon: o.canon,
      row: o.row,
      updateError: o.updateError,
    });
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

  /** Answers each vision check from `answer(callIndex, factCount)`, which may wait; an Error is thrown. Records the params. */
  function vision(answer: (call: number, factCount: number) => unknown) {
    const calls: Json[] = [];
    g.__anthropicCreate = async (params: Json, reqOpts: Json) => {
      calls.push({ params, reqOpts });
      const text: string = params.messages[0].content[1].text;
      const factCount = [...text.matchAll(/^\d+\. /gm)].length;
      const r = await answer(calls.length, factCount);
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

  /** A gate a vision answer can wait on, so a test can look at the row while the check is in flight. */
  function hold() {
    let release = () => {};
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    gates.push(release);
    return { promise, release };
  }

  /** Calls the handler. handedBeforeResponse counts the work already handed to waitUntil when the Response came back. */
  async function run(): Promise<{ status: number; json: Json; handedBeforeResponse: number }> {
    const res = await (handler as Handler)(
      new Request("http://functions.test/", { method: "POST", body: JSON.stringify({ scene_id: SCENE_ID }), headers: { "content-type": "application/json" } }),
    );
    const handedBeforeResponse = background.length;
    return { status: res.status, json: await res.json(), handedBeforeResponse };
  }

  /** Waits for the background work (runInBackground's promises never reject). */
  const settle = () => Promise.all(background);

  /** The reader_scenes updates that stored the image. */
  const imageSaves = (db: ReturnType<typeof makeDb>) => db.sceneUpdates().filter((q) => q.values?.status === "generated");
  /** The background check's writes: reader_scenes updates of visual_check alone. */
  const checkWrites = (db: ReturnType<typeof makeDb>) =>
    db.sceneUpdates().filter((q) => Object.keys(q.values ?? {}).join() === "visual_check");
  const researchLine = () => logs.find((l) => l.startsWith("[scene] research key=")) ?? "";
  const uploadedB64 = (db: ReturnType<typeof makeDb>) => Buffer.from(db.uploads.at(-1)!.bytes).toString("base64");
  /** started_at is when the check was queued: within a second of `at` on the fake clock. */
  const assertStartedAt = (value: unknown, at: number) =>
    assert.ok(Math.abs(Date.parse(String(value)) - at) < 1000, `started_at ${value} is not ${new Date(at).toISOString()}`);

  // ── No facts: the request to Together is the pre-check request ─────────────

  describe("with no research facts", () => {
    // The body the function sent before the visual check existed: the
    // pre-research prompt, and steps only when set.
    const legacyBody = (cfg: typeof FLUX_CFG, withSteps: boolean) => {
      const body: Record<string, unknown> = {
        model: cfg.model,
        prompt: legacyPrompt(DHRUVA_VISUAL, cfg),
        width: cfg.width,
        height: cfg.height,
        n: 1,
        response_format: "b64_json",
      };
      if (withSteps && cfg.steps && cfg.steps > 0) body.steps = cfg.steps;
      return body;
    };

    const CASES: Array<{ name: string; cfg: typeof FLUX_CFG; withSteps: boolean }> = [
      { name: "FLUX, no steps", cfg: FLUX_CFG, withSteps: true },
      { name: "FLUX with steps: steps still sent", cfg: { ...FLUX_CFG, steps: 28 }, withSteps: true },
      { name: "openai/gpt-image-2 with steps configured: no steps, no seed", cfg: { ...GPT_CFG, steps: 28 }, withSteps: false },
    ];
    for (const c of CASES) {
      test(`${c.name}: one render with exactly the pre-check Together body, a skipped/no_facts record and no background check`, async () => {
        // Arrange
        const { db, together } = setup({ visual: DHRUVA_VISUAL, cfg: c.cfg });
        const calls = vision((_, n) => reply(n));
        const t0 = Date.now();
        // Act
        const { status, json, handedBeforeResponse } = await run();
        await settle();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.match(researchLine(), / facts=0 /, logs.join("\n"));
        assert.equal(together.length, 1);
        assert.deepEqual(together[0], legacyBody(c.cfg, c.withSteps));
        assert.equal(handedBeforeResponse, 0);
        assert.equal(background.length, 0);
        assert.equal(calls.length, 0);
        const { checked_at, started_at, ...rest } = db.row.visual_check;
        assert.deepEqual(rest, {
          status: "skipped",
          attempts: 1,
          chosen_attempt: 0,
          failed: [],
          unclear: 0,
          reason: "no_facts",
          image_model: c.cfg.model,
        });
        assert.ok(!Number.isNaN(Date.parse(checked_at)), String(checked_at));
        assertStartedAt(started_at, t0);
        assert.deepEqual(json.visual_check, db.row.visual_check, "the response carries the stored record");
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
      assert.equal(db.row.visual_check.image_model, FLUX_CFG.fallback_model);
      assert.equal(json.model_used, FLUX_CFG.model, "model_used is unchanged: the configured model");
    });

    test("every image attempt failing still fails the scene, with no visual_check written and no background check", async () => {
      // Arrange
      const { db, together } = setup({ visual: ARJUNA_VISUAL, imageOk: () => false });
      // Act
      const { status, json, handedBeforeResponse } = await run();
      // Assert
      assert.equal(status, 502);
      assert.equal(json.error, "All image attempts failed");
      assert.equal(together.length, 2);
      assert.equal(db.uploads.length, 0);
      const updates = db.sceneUpdates().map((q) => q.values);
      assert.deepEqual(updates.at(-1), { status: "failed", error_message: "All image attempts failed" });
      assert.equal(updates.some((v) => "visual_check" in v), false);
      assert.equal(handedBeforeResponse, 0);
      assert.equal(background.length, 0);
    });
  });

  // ── Config fidelity: every render value comes from the active row ──────────

  describe("render configuration", () => {
    test("both attempts take model, size, steps, style, rules and prompt_max_len from the active image_gen_config row", async () => {
      // Arrange: the first model fails, so the fallback attempt is sent too
      const full = `${DHRUVA_VISUAL}, ${DISTINCT_CFG.style_positives}, ${DISTINCT_CFG.style_negatives}. ${DISTINCT_CFG.extra_rules}`;
      assert.ok(full.length > DISTINCT_CFG.prompt_max_len, "the fixture must exercise the prompt_max_len cut");
      const { db, together } = setup({ visual: DHRUVA_VISUAL, cfg: DISTINCT_CFG, imageOk: (n) => n !== 1 });
      // Act
      const { status, json } = await run();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      const prompt = legacyPrompt(DHRUVA_VISUAL, DISTINCT_CFG);
      const base = { prompt, n: 1, response_format: "b64_json", steps: DISTINCT_CFG.steps };
      assert.deepEqual(together, [
        { ...base, model: DISTINCT_CFG.model, width: DISTINCT_CFG.width, height: DISTINCT_CFG.height },
        { ...base, model: DISTINCT_CFG.fallback_model, width: DISTINCT_CFG.fallback_width, height: DISTINCT_CFG.fallback_height },
      ]);
      assert.equal(db.row.visual_check.image_model, DISTINCT_CFG.fallback_model);
      assert.equal(json.model_used, DISTINCT_CFG.model);
      assert.equal(logs.some((l) => l.includes("built-in defaults")), false, logs.join("\n"));
    });

    test("a row with no fallback model or size falls back to its own model and size, not the built-in defaults", async () => {
      // Arrange
      const cfg = { ...DISTINCT_CFG, fallback_model: null, fallback_width: null, fallback_height: null };
      const { together } = setup({ visual: DHRUVA_VISUAL, cfg, imageOk: (n) => n !== 1 });
      // Act
      const { status } = await run();
      // Assert
      assert.equal(status, 200);
      assert.deepEqual(
        together.map((b) => [b.model, b.width, b.height, b.steps]),
        [
          [cfg.model, cfg.width, cfg.height, cfg.steps],
          [cfg.model, cfg.width, cfg.height, cfg.steps],
        ],
      );
    });

    const NO_CONFIG: Array<[string, { cfg: null; cfgError?: Json }, string]> = [
      ["no active row", { cfg: null }, "WARN [scene] no active image_gen_config; rendering with the built-in defaults"],
      [
        "the config read failing",
        { cfg: null, cfgError: { code: "08006", message: "connection failure" } },
        "WARN [scene] no active image_gen_config (connection failure); rendering with the built-in defaults",
      ],
    ];
    for (const [name, cfg, line] of NO_CONFIG) {
      test(`${name}: both attempts use the built-in defaults, and that is logged`, async () => {
        // Arrange
        const { together } = setup({ visual: DHRUVA_VISUAL, ...cfg, imageOk: (n) => n !== 1 });
        // Act
        const { status, json } = await run();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.deepEqual(
          together.map((b) => [b.model, b.width, b.height, "steps" in b]),
          [
            ["black-forest-labs/FLUX.2-pro", 1088, 1344, false],
            ["black-forest-labs/FLUX.1.1-pro", 768, 1024, false],
          ],
        );
        assert.ok(together[0].prompt.startsWith(DHRUVA_VISUAL), together[0].prompt);
        assert.ok(together[0].prompt.includes("Raja Ravi Varma 1880-1900 aesthetic"), together[0].prompt);
        assert.ok(logs.includes(line), logs.join("\n"));
      });
    }
  });

  // ── With facts: returned first, checked after the response, flagged only ────

  describe("with research facts", () => {
    test("the image is stored and returned with a running record while its check is still in flight; the check's pass is then written over it", async () => {
      // Arrange: the vision answer waits until the test has seen the response
      const { db, together, images } = setup({ visual: ARJUNA_VISUAL });
      const gate = hold();
      const calls = vision(async (_, n) => {
        await gate.promise;
        return reply(n);
      });
      const t0 = Date.now();
      // Act
      const { status, json, handedBeforeResponse } = await run();
      const rowAtResponse = structuredClone(db.row.visual_check);
      gate.release();
      await settle();
      // Assert: the response and the row before the check finished
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(handedBeforeResponse, 1, "the check is handed to EdgeRuntime.waitUntil before the response");
      assert.equal(together.length, 1);
      const { started_at, ...running } = json.visual_check;
      assert.deepEqual(running, {
        status: "running",
        attempts: 1,
        chosen_attempt: 0,
        failed: [],
        unclear: 0,
        reason: null,
        image_model: FLUX_CFG.model,
        checked_at: null,
      });
      assertStartedAt(started_at, t0);
      assert.deepEqual(rowAtResponse, json.visual_check, "the row holds the running record while the check is in flight");
      // Assert: the check saw the stored image and exactly the facts in its prompt
      assert.equal(calls.length, 1);
      assert.equal(calls[0].params.messages[0].content[0].source.data, images[0]);
      const facts = checkedFacts(calls[0]);
      assert.ok(facts.length > 0);
      assert.match(researchLine(), new RegExp(` facts=${facts.length} `), researchLine());
      assert.ok(facts.includes(FOUR_HORSES), facts.join("\n"));
      for (const f of facts) assert.ok(together[0].prompt.includes(f), `fact not in the image prompt: ${f}`);
      // Assert: the final record, with started_at kept
      const { checked_at, ...rest } = db.row.visual_check;
      assert.deepEqual(rest, {
        status: "pass",
        attempts: 1,
        chosen_attempt: 0,
        failed: [],
        unclear: 0,
        reason: null,
        image_model: FLUX_CFG.model,
        started_at,
      });
      assert.ok(!Number.isNaN(Date.parse(checked_at)), String(checked_at));
      assert.equal(db.row.image_url, json.image_url);
      assert.equal(db.row.image_prompt, together[0].prompt);
      assert.equal(uploadedB64(db), images[0]);
    });

    test("a clearly contradicted fact is flagged on the stored image: no re-render, no second upload, no seed", async () => {
      // Arrange
      const { db, together, signals, images } = setup({ visual: ARJUNA_VISUAL });
      const calls = vision((_, n) => reply(n, 1));
      // Act
      const { status, json } = await run();
      await settle();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(json.visual_check.status, "running");
      assert.equal(calls.length, 1);
      assert.equal(together.length, 1, "never re-rendered");
      assert.equal("seed" in together[0], false);
      assert.equal(signals[0], undefined);
      assert.equal(db.uploads.length, 1);
      assert.equal(uploadedB64(db), images[0]);
      assert.equal(db.row.image_url, json.image_url, "the stored image stays");
      const record = db.row.visual_check;
      assert.equal(record.status, "fail");
      assert.equal(record.attempts, 1);
      assert.equal(record.chosen_attempt, 0);
      assert.equal(record.reason, null);
      assert.equal(record.failed.length, 1);
      assert.equal(record.failed[0].fact, checkedFacts(calls[0])[0]);
      assert.match(record.failed[0].observed, /3 horses counted/);
      assert.equal(record.started_at, json.visual_check.started_at);
    });

    test("facts the prompt has no room for are not checked", async () => {
      // Arrange: two more canon facts push the facts block past its 450 chars
      const { together } = setup({ visual: ARJUNA_VISUAL, canon: [...CANON, ...EXTRA_CANON] });
      const calls = vision((_, n) => reply(n));
      // Act
      const { status, json } = await run();
      await settle();
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

    const CHECK_ERRORS: Array<[string, () => unknown, string]> = [
      ["an API error", () => new APIError(529, "overloaded"), "api_error_529"],
      ["a refusal", () => ({ stop_reason: "refusal", content: [] }), "refusal"],
      ["a reply without the tool call", () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "looks fine" }] }), "no_tool"],
    ];
    for (const [name, answer, reason] of CHECK_ERRORS) {
      test(`check error (${name}): the stored image gets an error record and nothing is re-rendered`, async () => {
        // Arrange
        const { db, together, images } = setup({ visual: ARJUNA_VISUAL });
        const calls = vision(() => answer());
        // Act
        const { status, json } = await run();
        await settle();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(json.visual_check.status, "running");
        assert.equal(calls.length, 1);
        assert.equal(together.length, 1);
        assert.equal(uploadedB64(db), images[0]);
        const record = db.row.visual_check;
        assert.equal(record.status, "error");
        assert.equal(record.reason, reason);
        assert.equal(record.attempts, 1);
        assert.equal(record.chosen_attempt, 0);
      });
    }

    test("VISUAL_CHECK_ENABLED=false: one render, a skipped/disabled record, no background check and no vision call", async () => {
      // Arrange
      ENV.VISUAL_CHECK_ENABLED = "false";
      const { db, together } = setup({ visual: ARJUNA_VISUAL });
      const calls = vision((_, n) => reply(n, 1));
      // Act
      const { status, json, handedBeforeResponse } = await run();
      await settle();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(together.length, 1);
      assert.equal(calls.length, 0);
      assert.equal(handedBeforeResponse, 0);
      assert.equal(background.length, 0);
      assert.equal(db.row.visual_check.status, "skipped");
      assert.equal(db.row.visual_check.reason, "disabled");
      assert.deepEqual(json.visual_check, db.row.visual_check);
    });

    test("the background deadline counts from the handler's first line and started_at from when the check was queued: a check queued 345s in is skipped/deadline", async () => {
      // Arrange: 300s to write the visual prompt, 45s to render. The platform would
      // have cut such a request; the fake clock only shows where each time is
      // anchored. From request start the deadline is 360s and a check needs 20s of
      // it; counted from after the prompt was written, the check would still run.
      const { db, together } = setup({ visual: ARJUNA_VISUAL, haikuMs: 300_000, renderMs: 45_000 });
      const calls = vision((_, n) => reply(n, 1));
      const t0 = Date.now();
      // Act
      const { status, json } = await run();
      await settle();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(together.length, 1);
      assert.equal(json.visual_check.status, "running", "facts reached the prompt, so a check was queued");
      assert.equal(calls.length, 0);
      const record = db.row.visual_check;
      assert.equal(record.status, "skipped");
      assert.equal(record.reason, "deadline");
      assert.equal(record.attempts, 1);
      assertStartedAt(record.started_at, t0 + 345_000);
      assert.equal(record.started_at, json.visual_check.started_at);
    });

    test("a render that ends 115s in, past the old in-request check budget, is still checked", async () => {
      // Arrange
      const { db, together } = setup({ visual: ARJUNA_VISUAL, renderMs: 115_000 });
      const calls = vision((_, n) => reply(n, 1));
      // Act
      const { status } = await run();
      await settle();
      // Assert
      assert.equal(status, 200);
      assert.equal(together.length, 1);
      assert.equal(calls.length, 1);
      assert.equal(db.row.visual_check.status, "fail");
      assert.equal(db.row.visual_check.failed.length, 1);
    });

    test("when the fallback model drew the image, that image is checked and both records name the fallback model", async () => {
      // Arrange
      const { db, together, images } = setup({ visual: ARJUNA_VISUAL, imageOk: (n) => n !== 1 });
      const calls = vision((_, n) => reply(n));
      // Act
      const { status, json } = await run();
      await settle();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.deepEqual(together.map((b) => b.model), [FLUX_CFG.model, FLUX_CFG.fallback_model]);
      assert.equal(calls[0].params.messages[0].content[0].source.data, images[0]);
      assert.equal(json.visual_check.image_model, FLUX_CFG.fallback_model);
      assert.equal(db.row.visual_check.status, "pass");
      assert.equal(db.row.visual_check.image_model, FLUX_CFG.fallback_model);
    });
  });

  // ── Storage ─────────────────────────────────────────────────────────────────

  describe("storing the record", () => {
    test("the image is saved in one update with the unchanged columns plus visual_check; the check writes visual_check alone, compare-and-swapped on id and image_url", async () => {
      // Arrange
      const { db, together } = setup({ visual: ARJUNA_VISUAL });
      vision((_, n) => reply(n));
      // Act
      const { json } = await run();
      await settle();
      // Assert
      const updates = db.sceneUpdates();
      assert.deepEqual(
        updates.map((q) => Object.keys(q.values).sort()),
        [
          ["error_message", "status"],
          ["error_message", "generated_at", "image_generated", "image_prompt", "image_url", "status", "visual_check"],
          ["visual_check"],
        ],
      );
      const [generating, stored, checked] = updates;
      assert.deepEqual(generating.filters, [["id", SCENE_ID]]);
      assert.deepEqual(stored.filters, [["id", SCENE_ID]]);
      assert.equal(stored.values.image_url, json.image_url);
      assert.equal(stored.values.image_prompt, together[0].prompt);
      assert.equal(stored.values.error_message, null);
      assert.equal(stored.values.visual_check.status, "running");
      assert.deepEqual(checked.filters, [["id", SCENE_ID], ["image_url", json.image_url]]);
      assert.equal(checked.returning, "id", "the write asks for the rows it updated, so a write that matched none is seen");
      assert.equal(checked.values.visual_check.status, "pass");
      assert.equal(checked.values.visual_check.started_at, stored.values.visual_check.started_at);
    });

    const NEWER_RECORD = {
      status: "running",
      attempts: 1,
      chosen_attempt: 0,
      failed: [],
      unclear: 0,
      reason: null,
      image_model: FLUX_CFG.model,
      checked_at: null,
      started_at: "2026-09-14T10:00:00.000Z",
    };
    const LATER_CHANGES: Array<[string, (row: Json) => void, (row: Json) => void]> = [
      [
        "a newer generation stored another image",
        (row) => Object.assign(row, { image_url: "https://storage.test/scene-7-newer.jpg", visual_check: NEWER_RECORD }),
        (row) => assert.deepEqual(row.visual_check, NEWER_RECORD, "the newer image keeps its own record"),
      ],
      [
        "the scene was deleted",
        (row) => {
          row.id = -1;
        },
        (row) => assert.equal(row.visual_check.status, "running"),
      ],
    ];
    for (const [name, change, assertUnchanged] of LATER_CHANGES) {
      test(`${name} before the check finished: its record is written nowhere, once, and that is logged`, async () => {
        // Arrange
        const { db } = setup({ visual: ARJUNA_VISUAL });
        const gate = hold();
        vision(async (_, n) => {
          await gate.promise;
          return reply(n);
        });
        // Act
        const { status, json } = await run();
        change(db.row);
        gate.release();
        await settle();
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        const writes = checkWrites(db);
        assert.equal(writes.length, 1, "not retried");
        assert.deepEqual(writes[0].filters, [["id", SCENE_ID], ["image_url", json.image_url]]);
        assertUnchanged(db.row);
        assert.ok(logs.includes(`[scene] visual check for scene ${SCENE_ID} not stored: the scene was deleted or holds a newer image`), logs.join("\n"));
        assert.ok(logs.includes(`[visual-check] scene ${SCENE_ID} record status=pass not stored: writeRecord returned false`), logs.join("\n"));
      });
    }

    test("when the visual_check column is missing, the image is still saved without it and no check is started", async () => {
      // Arrange
      const { db, together } = setup({ visual: ARJUNA_VISUAL, updateError: (v) => ("visual_check" in v ? PGRST204 : null) });
      const calls = vision((_, n) => reply(n));
      // Act
      const { status, json, handedBeforeResponse } = await run();
      await settle();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      const saves = imageSaves(db).map((q) => q.values);
      assert.equal(saves.length, 2);
      assert.ok("visual_check" in saves[0]);
      const { visual_check: _dropped, ...withoutRecord } = saves[0];
      assert.deepEqual(saves[1], withoutRecord);
      assert.equal(db.row.image_url, json.image_url, "the image is saved");
      assert.ok(logs.some((l) => l.startsWith("WARN [scene] save with visual_check failed")), logs.join("\n"));
      assert.ok(
        logs.includes("WARN [scene] visual check not started: reader_scenes.visual_check does not exist (migration 20260913230000 not applied)"),
        logs.join("\n"),
      );
      assert.equal(handedBeforeResponse, 0);
      assert.equal(background.length, 0);
      assert.equal(calls.length, 0, "no Claude call whose result has nowhere to go");
      assert.equal(together.length, 1);
      assert.equal(json.visual_check.status, "running", "the response still carries the record it tried to store");
    });

    test("a first save failing for another reason still saves the image, and the check still runs and replaces the earlier image's record", async () => {
      // Arrange: the scene was generated before, so its row holds an old image and record
      const STALE = {
        status: "fail",
        attempts: 1,
        chosen_attempt: 0,
        failed: [{ fact: "old fact", observed: "old image" }],
        unclear: 0,
        reason: null,
        image_model: FLUX_CFG.model,
        checked_at: "2026-09-01T00:00:00.000Z",
      };
      const timeout = { code: "57014", message: "canceling statement due to statement timeout" };
      const { db } = setup({
        visual: ARJUNA_VISUAL,
        row: { image_generated: true, image_url: "https://storage.test/scene-7-old.jpg", status: "generated", visual_check: STALE },
        updateError: (v) => ("visual_check" in v && "image_url" in v ? timeout : null),
      });
      const calls = vision((_, n) => reply(n));
      // Act
      const { status, json, handedBeforeResponse } = await run();
      await settle();
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(handedBeforeResponse, 1);
      assert.equal(calls.length, 1);
      assert.equal(db.row.image_url, json.image_url);
      assert.equal(db.row.visual_check.status, "pass");
      assert.equal(db.row.visual_check.started_at, json.visual_check.started_at);
      assert.equal(logs.some((l) => l.includes("visual check not started")), false, logs.join("\n"));
    });

    const WRITE_FAILURES: Array<[string, Failure, string]> = [
      ["PGRST204", PGRST204, "reader_scenes.visual_check does not exist (migration 20260913230000 not applied)"],
      ["42703", { code: "42703", message: 'column "visual_check" does not exist' }, "reader_scenes.visual_check does not exist (migration 20260913230000 not applied)"],
      ["another database error", { code: "08006", message: "connection failure" }, "connection failure"],
      ["a throwing client", new Error("socket hang up"), "Error: socket hang up"],
    ];
    for (const [name, failure, reason] of WRITE_FAILURES) {
      test(`the check's write failing with ${name} is logged once, never retried, and the background work still ends`, async () => {
        // Arrange: the image save succeeds; only the check's own write fails
        const { db } = setup({ visual: ARJUNA_VISUAL, updateError: (v) => (Object.keys(v).join() === "visual_check" ? failure : null) });
        vision((_, n) => reply(n));
        // Act
        await run();
        await assert.doesNotReject(settle());
        // Assert
        assert.equal(checkWrites(db).length, 1);
        assert.equal(db.row.visual_check.status, "running", "the stored record is left as it was");
        const lines = logs.filter((l) => l.includes(`[scene] visual check for scene ${SCENE_ID} not stored`));
        assert.deepEqual(lines, [`WARN [scene] visual check for scene ${SCENE_ID} not stored: ${reason}`]);
      });
    }
  });
});
