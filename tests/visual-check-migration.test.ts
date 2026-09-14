// Tests for the visual_check column migrations and the gallery's image-check line.
//
// The migrations are checked from their source. 20260913230000_visual_check.sql
// must add a nullable jsonb column to exactly the five tables that store
// generated images and document the stored record shape.
// 20260914090000_visual_check_running.sql must only re-comment that column, so the
// documented shape includes the "running" status and started_at of the check that
// now runs after the response. Neither may touch anything else (no drops,
// policies, grants or RLS).
//
// The gallery page is a React file that node cannot import, so its pure block
// (between the visual-check-summary markers: visualCheckSummary, the helpers that
// pick the running checks to re-read and merge the result, and the tracker of the
// image each pending post's reviewer saw) is copied to a temporary .mts file and
// imported on its own. The pending Instagram card is also run from its source: its
// regenerate hooks in a temporary .mts file on a minimal hooks model, and its
// button, image and lightbox expressions evaluated against that state. Those tests,
// and the source checks of how the cards poll, are skipped when the gallery is not
// in the checkout.
//
// Run: node --experimental-strip-types --test tests/
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  initialRecordFor,
  runningRecord,
  VISUAL_CHECK_STATUSES,
  visualCheckRecord,
} from "../supabase/functions/_shared/visualCheckCore.ts";

const MIGRATIONS_DIR = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const MIGRATION_FILE = "20260913230000_visual_check.sql";
const RUNNING_MIGRATION_FILE = "20260914090000_visual_check_running.sql";
const RESEARCH_MIGRATION_FILE = "20260913190000_scene_visual_research.sql";
const SQL = readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), "utf8");
const RUNNING_SQL = readFileSync(join(MIGRATIONS_DIR, RUNNING_MIGRATION_FILE), "utf8");

const TABLES = [
  "gita_chapter_art_review",
  "bhagavatam_chapter_art_review",
  "chaitanya_chapter_art_review",
  "ig_pending_review",
  "reader_scenes",
];

const GALLERY_PATH = fileURLToPath(new URL("../artifacts/temple-tracker/src/pages/gallery.tsx", import.meta.url));
const HAS_GALLERY = existsSync(GALLERY_PATH);

// ── SQL helpers ──────────────────────────────────────────────────────────────

/**
 * Splits SQL into statements with `--` comments removed and whitespace collapsed.
 * Semicolons and `--` inside single-quoted strings ('' escapes) are kept.
 */
function statements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  const push = () => {
    const s = cur.replace(/\s+/g, " ").trim();
    if (s) out.push(s);
    cur = "";
  };
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inQuote) {
      cur += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          cur += "'";
          i++;
        } else {
          inQuote = false;
        }
      }
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl < 0 ? sql.length : nl;
      cur += " ";
      continue;
    }
    if (ch === "'") inQuote = true;
    if (ch === ";") {
      push();
      continue;
    }
    cur += ch;
  }
  push();
  return out;
}

/** The statement with every string literal emptied, lower-cased: keywords only. */
function codeOnly(statement: string): string {
  return statement.replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
}

/** The text of the single-quoted literal at the end of a comment statement. */
function literal(statement: string): string {
  const m = statement.match(/'((?:[^']|'')*)'\s*$/);
  return m ? m[1].replace(/''/g, "'") : "";
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The comment-on-column statements for public.<table>.visual_check, in order. */
function visualCheckComments(list: string[], table: string): string[] {
  const re = new RegExp(`^comment on column public\\.${escapeRe(table)}\\.visual_check is '`, "i");
  return list.filter((s) => re.test(s));
}

describe("statements() helper", () => {
  test("drops comments and ignores semicolons and keywords inside strings", () => {
    // Arrange
    const sql = "-- drop table x;\nalter table a add column b int;\ncomment on column a.b is 'no drop; here -- kept';\n";
    // Act
    const list = statements(sql);
    // Assert
    assert.deepEqual(list, ["alter table a add column b int", "comment on column a.b is 'no drop; here -- kept'"]);
    assert.equal(codeOnly(list[1]).includes("drop"), false);
    assert.equal(literal(list[1]), "no drop; here -- kept");
  });
});

// ── Migration ────────────────────────────────────────────────────────────────

describe("20260913230000_visual_check.sql", () => {
  const list = statements(SQL);

  test("adds visual_check jsonb with add column if not exists to each of the five image tables", () => {
    for (const table of TABLES) {
      // Arrange
      const re = new RegExp(`^alter table public\\.${escapeRe(table)} add column if not exists visual_check jsonb$`, "i");
      // Act
      const matches = list.filter((s) => re.test(s));
      // Assert
      assert.equal(matches.length, 1, `${table}: expected one add-column statement`);
    }
  });

  test("the column is nullable with no default, so existing rows stay null", () => {
    // Arrange
    const alters = list.filter((s) => /^alter table/i.test(s));
    // Act / Assert
    assert.equal(alters.length, TABLES.length);
    for (const s of alters) {
      assert.doesNotMatch(codeOnly(s), /\bnot null\b|\bdefault\b|\bprimary\b|\bunique\b/, s);
    }
  });

  test("alters only the five image tables", () => {
    // Arrange
    const targets = list
      .filter((s) => /^alter table/i.test(s))
      .map((s) => codeOnly(s).match(/^alter table (?:if exists )?(?:only )?public\.([a-z0-9_]+)/)?.[1] ?? s);
    // Act / Assert
    assert.deepEqual([...targets].sort(), [...TABLES].sort());
  });

  test("contains only add-column and comment-on-column statements", () => {
    // Arrange / Act
    const other = list.filter((s) => !/^alter table public\.\w+ add column if not exists /i.test(s) && !/^comment on column /i.test(s));
    // Assert
    assert.deepEqual(other, []);
    assert.equal(list.length, TABLES.length * 2);
  });

  test("never drops or deletes, and changes no policy, grant or row level security", () => {
    // Arrange
    const code = list.map(codeOnly).join(";\n");
    // Act / Assert
    assert.doesNotMatch(code, /\bdrop\b/);
    assert.doesNotMatch(code, /\bpolicy\b|\bpolicies\b/);
    assert.doesNotMatch(code, /\bgrant\b|\brevoke\b/);
    assert.doesNotMatch(code, /row level security|\bsecurity\b/);
    assert.doesNotMatch(code, /\bdelete\b|\btruncate\b|\bupdate\b|\binsert\b/);
    assert.doesNotMatch(code, /\bcreate\b/);
  });

  test("comments every column with the stored record shape, key for key", () => {
    // Arrange: the keys the core really stores, so a new key forces a comment update
    const recordKeys = Object.keys(
      visualCheckRecord({ status: "fail", attempts: 2, chosenAttempt: 1, failed: [{ fact: "f", observed: "o" }] }),
    );
    assert.deepEqual(recordKeys.sort(), ["attempts", "checked_at", "chosen_attempt", "failed", "image_model", "reason", "status", "unclear"]);
    for (const table of TABLES) {
      const re = new RegExp(`^comment on column public\\.${escapeRe(table)}\\.visual_check is '`, "i");
      // Act
      const matches = list.filter((s) => re.test(s));
      // Assert
      assert.equal(matches.length, 1, `${table}: expected one column comment`);
      const text = literal(matches[0]);
      for (const key of recordKeys) assert.match(text, new RegExp(`\\b${key}\\b`), `${table}: comment should name ${key}`);
      assert.match(text, /failed: \[\{fact, observed\}\]/, `${table}: comment should show the failed item shape`);
      assert.match(text, /pass\|fail\|error\|skipped/, `${table}: comment should list the statuses`);
    }
  });

  test("sorts after the scene visual research migration", () => {
    // Arrange
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    // Act
    const mine = files.indexOf(MIGRATION_FILE);
    const research = files.indexOf(RESEARCH_MIGRATION_FILE);
    // Assert
    assert.ok(mine >= 0 && research >= 0);
    assert.ok(mine > research, "visual_check must apply after scene_visual_research");
  });
});

describe("20260914090000_visual_check_running.sql", () => {
  const list = statements(RUNNING_SQL);
  const commentFor = (table: string) => literal(visualCheckComments(list, table)[0] ?? "");

  test("holds exactly one visual_check column comment per image table and nothing else", () => {
    // Arrange / Act: a statement that is not such a comment maps to itself and fails the comparison
    const targets = list.map((s) => codeOnly(s).match(/^comment on column public\.([a-z0-9_]+)\.visual_check is ''$/)?.[1] ?? s);
    // Assert
    assert.deepEqual([...targets].sort(), [...TABLES].sort());
  });

  test("changes no schema, data, policy, grant or row level security", () => {
    // Arrange
    const code = list.map(codeOnly).join(";\n");
    // Act / Assert
    assert.doesNotMatch(code, /\balter\b|\bcreate\b|\bdrop\b|\brename\b/);
    assert.doesNotMatch(code, /\bpolicy\b|\bpolicies\b/);
    assert.doesNotMatch(code, /\bgrant\b|\brevoke\b|\bowner\b/);
    assert.doesNotMatch(code, /row level security|\bsecurity\b/);
    assert.doesNotMatch(code, /\bdelete\b|\btruncate\b|\bupdate\b|\binsert\b/);
  });

  test("documents the record stored with a new image, key for key, with every status", () => {
    // Arrange: the keys and statuses the core really stores, so a new one forces a new comment
    const recordKeys = Object.keys(runningRecord({ imageModel: "black-forest-labs/FLUX.2-pro", startedAt: "2026-09-14T09:00:00.000Z" })).sort();
    const statuses = `status: ${VISUAL_CHECK_STATUSES.join("|")}`;
    assert.deepEqual(recordKeys, ["attempts", "checked_at", "chosen_attempt", "failed", "image_model", "reason", "started_at", "status", "unclear"]);
    assert.equal(statuses, "status: pass|fail|error|skipped|running");
    for (const table of TABLES) {
      // Act
      const text = commentFor(table);
      // Assert
      assert.ok(text.includes(statuses), `${table}: comment should list the statuses`);
      for (const key of recordKeys) assert.match(text, new RegExp(`\\b${key}\\b`), `${table}: comment should name ${key}`);
      assert.match(text, /failed: \[\{fact, observed\}\]/, `${table}: comment should show the failed item shape`);
      assert.match(text, /checked_at \(null while running\)/, `${table}: comment should say checked_at is null while running`);
    }
  });

  test("only ig_pending_review documents a replaced image, and reader_scenes never names image_path", () => {
    for (const table of TABLES) {
      // Arrange / Act
      const text = commentFor(table);
      // Assert
      if (table === "ig_pending_review") {
        assert.match(text, /may replace image_url and image_path/);
      } else {
        assert.match(text, /never replaces the image/, table);
        assert.doesNotMatch(text, /may replace/, table);
      }
    }
    assert.doesNotMatch(commentFor("reader_scenes"), /image_path/);
  });

  test("sorts after the migration that added the column", () => {
    // Arrange
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    // Act
    const added = files.indexOf(MIGRATION_FILE);
    const running = files.indexOf(RUNNING_MIGRATION_FILE);
    // Assert
    assert.ok(added >= 0 && running >= 0);
    assert.ok(running > added, "the comments need the visual_check columns");
  });
});

describe("visual_check column comments across migrations", () => {
  test("the newest comment on each table's visual_check lists every status the core can store", () => {
    // Arrange: migrations apply in file-name order, so the last comment is the one in the database
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    const all = files.flatMap((f) => statements(readFileSync(join(MIGRATIONS_DIR, f), "utf8")));
    for (const table of TABLES) {
      // Act
      const latest = visualCheckComments(all, table).at(-1) ?? "";
      // Assert
      assert.ok(latest, `${table}: no visual_check comment`);
      assert.ok(literal(latest).includes(`status: ${VISUAL_CHECK_STATUSES.join("|")}`), `${table}: the newest comment misses a status`);
    }
  });
});

// ── Gallery ──────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type AnyValue = any;

interface Summary {
  tone: "fail" | "pass" | "muted";
  headline: string;
  details: string[];
}

interface Row {
  id: number;
  image_url?: string | null;
  image_path?: string | null;
  visual_check?: AnyValue;
  [key: string]: unknown;
}

interface Poller {
  update: (rows: Row[], enabled: boolean) => void;
  stop: () => void;
}

interface PollerOptions {
  table: string;
  columns: string;
  fetchRows: (path: string) => Promise<unknown>;
  setRows: (update: (prev: Row[]) => Row[]) => void;
  onStale: () => void;
  now: () => number;
  setInterval: (tick: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

interface SeenImagesApi {
  cardShown: (id: number, path: string | null) => void;
  lightboxShown: (id: number, path: string | null) => void;
  accept: (id: number, path: string | null) => void;
  pathToReview: (id: number, cardPath: string | null | undefined) => string | null;
}

interface SummaryModule {
  visualCheckSummary: (check: AnyValue, now?: number) => Summary | null;
  isCheckRunning: (check: AnyValue, now: number) => boolean;
  isCheckPollable: (check: AnyValue, now: number) => boolean;
  pollableCheckKeys: (rows: AnyValue, now: number) => string[];
  checkIdsToPoll: (rows: Row[], now: number, firstSeen: Map<string, number>) => number[];
  nextCheckStaleAt: (rows: AnyValue, now: number) => number | null;
  mergeCheckRows: (rows: Row[], fresh: unknown, sent: Map<number, unknown>, now: number) => Row[];
  createCheckPoller: (options: PollerOptions) => Poller;
  createSeenImages: () => SeenImagesApi;
  VISUAL_CHECK_STALE_MS: number;
  VISUAL_CHECK_POLL_MS: number;
}

const BLOCK_EXPORTS = [
  "visualCheckSummary",
  "isCheckRunning",
  "isCheckPollable",
  "pollableCheckKeys",
  "checkIdsToPoll",
  "nextCheckStaleAt",
  "mergeCheckRows",
  "createCheckPoller",
  "createSeenImages",
  "VISUAL_CHECK_STALE_MS",
  "VISUAL_CHECK_POLL_MS",
];

let summaryDir: string | null = null;
let summaryModule: Promise<SummaryModule> | null = null;

/** Imports the gallery's visual-check-summary block on its own (no React, no JSX). */
function loadSummary(): Promise<SummaryModule> {
  if (!summaryModule) {
    const src = readFileSync(GALLERY_PATH, "utf8");
    const start = src.indexOf("// visual-check-summary:start");
    const end = src.indexOf("// visual-check-summary:end");
    assert.ok(start >= 0 && end > start, "gallery.tsx must keep the visual-check-summary markers");
    summaryDir = mkdtempSync(join(tmpdir(), "visual-check-summary-"));
    const file = join(summaryDir, "summary.mts");
    writeFileSync(file, `${src.slice(start, end)}\nexport { ${BLOCK_EXPORTS.join(", ")} };\n`);
    summaryModule = import(pathToFileURL(file).href) as Promise<SummaryModule>;
  }
  return summaryModule;
}

after(() => {
  if (summaryDir) rmSync(summaryDir, { recursive: true, force: true });
});

const GALLERY_SKIP = HAS_GALLERY ? false : "artifacts/temple-tracker/src/pages/gallery.tsx is not in this checkout";

const T0 = Date.parse("2026-09-14T09:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MINUTE = 60_000;

describe("gallery visualCheckSummary", { skip: GALLERY_SKIP }, () => {
  test("a failed check lists each wrong detail with what was seen, and the render count when re-rendered", async () => {
    // Arrange
    const { visualCheckSummary } = await loadSummary();
    const record = visualCheckRecord({
      status: "fail",
      attempts: 3,
      chosenAttempt: 1,
      failed: [
        { fact: "Arjuna's chariot is drawn by exactly four white horses", observed: "3 horses" },
        { fact: "Arjuna holds the Gandiva bow", observed: "Krishna holds the bow" },
      ],
      unclear: 0,
      reason: "max_attempts",
      imageModel: "openai/gpt-image-2",
      checkedAt: "2026-09-13T12:00:00.000Z",
    });
    // Act
    const summary = visualCheckSummary(record);
    // Assert
    assert.deepEqual(summary, {
      tone: "fail",
      headline: "Image check: 2 details wrong (best of 3 renders)",
      details: [
        "expected: Arjuna's chariot is drawn by exactly four white horses — seen: 3 horses",
        "expected: Arjuna holds the Gandiva bow — seen: Krishna holds the bow",
      ],
    });
  });

  test("one wrong detail on a single render is singular and has no render count", async () => {
    const { visualCheckSummary } = await loadSummary();
    const record = visualCheckRecord({ status: "fail", attempts: 1, chosenAttempt: 0, failed: [{ fact: "four horses", observed: "" }] });
    const summary = visualCheckSummary(record);
    assert.equal(summary?.headline, "Image check: 1 detail wrong");
    assert.deepEqual(summary?.details, ["expected: four horses — seen: not described"]);
  });

  test("a pass is green and shows the render count only when more than one render was made", async () => {
    const { visualCheckSummary } = await loadSummary();
    const first = visualCheckSummary(visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0 }));
    const second = visualCheckSummary(visualCheckRecord({ status: "pass", attempts: 2, chosenAttempt: 1 }));
    assert.deepEqual(first, { tone: "pass", headline: "Image check passed", details: [] });
    assert.deepEqual(second, { tone: "pass", headline: "Image check passed (2 renders)", details: [] });
  });

  test("a pass with unclear details is not green and says how many could not be confirmed", async () => {
    // Arrange
    const { visualCheckSummary } = await loadSummary();
    // Act
    const allUnclear = visualCheckSummary(visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0, unclear: 3 }));
    const oneUnclear = visualCheckSummary(visualCheckRecord({ status: "pass", attempts: 2, chosenAttempt: 1, unclear: 1 }));
    const safeFallback = visualCheckSummary(visualCheckRecord({ status: "skipped", attempts: 1, chosenAttempt: 0, reason: "safe_fallback" }));
    // Assert
    assert.deepEqual(allUnclear, { tone: "muted", headline: "Image check passed, 3 details unclear", details: [] });
    assert.deepEqual(oneUnclear, { tone: "muted", headline: "Image check passed, 1 detail unclear (2 renders)", details: [] });
    assert.equal(safeFallback?.headline, "Image check not run (safe fallback)");
  });

  test("error and skipped read as not run, with the reason in plain words", async () => {
    const { visualCheckSummary } = await loadSummary();
    const error = visualCheckSummary(visualCheckRecord({ status: "error", attempts: 1, chosenAttempt: 0, reason: "api_error_529" }));
    const skipped = visualCheckSummary(visualCheckRecord({ status: "skipped", attempts: 1, chosenAttempt: 0, reason: "deadline" }));
    const noReason = visualCheckSummary(visualCheckRecord({ status: "skipped", attempts: 1, chosenAttempt: 0 }));
    assert.deepEqual(error, { tone: "muted", headline: "Image check not run (api error 529)", details: [] });
    assert.equal(skipped?.headline, "Image check not run (deadline)");
    assert.equal(noReason?.headline, "Image check not run");
  });

  test("rows with no record, or a record it does not understand, show nothing", async () => {
    const { visualCheckSummary } = await loadSummary();
    assert.equal(visualCheckSummary(null), null);
    assert.equal(visualCheckSummary(undefined), null);
    assert.equal(visualCheckSummary("fail"), null);
    assert.equal(visualCheckSummary({ status: "queued" }), null);
  });

  test("a failed record with a malformed failed list still renders without throwing", async () => {
    const { visualCheckSummary } = await loadSummary();
    const summary = visualCheckSummary({ status: "fail", attempts: "2", failed: "three horses" });
    assert.equal(summary?.headline, "Image check: 0 details wrong (best of 2 renders)");
    assert.deepEqual(summary?.details, []);
  });

  test("a running check reads as checking until started_at is more than 10 minutes old", async () => {
    // Arrange
    const { visualCheckSummary, VISUAL_CHECK_STALE_MS } = await loadSummary();
    const record = runningRecord({ imageModel: "black-forest-labs/FLUX.2-pro", startedAt: iso(T0) });
    // Act
    const early = visualCheckSummary(record, T0 + 30_000);
    const atLimit = visualCheckSummary(record, T0 + VISUAL_CHECK_STALE_MS);
    const late = visualCheckSummary(record, T0 + VISUAL_CHECK_STALE_MS + 1);
    // Assert
    assert.equal(VISUAL_CHECK_STALE_MS, 10 * MINUTE);
    assert.deepEqual(early, { tone: "muted", headline: "Checking image…", details: [] });
    assert.deepEqual(atLimit, { tone: "muted", headline: "Checking image…", details: [] });
    assert.deepEqual(late, { tone: "muted", headline: "Image check did not finish", details: [] });
  });

  test("a running record with no usable started_at, or one ahead of this clock, still reads as checking", async () => {
    // Arrange
    const { visualCheckSummary } = await loadSummary();
    // Act
    const headlines = [
      { status: "running" },
      { status: "running", started_at: null },
      { status: "running", started_at: "not a date" },
      { status: "running", started_at: iso(T0 + 5 * MINUTE) },
    ].map((check) => visualCheckSummary(check, T0)?.headline);
    // Assert
    assert.deepEqual(headlines, ["Checking image…", "Checking image…", "Checking image…", "Checking image…"]);
  });

  test("without a clock argument a running record is judged against the current time", async () => {
    // Arrange
    const { visualCheckSummary } = await loadSummary();
    const recent = runningRecord({ startedAt: iso(Date.now() - MINUTE) });
    const abandoned = runningRecord({ startedAt: iso(Date.now() - 11 * MINUTE) });
    // Act / Assert
    assert.equal(visualCheckSummary(recent)?.headline, "Checking image…");
    assert.equal(visualCheckSummary(abandoned)?.headline, "Image check did not finish");
  });

  test("the record stored with a new image reads as checking, or as not run with its reason", async () => {
    // Arrange
    const { visualCheckSummary } = await loadSummary();
    const base = { imageModel: "black-forest-labs/FLUX.2-pro", startedAt: iso(T0), checkedAt: iso(T0) };
    const facts = ["Arjuna's chariot is drawn by exactly four white horses"];
    const now = T0 + 5_000;
    // Act
    const running = visualCheckSummary(initialRecordFor({ ...base, factsUsed: facts }), now);
    const noFacts = visualCheckSummary(initialRecordFor({ ...base, factsUsed: [] }), now);
    const fallback = visualCheckSummary(initialRecordFor({ ...base, factsUsed: facts, safeFallback: true }), now);
    const disabled = visualCheckSummary(initialRecordFor({ ...base, factsUsed: facts, disabled: true }), now);
    // Assert
    assert.equal(running?.headline, "Checking image…");
    assert.equal(noFacts?.headline, "Image check not run (no facts)");
    assert.equal(fallback?.headline, "Image check not run (safe fallback)");
    assert.equal(disabled?.headline, "Image check not run (disabled)");
  });

  test("a settled background record reads like before and never goes stale", async () => {
    // Arrange: an hour after started_at, far past the 10-minute limit for running records
    const { visualCheckSummary } = await loadSummary();
    const now = T0 + 60 * MINUTE;
    const flagged = visualCheckRecord({
      status: "fail",
      attempts: 1,
      chosenAttempt: 0,
      failed: [{ fact: "four horses", observed: "3 horses" }],
      startedAt: iso(T0),
      checkedAt: iso(T0 + 30_000),
    });
    const redone = visualCheckRecord({ status: "pass", attempts: 3, chosenAttempt: 2, startedAt: iso(T0), checkedAt: iso(T0 + 90_000) });
    // Act / Assert
    assert.deepEqual(visualCheckSummary(flagged, now), {
      tone: "fail",
      headline: "Image check: 1 detail wrong",
      details: ["expected: four horses — seen: 3 horses"],
    });
    assert.deepEqual(visualCheckSummary(redone, now), { tone: "pass", headline: "Image check passed (3 renders)", details: [] });
  });
});

describe("gallery visual check polling", { skip: GALLERY_SKIP }, () => {
  const failed = [{ fact: "four horses", observed: "3 horses" }];

  test("a running check and a re-render's interim result are re-read; settled and stale ones are not", async () => {
    // Arrange
    const { isCheckPollable, isCheckRunning } = await loadSummary();
    const startedAt = iso(T0);
    const now = T0 + MINUTE;
    const running = runningRecord({ imageModel: "black-forest-labs/FLUX.2-pro", startedAt });
    const interim = visualCheckRecord({ status: "fail", attempts: 2, chosenAttempt: 1, failed, startedAt, checkedAt: iso(now) });
    const redoFinal = visualCheckRecord({ status: "fail", attempts: 3, chosenAttempt: 1, failed, reason: "max_attempts", startedAt, checkedAt: iso(now) });
    const flagged = visualCheckRecord({ status: "fail", attempts: 1, chosenAttempt: 0, failed, startedAt, checkedAt: iso(now) });
    const passed = visualCheckRecord({ status: "pass", attempts: 2, chosenAttempt: 1, startedAt, checkedAt: iso(now) });
    const skipped = initialRecordFor({ factsUsed: [], startedAt, checkedAt: startedAt });
    const later = T0 + 10 * MINUTE + 1;
    // Act / Assert
    assert.equal(isCheckPollable(running, now), true);
    assert.equal(isCheckPollable(interim, now), true, "the re-render may still swap in a better image");
    assert.equal(isCheckRunning(interim, now), false, "an interim result is shown as the check it is");
    assert.equal(isCheckPollable(redoFinal, now), false);
    assert.equal(isCheckPollable(flagged, now), false);
    assert.equal(isCheckPollable(passed, now), false);
    assert.equal(isCheckPollable(skipped, now), false);
    assert.equal(isCheckPollable(null, now), false);
    assert.equal(isCheckPollable(running, later), false);
    assert.equal(isCheckPollable(interim, later), false);
    assert.equal(isCheckPollable({ ...interim, started_at: null }, now), false);
  });

  test("keys the loaded rows whose check may still change by id and started_at", async () => {
    // Arrange
    const { pollableCheckKeys } = await loadSummary();
    const rows = [
      { id: 1, visual_check: runningRecord({ startedAt: iso(T0) }) },
      null,
      { id: 2, visual_check: visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0, startedAt: iso(T0) }) },
      { id: 3, visual_check: { status: "running" } },
      { id: 4, visual_check: null },
    ];
    // Act
    const keys = pollableCheckKeys(rows, T0 + MINUTE);
    // Assert
    assert.deepEqual(keys, [`1:${iso(T0)}`, "3:"]);
    assert.deepEqual(pollableCheckKeys("not rows", T0), []);
  });

  test("re-reads every check that may still change until it settles or goes stale, however long ago the page first saw it", async () => {
    // Arrange: row 1 was first seen 8 minutes ago; row 4, a redo's interim result, never
    const { checkIdsToPoll, VISUAL_CHECK_POLL_MS } = await loadSummary();
    const now = T0 + 9 * MINUTE;
    const rows: Row[] = [
      { id: 1, visual_check: runningRecord({ startedAt: iso(T0) }) },
      { id: 2, visual_check: visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0, startedAt: iso(T0) }) },
      { id: 3, visual_check: runningRecord({ startedAt: iso(now - 11 * MINUTE) }) },
      { id: 4, visual_check: visualCheckRecord({ status: "fail", attempts: 2, chosenAttempt: 1, failed, startedAt: iso(T0 + MINUTE), checkedAt: iso(T0 + 2 * MINUTE) }) },
      { id: 1, visual_check: runningRecord({ startedAt: iso(T0) }) },
    ];
    const firstSeen = new Map<string, number>([[`1:${iso(T0)}`, T0 + MINUTE]]);
    // Act
    const ids = checkIdsToPoll(rows, now, firstSeen);
    // Assert: 2 settled, 3 stale, and each id once
    assert.deepEqual(ids, [1, 4]);
    assert.equal(VISUAL_CHECK_POLL_MS, 10_000);
  });

  test("a running record without started_at is re-read for 10 minutes after the page first saw it; a regenerated record has its own started_at", async () => {
    // Arrange: no generator writes a running record without started_at, but one must not be re-read forever
    const { checkIdsToPoll, VISUAL_CHECK_STALE_MS } = await loadSummary();
    const unstamped: Row = { id: 8, visual_check: { status: "running" } };
    const firstSeen = new Map<string, number>([["8:", T0]]);
    const regenerated: Row = { id: 8, visual_check: runningRecord({ startedAt: iso(T0 + VISUAL_CHECK_STALE_MS) }) };
    // Act / Assert
    assert.deepEqual(checkIdsToPoll([unstamped], T0 + VISUAL_CHECK_STALE_MS - 1, firstSeen), [8]);
    assert.deepEqual(checkIdsToPoll([unstamped], T0 + VISUAL_CHECK_STALE_MS, firstSeen), []);
    assert.deepEqual(checkIdsToPoll([unstamped], T0, new Map()), [], "not seen yet: the poll records it when it starts");
    assert.deepEqual(checkIdsToPoll([regenerated], T0 + VISUAL_CHECK_STALE_MS + MINUTE, firstSeen), [8]);
  });

  test("nextCheckStaleAt is 1ms past started_at + 10 minutes of the first pollable record to go stale", async () => {
    // Arrange
    const { nextCheckStaleAt, VISUAL_CHECK_STALE_MS } = await loadSummary();
    const now = T0 + MINUTE;
    const later = { id: 1, visual_check: runningRecord({ startedAt: iso(T0 + 30_000) }) };
    const interim = { id: 2, visual_check: visualCheckRecord({ status: "fail", attempts: 2, chosenAttempt: 1, failed, startedAt: iso(T0), checkedAt: iso(now) }) };
    const settled = { id: 3, visual_check: visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0, startedAt: iso(T0 - MINUTE) }) };
    const unstamped = { id: 4, visual_check: { status: "running" } };
    // Act / Assert
    assert.equal(nextCheckStaleAt([later, interim, settled, unstamped], now), T0 + VISUAL_CHECK_STALE_MS + 1);
    assert.equal(nextCheckStaleAt([later], now), T0 + 30_000 + VISUAL_CHECK_STALE_MS + 1);
    assert.equal(nextCheckStaleAt([settled, unstamped], now), null);
    assert.equal(nextCheckStaleAt("not rows", now), null);
  });

  test("stores the settled check and keeps the loaded URL when the image is the same, ignoring this page's t=", async () => {
    // Arrange
    const { mergeCheckRows } = await loadSummary();
    const running = runningRecord({ imageModel: "black-forest-labs/FLUX.2-pro", startedAt: iso(T0) });
    const url = "https://example.supabase.co/storage/v1/object/public/instagram-images/gita-1.png";
    const rows: Row[] = [
      { id: 1, image_url: `${url}?t=111`, image_path: "gita-1.png", visual_check: running, chapter_title: "Chapter 1" },
      { id: 2, image_url: "https://example.supabase.co/b.png", image_path: "b.png", visual_check: running },
    ];
    const settled = visualCheckRecord({ status: "fail", attempts: 1, chosenAttempt: 0, failed, startedAt: iso(T0), checkedAt: iso(T0 + 30_000) });
    const sent = new Map<number, unknown>(rows.map((r) => [r.id, r.visual_check]));
    // Act
    const merged = mergeCheckRows(rows, [{ id: 1, image_url: url, image_path: "gita-1.png", visual_check: settled }], sent, T0 + 40_000);
    // Assert
    assert.notEqual(merged, rows);
    assert.deepEqual(merged[0], { ...rows[0], visual_check: settled });
    assert.equal(merged[1], rows[1]);
  });

  test("a replaced image takes the new URL with a cache-busting t=, and the new image_path", async () => {
    // Arrange: the daily post's background re-render swapped in a better image
    const { mergeCheckRows } = await loadSummary();
    const running = runningRecord({ startedAt: iso(T0) });
    const interim = visualCheckRecord({ status: "fail", attempts: 2, chosenAttempt: 1, failed, startedAt: iso(T0), checkedAt: iso(T0 + MINUTE) });
    const rows: Row[] = [
      { id: 1, image_url: "https://example.supabase.co/ig/post-1.png", image_path: "post-1.png", visual_check: running },
      { id: 2, image_url: "https://example.supabase.co/ig/post-2.png?v=1", image_path: "post-2.png", visual_check: running },
    ];
    const fresh = [
      { id: 1, image_url: "https://example.supabase.co/ig/post-1-r1.png", image_path: "post-1-r1.png", visual_check: interim },
      { id: 2, image_url: "https://example.supabase.co/ig/post-2.png?v=2", image_path: "post-2.png", visual_check: running },
    ];
    const sent = new Map<number, unknown>(rows.map((r) => [r.id, r.visual_check]));
    // Act
    const merged = mergeCheckRows(rows, fresh, sent, 1234);
    // Assert
    assert.deepEqual(merged[0], {
      id: 1,
      image_url: "https://example.supabase.co/ig/post-1-r1.png?t=1234",
      image_path: "post-1-r1.png",
      visual_check: interim,
    });
    assert.equal(merged[1].image_url, "https://example.supabase.co/ig/post-2.png?v=2&t=1234");
    assert.equal(merged[1].visual_check, running);
  });

  test("returns the loaded rows themselves when nothing changed or the body is not a row list", async () => {
    // Arrange
    const { mergeCheckRows } = await loadSummary();
    const running = runningRecord({ startedAt: iso(T0) });
    const rows: Row[] = [{ id: 1, image_url: "https://example.supabase.co/a.png?t=5", image_path: "a.png", visual_check: running }];
    const sent = new Map<number, unknown>([[1, running]]);
    const sameAgain = [{ id: 1, image_url: "https://example.supabase.co/a.png", image_path: "a.png", visual_check: { ...running } }];
    // Act / Assert
    assert.equal(mergeCheckRows(rows, sameAgain, sent, T0), rows);
    assert.equal(mergeCheckRows(rows, { message: "permission denied" }, sent, T0), rows);
    assert.equal(mergeCheckRows(rows, null, sent, T0), rows);
    assert.equal(mergeCheckRows(rows, [null, "row", { visual_check: null }, { id: "1", visual_check: null }], sent, T0), rows);
    assert.equal(mergeCheckRows(rows, [{ id: 99, image_url: "https://example.supabase.co/z.png", visual_check: null }], sent, T0), rows);
  });

  test("a row whose check changed after the request went out keeps its state, so a regenerate that answered first wins", async () => {
    // Arrange
    const { mergeCheckRows } = await loadSummary();
    const before = runningRecord({ startedAt: iso(T0) });
    const regenerated = runningRecord({ startedAt: iso(T0 + 20_000) });
    const rows: Row[] = [{ id: 1, image_url: "https://example.supabase.co/new.png?t=9", image_path: "new.png", visual_check: regenerated }];
    const sent = new Map<number, unknown>([[1, before]]);
    const stale = [
      {
        id: 1,
        image_url: "https://example.supabase.co/old.png",
        image_path: "old.png",
        visual_check: visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0, startedAt: iso(T0) }),
      },
    ];
    // Act
    const merged = mergeCheckRows(rows, stale, sent, T0 + 25_000);
    // Assert
    assert.equal(merged, rows);
  });

  test("a table without image_path never gains one", async () => {
    // Arrange: reader_scenes rows are re-read with id, visual_check and image_url only
    const { mergeCheckRows } = await loadSummary();
    const running = runningRecord({ startedAt: iso(T0) });
    const rows: Row[] = [{ id: 3, image_url: "https://example.supabase.co/scene-3.png", visual_check: running, selected_text: "Arjuna" }];
    const settled = visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0, startedAt: iso(T0), checkedAt: iso(T0 + 20_000) });
    const sent = new Map<number, unknown>([[3, running]]);
    // Act
    const merged = mergeCheckRows(rows, [{ id: 3, image_url: "https://example.supabase.co/scene-3.png", visual_check: settled }], sent, T0);
    // Assert
    assert.deepEqual(merged[0], { ...rows[0], visual_check: settled });
    assert.equal("image_path" in merged[0], false);
  });
});

describe("gallery check poller", { skip: GALLERY_SKIP }, () => {
  const failed = [{ fact: "four horses", observed: "3 horses" }];
  const COLUMNS = "id,visual_check,image_url,image_path";
  const path = (ids: number[]) => `ig_pending_review?select=${COLUMNS}&id=in.(${ids.join(",")})`;
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }

  /**
   * createCheckPoller on a fake clock with fake timers. The rows live here the way a
   * section's state does: setRows applies the update and hands the new rows to
   * update(), as the hook's effect does after React renders. answer(path, now) is
   * the body of each re-read.
   */
  async function harness(o: { now: number; rows: Row[]; enabled?: boolean; answer?: (path: string, now: number) => unknown }) {
    const { createCheckPoller } = await loadSummary();
    let clock = o.now;
    let nextId = 1;
    const intervals = new Map<number, { run: () => void; ms: number; next: number }>();
    const timeouts = new Map<number, { run: () => void; at: number }>();
    const requests: Array<{ path: string; at: number }> = [];
    const staleAt: number[] = [];
    const counts = { setInterval: 0, clearInterval: 0 };
    const state = { rows: o.rows, enabled: o.enabled ?? true };
    const poller = createCheckPoller({
      table: "ig_pending_review",
      columns: COLUMNS,
      fetchRows: async (p) => {
        requests.push({ path: p, at: clock });
        return o.answer ? await o.answer(p, clock) : [];
      },
      setRows: (update) => {
        state.rows = update(state.rows);
        poller.update(state.rows, state.enabled);
      },
      onStale: () => {
        staleAt.push(clock);
      },
      now: () => clock,
      setInterval: (run, ms) => {
        counts.setInterval++;
        const id = nextId++;
        intervals.set(id, { run, ms, next: clock + ms });
        return id;
      },
      clearInterval: (id) => {
        if (intervals.delete(id as number)) counts.clearInterval++;
      },
      setTimeout: (run, ms) => {
        const id = nextId++;
        timeouts.set(id, { run, at: clock + ms });
        return id;
      },
      clearTimeout: (id) => {
        timeouts.delete(id as number);
      },
    });
    /** Moves the clock on, firing every timer that falls due in order and letting each re-read settle. */
    const advance = async (ms: number) => {
      const end = clock + ms;
      for (;;) {
        let due: { at: number; fire: () => void } | null = null;
        for (const t of intervals.values()) {
          if (t.next <= end && (!due || t.next < due.at)) {
            due = {
              at: t.next,
              fire: () => {
                t.next += t.ms;
                t.run();
              },
            };
          }
        }
        for (const [id, t] of timeouts) {
          if (t.at <= end && (!due || t.at < due.at)) {
            due = {
              at: t.at,
              fire: () => {
                timeouts.delete(id);
                t.run();
              },
            };
          }
        }
        if (!due) break;
        clock = due.at;
        due.fire();
        await settle();
      }
      clock = end;
    };
    /** The section loaded (or reloaded) these rows. */
    const update = (rows: Row[], enabled = true) => {
      state.rows = rows;
      state.enabled = enabled;
      poller.update(rows, enabled);
    };
    return { poller, requests, staleAt, counts, intervals, timeouts, state, advance, update };
  }

  test("a running check makes one re-read 10 seconds after the poll starts, for the rows whose check may still change", async () => {
    // Arrange
    const rows: Row[] = [
      { id: 1, image_url: "https://x/a.png", image_path: "a.png", visual_check: runningRecord({ startedAt: iso(T0) }) },
      { id: 2, image_url: "https://x/b.png", image_path: "b.png", visual_check: visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0, startedAt: iso(T0) }) },
    ];
    const h = await harness({ now: T0 + 5_000, rows });
    // Act
    h.update(rows);
    await h.advance(9_999);
    const early = h.requests.length;
    await h.advance(1);
    // Assert
    assert.equal(early, 0);
    assert.deepEqual(h.requests, [{ path: path([1]), at: T0 + 15_000 }]);
    assert.equal(h.counts.setInterval, 1);
  });

  test("reloading the same rows every few seconds keeps the timer, so the 10-second re-reads still happen", async () => {
    // Arrange: the bulk and regenerate pollers reload a section's rows every few seconds
    const rows: Row[] = [{ id: 1, image_url: "https://x/a.png", image_path: "a.png", visual_check: runningRecord({ startedAt: iso(T0) }) }];
    const h = await harness({ now: T0, rows });
    // Act
    h.update(rows);
    for (let i = 0; i < 7; i++) {
      await h.advance(3_000);
      h.update(structuredClone(rows));
    }
    // Assert: 21 seconds, re-read at 10s and 20s
    assert.deepEqual(h.requests.map((r) => r.at), [T0 + 10_000, T0 + 20_000]);
    assert.equal(h.counts.setInterval, 1);
    assert.equal(h.counts.clearInterval, 0);
  });

  test("a disabled poll starts no timer and re-reads nothing; enabling it starts the poll", async () => {
    // Arrange: the public Bhaktigram route passes enabled false
    const rows: Row[] = [{ id: 1, visual_check: runningRecord({ startedAt: iso(T0) }) }];
    const h = await harness({ now: T0, rows, enabled: false });
    // Act
    h.update(rows, false);
    await h.advance(60_000);
    const whileDisabled = { requests: h.requests.length, intervals: h.counts.setInterval, timeouts: h.timeouts.size };
    h.update(rows, true);
    await h.advance(10_000);
    // Assert
    assert.deepEqual(whileDisabled, { requests: 0, intervals: 0, timeouts: 0 });
    assert.equal(h.requests.length, 1);
  });

  test("the first tick re-reads every record that could change when the poll started, one without started_at included", async () => {
    // Arrange
    const rows: Row[] = [
      { id: 3, visual_check: { status: "running" } },
      { id: 4, visual_check: runningRecord({ startedAt: iso(T0) }) },
    ];
    const h = await harness({ now: T0 + MINUTE, rows });
    // Act
    h.update(rows);
    await h.advance(10_000);
    // Assert
    assert.deepEqual(h.requests.map((r) => r.path), [path([3, 4])]);
  });

  test("the timer stops once the check settles, and nothing is re-read after that", async () => {
    // Arrange: the second re-read finds the result
    const running = runningRecord({ startedAt: iso(T0) });
    const settled = visualCheckRecord({ status: "fail", attempts: 1, chosenAttempt: 0, failed, startedAt: iso(T0), checkedAt: iso(T0 + 15_000) });
    const rows: Row[] = [{ id: 1, image_url: "https://x/a.png", image_path: "a.png", visual_check: running }];
    const h = await harness({
      now: T0,
      rows,
      answer: (_p, now) => [{ id: 1, image_url: "https://x/a.png", image_path: "a.png", visual_check: now >= T0 + 20_000 ? settled : running }],
    });
    // Act
    h.update(rows);
    await h.advance(5 * MINUTE);
    // Assert
    assert.deepEqual(h.requests.map((r) => r.at), [T0 + 10_000, T0 + 20_000]);
    assert.deepEqual(h.state.rows[0].visual_check, settled);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.counts.clearInterval, 1);
    assert.equal(h.timeouts.size, 0, "no stale re-render waits for a settled check");
  });

  test("a re-read still waiting for its answer holds back the next ticks", async () => {
    // Arrange
    const rows: Row[] = [{ id: 1, visual_check: runningRecord({ startedAt: iso(T0) }) }];
    const slow = deferred<unknown>();
    let calls = 0;
    const h = await harness({ now: T0, rows, answer: () => (++calls === 1 ? slow.promise : []) });
    // Act
    h.update(rows);
    await h.advance(30_000);
    const whileWaiting = h.requests.length;
    slow.resolve([]);
    await settle();
    await h.advance(10_000);
    // Assert
    assert.equal(whileWaiting, 1, "the ticks at 20s and 30s send nothing while the first answer is out");
    assert.equal(h.requests.length, 2);
  });

  test("a daily post first seen 30s after it was stored is re-read until its redo writes the final record 350s in", async () => {
    // Arrange: the redo abandoned a hung re-render near its deadline and wrote its only record then
    const running = runningRecord({ startedAt: iso(T0) });
    const final = visualCheckRecord({ status: "fail", attempts: 2, chosenAttempt: 0, failed, reason: "render_failed", startedAt: iso(T0), checkedAt: iso(T0 + 350_000) });
    const rows: Row[] = [{ id: 77, image_url: "https://x/p.jpg", image_path: "p.jpg", visual_check: running }];
    const h = await harness({
      now: T0 + 30_000,
      rows,
      answer: (_p, now) => [{ id: 77, image_url: "https://x/p.jpg", image_path: "p.jpg", visual_check: now >= T0 + 350_000 ? final : running }],
    });
    // Act
    h.update(rows);
    await h.advance(330_000);
    // Assert: the card shows the flag, and the poll stops once it has it
    assert.deepEqual(h.state.rows[0].visual_check, final);
    assert.equal(h.requests.at(-1)?.at, T0 + 350_000);
    assert.equal(h.intervals.size, 0);
  });

  test("a check that never finishes re-renders its card once, the moment it goes stale, and the poll stops there", async () => {
    // Arrange: the worker died, so every re-read still answers running
    const { VISUAL_CHECK_STALE_MS } = await loadSummary();
    const running = runningRecord({ startedAt: iso(T0) });
    const rows: Row[] = [{ id: 5, image_url: "https://x/s.png", visual_check: running }];
    const h = await harness({ now: T0 + 5_000, rows, answer: () => [{ id: 5, image_url: "https://x/s.png", visual_check: running }] });
    // Act
    h.update(rows);
    await h.advance(VISUAL_CHECK_STALE_MS - 5_000);
    const beforeStale = h.staleAt.length;
    await h.advance(1);
    await h.advance(MINUTE);
    // Assert
    assert.equal(beforeStale, 0);
    assert.deepEqual(h.staleAt, [T0 + VISUAL_CHECK_STALE_MS + 1]);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.requests.at(-1)?.at, T0 + VISUAL_CHECK_STALE_MS - 5_000);
  });

  test("stop clears both timers and drops an answer that comes back after it; a later update starts the poll again", async () => {
    // Arrange
    const running = runningRecord({ startedAt: iso(T0) });
    const settled = visualCheckRecord({ status: "pass", attempts: 1, chosenAttempt: 0, startedAt: iso(T0), checkedAt: iso(T0 + 12_000) });
    const rows: Row[] = [{ id: 1, image_url: "https://x/a.png", image_path: "a.png", visual_check: running }];
    const late = deferred<unknown>();
    const h = await harness({ now: T0, rows, answer: () => late.promise });
    // Act
    h.update(rows);
    await h.advance(10_000);
    h.poller.stop();
    const afterStop = { intervals: h.intervals.size, timeouts: h.timeouts.size };
    late.resolve([{ id: 1, image_url: "https://x/a.png", image_path: "a.png", visual_check: settled }]);
    await settle();
    const rowsAfterLateAnswer = h.state.rows;
    h.update(rows);
    // Assert
    assert.deepEqual(afterStop, { intervals: 0, timeouts: 0 });
    assert.equal(rowsAfterLateAnswer, rows, "after unmount nothing is merged");
    assert.equal(h.counts.setInterval, 2, "a remount (React StrictMode runs effects twice) starts the poll again");
  });
});

describe("gallery review cards", { skip: GALLERY_SKIP }, () => {
  const src = HAS_GALLERY ? readFileSync(GALLERY_PATH, "utf8") : "";

  function interfaceBody(name: string): string {
    const m = src.match(new RegExp(`interface ${name} \\{([\\s\\S]*?)\\n\\s*\\}`));
    return m ? m[1] : "";
  }

  test("every review row type carries visual_check", () => {
    for (const name of ["ReaderScene", "GitaArt", "PendingPost", "PendingChapterArt", "PendingChaitanyaArt"]) {
      assert.match(interfaceBody(name), /visual_check\?: VisualCheck \| null;/, `${name} should declare visual_check`);
    }
  });

  test("the record type knows the running status and started_at", () => {
    const body = interfaceBody("VisualCheck");
    assert.match(body, /status: "pass" \| "fail" \| "error" \| "skipped" \| "running";/);
    assert.match(body, /started_at\?: string \| null;/);
  });

  test("the reader scene card and the four chapter/post review cards render the check note", () => {
    const sceneNotes = src.match(/<VisualCheckNote check=\{s\.visual_check\} \/>/g) ?? [];
    const rowNotes = src.match(/<VisualCheckNote check=\{p\.visual_check\} \/>/g) ?? [];
    assert.equal(sceneNotes.length, 1, "Story Scenes");
    assert.equal(rowNotes.length, 4, "Gita, Instagram, Bhagavatam and Chaitanya");
  });

  test("the review queries select every column, so visual_check is loaded", () => {
    for (const table of TABLES) {
      // Arrange: the list loads for the review queues (pending, or not yet approved)
      const loads = [...src.matchAll(new RegExp(`sbFetch\\(\\s*"(${escapeRe(table)}\\?[^"]*)"\\s*\\)`, "g"))]
        .map((m) => m[1])
        .filter((q) => /status=eq\.pending|approved=not\.is\.true/.test(q));
      // Act / Assert
      assert.ok(loads.length >= 1, `${table}: expected a review load`);
      for (const q of loads) assert.match(q, /select=(\*|[^&]*visual_check)/, `${table}: ${q}`);
    }
  });

  test("regenerating an image replaces the card's check with the one returned for the new image", () => {
    assert.equal((src.match(/visual_check: d\.visual_check \?\? null/g) ?? []).length, 3, "scene generate, Gita and Instagram regenerate");
    assert.match(src, /onDone\(`\$\{d\.image_url\}\?t=\$\{Date\.now\(\)\}`, d\.visual_check \?\? null\)/);
    assert.equal((src.match(/image_url: url, visual_check: check/g) ?? []).length, 2, "Bhagavatam and Chaitanya regenerate");
  });

  test("Story Scenes and every review section re-read their running checks, with the columns each table has", () => {
    // Arrange
    const calls = [...src.matchAll(/useVisualCheckPoll\(\s*"([a-z_]+)",\s*"([a-z_,]+)",\s*(\w+),\s*(\w+)(?:,\s*([^)]+?))?\s*\)/g)]
      .map((m) => ({ table: m[1], columns: m[2], rows: m[3], setRows: m[4], enabled: m[5] ?? null }))
      .sort((a, b) => a.table.localeCompare(b.table));
    const withPath = "id,visual_check,image_url,image_path";
    // Act / Assert: reader_scenes has no image_path; the admin queues skip the public Bhaktigram feed
    assert.deepEqual(calls, [
      { table: "bhagavatam_chapter_art_review", columns: withPath, rows: "pendingChapterArt", setRows: "setPendingChapterArt", enabled: "!isBhaktigramRoute" },
      {
        table: "chaitanya_chapter_art_review",
        columns: withPath,
        rows: "pendingChaitanya",
        setRows: "setPendingChaitanya",
        enabled: "!CHAITANYA_IMAGE_GEN_PAUSED && !isBhaktigramRoute",
      },
      { table: "gita_chapter_art_review", columns: withPath, rows: "rows", setRows: "setRows", enabled: null },
      { table: "ig_pending_review", columns: withPath, rows: "pending", setRows: "setPending", enabled: "!isBhaktigramRoute" },
      { table: "reader_scenes", columns: "id,visual_check,image_url", rows: "scenes", setRows: "setScenes", enabled: null },
    ]);
    assert.equal((src.match(/useVisualCheckPoll\(/g) ?? []).length, calls.length, "every call is one of the five above");
  });

  test("the hook keeps one poller per section: re-reads through sbFetch on the window's timers, hands it every change of the rows, and stops it on unmount", () => {
    // Arrange: how the poller behaves is tested above ("gallery check poller"); this checks the hook feeds it
    const start = src.indexOf("function useVisualCheckPoll<");
    const body = start >= 0 ? src.slice(start, src.indexOf("\n}\n", start)) : "";
    // Act / Assert
    assert.ok(body.length > 0, "useVisualCheckPoll should exist");
    assert.match(body, /const \[poller\] = useState\(\(\) =>\s*createCheckPoller<T>\(\{/);
    assert.match(body, /const res = await sbFetch\(path\);\s*return res\.ok \? await res\.json\(\) : null;/);
    assert.match(body, /onStale: \(\) => setStaleRenders\(n => n \+ 1\)/);
    assert.match(body, /now: \(\) => Date\.now\(\)/);
    for (const timer of ["setInterval", "clearInterval", "setTimeout", "clearTimeout"]) {
      assert.match(body, new RegExp(`\\b${timer}: [^\\n]*window\\.${timer}\\(`), timer);
    }
    assert.match(body, /useEffect\(\(\) => \{\s*poller\.update\(rows, enabled\);\s*\}, \[poller, rows, enabled\]\);/);
    assert.match(body, /useEffect\(\(\) => \(\) => poller\.stop\(\), \[poller\]\);/);
  });

  test("the Gita section calls the poll before its early return", () => {
    // Arrange: hooks must run on every render
    const section = src.slice(src.indexOf("function GitaArtSection()"), src.indexOf("// ── Gallery Page"));
    // Act
    const poll = section.indexOf('useVisualCheckPoll("gita_chapter_art_review"');
    const early = section.indexOf("if (loading) return null;");
    // Assert
    assert.ok(poll > 0 && early > poll, "useVisualCheckPoll must come before `if (loading) return null;`");
  });

  test("row types declare the image_path the poll re-reads, and reader scenes have none", () => {
    assert.match(interfaceBody("GitaArt"), /image_path\?: string \| null;/);
    assert.match(interfaceBody("PendingPost"), /image_path\?: string \| null;/);
    assert.match(interfaceBody("PendingChapterArt"), /image_path: string;/);
    assert.match(interfaceBody("PendingChaitanyaArt"), /image_path: string;/);
    assert.doesNotMatch(interfaceBody("ReaderScene"), /image_path/);
  });
});

// approve-instagram-post acts only on the image the reviewer saw: the card sends the
// image_path of the image its reviewer saw (createSeenImages), and a 409
// image_changed carries the image the automatic check swapped in, which the card
// must show before anyone approves or rejects it.
describe("gallery review of a pending Instagram post", { skip: GALLERY_SKIP }, () => {
  const src = HAS_GALLERY ? readFileSync(GALLERY_PATH, "utf8") : "";
  // reviewPost's body: the request to approve-instagram-post and how its answer is handled.
  const start = src.indexOf("const reviewPost = useCallback(");
  const end = start >= 0 ? src.indexOf("}, [fetchPending, startPoller, seenImages]);", start) : -1;
  const reviewPost = start >= 0 && end > start ? src.slice(start, end) : "";

  test("Approve and Reject send the image_path of the image the reviewer saw on their card's post", () => {
    // Arrange / Act
    const approves = src.match(/reviewPost\(p\.id, "approve", seenImages\.pathToReview\(p\.id, p\.image_path\)\)/g) ?? [];
    const rejects = src.match(/reviewPost\(p\.id, "reject", seenImages\.pathToReview\(p\.id, p\.image_path\)\)/g) ?? [];
    // Assert
    assert.ok(reviewPost.length > 0, "reviewPost should exist");
    assert.match(reviewPost, /async \(id: number, action: "approve" \| "reject", imagePath\?: string \| null\) =>/);
    assert.match(reviewPost, /body: JSON\.stringify\(\{ id, action, image_path: imagePath \|\| undefined \}\)/);
    assert.equal(approves.length, 1);
    assert.equal(rejects.length, 1);
    assert.doesNotMatch(src, /reviewPost\([^)]*"(approve|reject)"\)/, "every call names the image it reviews");
  });

  test("the page keeps one seen-image tracker, and the Lightbox reports when its image has loaded", () => {
    // Arrange: what the card and the lightbox report is run from source below ("gallery pending Instagram card, run from its source")
    const lightbox = src.slice(src.indexOf("function Lightbox("), src.indexOf("// ── Feature flags"));
    // Act / Assert
    assert.match(src, /const \[seenImages\] = useState\(\(\) => createSeenImages\(\)\);/);
    assert.match(lightbox, /onImageLoad\?: \(item: GalleryItem\) => void;/);
    assert.match(lightbox, /onLoad=\{\(\) => onImageLoad\?\.\(item\)\}/, "the Lightbox image reports its load");
    assert.match(src, /pendingReview\?: \{ id: number; imagePath: string \| null \};/, "GalleryItem carries the pending post a preview shows");
  });

  test("a 409 image_changed shows the new image, its path and its check on the card, closes that post's lightbox and asks for a new review", async () => {
    // Arrange
    const from = reviewPost.indexOf('res.status === 409 && data?.status === "image_changed"');
    const to = reviewPost.indexOf('data?.status === "publish_unknown"');
    const branch = from >= 0 && to > from ? reviewPost.slice(from, to) : "";
    // Act / Assert: the branch
    assert.ok(branch.length > 0, "reviewPost should handle image_changed before publish_unknown");
    assert.match(
      branch,
      /setPending\(prev => mergeCheckRows\(prev, \[\{ id, image_url: data\.image_url, image_path: data\.image_path \?\? null, visual_check: data\.visual_check \?\? null \}\], new Map\(prev\.map\(\(x\): \[number, unknown\] => \[x\.id, x\.visual_check\]\)\), Date\.now\(\)\)\);/,
    );
    assert.match(branch, /seenImages\.accept\(id, data\.image_path \?\? null\);/, "the reviewer is told, so the new image counts as seen once the card shows it");
    assert.match(branch, /setLightboxItem\(cur => \(cur\?\.id === `pending-\$\{id\}` \? null : cur\)\);/);
    assert.match(branch, /alert\("The automatic image check replaced this post's image/);
    // Act / Assert: the merge that branch runs, on a card still showing the old image
    const { mergeCheckRows } = await loadSummary();
    const card = { id: 77, image_url: "https://storage.test/old.jpg", image_path: "old.jpg", visual_check: { status: "running", started_at: iso(T0) } };
    const check = { status: "fail", attempts: 2, chosen_attempt: 1, failed: [], reason: null, started_at: iso(T0) };
    const answer = { id: 77, image_url: "https://storage.test/new.jpg", image_path: "new.jpg", visual_check: check };
    const merged = mergeCheckRows([card], [answer], new Map([[77, card.visual_check]]), T0 + 5_000);
    assert.deepEqual(merged, [{ ...card, image_url: `https://storage.test/new.jpg?t=${T0 + 5_000}`, image_path: "new.jpg", visual_check: check }]);
  });

  test("a 409 publish_unknown or claimed shows the function's own text, and any other failure still says the action failed", () => {
    assert.match(reviewPost, /\} else if \(res\.status === 409 && \(data\?\.status === "publish_unknown" \|\| data\?\.status === "claimed"\)\) \{\s*alert\(data\.error\);/);
    assert.match(reviewPost, /\} else if \(!res\.ok\) \{\s*alert\(`\$\{action === "approve" \? "Approve" : "Reject"\} failed: /);
  });

  test("a regenerate keeps the card's image_path in step with the image it saved, and that image counts as seen once the card shows it", () => {
    assert.match(src, /image_url: `\$\{d\.image_url\}\?t=\$\{Date\.now\(\)\}`, image_path: d\.image_path \?\? x\.image_path, image_prompt: promptDraft,/);
    assert.match(src, /seenImages\.accept\(id, d\.image_path \?\? null\);\s*\/\/ image_path too/);
  });
});

// ── The image each pending post's reviewer saw ──────────────────────────────

describe("gallery createSeenImages", { skip: GALLERY_SKIP }, () => {
  const R0 = "ig-canto1-ch3-0.jpg";
  const R1 = "ig-canto1-ch3-0-r1.jpg";
  const R2 = "ig-canto1-ch3-0-r2.jpg";

  test("a post that has shown no image names its card's own image_path, or null when it has none", async () => {
    // Arrange
    const { createSeenImages } = await loadSummary();
    const seen = createSeenImages();
    // Act / Assert
    assert.equal(seen.pathToReview(1, R0), R0);
    assert.equal(seen.pathToReview(1, null), null);
    assert.equal(seen.pathToReview(1, undefined), null);
  });

  test("the first image a card shows is named, even once the card's image_path has moved on to an image that has not loaded", async () => {
    // Arrange
    const { createSeenImages } = await loadSummary();
    const seen = createSeenImages();
    // Act
    seen.cardShown(1, R0);
    // Assert
    assert.equal(seen.pathToReview(1, R1), R0);
  });

  test("a later image that loads on the card is not named: nobody told the reviewer it replaced the first", async () => {
    // Arrange
    const { createSeenImages } = await loadSummary();
    const seen = createSeenImages();
    seen.cardShown(1, R0);
    // Act
    seen.cardShown(1, R1);
    // Assert
    assert.equal(seen.pathToReview(1, R1), R0);
  });

  test("an accepted image (a 409 image_changed, or a regenerate) is named at once when the card already shows it", async () => {
    // Arrange
    const { createSeenImages } = await loadSummary();
    const seen = createSeenImages();
    seen.cardShown(1, R0);
    seen.cardShown(1, R1);
    // Act
    seen.accept(1, R1);
    // Assert
    assert.equal(seen.pathToReview(1, R1), R1);
  });

  test("an accepted image is named only once the card shows it, and an image the card shows before it is not", async () => {
    // Arrange
    const { createSeenImages } = await loadSummary();
    const seen = createSeenImages();
    seen.cardShown(1, R0);
    // Act / Assert
    seen.accept(1, R1);
    assert.equal(seen.pathToReview(1, R1), R0, "R1 has not loaded yet");
    seen.cardShown(1, R2);
    assert.equal(seen.pathToReview(1, R2), R0, "R2 was never accepted");
    seen.cardShown(1, R1);
    assert.equal(seen.pathToReview(1, R1), R1);
  });

  test("the image the lightbox showed full size is named, whatever the thumbnail loaded behind it", async () => {
    // Arrange
    const { createSeenImages } = await loadSummary();
    const seen = createSeenImages();
    seen.cardShown(1, R0);
    // Act / Assert
    seen.lightboxShown(1, R0);
    seen.cardShown(1, R1);
    assert.equal(seen.pathToReview(1, R1), R0);
    seen.lightboxShown(1, R1);
    assert.equal(seen.pathToReview(1, R1), R1, "a lightbox opened on the new image inspects it");
  });

  test("posts are tracked apart", async () => {
    // Arrange
    const { createSeenImages } = await loadSummary();
    const seen = createSeenImages();
    // Act
    seen.cardShown(1, R0);
    seen.accept(2, R1);
    // Assert
    assert.equal(seen.pathToReview(1, "other.jpg"), R0);
    assert.equal(seen.pathToReview(2, "b.jpg"), "b.jpg", "an accepted image counts only once its own card shows it");
  });
});

// ── The pending Instagram card, run from its source ──────────────────────────

/** A pending card as rendered now: take a fresh one after every step. A click on a disabled button fails, as a browser ignores it. */
interface CardView {
  approveDisabled: boolean;
  rejectDisabled: boolean;
  editDisabled: boolean;
  editorOpen: boolean;
  approve: () => void;
  reject: () => void;
  edit: () => void;
  regenerate: () => void;
  openPreview: () => void;
  /** The thumbnail finished loading the image the card holds now: its onLoad, when it has one. */
  thumbnailLoaded: () => void;
}

interface CardSource {
  render: (react: AnyValue, env: AnyValue) => Record<string, AnyValue>;
  /** The card's `const is... = ...;` flags, in order. */
  flags: Array<{ name: string; expr: string }>;
  /** openPreview, as an arrow function. */
  openPreview: string;
  thumbnail: Map<string, string>;
  approve: Map<string, string>;
  reject: Map<string, string>;
  edit: Map<string, string>;
  regenerate: Map<string, string>;
  lightbox: Map<string, string>;
}

interface MountedCards {
  card: (id: number) => CardView;
  rows: () => Row[];
  /** Each reviewPost call: [id, action, image_path]. */
  reviews: AnyValue[][];
  alerts: string[];
  /** The card ids of the regenerate requests still waiting for an answer, in the order they were sent. */
  inFlight: () => number[];
  /** Answers the oldest waiting regenerate request of card `id`, then lets its handler finish. */
  answer: (id: number, status: number, body: unknown) => Promise<void>;
  /** The poll's merge of a swapped render into a card (mergeCheckRows): its img src changes, and the new image has not loaded. */
  mergeImage: (id: number, image: { url: string; path: string }) => void;
  /** The open lightbox finished loading its image: the page's Lightbox onImageLoad, when it has one. */
  lightboxLoaded: () => void;
  closeLightbox: () => void;
  seenImages: SeenImagesApi;
}

let cardDir: string | null = null;
let cardSource: Promise<CardSource> | null = null;

after(() => {
  if (cardDir) rmSync(cardDir, { recursive: true, force: true });
});

/** The single-line `name={expression}` attributes of the JSX element whose opening tag has a line matching `marker`. */
function jsxAttributes(lines: string[], marker: RegExp, what: string): Map<string, string> {
  const at = lines.findIndex((l) => marker.test(l));
  assert.ok(at >= 0, `gallery.tsx: ${what} not found`);
  let open = at;
  while (open >= 0 && !/^\s*<[A-Za-z]/.test(lines[open])) open--;
  assert.ok(open >= 0, `gallery.tsx: the element holding ${what}`);
  const attributes = new Map<string, string>();
  for (let i = open + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === ">" || line === "/>") break;
    const m = /^(\w+)=\{(.*)\}$/.exec(line);
    if (m) attributes.set(m[1], m[2]);
  }
  return attributes;
}

/**
 * The pending Instagram card's source, from gallery.tsx: its regenerate hooks (from
 * `const [promptEditId` to the end of regeneratePending) as a temporary .mts module,
 * so node strips their types, plus the expressions of the card's flags, openPreview,
 * thumbnail and buttons, and of the page's Lightbox.
 */
function loadCardSource(): Promise<CardSource> {
  if (!cardSource) {
    const src = readFileSync(GALLERY_PATH, "utf8");
    const hooksStart = src.indexOf("  const [promptEditId, setPromptEditId] = useState");
    const handlerStart = hooksStart >= 0 ? src.indexOf("const regeneratePending = useCallback(", hooksStart) : -1;
    const depsAt = handlerStart >= 0 ? src.indexOf("\n  }, [", handlerStart) : -1;
    const hooksEnd = depsAt >= 0 ? src.indexOf("\n", depsAt + 1) : -1;
    assert.ok(hooksStart >= 0 && handlerStart > hooksStart && depsAt > handlerStart && hooksEnd > depsAt, "gallery.tsx: the pending card's regenerate hooks");
    const hooks = src.slice(hooksStart, hooksEnd);
    const stateNames = [...hooks.matchAll(/const \[(\w+), (\w+)\] = useState/g)].flatMap((m) => [m[1], m[2]]);
    cardDir = mkdtempSync(join(tmpdir(), "pending-card-"));
    const file = join(cardDir, "hooks.mts");
    writeFileSync(
      file,
      [
        "export function render(react, env) {",
        "  const { useState, useCallback } = react;",
        "  const { setPending, seenImages, fetch, alert, SUPABASE_URL, SUPABASE_ANON_KEY } = env;",
        hooks,
        `  return { ${[...stateNames, "regeneratePending"].join(", ")} };`,
        "}",
        "",
      ].join("\n"),
    );
    const cardStart = src.indexOf("{pending.map((p) => {");
    const cardEnd = cardStart >= 0 ? src.indexOf("Tune model &amp; style in Playground", cardStart) : -1;
    assert.ok(cardStart >= 0 && cardEnd > cardStart, "gallery.tsx: the pending card");
    const lines = src.slice(cardStart, cardEnd).split("\n");
    const flags = lines.flatMap((l) => {
      const m = /^\s*const (is\w+) = ([^;]+);$/.exec(l);
      return m ? [{ name: m[1], expr: m[2] }] : [];
    });
    const previewAt = lines.findIndex((l) => /^\s*const openPreview = \(\) => \{$/.test(l));
    assert.ok(previewAt >= 0, "gallery.tsx: the pending card's openPreview");
    const indent = (/^\s*/.exec(lines[previewAt]) ?? [""])[0];
    const previewEnd = lines.findIndex((l, i) => i > previewAt && l === `${indent}};`);
    assert.ok(previewEnd > previewAt, "gallery.tsx: the end of the pending card's openPreview");
    const openPreview = ["() => {", ...lines.slice(previewAt + 1, previewEnd), "}"].join("\n");
    const pageLines = src.split("\n");
    cardSource = import(pathToFileURL(file).href).then((m) => ({
      render: m.render,
      flags,
      openPreview,
      thumbnail: jsxAttributes(lines, /^\s*src=\{p\.image_url\}$/, "the card's thumbnail"),
      approve: jsxAttributes(lines, /reviewPost\(p\.id, "approve"/, "Approve"),
      reject: jsxAttributes(lines, /reviewPost\(p\.id, "reject"/, "Reject"),
      edit: jsxAttributes(lines, /setPromptEditId\(promptEditId === p\.id \? null : p\.id\)/, "Edit prompt"),
      regenerate: jsxAttributes(lines, /regeneratePending\(p\.id\)/, "Regenerate image"),
      lightbox: jsxAttributes(pageLines, /^\s*<Lightbox$/, "the Lightbox"),
    }));
  }
  return cardSource;
}

/**
 * Renders pending Instagram cards from gallery.tsx's own source on a minimal hooks
 * model: useState keeps one slot per call, in call order, and a set applies at once;
 * useCallback returns the function it is given; every step renders the card again, as
 * React would after each state change. reviewPost only records its arguments, and a
 * regenerate request waits until the test answers it.
 */
async function mountPendingCards(initialRows: Row[]): Promise<MountedCards> {
  const source = await loadCardSource();
  const { createSeenImages, mergeCheckRows } = await loadSummary();
  const seenImages = createSeenImages();
  let rows: Row[] = initialRows.map((r) => ({ ...r }));
  let lightboxItem: AnyValue = null;
  const next = (current: AnyValue, update: AnyValue): AnyValue => (typeof update === "function" ? update(current) : update);
  const slots: AnyValue[] = [];
  let slot = 0;
  const react = {
    useState(initial: AnyValue) {
      const at = slot++;
      if (!(at in slots)) slots[at] = typeof initial === "function" ? initial() : initial;
      return [slots[at], (update: AnyValue) => { slots[at] = next(slots[at], update); }];
    },
    useCallback: (fn: AnyValue) => fn,
  };
  const requests: Array<{ id: number; respond: (res: Response) => void; done: boolean }> = [];
  const reviews: AnyValue[][] = [];
  const alerts: string[] = [];
  const env = {
    setPending: (update: AnyValue) => { rows = next(rows, update); },
    seenImages,
    fetch: (_url: string, init: AnyValue) => new Promise<Response>((respond) => { requests.push({ id: JSON.parse(init.body).id, respond, done: false }); }),
    alert: (message: unknown) => { alerts.push(String(message)); },
    SUPABASE_URL: "https://sb.test",
    SUPABASE_ANON_KEY: "anon-test",
  };
  const evaluate = (expr: string, scope: Record<string, unknown>): AnyValue => {
    const names = Object.keys(scope);
    return new Function(...names, `"use strict";\nreturn (${expr});`)(...names.map((n) => scope[n]));
  };
  const render = (p: Row): Record<string, unknown> => {
    slot = 0;
    const scope: Record<string, unknown> = {
      ...source.render(react, env),
      p,
      seenImages,
      reviewing: new Set<number>(),
      pendingExpanded: null,
      setPendingExpanded: () => {},
      reviewPost: (...args: AnyValue[]) => { reviews.push(args); },
      setLightboxItem: (update: AnyValue) => { lightboxItem = next(lightboxItem, update); },
    };
    for (const flag of source.flags) scope[flag.name] = evaluate(flag.expr, scope);
    return scope;
  };
  return {
    card(id) {
      const p = rows.find((r) => r.id === id);
      assert.ok(p, `no pending card ${id}`);
      const scope = render(p);
      const isDisabled = (attributes: Map<string, string>) => Boolean(evaluate(attributes.get("disabled") ?? "false", scope));
      const click = (attributes: Map<string, string>, what: string) => {
        assert.equal(isDisabled(attributes), false, `card ${id}: ${what} is disabled`);
        evaluate(attributes.get("onClick") ?? "undefined", scope)();
      };
      const editorOpen = scope.promptEditId === id;
      return {
        approveDisabled: isDisabled(source.approve),
        rejectDisabled: isDisabled(source.reject),
        editDisabled: isDisabled(source.edit),
        editorOpen,
        approve: () => click(source.approve, "Approve"),
        reject: () => click(source.reject, "Reject"),
        edit: () => click(source.edit, "Edit prompt"),
        regenerate: () => {
          assert.ok(editorOpen, `card ${id}: its prompt editor is closed`);
          click(source.regenerate, "Regenerate image");
        },
        openPreview: () => evaluate(source.openPreview, scope)(),
        thumbnailLoaded: () => {
          const onLoad = source.thumbnail.get("onLoad");
          if (onLoad) evaluate(onLoad, scope)();
        },
      };
    },
    rows: () => rows,
    reviews,
    alerts,
    inFlight: () => requests.filter((r) => !r.done).map((r) => r.id),
    async answer(id, status, body) {
      const request = requests.find((r) => r.id === id && !r.done);
      assert.ok(request, `no regenerate request of card ${id} is waiting`);
      request.done = true;
      request.respond(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
      for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
    },
    mergeImage(id, image) {
      const sent = new Map(rows.map((r): [number, unknown] => [r.id, r.visual_check]));
      rows = mergeCheckRows(rows, [{ id, image_url: image.url, image_path: image.path, visual_check: null }], sent, Date.now());
    },
    lightboxLoaded() {
      assert.ok(lightboxItem, "no lightbox is open");
      const onImageLoad = source.lightbox.get("onImageLoad");
      if (onImageLoad) evaluate(onImageLoad, { seenImages })(lightboxItem);
    },
    closeLightbox() {
      lightboxItem = null;
    },
    seenImages,
  };
}

describe("gallery pending Instagram card, run from its source", { skip: GALLERY_SKIP }, () => {
  const R0 = { url: "https://storage.test/ig-canto1-ch3-0.jpg", path: "ig-canto1-ch3-0.jpg" };
  const R1 = { url: "https://storage.test/ig-canto1-ch3-0-r1.jpg", path: "ig-canto1-ch3-0-r1.jpg" };
  const cardRow = (id: number, image = R0): Row => ({
    id,
    chapter_global_number: 3,
    chapter_canto: 1,
    chapter_in_canto: 3,
    chapter_title: `Chapter ${id}`,
    caption: `caption ${id}`,
    hashtags: "#tags",
    image_prompt: null,
    image_url: image.url,
    image_path: image.path,
    status: "pending",
    created_at: "2026-09-14T09:00:00.000Z",
    error_message: null,
    visual_check: null,
  });
  const regenerated = (id: number, path: string) => ({ ok: true, id, image_url: `https://storage.test/${path}`, image_path: path, visual_check: null });

  test("two cards regenerating at once each keep Approve, Reject and Edit prompt disabled until their own request answers", async () => {
    // Arrange
    const ui = await mountPendingCards([cardRow(1), cardRow(2, R1)]);
    // Act: card 1 starts regenerating, then card 2
    ui.card(1).edit();
    ui.card(1).regenerate();
    ui.card(2).edit();
    ui.card(2).regenerate();
    // Assert
    assert.deepEqual(ui.inFlight(), [1, 2]);
    for (const id of [1, 2]) {
      const c = ui.card(id);
      assert.equal(c.approveDisabled, true, `card ${id}: Approve`);
      assert.equal(c.rejectDisabled, true, `card ${id}: Reject`);
      assert.equal(c.editDisabled, true, `card ${id}: Edit prompt`);
    }
    // Act: card 1's request answers first
    await ui.answer(1, 200, regenerated(1, "pending-1-new.jpg"));
    // Assert: card 1 is free again; card 2 still waits for its render, with its editor open
    assert.equal(ui.card(1).approveDisabled, false);
    assert.equal(ui.card(1).rejectDisabled, false);
    assert.equal(ui.card(2).approveDisabled, true, "card 2: Approve while its own render runs");
    assert.equal(ui.card(2).rejectDisabled, true, "card 2: Reject while its own render runs");
    assert.equal(ui.card(2).editDisabled, true);
    assert.equal(ui.card(2).editorOpen, true, "card 1's answer leaves card 2's editor open");
    // Act: card 2's request answers
    await ui.answer(2, 200, regenerated(2, "pending-2-new.jpg"));
    // Assert
    assert.equal(ui.card(2).approveDisabled, false);
    assert.equal(ui.card(2).rejectDisabled, false);
    assert.equal(ui.card(2).editorOpen, false, "its own answer closes card 2's editor");
    assert.deepEqual(ui.rows().map((r) => r.image_path), ["pending-1-new.jpg", "pending-2-new.jpg"]);
    assert.deepEqual(ui.alerts, []);
  });

  test("Approve names the image the thumbnail showed, not an image_path the poll merged before its image loaded", async () => {
    // Arrange: the card shows R0
    const ui = await mountPendingCards([cardRow(1)]);
    ui.card(1).thumbnailLoaded();
    // Act: the redo's swap reaches the card, and the reviewer clicks Approve before R1 has loaded
    ui.mergeImage(1, R1);
    ui.card(1).approve();
    // Assert
    assert.equal(ui.rows()[0].image_path, R1.path, "the card already holds R1");
    assert.deepEqual(ui.reviews, [[1, "approve", R0.path]], "names R0, so the function answers 409 image_changed");
    // Act: R1 loads on the card, but nobody has told the reviewer it replaced R0
    ui.card(1).thumbnailLoaded();
    ui.card(1).reject();
    // Assert
    assert.deepEqual(ui.reviews[1], [1, "reject", R0.path]);
  });

  test("an image swapped in behind the lightbox is not approved once the lightbox closes: Approve names the image inspected full size until the reviewer is told", async () => {
    // Arrange: the card shows R0, and the reviewer inspects it full size
    const ui = await mountPendingCards([cardRow(1)]);
    ui.card(1).thumbnailLoaded();
    ui.card(1).openPreview();
    ui.lightboxLoaded();
    // Act: the redo's swap reaches the card behind the lightbox and R1 loads there; the reviewer closes the lightbox and approves
    ui.mergeImage(1, R1);
    ui.card(1).thumbnailLoaded();
    ui.closeLightbox();
    ui.card(1).approve();
    // Assert
    assert.deepEqual(ui.reviews, [[1, "approve", R0.path]], "names R0, so the function answers 409 image_changed");
    // Act: the 409 image_changed tells the reviewer about R1 (reviewPost accepts it), and they approve again
    ui.seenImages.accept(1, R1.path);
    ui.card(1).approve();
    // Assert
    assert.deepEqual(ui.reviews[1], [1, "approve", R1.path]);
  });

  test("an image the reviewer opened full size in the lightbox is named: a new image inspected there needs no second look", async () => {
    // Arrange: the card showed R0, and the redo's swap reached the card before R1 loaded there
    const ui = await mountPendingCards([cardRow(1)]);
    ui.card(1).thumbnailLoaded();
    ui.mergeImage(1, R1);
    // Act: the reviewer opens the card full size, which shows R1, then closes the lightbox and approves
    ui.card(1).openPreview();
    ui.lightboxLoaded();
    ui.closeLightbox();
    ui.card(1).approve();
    // Assert
    assert.deepEqual(ui.reviews, [[1, "approve", R1.path]]);
  });

  test("a regenerated image is named once its card shows it, not while it is still loading", async () => {
    // Arrange
    const ui = await mountPendingCards([cardRow(1)]);
    ui.card(1).thumbnailLoaded();
    ui.card(1).edit();
    ui.card(1).regenerate();
    // Act: the regenerate answers, and the reviewer approves before the new image has loaded on the card
    await ui.answer(1, 200, regenerated(1, "pending-1-new.jpg"));
    ui.card(1).approve();
    // Assert
    assert.equal(ui.rows()[0].image_path, "pending-1-new.jpg");
    assert.deepEqual(ui.reviews, [[1, "approve", R0.path]]);
    // Act: the new image loads on the card
    ui.card(1).thumbnailLoaded();
    ui.card(1).approve();
    // Assert
    assert.deepEqual(ui.reviews[1], [1, "approve", "pending-1-new.jpg"]);
  });
});
