// Scene research: IO wrapper around sceneResearchCore.ts.
//
// getSceneResearch() returns verified, sourced VISUAL facts for a scene, ready
// for assemblePrompt(). It NEVER throws and never blocks image generation: on a
// missing key, timeout, HTTP error, refusal, malformed output or zero verified
// facts it resolves with canon-only facts (or none), and generation proceeds
// exactly as it does without research.
//
// Cost control: Firecrawl's credit pool is shared with the CRM enrichment crons,
// so one research run makes at most 3 searches and 2 scrapes. Results are cached
// in public.scene_visual_research (ok 180d, empty 30d, failed 6h). Note that a
// reject in the review queues moves to the NEXT scene, which is a new key, so
// the cache pays off for regenerates of the same scene/key, not for rejects.
//
// Entity delta: inline keys ('<book>:g<n>:inline') and Gita chapter keys cover
// a DIFFERENT scene on each generation. A fresh row is only a hit when it has
// already researched every character and object of the current scene;
// otherwise the new entities are researched (same 3-search / 2-scrape cap) and
// merged into the row.
//
// Kill switch: RESEARCH_ENABLED=false returns no facts before any DB call, so
// generation is exactly what it is without research (cached facts included).
//
// Cache read errors: a PostgREST error (or a thrown client) while reading the
// cache row is NOT a miss. The call returns canon-only facts with status
// "failed", makes no Firecrawl or Claude call and writes nothing, so a transient
// DB error (or a missing migration) neither spends credits nor overwrites a
// possibly good row.
//
// Network-free mode: opts.allowNetwork=false serves a fresh cached row plus canon
// ("hit"), or canon only ("skipped"); it never calls Firecrawl or Claude and
// never writes (not even hit_count). For bulk runs.

// Pinned: an unpinned specifier resolves to whatever is newest at deploy time,
// and a function that fails to boot blocks image generation outright.
import Anthropic from "npm:@anthropic-ai/sdk@0.125.0";
import {
  buildResearchUserMessage,
  buildSearchQueries,
  type CanonRow,
  canonicalUrl,
  extractEntities,
  type FetchedSource,
  filterSearchResults,
  focusEntities,
  mergeCanon,
  normalizeForMatch,
  RESEARCH_SYSTEM_PROMPT,
  RESEARCH_VERSION,
  resolveFactConflicts,
  scopeForKey,
  type SceneEntities,
  sourceTier,
  type StoredStatus,
  ttlFor,
  unresearchedEntities,
  verifyFacts,
  VISUAL_FACTS_INPUT_SCHEMA,
  VISUAL_FACTS_TOOL_NAME,
  type VisualFact,
} from "./sceneResearchCore.ts";

// One import site for integrators: keys, assemblePrompt, sanitizer, types.
export * from "./sceneResearchCore.ts";

const RESEARCH_TABLE = "scene_visual_research";
const CANON_TABLE = "scene_visual_canon";

// Same endpoint and timeouts as the CRM's proven Firecrawl callers
// (enrich-client-profile): real search latency can exceed 1-4s.
const FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v1";
const FIRECRAWL_SEARCH_TIMEOUT_MS = 10_000;
const FIRECRAWL_SCRAPE_TIMEOUT_MS = 10_000;
// Page text is only there to hold a verbatim quote; a smaller page keeps the
// Claude call fast. Two 15k-char pages made it too slow for its window.
const MAX_SCRAPE_CONTENT_CHARS = 6_000;

// Live run 2026-09-13 (gita:ch1): the old 25s cap left Claude ~12s to read two
// 15k-char pages with thinking on; it was aborted at 25005ms and produced no
// facts. Claude now gets a real reserve. Bulk and multi-chapter runs are
// network-free, so this only affects single interactive or background misses.
const HARD_CAP_MS = 60_000;
const CLAUDE_RESERVE_MS = 35_000;
const MIN_SCRAPE_WINDOW_MS = 4_000;
const MIN_CLAUDE_WINDOW_MS = 3_000;
const MAX_SEARCHES = 3;
const MAX_SCRAPES = 2;
const SEARCH_LIMIT = 5;
const MAX_SOURCES = 10;
// Inline and chapter rows accumulate facts across scenes; triggers pick per scene.
const MAX_STORED_FACTS = 40;
const MAX_STORED_SOURCES = 30;
const RESEARCH_MODEL = "claude-opus-5";

export type ResearchStatus = "hit" | "ok" | "empty" | "failed" | "skipped";

export interface SceneResearchInput {
  key: string;
  book: string;
  sceneText: string;
  title?: string | null;
  characters?: string[] | null;
}

export interface SceneResearchOptions {
  /** Total hard cap in ms (default and maximum 60000). */
  timeoutMs?: number;
  /** Ignore a fresh cache row and research again. Has no effect when allowNetwork is false. */
  forceRefresh?: boolean;
  /**
   * Default true. false = never call Firecrawl or Claude and never write: serve a
   * fresh (non-expired) cached row plus canon ("hit"), otherwise canon only
   * ("skipped"). A cache read error still returns canon only with "failed".
   */
  allowNetwork?: boolean;
}

export interface SceneResearchResult {
  /** prompt_text strings, canon first, already selected for this scene. */
  facts: string[];
  status: ResearchStatus;
  /** Provenance of each included fact, in order: canon `source` labels, then web source URLs. */
  sources: string[];
  key: string;
  ms: number;
}

// Structural type so this module needs no supabase-js import; pass the
// client from createClient(url, SERVICE_ROLE_KEY).
// deno-lint-ignore no-explicit-any
export type SupabaseLike = { from: (table: string) => any };

interface CacheRow {
  facts: unknown;
  status: string;
  expires_at: string;
  research_version: number | null;
  hit_count: number | null;
  entities: unknown;
  sources: unknown;
}

interface ResearchKeys {
  firecrawl: string;
  anthropic: string;
}

interface ResearchRun {
  status: StoredStatus;
  kept: VisualFact[];
  sources: FetchedSource[];
}

interface RunState {
  key: string;
  book: string;
  selectionText: string;
  canon: CanonRow[];
}

function env(name: string): string | undefined {
  try {
    // deno-lint-ignore no-explicit-any
    const v = (globalThis as any).Deno?.env?.get(name);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

function errName(e: unknown): string {
  return e instanceof Error ? e.name : typeof e;
}

/** RESEARCH_ENABLED=false (also 0/off/no, any case) turns research off entirely. */
function researchDisabled(): boolean {
  const v = env("RESEARCH_ENABLED");
  return typeof v === "string" && ["false", "0", "off", "no"].includes(v.trim().toLowerCase());
}

function researchKeys(): ResearchKeys | null {
  const firecrawl = env("FIRECRAWL_API_KEY");
  const anthropic = env("ANTHROPIC_API_KEY");
  return firecrawl && anthropic ? { firecrawl, anthropic } : null;
}

/** First 16 hex chars of SHA-256(text), for readerKey(book, await sha16(selected_text)). */
export async function sha16(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text ?? "")));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// ── Firecrawl ────────────────────────────────────────────────────────────────

function linkedController(timeoutMs: number, signal: AbortSignal): { controller: AbortController; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", onAbort);
  return {
    controller,
    done: () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    },
  };
}

async function firecrawlSearch(
  apiKey: string,
  query: string,
  limit: number,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ ok: boolean; results: unknown[] }> {
  const { controller, done } = linkedController(timeoutMs, signal);
  try {
    const res = await fetch(`${FIRECRAWL_API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      // { query, limit } only: a "sources" param makes this endpoint return nothing.
      body: JSON.stringify({ query, limit }),
      signal: controller.signal,
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      console.warn(`[research] firecrawl search HTTP ${res.status}`);
      return { ok: false, results: [] };
    }
    const j = await res.json();
    const web = j?.data?.web ?? j?.data ?? j?.results ?? [];
    return { ok: true, results: Array.isArray(web) ? web : [] };
  } catch (e) {
    console.warn(`[research] firecrawl search error ${errName(e)}`);
    return { ok: false, results: [] };
  } finally {
    done();
  }
}

async function firecrawlScrape(apiKey: string, url: string, timeoutMs: number, signal: AbortSignal): Promise<string | null> {
  const { controller, done } = linkedController(timeoutMs, signal);
  try {
    const res = await fetch(`${FIRECRAWL_API_BASE}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: controller.signal,
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      console.warn(`[research] firecrawl scrape HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const markdown = json.data?.markdown ?? json.markdown ?? null;
    return typeof markdown === "string" ? markdown.slice(0, MAX_SCRAPE_CONTENT_CHARS) : null;
  } catch (e) {
    console.warn(`[research] firecrawl scrape error ${errName(e)}`);
    return null;
  } finally {
    done();
  }
}

// ── Claude ───────────────────────────────────────────────────────────────────

type ProposalOutcome = "ok" | "refusal" | "no_tool" | "error";

async function proposeFacts(
  apiKey: string,
  userMessage: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ candidates: unknown[]; outcome: ProposalOutcome }> {
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create(
      {
        model: RESEARCH_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: RESEARCH_SYSTEM_PROMPT,
        tools: [
          {
            name: VISUAL_FACTS_TOOL_NAME,
            description:
              "Record canonical visual facts about the scene's entities. Each fact must quote, word for word, the source it cites.",
            strict: true,
            input_schema: VISUAL_FACTS_INPUT_SCHEMA,
          },
        ],
        // Not forced: thinking is on by default on claude-opus-5 and forced tool
        // use conflicts with it. The prompt instructs the model to call the tool.
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: userMessage }],
      },
      // No retry: inside a fixed deadline a second attempt can never finish.
      { timeout: Math.max(1000, timeoutMs), maxRetries: 0, signal },
    );
    if (response.stop_reason === "refusal") return { candidates: [], outcome: "refusal" };
    const block = response.content.find((b) => b.type === "tool_use" && b.name === VISUAL_FACTS_TOOL_NAME);
    if (!block || block.type !== "tool_use") return { candidates: [], outcome: "no_tool" };
    const facts = (block.input as { facts?: unknown } | null)?.facts;
    return Array.isArray(facts) ? { candidates: facts, outcome: "ok" } : { candidates: [], outcome: "no_tool" };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.warn(`[research] claude API error ${e.status ?? "connection"}`);
    } else {
      console.warn(`[research] claude unexpected error ${errName(e)}`);
    }
    return { candidates: [], outcome: "error" };
  }
}

// ── Cache and canon ──────────────────────────────────────────────────────────

async function loadCanon(supabase: SupabaseLike): Promise<CanonRow[]> {
  try {
    const { data, error } = await supabase
      .from(CANON_TABLE)
      .select("id, subject, attribute, prompt_text, triggers, context_triggers, negative_triggers, book, source, active")
      .eq("active", true)
      .order("id", { ascending: true })
      .limit(500);
    if (error || !Array.isArray(data)) return [];
    return data as CanonRow[];
  } catch {
    return [];
  }
}

/**
 * `error: true` means the cache could NOT be read (PostgREST error, a thrown
 * client, an unexpected payload). That is not a miss: the caller must not pay
 * for research or overwrite a row it could not see.
 */
interface CacheRead {
  row: CacheRow | null;
  error: boolean;
}

const NO_CACHE_READ: CacheRead = { row: null, error: false };

async function readCache(supabase: SupabaseLike, key: string): Promise<CacheRead> {
  try {
    const { data, error } = await supabase
      .from(RESEARCH_TABLE)
      .select("facts, status, expires_at, research_version, hit_count, entities, sources")
      .eq("research_key", key)
      .maybeSingle();
    if (error) return { row: null, error: true };
    if (data === null || data === undefined) return { row: null, error: false };
    if (typeof data !== "object" || Array.isArray(data)) return { row: null, error: true };
    return { row: data as CacheRow, error: false };
  } catch {
    return { row: null, error: true };
  }
}

function isFresh(row: CacheRow, nowMs: number): boolean {
  const expires = Date.parse(row.expires_at);
  return ["ok", "empty", "failed"].includes(row.status) && Number.isFinite(expires) && expires > nowMs &&
    Number(row.research_version ?? 0) >= RESEARCH_VERSION;
}

function bumpHitCount(supabase: SupabaseLike, key: string, previous: number | null): void {
  try {
    // A query builder only runs when then() is called; Promise.resolve does that.
    const p = Promise.resolve(
      supabase.from(RESEARCH_TABLE).update({ hit_count: (Number(previous) || 0) + 1 }).eq("research_key", key),
    ).then(() => undefined, () => undefined);
    // deno-lint-ignore no-explicit-any
    const edge = (globalThis as any).EdgeRuntime;
    if (edge && typeof edge.waitUntil === "function") edge.waitUntil(p);
  } catch {
    // telemetry only
  }
}

async function storeResult(
  supabase: SupabaseLike,
  state: RunState,
  entities: SceneEntities | null,
  facts: VisualFact[],
  sources: FetchedSource[],
  status: StoredStatus,
): Promise<void> {
  try {
    const now = Date.now();
    const { error } = await supabase.from(RESEARCH_TABLE).upsert(
      {
        research_key: state.key,
        book: state.book || "unknown",
        scope: scopeForKey(state.key),
        entities: entities?.all ?? [],
        facts: facts.slice(0, MAX_STORED_FACTS),
        sources: sources.map((s) => ({ url: s.url, title: s.title ?? "", tier: sourceTier(s.url), scraped: !!s.text })),
        status,
        research_version: RESEARCH_VERSION,
        refreshed_at: new Date(now).toISOString(),
        expires_at: new Date(ttlFor(status, now)).toISOString(),
      },
      { onConflict: "research_key" },
    );
    if (error) console.warn(`[research] cache write failed for ${state.key}`);
  } catch {
    console.warn(`[research] cache write threw for ${state.key}`);
  }
}

/**
 * Merge newly researched facts into a fresh cached row (entity delta) and write
 * it back. Returns the merged facts. Conflicts between old and new facts drop
 * both (resolveFactConflicts). Expiry: new ok facts keep an ok row's expiry
 * (or get the ok TTL on a previously empty row); an empty delta caps the row at
 * the empty TTL so those entities are retried within 30 days.
 */
async function storeMerged(
  supabase: SupabaseLike,
  state: RunState,
  row: CacheRow,
  entities: SceneEntities,
  delta: ResearchRun,
): Promise<VisualFact[]> {
  const previous = Array.isArray(row.facts) ? (row.facts as VisualFact[]) : [];
  const facts = resolveFactConflicts([...previous, ...delta.kept]).kept.slice(0, MAX_STORED_FACTS);
  try {
    const now = Date.now();
    const rowExpires = Date.parse(row.expires_at);
    const rowExp = Number.isFinite(rowExpires) ? rowExpires : now;
    const status: StoredStatus = facts.length > 0 ? "ok" : "empty";
    const expires = delta.status === "ok" && status === "ok"
      ? (row.status === "ok" ? rowExp : ttlFor("ok", now))
      : Math.min(rowExp, ttlFor("empty", now));

    const entityList: string[] = [];
    const entityKeys = new Set<string>();
    const oldEntities = Array.isArray(row.entities) ? row.entities : [];
    for (const e of [...oldEntities, ...entities.all]) {
      if (typeof e !== "string") continue;
      const k = normalizeForMatch(e);
      if (!k || entityKeys.has(k)) continue;
      entityKeys.add(k);
      entityList.push(e);
    }

    const sourceList: unknown[] = [];
    const sourceKeys = new Set<string>();
    const newSources = delta.sources.map((s) => ({
      url: s.url,
      title: s.title ?? "",
      tier: sourceTier(s.url),
      scraped: !!s.text,
    }));
    for (const s of [...(Array.isArray(row.sources) ? row.sources : []), ...newSources]) {
      const url = (s as { url?: unknown } | null)?.url;
      if (typeof url !== "string") continue;
      const k = canonicalUrl(url);
      if (sourceKeys.has(k)) continue;
      sourceKeys.add(k);
      sourceList.push(s);
    }

    const { error } = await supabase.from(RESEARCH_TABLE).upsert(
      {
        research_key: state.key,
        book: state.book || "unknown",
        scope: scopeForKey(state.key),
        entities: entityList,
        facts,
        sources: sourceList.slice(-MAX_STORED_SOURCES),
        status,
        research_version: RESEARCH_VERSION,
        refreshed_at: new Date(now).toISOString(),
        expires_at: new Date(expires).toISOString(),
      },
      { onConflict: "research_key" },
    );
    if (error) console.warn(`[research] cache merge failed for ${state.key}`);
  } catch {
    console.warn(`[research] cache merge threw for ${state.key}`);
  }
  return facts;
}

// ── getSceneResearch ─────────────────────────────────────────────────────────

type Outcome = Omit<SceneResearchResult, "ms">;

function outcome(state: RunState, webFacts: unknown, status: ResearchStatus): Outcome {
  const web = Array.isArray(webFacts) ? (webFacts as VisualFact[]) : [];
  const merged = mergeCanon(state.canon, web, state.selectionText, { book: state.book });
  return {
    facts: merged.map((f) => f.prompt_text),
    status,
    sources: [...new Set(merged.map((f) => f.source).filter((s) => typeof s === "string" && s.length > 0))],
    key: state.key,
  };
}

/**
 * One research pass for `entities`: at most MAX_SEARCHES searches, MAX_SCRAPES
 * scrapes and one Claude call, all inside the deadline. Never writes the cache.
 */
async function research(
  state: RunState,
  keys: ResearchKeys,
  title: string | null,
  sceneText: string,
  entities: SceneEntities,
  signal: AbortSignal,
  deadline: number,
): Promise<ResearchRun> {
  const remaining = () => deadline - Date.now();
  const queries = buildSearchQueries(entities, { book: state.book, title }).slice(0, MAX_SEARCHES);
  if (queries.length === 0) return { status: "empty", kept: [], sources: [] };

  const searchTimeout = Math.min(FIRECRAWL_SEARCH_TIMEOUT_MS, Math.max(1000, remaining() - CLAUDE_RESERVE_MS));
  const searches = await Promise.all(
    queries.map((q) => firecrawlSearch(keys.firecrawl, q, SEARCH_LIMIT, searchTimeout, signal)),
  );
  const sources = filterSearchResults(searches.flatMap((s) => s.results), MAX_SOURCES);
  if (sources.length === 0) {
    const status: StoredStatus = searches.some((s) => s.ok) && !signal.aborted ? "empty" : "failed";
    return { status, kept: [], sources: [] };
  }

  // Snippets rarely state counts; page text from the top sources usually does.
  const scrapeWindow = remaining() - CLAUDE_RESERVE_MS;
  if (scrapeWindow >= MIN_SCRAPE_WINDOW_MS && !signal.aborted) {
    const targets = sources.slice(0, MAX_SCRAPES);
    const texts = await Promise.all(
      targets.map((s) =>
        firecrawlScrape(keys.firecrawl, s.url, Math.min(FIRECRAWL_SCRAPE_TIMEOUT_MS, scrapeWindow), signal)
      ),
    );
    targets.forEach((s, i) => {
      const t = texts[i];
      if (t) s.text = t;
    });
  }

  const claudeWindow = remaining() - 500;
  if (claudeWindow < MIN_CLAUDE_WINDOW_MS || signal.aborted) return { status: "failed", kept: [], sources };
  const userMessage = buildResearchUserMessage({
    book: state.book,
    title,
    sceneText,
    entities,
    sources,
    canonPairs: state.canon.map((c) => ({ subject: c.subject, attribute: c.attribute })),
  });
  const proposal = await proposeFacts(keys.anthropic, userMessage, claudeWindow, signal);
  if (proposal.outcome === "error") return { status: "failed", kept: [], sources };

  const { kept, dropped } = verifyFacts(proposal.candidates, sources);
  if (dropped.length > 0) {
    const reasons = [...new Set(dropped.map((d) => d.reason))].join(",");
    console.log(`[research] ${state.key} dropped=${dropped.length} (${reasons}) outcome=${proposal.outcome}`);
  }
  return { status: kept.length > 0 ? "ok" : "empty", kept, sources };
}

async function run(
  supabase: SupabaseLike,
  input: SceneResearchInput,
  opts: SceneResearchOptions | undefined,
  state: RunState,
  signal: AbortSignal,
  deadline: number,
): Promise<Outcome> {
  const sceneText = String(input?.sceneText ?? "");
  const title = typeof input?.title === "string" ? input.title : null;
  const characters = Array.isArray(input?.characters)
    ? input.characters.filter((c): c is string => typeof c === "string")
    : null;
  const entities = extractEntities([title, sceneText].filter(Boolean).join(". "), characters);

  const allowNetwork = opts?.allowNetwork !== false;
  const canonPromise = loadCanon(supabase);
  const skipRead = !state.key || (allowNetwork && !!opts?.forceRefresh);
  const cachePromise = skipRead ? Promise.resolve(NO_CACHE_READ) : readCache(supabase, state.key);
  state.canon = await canonPromise;
  const { row, error: cacheReadError } = await cachePromise;

  // Not a miss: never pay for research, and never overwrite a row we could not see.
  if (cacheReadError) return outcome(state, [], "failed");
  const fresh = row !== null && isFresh(row, Date.now());
  // Network-free: a fresh row is served as-is (no entity delta, no hit_count write).
  if (!allowNetwork) return fresh ? outcome(state, (row as CacheRow).facts, "hit") : outcome(state, [], "skipped");

  const keys = state.key ? researchKeys() : null;

  if (row && fresh) {
    // A fresh failed row is a short back-off: serve it without retrying.
    const missing = row.status === "failed" ? [] : unresearchedEntities(entities, row.entities);
    if (missing.length === 0 || !keys || signal.aborted) {
      bumpHitCount(supabase, state.key, row.hit_count);
      return outcome(state, row.facts, "hit");
    }
    // Entity delta: this key's row was researched for a different scene.
    const delta = await research(state, keys, title, sceneText, focusEntities(entities, missing), signal, deadline);
    // On failure keep the row untouched (its facts stay valid) and retry next time.
    if (delta.status === "failed") return outcome(state, row.facts, "failed");
    const merged = await storeMerged(supabase, state, row, entities, delta);
    return outcome(state, merged, delta.status);
  }

  if (!state.key || !keys) return outcome(state, [], "skipped");
  if (signal.aborted) return outcome(state, [], "failed");

  const result = await research(state, keys, title, sceneText, entities, signal, deadline);
  await storeResult(supabase, state, entities, result.kept, result.sources, result.status);
  return outcome(state, result.kept, result.status);
}

/**
 * Verified, sourced visual facts for one scene. Never throws; on any failure
 * resolves with canon-only facts (possibly none) and a non-"ok" status.
 * RESEARCH_ENABLED=false resolves { facts: [], status: "skipped" } before any
 * DB or network call. A cache read error resolves canon-only facts with
 * "failed" and no network call or write. opts.allowNetwork=false never calls
 * Firecrawl or Claude and never writes: "hit" when a fresh cached row was
 * served, otherwise "skipped".
 */
export async function getSceneResearch(
  supabase: SupabaseLike,
  input: SceneResearchInput,
  opts?: SceneResearchOptions,
): Promise<SceneResearchResult> {
  const started = Date.now();
  const state: RunState = { key: "", book: "", selectionText: "", canon: [] };
  const finish = (o: Outcome): SceneResearchResult => {
    const ms = Date.now() - started;
    console.log(`[research] ${o.key || "(no key)"} ${o.status} ${ms}ms facts=${o.facts.length}`);
    return { ...o, ms };
  };
  const safeOutcome = (status: ResearchStatus): Outcome => {
    try {
      return outcome(state, [], status);
    } catch {
      return { facts: [], status, sources: [], key: state.key };
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    state.key = typeof input?.key === "string" ? input.key.trim() : "";
    // Kill switch first: no cache read, no canon, no writes, no network.
    if (researchDisabled()) return finish({ facts: [], status: "skipped", sources: [], key: state.key });
    state.book = String(input?.book ?? "").trim().toLowerCase();
    const characters = Array.isArray(input?.characters)
      ? input.characters.filter((c) => typeof c === "string")
      : [];
    state.selectionText = [input?.title, input?.sceneText, characters.join(", ")]
      .filter((s) => typeof s === "string" && s.length > 0)
      .join(". ");

    const requested = Number(opts?.timeoutMs);
    const cap = Number.isFinite(requested) && requested > 0 ? Math.min(requested, HARD_CAP_MS) : HARD_CAP_MS;
    const controller = new AbortController();
    const timedOut = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, cap);
    });
    const work = run(supabase, input, opts, state, controller.signal, started + cap).catch(() => null);
    const result = await Promise.race([work, timedOut]);
    return finish(result ?? safeOutcome("failed"));
  } catch {
    return finish(safeOutcome("failed"));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
