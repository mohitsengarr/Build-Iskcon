// Tests for the visual_check column migration and the gallery's image-check line.
//
// The migration is checked from its source: it must add a nullable jsonb column
// to exactly the five tables that store generated images, document the stored
// record shape, and touch nothing else (no drops, policies, grants or RLS).
//
// The gallery page is a React file that node cannot import, so its pure
// visualCheckSummary block (between the visual-check-summary markers) is copied
// to a temporary .mts file and imported on its own. Those tests are skipped when
// the gallery is not in the checkout.
//
// Run: node --experimental-strip-types --test tests/
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { visualCheckRecord } from "../supabase/functions/_shared/visualCheckCore.ts";

const MIGRATIONS_DIR = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const MIGRATION_FILE = "20260913230000_visual_check.sql";
const RESEARCH_MIGRATION_FILE = "20260913190000_scene_visual_research.sql";
const SQL = readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), "utf8");

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

// ── Gallery ──────────────────────────────────────────────────────────────────

interface SummaryModule {
  // deno-lint-ignore no-explicit-any
  visualCheckSummary: (check: any) => { tone: "fail" | "pass" | "muted"; headline: string; details: string[] } | null;
}

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
    writeFileSync(file, `${src.slice(start, end)}\nexport { visualCheckSummary };\n`);
    summaryModule = import(pathToFileURL(file).href) as Promise<SummaryModule>;
  }
  return summaryModule;
}

after(() => {
  if (summaryDir) rmSync(summaryDir, { recursive: true, force: true });
});

const GALLERY_SKIP = HAS_GALLERY ? false : "artifacts/temple-tracker/src/pages/gallery.tsx is not in this checkout";

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
});
