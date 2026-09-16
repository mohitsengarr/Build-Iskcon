// Handler-level wiring tests. Each edge function's index.ts is imported under
// node with its Deno-only specifiers stubbed (helpers/edge-function-hooks.mjs and
// helpers/npm-stub-hooks.mjs), a fake database and storage (globalThis.__sb), and
// a fake fetch for Together, the raw Claude API, buildiskcon.com and Firecrawl.
// The real _shared/sceneResearch.ts runs. No network, no real keys, no paid calls.
//
// Globals are installed in the suite's before() and restored in after(). This
// file sorts after scene-research-io.test.ts, whose top-level code sets
// globalThis.Deno, so under `node --test tests/` the two never overlap.
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { seededCanon } from "./helpers/seed-canon.ts";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
register("./helpers/edge-function-hooks.mjs", import.meta.url);

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const FUNCTIONS = new URL("../supabase/functions/", import.meta.url);
const CANON = seededCanon();
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_ENV: Record<string, string> = {
  SUPABASE_URL: "http://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  TOGETHER_API_KEY: "together-test",
  ANTHROPIC_API_KEY: "anthropic-test",
};
const ENV: Record<string, string> = {};
const LOADED = ["instagram-post", "generate-gita-chapter-art", "bulk-generate-chapter-art", "bulk-generate-chaitanya-art"];
// bulk-generate-images caches image_gen_config once per isolate, so its
// no-config and config paths each get their own module instance (a query string
// loads a separate copy). The baseline file is bulk-generate-images/index.ts
// exactly as it was before research was added (commit 3cbd431), copied verbatim.
const BASELINE_BGI = new URL("./fixtures/baseline/bulk-generate-images.index.ts", import.meta.url).href;
const EXTRA_LOADS: Array<[string, string]> = [
  ["bgi", new URL("bulk-generate-images/index.ts?nocfg", FUNCTIONS).href],
  ["bgi-cfg", new URL("bulk-generate-images/index.ts?cfg", FUNCTIONS).href],
  ["base-bgi", `${BASELINE_BGI}?nocfg`],
  ["base-bgi-cfg", `${BASELINE_BGI}?cfg`],
];
const RESEARCH_TABLE = "scene_visual_research";

type Handler = (req: Request) => Promise<Response>;
const handlers: Record<string, Handler> = {};

// ── Fakes ────────────────────────────────────────────────────────────────────

interface Query {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  filters: Array<[string, unknown]>;
  single: boolean;
  values?: unknown;
}
type TableFn = (q: Query) => unknown;

function makeDb(tables: Record<string, TableFn>) {
  const queries: Query[] = [];
  const uploads: string[] = [];
  return {
    queries,
    uploads,
    writes: (table: string) => queries.filter((q) => q.table === table && q.op !== "select"),
    from(table: string) {
      const q: Query = { table, op: "select", filters: [], single: false };
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
        // deno-lint-ignore no-explicit-any
        then(res: any, rej: any) {
          queries.push(q);
          const fn = tables[table];
          const data = fn ? fn(q) : null;
          return Promise.resolve({ data, error: null, count: 0 }).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
        list: async () => ({ data: [], error: null }),
      }),
    },
  };
}

const CHAPTER_INDEX = [
  { globalNumber: 10, number: 10, skandh: 1, title: "Chapter Ten", batchNumber: 1, pageNumber: 1 },
  { globalNumber: 293, number: 1, skandh: 11, title: "Chapter Two Ninety Three", batchNumber: 30, pageNumber: 1 },
];

// deno-lint-ignore no-explicit-any
type Json = any;

function makeFetch(opts: { claude: (body: Json) => string; imageOk?: (attempt: number) => boolean }) {
  const seen = { together: [] as Json[], firecrawl: [] as string[], claude: [] as Json[] };
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
  const fn = async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (u.startsWith("https://api.firecrawl.dev/")) {
      seen.firecrawl.push(u);
      return u.endsWith("/search") ? json({ success: true, data: { web: [] } }) : json({ success: true, data: { markdown: "" } });
    }
    if (u === "https://api.together.xyz/v1/images/generations") {
      seen.together.push(body);
      const ok = opts.imageOk ? opts.imageOk(seen.together.length) : true;
      // A failure that is not re-posted: 429 and every 5xx now get another post
      // (_shared/togetherRetry.ts), and these tests count one post per attempt.
      return ok ? json({ data: [{ b64_json: "eA==" }] }) : new Response("bad request", { status: 400 });
    }
    if (u === "https://api.anthropic.com/v1/messages") {
      seen.claude.push(body);
      return json({ content: [{ type: "text", text: opts.claude(body) }] });
    }
    if (u.endsWith("/api/bhagwatham/chapter-index")) return json({ chapters: CHAPTER_INDEX });
    if (u.includes("/api/bhagwatham/batch/")) return json({ pages: [{ text: "Chapter text." }] });
    throw new Error(`unexpected fetch ${u}`);
  };
  return { fn, seen };
}

function freshRow(facts: unknown[]) {
  return {
    facts,
    status: "ok",
    expires_at: new Date(Date.now() + DAY_MS).toISOString(),
    research_version: 1,
    hit_count: 2,
    entities: [],
    sources: [],
  };
}

// ── Harness ──────────────────────────────────────────────────────────────────

describe("edge function wiring (index.ts handlers)", () => {
  const saved: Record<string, unknown> = {};
  const SAVED_GLOBALS = ["Deno", "EdgeRuntime", "fetch", "__sb", "__anthropicCreate"];
  const realLog = console.log;
  const realWarn = console.warn;
  const realError = console.error;
  let waits: Promise<unknown>[] = [];
  let logs: string[] = [];
  let sdkCalls = 0;

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
    for (const fn of LOADED) {
      loading = fn;
      await import(new URL(`${fn}/index.ts`, FUNCTIONS).href);
      assert.equal(typeof handlers[fn], "function", `${fn} did not register a handler`);
    }
    for (const [name, href] of EXTRA_LOADS) {
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
    sdkCalls = 0;
    g.__anthropicCreate = async () => {
      sdkCalls++;
      return { stop_reason: "end_turn", content: [{ type: "text", text: "no facts" }] };
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

  async function call(fn: string, body: unknown): Promise<{ status: number; json: Json }> {
    const res = await handlers[fn](
      new Request("http://functions.test/", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    );
    const json = await res.json();
    await Promise.all(waits.splice(0));
    return { status: res.status, json };
  }

  // ── instagram-post: inline path (chapter with no scene row) ─────────────────
  describe("instagram-post inline path", () => {
    const ARJUNA_SCENE =
      "Wide shot of Arjuna, a MALE warrior prince, standing on his chariot beside Krishna, a youthful MALE with blue skin, on the plain of Kurukshetra";
    const DHRUVA_SCENE = "Wide shot of Dhruva, a young MALE prince, meditating alone in the forest of Madhuvana under golden light";

    function setup(inlineReply: unknown, characters: string[], imageOk?: (n: number) => boolean) {
      const db = makeDb({
        image_gen_config: () => null,
        bhagwatham_personas: () => [],
        bhagavatam_chapter_scenes: () => null,
        bhaktigram_mahajan_aliases: () => [],
        ig_cron_state: () => ({ total_posted: 1, next_chapter: 293 }),
        ig_pending_review: (q) => (q.op === "insert" ? { id: 41 } : []),
        scene_visual_canon: () => CANON,
        [RESEARCH_TABLE]: () => null,
      });
      const net = makeFetch({
        claude: (body) => {
          if (body.max_tokens === 300) return JSON.stringify(characters);
          if (body.max_tokens === 1200) return JSON.stringify(inlineReply);
          if (body.max_tokens === 600) return '{"sanskrit":null,"hindi":null}';
          return "caption text";
        },
        imageOk,
      });
      g.__sb = db;
      g.fetch = net.fn;
      return { db, net };
    }

    test("uses the imagePrompt Claude returns as the scene, and no image prompt contains 'undefined'", async () => {
      // Arrange
      const { db, net } = setup({ imagePrompt: DHRUVA_SCENE, caption: "Dhruva caption", hashtags: "#h" }, ["Dhruva"]);
      // Act
      const { status, json } = await call("instagram-post", { chapter_global_number: 293 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(json.sceneSource, "inline-claude");
      assert.equal(net.seen.together.length, 1);
      assert.ok(net.seen.together[0].prompt.startsWith(DHRUVA_SCENE), net.seen.together[0].prompt.slice(0, 120));
      for (const b of net.seen.together) assert.doesNotMatch(b.prompt, /\bundefined\b/i);
      const insert = db.writes("ig_pending_review").find((q) => q.op === "insert");
      assert.equal((insert?.values as { caption: string }).caption, "Dhruva caption");
      assert.ok(logs.some((l) => l.startsWith("[instagram-post] research key=bhagavatam:g293:inline ")), logs.join("\n"));
    });

    test("accepts a reply that uses the prompt key", async () => {
      const { net } = setup({ prompt: DHRUVA_SCENE, caption: "c", hashtags: "#h" }, ["Dhruva"]);
      const { status } = await call("instagram-post", { chapter_global_number: 293 });
      assert.equal(status, 200);
      assert.ok(net.seen.together[0].prompt.startsWith(DHRUVA_SCENE));
    });

    test("a reply with neither key still produces a chapter scene, not 'undefined'", async () => {
      const { net } = setup({ caption: "c", hashtags: "#h" }, ["Dhruva"]);
      const { status } = await call("instagram-post", { chapter_global_number: 293 });
      assert.equal(status, 200);
      const prompt: string = net.seen.together[0].prompt;
      assert.ok(prompt.startsWith("A wide establishing shot of the central scene of the Srimad Bhagavatam chapter Chapter Two Ninety Three"), prompt.slice(0, 140));
      assert.doesNotMatch(prompt, /\bundefined\b/i);
    });

    test("when FLUX falls back to SAFE_FALLBACK, one line says the research facts were dropped", async () => {
      const { net } = setup({ imagePrompt: ARJUNA_SCENE, caption: "c", hashtags: "#h" }, ["Arjuna", "Krishna"], (n) => n === 3);
      const { status } = await call("instagram-post", { chapter_global_number: 293 });
      assert.equal(status, 200);
      assert.equal(net.seen.together.length, 3);
      assert.ok(net.seen.together[0].prompt.includes("four white horses"), "canon facts expected in the first prompt");
      assert.ok(net.seen.together[2].prompt.startsWith("A serene scene from Srimad Bhagavatam"));
      const notes = logs.filter((l) => l.includes("uses SAFE_FALLBACK"));
      assert.equal(notes.length, 1, logs.join("\n"));
      assert.match(notes[0], /^\[instagram-post\] FLUX attempt 3 uses SAFE_FALLBACK: [1-9]\d* research facts? dropped for this attempt$/);
    });

    test("a SAFE_FALLBACK attempt whose prompt carried no facts logs nothing", async () => {
      const { net } = setup({ imagePrompt: DHRUVA_SCENE, caption: "c", hashtags: "#h" }, ["Dhruva"], (n) => n === 3);
      const { status } = await call("instagram-post", { chapter_global_number: 293 });
      assert.equal(status, 200);
      assert.equal(net.seen.together.length, 3);
      assert.equal(logs.filter((l) => l.includes("uses SAFE_FALLBACK")).length, 0);
    });

    test("every FLUX attempt failing still fails the post, with no review row", async () => {
      const { db, net } = setup({ imagePrompt: ARJUNA_SCENE, caption: "c", hashtags: "#h" }, ["Arjuna", "Krishna"], () => false);
      const { status, json } = await call("instagram-post", { chapter_global_number: 293 });
      assert.equal(status, 500);
      assert.match(json.error, /All FLUX attempts failed/);
      assert.equal(net.seen.together.length, 3);
      assert.equal(db.writes("ig_pending_review").length, 0);
      assert.equal(logs.filter((l) => l.includes("uses SAFE_FALLBACK")).length, 1);
    });
  });

  // ── generate-gita-chapter-art: network only for single-chapter runs ─────────
  describe("generate-gita-chapter-art research network", () => {
    const BRIEF = {
      imagePrompt:
        "Krishna, a youthful MALE charioteer with blue skin, holds the reins of Arjuna's chariot on the plain of Kurukshetra while Arjuna, a MALE warrior, listens",
      caption: "What the chapter teaches.",
      hashtags: "#BhagavadGita",
    };

    function setup(chaptersWithArt: number[], canon: unknown[] = CANON) {
      ENV.FIRECRAWL_API_KEY = "fc-test";
      const db = makeDb({
        image_gen_config: () => null,
        // Since bd355c17 the review table answers three different reads. The two
        // single-row ones must answer with a row or null, never a list: an empty
        // list is truthy, and the one-pending-cover probe reading one would skip
        // every chapter. Nothing is pending and no scene was rejected here.
        gita_chapter_art_review: (q) => {
          if (q.op === "insert") return { id: 9 };
          if (q.single) return null;
          if (q.filters.some(([column, value]) => column === "scene_rejected" && value === true)) return [];
          return chaptersWithArt.map((n) => ({ chapter_number: n }));
        },
        scene_visual_canon: () => canon,
        [RESEARCH_TABLE]: (q) => (q.op === "select" ? null : null),
      });
      const net = makeFetch({ claude: () => JSON.stringify(BRIEF) });
      g.__sb = db;
      g.fetch = net.fn;
      return { db, net };
    }
    const researchLines = () => logs.filter((l) => l.startsWith("[gita-art] research key="));

    test("{ missing: true, limit: 3 } renders 3 chapters with cached research only: no Firecrawl, no Claude research, no cache write", async () => {
      // Arrange
      const { db, net } = setup([]);
      // Act
      const { status, json } = await call("generate-gita-chapter-art", { missing: true, limit: 3 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.deepEqual(json.generated.map((r: { chapter: number }) => r.chapter), [1, 2, 3]);
      assert.equal(net.seen.firecrawl.length, 0);
      assert.equal(sdkCalls, 0);
      assert.equal(db.writes(RESEARCH_TABLE).length, 0);
      assert.equal(researchLines().length, 3);
      for (const l of researchLines()) assert.match(l, / status=skipped facts=[1-9]\d* .*network=off/, l);
    });

    const RESTATEMENT = "four horses, no more and no fewer";

    test("a canon horse-count fact replaces the hardcoded restatement, so the count is stated once", async () => {
      // Arrange
      const { net } = setup([]);
      // Act
      const { status, json } = await call("generate-gita-chapter-art", { missing: true, limit: 1 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      const prompt: string = net.seen.together[0].prompt;
      assert.ok(prompt.includes("exactly four white horses"), prompt.slice(0, 400));
      assert.equal(prompt.includes(RESTATEMENT), false, prompt.slice(0, 600));
    });

    test("with no canon fact the restatement is still added to a chariot scene", async () => {
      // Arrange
      const { net } = setup([], []);
      // Act
      const { status, json } = await call("generate-gita-chapter-art", { missing: true, limit: 1 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.ok(net.seen.together[0].prompt.includes(RESTATEMENT), net.seen.together[0].prompt.slice(0, 600));
    });

    test("{ chapter: 2 } keeps network research", async () => {
      const { db } = setup([]);
      const { status, json } = await call("generate-gita-chapter-art", { chapter: 2 });
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(json.generated.length, 1);
      assert.ok(db.writes(RESEARCH_TABLE).length >= 1, "a network research run stores its result");
      assert.equal(researchLines().length, 1);
      assert.match(researchLines()[0], /network=on/);
      assert.doesNotMatch(researchLines()[0], / status=skipped /);
    });

    test("{ missing: true } with no limit renders one chapter and keeps network research", async () => {
      const { db, net } = setup([]);
      const { json } = await call("generate-gita-chapter-art", { missing: true });
      assert.equal(json.generated.length, 1);
      assert.ok(net.seen.firecrawl.length >= 1 || db.writes(RESEARCH_TABLE).length >= 1);
      assert.match(researchLines()[0], /network=on/);
    });

    test("{ missing: true, limit: 2 } with only one chapter left still reads the cache only", async () => {
      const have = Array.from({ length: 17 }, (_, i) => i + 1);
      const { db, net } = setup(have);
      const { json } = await call("generate-gita-chapter-art", { missing: true, limit: 2 });
      assert.deepEqual(json.generated.map((r: { chapter: number }) => r.chapter), [18]);
      assert.equal(net.seen.firecrawl.length, 0);
      assert.equal(db.writes(RESEARCH_TABLE).length, 0);
      assert.match(researchLines()[0], /network=off/);
    });
  });

  // ── bulk cover functions: cached research in bulk, network in chapter mode ──
  const TULASI_FACT = {
    subject: "Tulasi",
    attribute: "planter",
    kind: "object",
    value: "clay planter",
    prompt_text: "a Tulasi plant grows in a raised clay planter",
    triggers: ["Tulasi"],
    source_url: "https://vaniquotes.org/wiki/Tulasi",
    quote: "Tulasi grows in a raised clay planter",
  };
  const COVERS = [
    {
      fn: "bulk-generate-chapter-art",
      chapter: 10,
      key: "bhagavatam:g10:s0",
      scenesTable: "bhagavatam_chapter_scenes",
      reviewTable: "bhagavatam_chapter_art_review",
      scene: {
        title: "Narada at the hermitage",
        summary: "Narada sings",
        characters: ["Narada"],
        setting: "forest hermitage",
        mood: "calm",
        image_prompt: "Narada Muni, an elderly MALE sage, plays his vina beside a Tulasi plant in a forest hermitage at dawn",
        rank: 1,
      },
    },
    {
      fn: "bulk-generate-chaitanya-art",
      chapter: 5,
      key: "chaitanya:g5:s0",
      scenesTable: "chaitanya_chapter_scenes",
      reviewTable: "chaitanya_chapter_art_review",
      scene: {
        title: "Kirtana in the courtyard",
        summary: "Chanting",
        characters: ["Sri Caitanya"],
        setting: "Navadvipa courtyard",
        mood: "joyful",
        image_prompt: "Sri Caitanya Mahaprabhu, a MALE sannyasi, chants beside a Tulasi plant in a Navadvipa courtyard at dawn",
        rank: 1,
      },
    },
  ];

  for (const cover of COVERS) {
    describe(`${cover.fn} research by mode`, () => {
      const CHAITANYA_CHAPTER = { global_number: 5, part: "adi", number_in_part: 5, title: "Chapter Five", pdf_path: null, ocr_status: "done" };

      function setup(cacheRow: unknown, imageOk?: (n: number) => boolean) {
        ENV.FIRECRAWL_API_KEY = "fc-test";
        const db = makeDb({
          image_gen_config: () => null,
          bhagwatham_personas: () => [],
          chaitanya_chapters: (q) => (q.single ? CHAITANYA_CHAPTER : [CHAITANYA_CHAPTER]),
          [cover.scenesTable]: (q) => (q.op === "select" ? { scenes: [cover.scene], used_scene_indexes: [] } : null),
          [cover.reviewTable]: (q) => (q.op === "insert" ? { id: 3 } : q.single ? null : []),
          scene_visual_canon: () => CANON,
          [RESEARCH_TABLE]: (q) => (q.op === "select" ? cacheRow : null),
        });
        const net = makeFetch({ claude: () => "{}", imageOk });
        g.__sb = db;
        g.fetch = net.fn;
        return { db, net };
      }
      const researchLine = () => logs.find((l) => l.startsWith(`[${cover.fn}] research ${cover.key} `)) ?? "";

      test("bulk mode serves a fresh cached row: its web fact reaches the prompt with no Firecrawl, Claude or cache write", async () => {
        // Arrange
        const { db, net } = setup(freshRow([TULASI_FACT]));
        // Act
        const { status, json } = await call(cover.fn, { mode: "bulk", limit: 1 });
        // Assert
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(json.research, "cache-only");
        assert.equal(json.queued, 1);
        assert.equal(net.seen.firecrawl.length, 0);
        assert.equal(sdkCalls, 0);
        assert.equal(db.writes(RESEARCH_TABLE).length, 0);
        assert.match(researchLine(), / status=hit facts=1 /, logs.join("\n"));
        assert.equal(net.seen.together.length, 1);
        assert.ok(net.seen.together[0].prompt.includes("a Tulasi plant grows in a raised clay planter"), net.seen.together[0].prompt.slice(0, 300));
        const insert = db.writes(cover.reviewTable).find((q) => q.op === "insert")?.values as { prompt: string; scene_index: number };
        assert.equal(insert.prompt, cover.scene.image_prompt);
        assert.equal(insert.scene_index, 0);
      });

      test("bulk mode with no cached row: canon only ('skipped'), still no network and no cache write", async () => {
        const { db, net } = setup(null);
        const { status } = await call(cover.fn, { mode: "bulk", limit: 1 });
        assert.equal(status, 200);
        assert.equal(net.seen.firecrawl.length, 0);
        assert.equal(db.writes(RESEARCH_TABLE).length, 0);
        assert.match(researchLine(), / status=skipped facts=0 /, logs.join("\n"));
        assert.ok(!net.seen.together[0].prompt.includes("raised clay planter"));
      });

      test("chapter mode on a cache miss keeps network research and stores the result", async () => {
        const { db } = setup(null);
        const { status, json } = await call(cover.fn, { mode: "chapter", chapter_global_number: cover.chapter });
        assert.equal(status, 200, JSON.stringify(json));
        assert.equal(json.ok, true, JSON.stringify(json));
        assert.ok(db.writes(RESEARCH_TABLE).some((q) => q.op === "upsert"), "network research stores its result");
        assert.doesNotMatch(researchLine(), / status=(skipped|hit) /, researchLine());
      });

      test("bulk mode logs the cached fact as dropped when FLUX falls back to SAFE_FALLBACK", async () => {
        const { net } = setup(freshRow([TULASI_FACT]), (n) => n === 3);
        await call(cover.fn, { mode: "bulk", limit: 1 });
        assert.equal(net.seen.together.length, 3);
        const notes = logs.filter((l) => l.includes("uses SAFE_FALLBACK"));
        assert.deepEqual(notes, [`[${cover.fn}] FLUX attempt 3 uses SAFE_FALLBACK: 1 research fact dropped for this attempt`]);
      });
    });
  }

  // ── bulk-generate-images: baseline prompt with no facts, research by mode ───
  const BGI_CFG = {
    model: "black-forest-labs/FLUX.2-pro",
    width: 1024,
    height: 1280,
    steps: null,
    style_positives: "warm golden oil painting, visible brushstrokes, light falling toward the sages",
    style_negatives: "NOT cartoon, NOT a firearm, NOT a sword",
    extra_rules: "Warriors appear peaceful and no arrows fly.",
    prompt_max_len: 2000,
    fallback_model: "black-forest-labs/FLUX.1.1-pro",
    fallback_width: 768,
    fallback_height: 1024,
    is_active: true,
  };
  // Every sanitizer substring case: fire, war(m), (to)war(d), war(riors), weapon, arrow (n-arrow), battle.
  const WAR_SCENE =
    "Wide shot of sages pouring ghee into the sacrificial fire toward warm golden light, while young warriors lay down their weapons and arrows beside a narrow river at the battlefield's edge";
  const LONG_WAR_SCENE = Array.from({ length: 12 }, () => WAR_SCENE).join(". ");
  const GITA_SCENE =
    "Krishna, a youthful MALE charioteer with blue skin, holds the reins of Arjuna's chariot on the plain of Kurukshetra while Arjuna, a MALE warrior, looks toward him";
  const LONG_GITA_SCENE = Array.from({ length: 15 }, () => GITA_SCENE).join(". ");
  const NARADA_SCENE = "Narada Muni, an elderly MALE sage, plays his vina beside a Tulasi plant in a forest hermitage, facing warm light at dawn";
  const TOWARD_FACT = {
    subject: "Narada",
    attribute: "facing",
    kind: "position",
    value: "toward the rising sun",
    prompt_text: "Narada faces toward the rising sun",
    triggers: ["Narada"],
    source_url: "https://vaniquotes.org/wiki/Narada",
    quote: "Narada faces toward the rising sun",
  };

  function bgiSetup(o: { cfg: boolean; imagePrompt?: unknown; cacheRow?: unknown; firecrawl?: boolean; canon?: unknown[]; imageOk?: (n: number) => boolean }) {
    if (o.firecrawl) ENV.FIRECRAWL_API_KEY = "fc-test";
    const db = makeDb({
      image_gen_config: () => (o.cfg ? BGI_CFG : null),
      bhagavatam_image_deletes: () => [],
      ig_pending_review: (q) => (q.op === "insert" ? { id: 41 } : []),
      scene_visual_canon: () => o.canon ?? CANON,
      [RESEARCH_TABLE]: (q) => (q.op === "select" ? (o.cacheRow ?? null) : null),
    });
    const net = makeFetch({
      claude: (body) => (body.max_tokens === 1200 ? JSON.stringify({ imagePrompt: o.imagePrompt, caption: "c", hashtags: "#h" }) : "{}"),
      // Default: only the third request succeeds, so a single chapter's three attempts are all compared.
      imageOk: o.imageOk ?? ((n) => n === 3),
    });
    g.__sb = db;
    g.fetch = net.fn;
    return { db, net };
  }
  const bgiResearchLines = () => logs.filter((l) => l.startsWith("[bulk-generate-images] research key="));

  describe("bulk-generate-images with no research facts sends the baseline prompt", () => {
    const CASES: Array<{ name: string; cfg: boolean; imagePrompt: unknown; canon?: unknown[] }> = [
      { name: "no config, short scene, seeded canon", cfg: false, imagePrompt: WAR_SCENE },
      { name: "no config, short scene, empty canon", cfg: false, imagePrompt: WAR_SCENE, canon: [] },
      { name: "no config, scene over the 1050-char share", cfg: false, imagePrompt: LONG_WAR_SCENE },
      { name: "no config, Claude reply with no imagePrompt", cfg: false, imagePrompt: undefined },
      { name: "config, short scene, seeded canon", cfg: true, imagePrompt: WAR_SCENE },
      { name: "config, short scene, empty canon", cfg: true, imagePrompt: WAR_SCENE, canon: [] },
      { name: "config, scene over prompt_max_len", cfg: true, imagePrompt: LONG_WAR_SCENE },
      { name: "config, Claude reply with no imagePrompt", cfg: true, imagePrompt: undefined },
    ];

    for (const c of CASES) {
      test(`${c.name}: every FLUX request is byte-identical to baseline`, async () => {
        // Arrange
        const base = bgiSetup(c);
        const baseRes = await call(c.cfg ? "base-bgi-cfg" : "base-bgi", { mode: "sample" });
        const head = bgiSetup(c);
        // Act
        const headRes = await call(c.cfg ? "bgi-cfg" : "bgi", { mode: "sample" });
        // Assert
        assert.equal(baseRes.status, 200, JSON.stringify(baseRes.json));
        assert.equal(headRes.status, 200, JSON.stringify(headRes.json));
        assert.equal(base.net.seen.together.length, 3);
        assert.deepEqual(head.net.seen.together, base.net.seen.together);
        assert.match(bgiResearchLines()[0] ?? "", / facts=0 /, logs.join("\n"));
      });
    }

    test("config, canon facts that do not fit beside a scene filling prompt_max_len: still byte-identical", async () => {
      // Arrange: the scene alone is over 2000 chars, so no fact fits
      const base = bgiSetup({ cfg: true, imagePrompt: LONG_GITA_SCENE });
      await call("base-bgi-cfg", { mode: "sample" });
      const head = bgiSetup({ cfg: true, imagePrompt: LONG_GITA_SCENE });
      // Act
      await call("bgi-cfg", { mode: "sample" });
      // Assert
      assert.match(bgiResearchLines()[0] ?? "", / facts=[1-9]\d* /, "canon matched the scene");
      assert.deepEqual(head.net.seen.together, base.net.seen.together);
    });

    test("no config, with canon facts: the facts are added and the other text is sanitized as before", async () => {
      // Arrange
      const base = bgiSetup({ cfg: false, imagePrompt: GITA_SCENE });
      await call("base-bgi", { mode: "sample" });
      const head = bgiSetup({ cfg: false, imagePrompt: GITA_SCENE });
      // Act
      await call("bgi", { mode: "sample" });
      // Assert
      const basePrompt: string = base.net.seen.together[0].prompt;
      const prompt: string = head.net.seen.together[0].prompt;
      assert.ok(prompt.includes("Arjuna's chariot is drawn by exactly four white horses"), prompt.slice(0, 400));
      assert.ok(basePrompt.includes("a MALE blessingrior, looks toblessingd him"), basePrompt.slice(0, 300));
      assert.ok(prompt.includes("a MALE blessingrior, looks toblessingd him"), prompt.slice(0, 300));
      assert.ok(prompt.includes("blessingm saffron palette"), "style positives sanitized as in baseline");
      assert.ok(prompt.length <= 1980, String(prompt.length));
      assert.deepEqual(head.net.seen.together[2], base.net.seen.together[2], "SAFE_FALLBACK attempt unchanged");
    });
  });

  describe("bulk-generate-images research by mode", () => {
    test("bulk mode on a cache miss: no Firecrawl, no Claude research call, no cache write", async () => {
      // Arrange
      const { db, net } = bgiSetup({ cfg: false, imagePrompt: NARADA_SCENE, firecrawl: true, imageOk: () => true });
      // Act
      const { status, json } = await call("bgi", { mode: "bulk", limit: 2, concurrency: 2 });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.equal(json.queued, 2);
      assert.equal(json.research, "cache-only");
      assert.equal(net.seen.firecrawl.length, 0);
      assert.equal(sdkCalls, 0);
      assert.equal(db.writes(RESEARCH_TABLE).length, 0);
      assert.equal(net.seen.together.length, 2, "both chapters still render");
      assert.equal(db.writes("ig_pending_review").filter((q) => q.op === "insert").length, 2);
      assert.equal(bgiResearchLines().length, 2, logs.join("\n"));
      for (const l of bgiResearchLines()) assert.match(l, / status=skipped facts=0 .*network=off$/, l);
    });

    test("bulk mode serves a fresh cached row: its facts reach the prompt without being rewritten inside words", async () => {
      // Arrange
      const { db, net } = bgiSetup({ cfg: false, imagePrompt: NARADA_SCENE, firecrawl: true, cacheRow: freshRow([TULASI_FACT, TOWARD_FACT]) });
      // Act
      const { status } = await call("bgi", { mode: "bulk", limit: 1 });
      // Assert
      assert.equal(status, 200);
      assert.equal(net.seen.firecrawl.length, 0);
      assert.equal(sdkCalls, 0);
      assert.equal(db.writes(RESEARCH_TABLE).length, 0);
      assert.match(bgiResearchLines()[0] ?? "", / status=hit facts=2 .*network=off$/, logs.join("\n"));
      const prompt: string = net.seen.together[0].prompt;
      assert.ok(prompt.includes("a Tulasi plant grows in a raised clay planter"), prompt.slice(0, 400));
      assert.ok(prompt.includes("Narada faces toward the rising sun"), prompt.slice(0, 400));
      assert.ok(prompt.includes("facing blessingm light"), "scene text sanitized as in baseline");
    });

    test("sample mode on a cache miss still researches over the network and stores the result", async () => {
      // Arrange
      const { db, net } = bgiSetup({ cfg: false, imagePrompt: NARADA_SCENE, firecrawl: true });
      // Act
      const { status, json } = await call("bgi", { mode: "sample" });
      // Assert
      assert.equal(status, 200, JSON.stringify(json));
      assert.ok(net.seen.firecrawl.length >= 1, "Firecrawl searched");
      assert.ok(db.writes(RESEARCH_TABLE).some((q) => q.op === "upsert"), "network research stores its result");
      assert.equal(bgiResearchLines().length, 1);
      assert.match(bgiResearchLines()[0], /network=on$/);
      assert.doesNotMatch(bgiResearchLines()[0], / status=(skipped|hit) /);
    });
  });
});
