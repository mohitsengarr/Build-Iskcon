// Tests for supabase/migrations/20260914100000_ig_publish_started_at.sql, read
// from its source.
//
// approve-instagram-post sets ig_pending_review.publish_started_at on its own claim
// right before it calls Instagram, and never takes over a stale claim that has it
// set, so a request that died after it started publishing is never repeated. The
// migration must add that column (timestamptz, nullable, no default) with add
// column if not exists, document it, and change nothing else: no drop, data,
// policy, grant or row level security change.
//
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const MIGRATION_FILE = "20260914100000_ig_publish_started_at.sql";
// The newest migration before this one.
const PREVIOUS_MIGRATION_FILE = "20260914090000_visual_check_running.sql";
const SQL = readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), "utf8");
const APPROVE_SOURCE = readFileSync(new URL("../supabase/functions/approve-instagram-post/index.ts", import.meta.url), "utf8");

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

describe("statements() helper (publish marker migration)", () => {
  test("drops comments and keeps semicolons and keywords inside strings out of the code", () => {
    // Arrange
    const sql = "-- drop table x;\nalter table a add column b timestamptz;\ncomment on column a.b is 'no grant; here -- kept';\n";
    // Act
    const list = statements(sql);
    // Assert
    assert.deepEqual(list, ["alter table a add column b timestamptz", "comment on column a.b is 'no grant; here -- kept'"]);
    assert.equal(codeOnly(list[1]).includes("grant"), false);
    assert.equal(literal(list[1]), "no grant; here -- kept");
  });
});

describe("20260914100000_ig_publish_started_at.sql", () => {
  const list = statements(SQL);

  test("adds publish_started_at timestamptz to ig_pending_review with add column if not exists", () => {
    // Arrange
    const re = /^alter table public\.ig_pending_review add column if not exists publish_started_at timestamptz$/i;
    // Act
    const matches = list.filter((s) => re.test(s));
    // Assert
    assert.equal(matches.length, 1, list.join("\n"));
  });

  test("the column is nullable with no default, so every existing row reads as never started publishing", () => {
    // Arrange
    const alters = list.filter((s) => /^alter table/i.test(s));
    // Act / Assert
    assert.equal(alters.length, 1);
    assert.doesNotMatch(codeOnly(alters[0]), /\bnot null\b|\bdefault\b|\bprimary\b|\bunique\b|\breferences\b|\bcheck\b/);
  });

  test("holds only that add-column statement and one comment on the new column", () => {
    // Arrange / Act
    const [alter, comment, ...rest] = list;
    // Assert
    assert.deepEqual(rest, [], list.join("\n"));
    assert.match(alter, /^alter table public\.ig_pending_review add column if not exists publish_started_at /i);
    assert.match(comment, /^comment on column public\.ig_pending_review\.publish_started_at is '/i);
  });

  test("the comment says approve-instagram-post sets it right before it calls Instagram, and that a stale claim with it set is never taken over", () => {
    // Arrange
    const comment = list.find((s) => /^comment on column public\.ig_pending_review\.publish_started_at is '/i.test(s)) ?? "";
    // Act
    const text = literal(comment);
    // Assert
    assert.match(text, /approve-instagram-post/);
    assert.match(text, /own claim \(reviewed_at\)/);
    assert.match(text, /right before it calls Instagram/);
    assert.match(text, /stale claim \(reviewed_at older than 10 minutes\) with publish_started_at set is never taken over/);
    assert.match(text, /publish_unknown/);
  });

  test("never drops or deletes, and changes no data, policy, grant or row level security", () => {
    // Arrange
    const code = list.map(codeOnly).join(";\n");
    // Act / Assert
    assert.doesNotMatch(code, /\bdrop\b/);
    assert.doesNotMatch(code, /\bpolicy\b|\bpolicies\b/);
    assert.doesNotMatch(code, /\bgrant\b|\brevoke\b/);
    assert.doesNotMatch(code, /row level security|\bsecurity\b/);
    assert.doesNotMatch(code, /\bdelete\b|\btruncate\b|\bupdate\b|\binsert\b/);
    assert.doesNotMatch(code, /\bcreate\b|\bindex\b|\btrigger\b/);
  });

  test("sorts after the newest migration before it", () => {
    // Arrange
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    // Act
    const mine = files.indexOf(MIGRATION_FILE);
    const previous = files.indexOf(PREVIOUS_MIGRATION_FILE);
    // Assert
    assert.ok(mine >= 0 && previous >= 0, files.join(", "));
    assert.ok(mine > previous, "publish_started_at must apply after the visual_check migrations");
  });

  test("approve-instagram-post sets the column this migration adds before publishing, and needs it null to take over a stale claim", () => {
    // Arrange
    const added = SQL.match(/add column if not exists (\w+) timestamptz/i)?.[1];
    // Act / Assert
    assert.equal(added, "publish_started_at");
    assert.match(APPROVE_SOURCE, /\.update\(\{ publish_started_at: new Date\(\)\.toISOString\(\) \}\)/, "the publish marker");
    assert.match(APPROVE_SOURCE, /\.lt\("reviewed_at", cutoff\)\.is\("publish_started_at", null\)/, "the stale-claim takeover");
  });
});
