// Offline tests for the IO wrapper (_shared/sceneResearch.ts).
// No network, no real keys, no paid calls: npm:@anthropic-ai/sdk resolves to a
// stub (tests/helpers), and fetch, Deno.env and the supabase client are fakes.
// Run: node --experimental-strip-types --test tests/
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { seededCanon } from "./helpers/seed-canon.ts";

register("./helpers/npm-stub-hooks.mjs", import.meta.url);
// deno-lint-ignore no-explicit-any
const io: any = await import("../supabase/functions/_shared/sceneResearch.ts");
// deno-lint-ignore no-explicit-any
const { APIError }: any = await import("./helpers/anthropic-stub.mjs");

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const ENV: Record<string, string> = {};
g.Deno = { env: { get: (k: string) => ENV[k] } };

const CANON = seededCanon();
const DAY_MS = 24 * 60 * 60 * 1000;
const realFetch = g.fetch;

function setKeys(): void {
  ENV.FIRECRAWL_API_KEY = "fc-test";
  ENV.ANTHROPIC_API_KEY = "sk-test";
}

// deno-lint-ignore no-explicit-any
type Call = { table: string; op: string; cols?: string; values?: any; opts?: any };

function makeSupabase(
  { canon = CANON as unknown[], cacheRow = null as unknown, throwOnFrom = false } = {},
) {
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      if (throwOnFrom) throw new Error("db down");
      const q: Call = { table, op: "select" };
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select(cols: string) {
          q.op = "select";
          q.cols = cols;
          return b;
        },
        eq() {
          return b;
        },
        order() {
          return b;
        },
        limit() {
          return b;
        },
        maybeSingle() {
          return b;
        },
        update(values: unknown) {
          q.op = "update";
          q.values = values;
          return b;
        },
        upsert(values: unknown, opts: unknown) {
          q.op = "upsert";
          q.values = values;
          q.opts = opts;
          return b;
        },
        // deno-lint-ignore no-explicit-any
        then(res: any, rej: any) {
          calls.push(q);
          const data = table === "scene_visual_canon" ? canon : q.op === "select" ? cacheRow : null;
          return Promise.resolve({ data, error: null }).then(res, rej);
        },
      };
      return b;
    },
  };
}

const GITA_SCENE =
  "Krishna, a youthful MALE charioteer with blue skin, holds the reins of Arjuna's chariot on the open plain of Kurukshetra while Arjuna, a MALE warrior, listens.";
const RATHA_SCENE = "Devotees pull Lord Jagannatha's Rathayatra chariot through Puri as Chaitanya dances.";
const SOURCE_URL = "https://vaniquotes.org/wiki/Arjuna_chariot";
const PAGE_TEXT = "Synthetic page. Arjuna's chariot was yoked to four white horses and carried the flag of Hanuman.";

const DELTA_SCENE = "Krishna's chariot with four horses and a Garuda banner leaves Hastinapura";
const DELTA_URL = "https://vaniquotes.org/wiki/Krishna_chariot";
const DELTA_PAGE = "Synthetic page. Krishna's chariot was drawn by four horses and flew the banner of Garuda.";

function firecrawlFetch({ failSearch = false, hang = false, url = SOURCE_URL, page = PAGE_TEXT } = {}) {
  // deno-lint-ignore no-explicit-any
  const seen = { search: 0, scrape: 0, bodies: [] as any[] };
  // deno-lint-ignore no-explicit-any
  const fn: any = async (reqUrl: string, init: any) => {
    if (hang) {
      return new Promise((_, reject) =>
        init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
      );
    }
    const body = JSON.parse(init.body);
    seen.bodies.push({ url: reqUrl, body });
    if (reqUrl.endsWith("/search")) {
      seen.search++;
      if (failSearch) return new Response("rate limited", { status: 429 });
      return Response.json({
        success: true,
        data: {
          web: [
            { url, title: "Vaniquotes page", description: "quotes" },
            { url: "https://www.pinterest.com/pin/1", title: "pin", description: "x" },
            { url: "https://en.wikipedia.org/wiki/Arjuna", title: "Arjuna", description: "hero" },
          ],
        },
      });
    }
    if (reqUrl.endsWith("/scrape")) {
      seen.scrape++;
      return Response.json({ success: true, data: { markdown: body.url === url ? page : "Other page." } });
    }
    return new Response("?", { status: 404 });
  };
  fn.seen = seen;
  return fn;
}

function noNetwork() {
  const fn = async () => {
    fn.called = true;
    throw new Error("network must not be used");
  };
  fn.called = false;
  return fn;
}

const toolResponse = (facts: unknown[]) => ({
  stop_reason: "tool_use",
  content: [{ type: "thinking", thinking: "" }, { type: "tool_use", id: "t1", name: "record_visual_facts", input: { facts } }],
});

const goodFact = {
  subject: "Arjuna's chariot",
  attribute: "flag",
  kind: "object",
  value: "flag of Hanuman",
  prompt_text: "the flag of Hanuman flies over Arjuna's chariot",
  triggers: ["Arjuna+chariot", "chariot"],
  source_url: SOURCE_URL,
  // The quote names the owner in the same sentence as the value (verifyFacts requires it).
  quote: "Arjuna's chariot was yoked to four white horses and carried the flag of Hanuman",
};
const badFact = { ...goodFact, attribute: "wheels", quote: "golden wheels shone" };
const overriddenFact = {
  subject: "Arjuna's chariot",
  attribute: "horses",
  kind: "count",
  value: "four",
  prompt_text: "four white horses",
  triggers: ["Arjuna"],
  source_url: SOURCE_URL,
  quote: "Arjuna's chariot was yoked to four white horses",
};
const garudaFact = {
  subject: "Krishna's chariot",
  attribute: "banner",
  kind: "object",
  value: "banner of Garuda",
  prompt_text: "the banner of Garuda flies over Krishna's chariot",
  triggers: ["Krishna+chariot", "!Arjuna"],
  source_url: DELTA_URL,
  quote: "Krishna's chariot was drawn by four horses and flew the banner of Garuda",
};
const fluteFact = {
  subject: "Krishna",
  attribute: "flute",
  kind: "object",
  value: "flute",
  prompt_text: "Krishna holds a flute",
  triggers: ["Krishna"],
  source_url: "https://vaniquotes.org/wiki/Flute",
  quote: "Krishna holds a flute in His hand",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    facts: [],
    status: "ok",
    expires_at: new Date(Date.now() + DAY_MS).toISOString(),
    research_version: 1,
    hit_count: 0,
    entities: [],
    sources: [],
    ...overrides,
  };
}

const daysUntil = (iso: string) => (Date.parse(iso) - Date.now()) / DAY_MS;

describe("getSceneResearch", () => {
  const realLog = console.log;
  const realWarn = console.warn;
  before(() => {
    console.log = (...a: unknown[]) => {
      if (!String(a[0]).startsWith("[research]")) realLog(...a);
    };
    console.warn = () => {};
  });
  after(() => {
    console.log = realLog;
    console.warn = realWarn;
    g.fetch = realFetch;
  });
  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    g.fetch = noNetwork();
    g.__anthropicCreate = async () => {
      throw new Error("Claude must not be called");
    };
  });

  test("RESEARCH_ENABLED=false returns no facts before any DB call, even with a fresh cached row", async () => {
    // Arrange
    setKeys();
    ENV.RESEARCH_ENABLED = "false";
    const sb = makeSupabase({ cacheRow: row({ facts: [goodFact] }) });
    // Act
    const r = await io.getSceneResearch(sb, { key: "gita:ch1", book: "gita", sceneText: GITA_SCENE, characters: ["Krishna", "Arjuna"] });
    // Assert
    assert.equal(r.status, "skipped");
    assert.deepEqual(r.facts, []);
    assert.deepEqual(r.sources, []);
    assert.deepEqual(sb.calls, []);
    assert.equal(g.fetch.called, false);
  });

  test("missing keys -> skipped with canon-only facts, no network, no cache write", async () => {
    const sb = makeSupabase();
    const r = await io.getSceneResearch(sb, { key: "gita:ch1", book: "gita", sceneText: GITA_SCENE, characters: ["Krishna", "Arjuna"] });
    assert.equal(r.status, "skipped");
    assert.equal(r.facts.length, 5);
    assert.match(r.facts[0], /exactly four white horses/);
    assert.equal(sb.calls.some((c) => c.op === "upsert"), false);
  });

  test("canon stays off a Rathayatra chariot scene", async () => {
    const r = await io.getSceneResearch(makeSupabase(), { key: "chaitanya:g1112:s1", book: "chaitanya", sceneText: RATHA_SCENE });
    assert.deepEqual(r.facts, []);
  });

  test("fresh row that already researched the scene's entities -> hit, no research, hit_count bumped", async () => {
    // Arrange
    setKeys();
    const entities = io.extractEntities(GITA_SCENE, null).all;
    const sb = makeSupabase({ cacheRow: row({ facts: [goodFact], hit_count: 4, entities }) });
    // Act
    const r = await io.getSceneResearch(sb, { key: "gita:ch1", book: "gita", sceneText: GITA_SCENE });
    await new Promise((res) => setTimeout(res, 20));
    // Assert
    assert.equal(r.status, "hit");
    assert.equal(g.fetch.called, false);
    assert.equal(r.facts.length, 6);
    assert.equal(r.facts[5], goodFact.prompt_text);
    assert.equal(r.sources.at(-1), SOURCE_URL);
    assert.deepEqual(sb.calls.find((c) => c.op === "update")?.values, { hit_count: 5 });
    assert.match(sb.calls.find((c) => c.table === "scene_visual_research" && c.op === "select")?.cols ?? "", /entities/);
  });

  test("expired row is a miss: full pipeline with the exact Firecrawl and Claude requests, cached 180d", async () => {
    setKeys();
    const sb = makeSupabase({ cacheRow: row({ expires_at: new Date(Date.now() - 1000).toISOString() }) });
    const f = firecrawlFetch();
    g.fetch = f;
    // deno-lint-ignore no-explicit-any
    let sent: any;
    g.__anthropicCreate = async (params: unknown, reqOpts: unknown, clientOpts: unknown) => {
      sent = { params, reqOpts, clientOpts };
      return toolResponse([goodFact, badFact, overriddenFact]);
    };
    const r = await io.getSceneResearch(sb, {
      key: "gita:ch1",
      book: "gita",
      sceneText: GITA_SCENE,
      title: "Observing the Armies",
      characters: ["Krishna", "Arjuna"],
    });
    assert.equal(r.status, "ok");
    assert.ok(f.seen.search >= 1 && f.seen.search <= 3, `searches=${f.seen.search}`);
    assert.ok(f.seen.scrape <= 2, `scrapes=${f.seen.scrape}`);
    for (const b of f.seen.bodies.filter((x: { url: string }) => x.url.endsWith("/search"))) {
      assert.deepEqual(Object.keys(b.body).sort(), ["limit", "query"]);
    }
    for (const b of f.seen.bodies.filter((x: { url: string }) => x.url.endsWith("/scrape"))) {
      assert.deepEqual(b.body, { url: b.body.url, formats: ["markdown"] });
    }
    assert.equal(f.seen.bodies.some((b: { body: { url?: string } }) => b.body.url?.includes("pinterest")), false);
    assert.equal(sent.params.model, "claude-opus-5");
    assert.equal(sent.params.max_tokens, 16000);
    assert.deepEqual(sent.params.betas, ["server-side-fallback-2026-07-01"]);
    assert.equal(sent.params.fallbacks, "default");
    assert.deepEqual(sent.params.output_config, { effort: "low" });
    assert.deepEqual(sent.params.tool_choice, { type: "auto" });
    assert.equal(sent.params.tools[0].strict, true);
    assert.equal(sent.params.tools[0].name, "record_visual_facts");
    assert.equal(sent.clientOpts.apiKey, "sk-test");
    assert.ok(sent.params.messages[0].content.includes(PAGE_TEXT), "scraped page text reaches Claude");
    const up = sb.calls.find((c) => c.op === "upsert") as Call;
    assert.equal(up.opts.onConflict, "research_key");
    assert.equal(up.values.status, "ok");
    assert.equal(up.values.scope, "chapter");
    assert.equal(up.values.book, "gita");
    assert.ok(up.values.entities.includes("Arjuna") && up.values.entities.includes("chariot"));
    assert.deepEqual(up.values.facts.map((x: { attribute: string }) => x.attribute), ["flag", "horses"]);
    assert.deepEqual(up.values.facts[0].triggers, ["Arjuna+chariot"]);
    const days = daysUntil(up.values.expires_at);
    assert.ok(days > 179.9 && days < 180.1, `ttl days=${days}`);
    assert.equal(r.facts.filter((x: string) => /horses/.test(x)).length, 1);
    assert.equal(r.facts.at(-1), goodFact.prompt_text);
  });

  test("Claude APIError -> failed, 6h failed row, canon still returned", async () => {
    setKeys();
    const sb = makeSupabase();
    g.fetch = firecrawlFetch();
    g.__anthropicCreate = async () => {
      throw new APIError(529, "overloaded");
    };
    const r = await io.getSceneResearch(sb, { key: "gita:ch2", book: "gita", sceneText: GITA_SCENE });
    assert.equal(r.status, "failed");
    assert.equal(r.facts.length, 5);
    const up = sb.calls.find((c) => c.op === "upsert") as Call;
    const hours = daysUntil(up.values.expires_at) * 24;
    assert.ok(up.values.status === "failed" && hours > 5.9 && hours < 6.1);
  });

  test("refusal -> empty, cached 30d", async () => {
    setKeys();
    const sb = makeSupabase();
    g.fetch = firecrawlFetch();
    g.__anthropicCreate = async () => ({ stop_reason: "refusal", content: [] });
    const r = await io.getSceneResearch(sb, { key: "gita:ch3", book: "gita", sceneText: GITA_SCENE });
    assert.equal(r.status, "empty");
    const up = sb.calls.find((c) => c.op === "upsert") as Call;
    assert.equal(up.values.status, "empty");
    assert.ok(Math.abs(daysUntil(up.values.expires_at) - 30) < 0.1);
  });

  test("no tool_use block -> empty", async () => {
    setKeys();
    g.fetch = firecrawlFetch();
    g.__anthropicCreate = async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "no" }] });
    const r = await io.getSceneResearch(makeSupabase(), { key: "gita:ch4", book: "gita", sceneText: GITA_SCENE });
    assert.equal(r.status, "empty");
  });

  test("Firecrawl 429 on every search -> failed without calling Claude", async () => {
    setKeys();
    g.fetch = firecrawlFetch({ failSearch: true });
    let called = false;
    g.__anthropicCreate = async () => {
      called = true;
      return toolResponse([]);
    };
    const r = await io.getSceneResearch(makeSupabase(), { key: "gita:ch5", book: "gita", sceneText: GITA_SCENE });
    assert.equal(r.status, "failed");
    assert.equal(called, false);
  });

  test("hanging network -> resolves by the timeout with failed + canon", async () => {
    setKeys();
    g.fetch = firecrawlFetch({ hang: true });
    const t0 = Date.now();
    const r = await io.getSceneResearch(makeSupabase(), { key: "gita:ch6", book: "gita", sceneText: GITA_SCENE }, { timeoutMs: 1500 });
    const ms = Date.now() - t0;
    assert.equal(r.status, "failed");
    assert.equal(r.facts.length, 5);
    assert.ok(ms < 2500, `took ${ms}ms`);
  });

  test("timeoutMs above 25000 is capped (returns promptly with no network)", async () => {
    const r = await io.getSceneResearch(makeSupabase(), { key: "gita:ch7", book: "gita", sceneText: GITA_SCENE }, { timeoutMs: 999999 });
    assert.equal(r.status, "skipped");
  });

  test("a supabase client that throws and a null input never reject", async () => {
    const r1 = await io.getSceneResearch(makeSupabase({ throwOnFrom: true }), { key: "gita:ch1", book: "gita", sceneText: GITA_SCENE });
    assert.ok(["skipped", "failed"].includes(r1.status));
    assert.equal(r1.facts.length, 0);
    const r2 = await io.getSceneResearch(null, null);
    assert.ok(Array.isArray(r2.facts));
  });

  test("sha16 + readerKey produce a stable 16-hex reader key", async () => {
    const h = await io.sha16("श्रीकृष्ण");
    assert.match(h, /^[0-9a-f]{16}$/);
    assert.equal(h, await io.sha16("श्रीकृष्ण"));
    assert.equal(io.readerKey("bhagavatam", h), `reader:bhagavatam:${h}`);
  });
});

describe("getSceneResearch entity delta (inline and chapter keys)", () => {
  const realLog = console.log;
  const realWarn = console.warn;
  before(() => {
    console.log = (...a: unknown[]) => {
      if (!String(a[0]).startsWith("[research]")) realLog(...a);
    };
    console.warn = () => {};
  });
  after(() => {
    console.log = realLog;
    console.warn = realWarn;
    g.fetch = realFetch;
  });
  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    setKeys();
    g.fetch = noNetwork();
    g.__anthropicCreate = async () => {
      throw new Error("Claude must not be called");
    };
  });
  const input = { key: "bhagavatam:g10:inline", book: "bhagavatam", sceneText: DELTA_SCENE };

  test("a fresh empty row from a different scene does not block research for the new scene", async () => {
    // Arrange: the row researched Prahlada and Nrisimha; this scene has Krishna, Garuda, a chariot, horses, a banner
    const sb = makeSupabase({ cacheRow: row({ status: "empty", entities: ["Prahlada", "Nrisimha"] }) });
    const f = firecrawlFetch({ url: DELTA_URL, page: DELTA_PAGE });
    g.fetch = f;
    g.__anthropicCreate = async () => toolResponse([garudaFact]);
    // Act
    const r = await io.getSceneResearch(sb, input);
    // Assert
    assert.equal(r.status, "ok");
    assert.ok(f.seen.search >= 1 && f.seen.search <= 3, `searches=${f.seen.search}`);
    assert.ok(f.seen.scrape <= 2, `scrapes=${f.seen.scrape}`);
    assert.equal(r.facts.at(-1), garudaFact.prompt_text);
    assert.equal(r.facts.some((x: string) => /four white horses/.test(x)), false);
    const up = sb.calls.find((c) => c.op === "upsert") as Call;
    assert.equal(up.values.status, "ok");
    assert.equal(up.values.scope, "inline");
    for (const e of ["Prahlada", "Nrisimha", "Krishna", "Garuda", "banner"]) {
      assert.ok(up.values.entities.includes(e), `entities missing ${e}`);
    }
    assert.deepEqual(up.values.facts.map((x: { prompt_text: string }) => x.prompt_text), [garudaFact.prompt_text]);
    assert.ok(Math.abs(daysUntil(up.values.expires_at) - 180) < 0.1);
  });

  test("new facts are merged into an ok row, which keeps its expiry", async () => {
    const expires = new Date(Date.now() + 10 * DAY_MS).toISOString();
    const sb = makeSupabase({ cacheRow: row({ facts: [fluteFact], entities: ["Krishna", "flute"], expires_at: expires }) });
    g.fetch = firecrawlFetch({ url: DELTA_URL, page: DELTA_PAGE });
    g.__anthropicCreate = async () => toolResponse([garudaFact]);
    const r = await io.getSceneResearch(sb, input);
    assert.equal(r.status, "ok");
    assert.ok(r.facts.includes(fluteFact.prompt_text) && r.facts.includes(garudaFact.prompt_text));
    const up = sb.calls.find((c) => c.op === "upsert") as Call;
    assert.deepEqual(up.values.facts.map((x: { attribute: string }) => x.attribute), ["flute", "banner"]);
    assert.equal(up.values.expires_at, expires);
  });

  test("an empty delta keeps the row's facts and caps its expiry at 30 days", async () => {
    const sb = makeSupabase({
      cacheRow: row({ facts: [fluteFact], entities: ["Krishna", "flute"], expires_at: new Date(Date.now() + 170 * DAY_MS).toISOString() }),
    });
    g.fetch = firecrawlFetch({ url: DELTA_URL, page: DELTA_PAGE });
    g.__anthropicCreate = async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "nothing" }] });
    const r = await io.getSceneResearch(sb, input);
    assert.equal(r.status, "empty");
    assert.ok(r.facts.includes(fluteFact.prompt_text));
    const up = sb.calls.find((c) => c.op === "upsert") as Call;
    assert.equal(up.values.status, "ok");
    assert.ok(up.values.entities.includes("Garuda"));
    assert.ok(Math.abs(daysUntil(up.values.expires_at) - 30) < 0.1);
  });

  test("a failed delta leaves the row untouched and still serves its facts", async () => {
    const sb = makeSupabase({ cacheRow: row({ facts: [fluteFact], entities: ["Krishna"] }) });
    g.fetch = firecrawlFetch({ failSearch: true });
    const r = await io.getSceneResearch(sb, input);
    assert.equal(r.status, "failed");
    assert.ok(r.facts.includes(fluteFact.prompt_text));
    assert.equal(sb.calls.some((c) => c.op === "upsert"), false);
  });

  test("a fresh failed row is a back-off: served as a hit without research", async () => {
    const sb = makeSupabase({ cacheRow: row({ status: "failed", entities: [] }) });
    const r = await io.getSceneResearch(sb, input);
    assert.equal(r.status, "hit");
    assert.equal(g.fetch.called, false);
  });

  test("regenerating the same scene on an inline key is a hit", async () => {
    const entities = io.extractEntities(DELTA_SCENE, null).all;
    const sb = makeSupabase({ cacheRow: row({ facts: [garudaFact], entities }) });
    const r = await io.getSceneResearch(sb, input);
    assert.equal(r.status, "hit");
    assert.equal(g.fetch.called, false);
    assert.equal(r.facts.at(-1), garudaFact.prompt_text);
  });
});

// A stubbed supabase client whose research-table read returns `cache`
// ({ data, error } as PostgREST would) or throws. Records reads and writes.
// deno-lint-ignore no-explicit-any
function makeCacheClient(cache: { data?: unknown; error?: unknown } | "throw", canon: unknown[] = CANON): any {
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    reads,
    writes,
    from(table: string) {
      if (table === "scene_visual_research" && cache === "throw") throw new Error("connection reset");
      let op = "select";
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: () => b,
        update: () => {
          op = "update";
          return b;
        },
        upsert: () => {
          op = "upsert";
          return b;
        },
        // deno-lint-ignore no-explicit-any
        then(res: any, rej: any) {
          if (op === "select") reads.push(table);
          else writes.push(`${table}:${op}`);
          if (table === "scene_visual_canon") return Promise.resolve({ data: canon, error: null }).then(res, rej);
          if (op !== "select" || cache === "throw") return Promise.resolve({ data: null, error: null }).then(res, rej);
          return Promise.resolve({ data: cache.data ?? null, error: cache.error ?? null }).then(res, rej);
        },
      };
      return b;
    },
  };
}

const tick = () => new Promise((res) => setTimeout(res, 20));

describe("getSceneResearch: a cache read error is not a miss", () => {
  const realLog = console.log;
  const realWarn = console.warn;
  before(() => {
    console.log = (...a: unknown[]) => {
      if (!String(a[0]).startsWith("[research]")) realLog(...a);
    };
    console.warn = () => {};
  });
  after(() => {
    console.log = realLog;
    console.warn = realWarn;
    g.fetch = realFetch;
  });
  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    setKeys();
    g.fetch = noNetwork();
    g.__anthropicCreate = async () => {
      throw new Error("Claude must not be called");
    };
  });
  const input = { key: "gita:ch1", book: "gita", sceneText: GITA_SCENE, characters: ["Krishna", "Arjuna"] };

  test("PostgREST error with both keys set -> failed, canon-only facts, no Firecrawl, no Claude, no write", async () => {
    // Arrange
    const sb = makeCacheClient({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    // Act
    const r = await io.getSceneResearch(sb, input);
    await tick();
    // Assert
    assert.equal(r.status, "failed");
    assert.equal(r.facts.length, 5);
    assert.match(r.facts[0], /exactly four white horses/);
    assert.equal(g.fetch.called, false);
    assert.deepEqual(sb.writes, []);
  });

  test("missing table (migration not applied) -> failed with no network", async () => {
    const sb = makeCacheClient({ data: null, error: { code: "42P01", message: 'relation "public.scene_visual_research" does not exist' } }, []);
    const r = await io.getSceneResearch(sb, input);
    await tick();
    assert.equal(r.status, "failed");
    assert.deepEqual(r.facts, []);
    assert.equal(g.fetch.called, false);
    assert.deepEqual(sb.writes, []);
  });

  test("a client that throws on the cache read -> failed with canon, no network, no write", async () => {
    const sb = makeCacheClient("throw");
    const r = await io.getSceneResearch(sb, input);
    await tick();
    assert.equal(r.status, "failed");
    assert.equal(r.facts.length, 5);
    assert.equal(g.fetch.called, false);
    assert.deepEqual(sb.writes, []);
  });

  test("an unexpected payload (an array, not a row) is treated as a read error", async () => {
    const sb = makeCacheClient({ data: [row({ facts: [goodFact] })], error: null });
    const r = await io.getSceneResearch(sb, input);
    assert.equal(r.status, "failed");
    assert.equal(g.fetch.called, false);
    assert.deepEqual(sb.writes, []);
  });

  test("no row (data null, error null) is still a miss: research runs and the result is cached", async () => {
    // Arrange
    const sb = makeCacheClient({ data: null, error: null });
    g.fetch = firecrawlFetch();
    g.__anthropicCreate = async () => toolResponse([goodFact]);
    // Act
    const r = await io.getSceneResearch(sb, input);
    // Assert
    assert.equal(r.status, "ok");
    assert.ok(g.fetch.seen.search >= 1);
    assert.deepEqual(sb.writes, ["scene_visual_research:upsert"]);
  });
});

describe("getSceneResearch with allowNetwork: false", () => {
  const realLog = console.log;
  const realWarn = console.warn;
  before(() => {
    console.log = (...a: unknown[]) => {
      if (!String(a[0]).startsWith("[research]")) realLog(...a);
    };
    console.warn = () => {};
  });
  after(() => {
    console.log = realLog;
    console.warn = realWarn;
    g.fetch = realFetch;
  });
  beforeEach(() => {
    for (const k of Object.keys(ENV)) delete ENV[k];
    setKeys();
    g.fetch = noNetwork();
    g.__anthropicCreate = async () => {
      throw new Error("Claude must not be called");
    };
  });
  const input = { key: "bhagavatam:g10:inline", book: "bhagavatam", sceneText: GITA_SCENE, characters: ["Krishna", "Arjuna"] };
  const noWrites = (sb: { calls: Call[] }) => sb.calls.filter((c) => c.op !== "select");

  test("serves a fresh row plus canon as a hit, without researching its unresearched entities or bumping hit_count", async () => {
    // Arrange: entities [] means every entity is unresearched, which would trigger a delta with network
    const sb = makeSupabase({ cacheRow: row({ facts: [goodFact], entities: [], hit_count: 3 }) });
    // Act
    const r = await io.getSceneResearch(sb, input, { allowNetwork: false });
    await tick();
    // Assert
    assert.equal(r.status, "hit");
    assert.equal(r.facts.length, 6);
    assert.equal(r.facts[5], goodFact.prompt_text);
    assert.equal(r.sources.at(-1), SOURCE_URL);
    assert.equal(g.fetch.called, false);
    assert.deepEqual(noWrites(sb), []);
  });

  test("an expired row is not served: canon only, skipped, no network, no write", async () => {
    const sb = makeSupabase({ cacheRow: row({ facts: [goodFact], expires_at: new Date(Date.now() - 1000).toISOString() }) });
    const r = await io.getSceneResearch(sb, input, { allowNetwork: false });
    await tick();
    assert.equal(r.status, "skipped");
    assert.equal(r.facts.length, 5);
    assert.equal(r.facts.includes(goodFact.prompt_text), false);
    assert.equal(g.fetch.called, false);
    assert.deepEqual(noWrites(sb), []);
  });

  test("no cached row with both keys set: canon only, skipped, no network, no write", async () => {
    const sb = makeSupabase({ cacheRow: null });
    const r = await io.getSceneResearch(sb, input, { allowNetwork: false });
    await tick();
    assert.equal(r.status, "skipped");
    assert.equal(r.facts.length, 5);
    assert.equal(g.fetch.called, false);
    assert.deepEqual(noWrites(sb), []);
  });

  test("a fresh failed row is served as a hit with canon only", async () => {
    const sb = makeSupabase({ cacheRow: row({ status: "failed" }) });
    const r = await io.getSceneResearch(sb, input, { allowNetwork: false });
    assert.equal(r.status, "hit");
    assert.equal(r.facts.length, 5);
  });

  test("forceRefresh has no effect: the fresh row is still served", async () => {
    const sb = makeSupabase({ cacheRow: row({ facts: [goodFact] }) });
    const r = await io.getSceneResearch(sb, input, { allowNetwork: false, forceRefresh: true });
    assert.equal(r.status, "hit");
    assert.ok(r.facts.includes(goodFact.prompt_text));
    assert.equal(g.fetch.called, false);
  });

  test("a cache read error still returns canon only with failed", async () => {
    const sb = makeCacheClient({ data: null, error: { code: "08006", message: "connection failure" } });
    const r = await io.getSceneResearch(sb, input, { allowNetwork: false });
    assert.equal(r.status, "failed");
    assert.equal(r.facts.length, 5);
    assert.deepEqual(sb.writes, []);
  });

  test("an empty key reads no cache row and returns canon only", async () => {
    const sb = makeCacheClient({ data: row({ facts: [goodFact] }), error: null });
    const r = await io.getSceneResearch(sb, { ...input, key: "" }, { allowNetwork: false });
    assert.equal(r.status, "skipped");
    assert.equal(r.facts.length, 5);
    assert.equal(sb.reads.includes("scene_visual_research"), false);
  });

  test("allowNetwork: true behaves like the default (a miss researches)", async () => {
    const sb = makeSupabase({ cacheRow: null });
    g.fetch = firecrawlFetch();
    g.__anthropicCreate = async () => toolResponse([goodFact]);
    const r = await io.getSceneResearch(sb, input, { allowNetwork: true });
    assert.equal(r.status, "ok");
    assert.ok(g.fetch.seen.search >= 1);
  });
});

describe("Anthropic SDK import", () => {
  const PINNED = 'import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";';

  test("sceneResearch.ts imports exactly the pinned SDK version, once", async () => {
    // Arrange
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../supabase/functions/_shared/sceneResearch.ts", import.meta.url), "utf8");
    // Act
    const specifiers = [...src.matchAll(/from\s+"(npm:@anthropic-ai\/sdk[^"]*)"/g)].map((m) => m[1]);
    // Assert
    assert.ok(src.split("\n").includes(PINNED), "pinned import line missing");
    assert.deepEqual(specifiers, ["npm:@anthropic-ai/sdk@0.125.0"]);
  });

  test("the test hook stubs only the pinned specifier, so an unpinned import cannot pass", async () => {
    const hooks = await import("./helpers/npm-stub-hooks.mjs");
    const next = (s: string) => {
      throw new Error(`unresolved ${s}`);
    };
    const pinned = await hooks.resolve("npm:@anthropic-ai/sdk@0.125.0", {}, next);
    assert.match(pinned.url, /anthropic-stub\.mjs$/);
    await assert.rejects(() => hooks.resolve("npm:@anthropic-ai/sdk", {}, next), /unresolved npm:@anthropic-ai\/sdk/);
    await assert.rejects(() => hooks.resolve("npm:@anthropic-ai/sdk@0.124.0", {}, next), /unresolved/);
  });
});
