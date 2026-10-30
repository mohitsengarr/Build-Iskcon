// _shared/watermarkStamp.ts and stampBytes: stamping the replacements drawn
// before the watermark existed — only those, never twice, and never under a
// reviewer's change.
// Run: node --experimental-strip-types --test tests/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./helpers/edge-function-hooks.mjs", import.meta.url);
const st = await import("../supabase/functions/_shared/watermarkStamp.ts");
const wm = await import("../supabase/functions/_shared/watermark.ts");

const BEFORE = st.WATERMARK_SINCE_MS - 60_000;
const AFTER = st.WATERMARK_SINCE_MS + 60_000;
const SB = "https://p.supabase.co";
const url = (bucket: string, path: string) => `${SB}/storage/v1/object/public/${bucket}/${path}`;

describe("stampRefusal", () => {
  const pending = (path: string, extra: Record<string, unknown> = {}) => ({ status: "pending", image_path: path, replaces_id: 7, ...extra });

  test("a pending replacement stored before the watermark may be stamped", () => {
    assert.equal(st.stampRefusal(pending(`art-candidate-5-${BEFORE}.jpg`)), null);
    assert.equal(st.stampRefusal(pending(`art-candidate-10-${BEFORE}.jpg`, { replaces_id: null, replaces_legacy: { image: "chapter-010.jpg" } })), null);
  });

  test("an approved row holding a replacement's image from before the watermark may be stamped", () => {
    assert.equal(st.stampRefusal({ status: "approved", image_path: `candidate-41-${BEFORE}.jpg`, replaces_id: null }), null);
  });

  test("a replacement approved in its own right may be stamped, whatever its file is called", () => {
    assert.equal(st.stampRefusal({ status: "approved", image_path: `art-regen-338-${BEFORE}.jpg`, replaces_legacy: { image: "chapter-338.jpg" } }), null);
    assert.equal(st.stampRefusal({ status: "approved", image_path: `art-regen-90-${BEFORE}.jpg`, replaces_id: 5 }), null);
  });

  test("an original holding a regenerated replacement's file qualifies only when a replaced row holds the same file", () => {
    const row = { status: "approved", image_path: `art-regen-342-${BEFORE}.jpg`, replaces_id: null };
    assert.equal(st.stampRefusal(row), "not a replacement's image");
    assert.equal(st.stampRefusal(row, { copiedFromReplacement: true }), null);
    assert.equal(st.stampRefusal({ ...row, image_path: `art-regen-342-${AFTER}.jpg` }, { copiedFromReplacement: true }), "stored after the watermark existed");
  });

  test("an image stored once the generators marked their images is left alone", () => {
    assert.equal(st.stampRefusal(pending(`art-candidate-5-${AFTER}.jpg`)), "stored after the watermark existed");
  });

  test("only replacements: an ordinary pending card, or an approved image that never was a replacement, is left alone", () => {
    assert.equal(st.stampRefusal(pending(`art-regen-5-${BEFORE}.jpg`, { replaces_id: null })), "not a replacement");
    assert.equal(st.stampRefusal({ status: "approved", image_path: `ig-canto10-ch1-${BEFORE}.jpg` }), "not a replacement's image");
  });

  test("never twice, never a rejected or replaced row, never a file whose age is unknown", () => {
    assert.equal(st.stampRefusal(pending(`art-candidate-5-${BEFORE}-wm.jpg`)), "already stamped");
    assert.equal(st.stampRefusal({ status: "rejected", image_path: `candidate-1-${BEFORE}.jpg`, replaces_id: 1 }), "status rejected");
    assert.equal(st.stampRefusal(pending("art-candidate-5.jpg")), "no timestamp in the file name");
    assert.equal(st.stampRefusal(null), "not found");
  });
});

describe("file names and storage URLs", () => {
  test("fileTimestamp reads the last 13-digit run", () => {
    assert.equal(st.fileTimestamp(`pending-713-${BEFORE}-r1.jpg`), BEFORE);
    assert.equal(st.fileTimestamp("chapter-001.jpg"), null);
  });

  test("the stamped copy sits beside the original, named for one call by its tag", () => {
    assert.equal(st.stampedPath("art-candidate-5-1.jpg", "ab12cd34"), "art-candidate-5-1-ab12cd34-wm.jpg");
    assert.equal(st.stampedPath("art-candidate-5-1", "t1"), "art-candidate-5-1-t1-wm");
  });

  test("a stamped name still reads as already stamped, and keeps the original's timestamp", () => {
    const path = st.stampedPath(`art-candidate-5-${BEFORE}.jpg`, "ab12cd34");
    assert.equal(st.stampRefusal({ status: "pending", image_path: path, replaces_id: 7 }), "already stamped");
    assert.equal(st.fileTimestamp(path), BEFORE);
  });

  test("a tag that could break the name is refused", () => {
    assert.throws(() => st.stampedPath("a.jpg", "../x"));
    assert.throws(() => st.stampedPath("a.jpg", ""));
  });

  test("stampTag gives each call a different short tag", () => {
    const a = st.stampTag();
    assert.match(a, /^[a-f0-9]{8}$/);
    assert.notEqual(a, st.stampTag());
  });

  test("isStampedCopyOf knows a stamped copy of this image from any other file", () => {
    assert.equal(st.isStampedCopyOf("art-candidate-5-1-ab12cd34-wm.jpg", "art-candidate-5-1.jpg"), true);
    assert.equal(st.isStampedCopyOf("art-candidate-5-1-wm.jpg", "art-candidate-5-1.jpg"), false, "no tag");
    assert.equal(st.isStampedCopyOf("art-candidate-5-2-ab12cd34-wm.jpg", "art-candidate-5-1.jpg"), false, "another image");
    assert.equal(st.isStampedCopyOf("art-candidate-5-1-ab/cd-wm.jpg", "art-candidate-5-1.jpg"), false, "not a tag");
    assert.equal(st.isStampedCopyOf("art-regen-5-9.jpg", "art-candidate-5-1.jpg"), false);
    assert.equal(st.isStampedCopyOf(null, "a.jpg"), false);
    assert.equal(st.isStampedCopyOf("a-t1-wm.jpg", null), false);
  });

  test("storageObject reads this project's public URLs only", () => {
    assert.deepEqual(st.storageObject(url("chapter-art-images", "a.jpg") + "?t=1", SB), { bucket: "chapter-art-images", path: "a.jpg" });
    assert.equal(st.storageObject("https://evil.test/storage/v1/object/public/b/a.jpg", SB), null);
    assert.equal(st.storageObject(url("b", "../x"), SB), null);
  });

  test("only the four review tables", () => {
    assert.equal(st.isStampTable("ig_pending_review"), true);
    assert.equal(st.isStampTable("profiles"), false);
  });
});

describe("markContrast", () => {
  // A 2x1 mark: a white text pixel and an empty one.
  const mark = { width: 2, height: 1, bitmap: new Uint8ClampedArray([255, 255, 255, 200, 0, 0, 0, 0]) };
  const image = (text: number, empty: number) => ({ width: 2, height: 1, bitmap: new Uint8ClampedArray([text, text, text, 255, empty, empty, empty, 255]) });

  test("near-white text over its own darker background reads as marked", () => {
    assert.ok(wm.markContrast(image(210, 50), mark, { x: 0, y: 0 }) > wm.MARKED_CONTRAST);
  });

  test("an even image reads as unmarked", () => {
    assert.ok(wm.markContrast(image(60, 60), mark, { x: 0, y: 0 }) < wm.MARKED_CONTRAST);
  });
});

describe("hasMark", () => {
  test("an image without the mark reads as unmarked", async () => {
    assert.equal(await wm.hasMark(Buffer.from("IMG:1344x1088"), () => {}), false);
  });

  test("an image that cannot be read is unknown (null), never marked", async () => {
    const lines: string[] = [];
    assert.equal(await wm.hasMark(Buffer.from("not an image"), (l) => lines.push(l)), null);
    assert.match(lines[0], /could not check the mark/);
  });
});

describe("stampBytes", () => {
  test("marks an unmarked image", async () => {
    const out = await wm.stampBytes(Buffer.from("IMG:1344x1088"), () => {});
    assert.equal(out.marked, true);
    assert.equal(out.alreadyMarked, false);
  });
});

// ── stampRow ──────────────────────────────────────────────────────────────────

function fakeDb(
  row: Record<string, unknown> | null,
  o: {
    uploadError?: string;
    updateError?: string;
    applyDespiteError?: boolean;
    failReadsAfterUpdate?: boolean;
    /** Other rows of the table, answered to the replaced-row lookup. */
    replacedRows?: Array<Record<string, unknown>>;
    lookupError?: string;
  } = {},
) {
  const lookups: Array<Array<[string, unknown]>> = [];
  const uploads: string[] = [];
  const files = new Set<string>();
  let updated = false;
  const removed: string[] = [];
  const updates: Array<{ values: Record<string, unknown>; eq: Array<[string, unknown]>; is: Array<[string, unknown]> }> = [];
  const from = () => {
    const eq: Array<[string, unknown]> = [];
    const is: Array<[string, unknown]> = [];
    let values: Record<string, unknown> | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => (eq.push([c, v]), q),
      is: (c: string, v: unknown) => (is.push([c, v]), q),
      update: (v: Record<string, unknown>) => ((values = v), q),
      maybeSingle: () => q,
      limit: () => q,
      then: (res: (v: unknown) => unknown) => {
        if (!values && eq.some(([c]) => c === "replaces_id")) {
          lookups.push([...eq]);
          if (o.lookupError) return Promise.resolve({ data: null, error: { message: o.lookupError } }).then(res);
          const hits = (o.replacedRows ?? []).filter((r) => eq.every(([c, v]) => r[c] === v));
          return Promise.resolve({ data: hits.map((r) => ({ id: r.id })), error: null }).then(res);
        }
        const matches = !!row && eq.every(([c, v]) => row[c] === v) && is.every(([c, v]) => (row[c] ?? null) === v);
        if (!values) {
          if (o.failReadsAfterUpdate && updated) return Promise.resolve({ data: null, error: { message: "fetch failed" } }).then(res);
          return Promise.resolve({ data: matches ? { ...row } : null, error: null }).then(res);
        }
        updated = true;
        updates.push({ values, eq: [...eq], is: [...is] });
        if (o.updateError) {
          if (o.applyDespiteError && matches) Object.assign(row!, values);
          return Promise.resolve({ data: null, error: { message: o.updateError } }).then(res);
        }
        if (matches) Object.assign(row!, values);
        return Promise.resolve({ data: matches ? [{ id: row!.id }] : [], error: null }).then(res);
      },
    };
    return q;
  };
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        uploads.push(`${bucket}/${path}`);
        if (o.uploadError) return { error: { message: o.uploadError } };
        if (files.has(`${bucket}/${path}`)) return { error: { message: "The resource already exists" } };
        files.add(`${bucket}/${path}`);
        return { error: null };
      },
      remove: async (paths: string[]) => {
        for (const p of paths) (removed.push(`${bucket}/${p}`), files.delete(`${bucket}/${p}`));
        return { error: null };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: url(bucket, path) } }),
    }),
  };
  return { from, storage, uploads, removed, updates, row, files, lookups };
}

const OLD = `art-candidate-5-${BEFORE}.jpg`;
const pendingRow = (extra: Record<string, unknown> = {}) => ({
  id: 90, status: "pending", replaces_id: 5, image_path: OLD, image_url: url("chapter-art-images", OLD), ...extra,
});
const stamping = (result: { marked: boolean; alreadyMarked: boolean }) => {
  const seen: number[] = [];
  return { seen, stamp: async (b: Uint8Array) => (seen.push(b.length), { bytes: new Uint8Array([1, 2]), ...result }) };
};
const okFetch = (async () => new Response(new Uint8Array([9, 9, 9]))) as unknown as typeof fetch;
const NEW = OLD.replace(".jpg", "-t1-wm.jpg");

describe("stampRow", () => {
  test("stores the stamped image as a new file and moves the row to it by a compare-and-swap; the old file stays", async () => {
    // Arrange
    const db = fakeDb(pendingRow());
    const s = stamping({ marked: true, alreadyMarked: false });
    // Act
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 90, stamp: s.stamp, fetchImpl: okFetch, tag: "t1" });
    // Assert
    assert.deepEqual(out, { outcome: "stamped", table: "bhagavatam_chapter_art_review", id: 90, path: NEW });
    assert.deepEqual(db.uploads, [`chapter-art-images/${NEW}`]);
    assert.equal(db.row!.image_path, NEW);
    assert.equal(db.row!.image_url, url("chapter-art-images", NEW));
    assert.deepEqual(db.updates[0].eq, [["id", 90], ["status", "pending"], ["image_path", OLD]]);
    assert.deepEqual(db.removed, []);
    assert.deepEqual(s.seen, [3], "the stored image's own bytes were stamped");
  });

  test("a pending Instagram post being reviewed is left alone: its compare-and-swap needs no claim", async () => {
    const db = fakeDb(pendingRow({ image_url: url("instagram-images", OLD), reviewed_at: "2026-10-22T10:00:00Z" }));
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "ig_pending_review", id: 90, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: okFetch, tag: "t1" });
    assert.equal(out.outcome, "changed");
    assert.deepEqual(db.updates[0].is, [["reviewed_at", null]]);
    assert.deepEqual(db.removed, [`instagram-images/${NEW}`], "the unused stamped file is deleted");
  });

  test("a row reviewed meanwhile keeps its image, and the stamped file is deleted", async () => {
    const db = fakeDb(pendingRow());
    const s = stamping({ marked: true, alreadyMarked: false });
    const out = await st.stampRow({
      supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 90,
      stamp: async (b) => { db.row!.status = "approved"; return s.stamp(b); }, fetchImpl: okFetch, tag: "t1",
    });
    assert.equal(out.outcome, "changed");
    assert.equal(db.row!.image_path, OLD);
    assert.deepEqual(db.removed, [`chapter-art-images/${NEW}`]);
  });

  test("an update whose answer was lost but which landed counts as stamped, and nothing is deleted", async () => {
    const db = fakeDb(pendingRow(), { updateError: "socket hang up", applyDespiteError: true });
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 90, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: okFetch, tag: "t1" });
    assert.equal(out.outcome, "stamped");
    assert.deepEqual(db.removed, []);
  });

  test("an image that seems marked already is never marked again, and nothing is written", async () => {
    const db = fakeDb(pendingRow());
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 90, stamp: stamping({ marked: false, alreadyMarked: true }).stamp, fetchImpl: okFetch, tag: "t1" });
    assert.equal(out.outcome, "already_marked");
    assert.deepEqual([db.uploads.length, db.updates.length], [0, 0]);
  });

  test("a row that does not qualify is not fetched or written", async () => {
    const db = fakeDb(pendingRow({ image_path: `art-candidate-5-${AFTER}.jpg`, image_url: url("chapter-art-images", `art-candidate-5-${AFTER}.jpg`) }));
    let fetched = 0;
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 90, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: (async () => (fetched++, new Response(""))) as unknown as typeof fetch });
    assert.equal(out.outcome, "skipped");
    assert.deepEqual([fetched, db.uploads.length], [0, 0]);
  });

  test("a file that already has the name is never adopted: the row is not moved and nothing is deleted", async () => {
    // Arrange: someone else stored a file under this call's name
    const db = fakeDb(pendingRow());
    db.files.add(`chapter-art-images/${NEW}`);
    // Act
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 90, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: okFetch, tag: "t1" });
    // Assert
    assert.equal(out.outcome, "error");
    assert.match((out as { reason: string }).reason, /already exists/);
    assert.equal(db.row!.image_path, OLD);
    assert.deepEqual([db.updates.length, db.removed.length], [0, 0]);
  });

  test("two calls on one row at once: one moves it, the other deletes only its own file, and the row's file survives", async () => {
    // Arrange: both calls read the row and store their copies before either swaps
    const db = fakeDb(pendingRow());
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let waiting = 0;
    const stamp = async () => {
      waiting++;
      if (waiting === 2) release();
      await gate;
      return { bytes: new Uint8Array([1]), marked: true, alreadyMarked: false };
    };
    const call = (tag: string) => st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 90, stamp, fetchImpl: okFetch, tag });
    // Act
    const [a, b] = await Promise.all([call("aaaa"), call("bbbb")]);
    // Assert
    const outcomes = [a.outcome, b.outcome].sort();
    assert.deepEqual(outcomes, ["changed", "stamped"]);
    const winner = (a.outcome === "stamped" ? a : b) as { path: string };
    const loser = winner === a ? "bbbb" : "aaaa";
    assert.equal(db.row!.image_path, winner.path);
    assert.ok(db.files.has(`chapter-art-images/${winner.path}`), "the file the row holds still exists");
    assert.deepEqual(db.removed, [`chapter-art-images/${OLD.replace(".jpg", `-${loser}-wm.jpg`)}`]);
  });

  test("a lost reply whose read-back also fails keeps the stamped file and reports an error", async () => {
    // Arrange: the update lands, its answer is lost, and the next read fails too
    const db = fakeDb(pendingRow(), { updateError: "connection reset", applyDespiteError: true, failReadsAfterUpdate: true });
    // Act
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 90, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: okFetch, tag: "t1" });
    // Assert
    assert.equal(out.outcome, "error");
    assert.match((out as { reason: string }).reason, /is kept/);
    assert.equal(db.row!.image_path, NEW);
    assert.deepEqual(db.removed, [], "the file the row may hold is not deleted");
  });

  test("a failed update keeps the stamped file even when the row still shows the old image, since the update may yet land", async () => {
    // Arrange: an error answer, and a read-back that still sees the old image
    const db = fakeDb(pendingRow(), { updateError: "connection reset" });
    // Act
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 90, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: okFetch, tag: "t1" });
    // Assert
    assert.equal(out.outcome, "error");
    assert.match((out as { reason: string }).reason, /connection reset; .*-t1-wm\.jpg is kept/);
    assert.equal(db.row!.image_path, OLD);
    assert.deepEqual(db.removed, [], "nothing is deleted after an unclear answer");
  });

  test("an approved original holding a regenerated replacement's file is stamped once the replaced row is found", async () => {
    // Arrange: #7 holds the file of replacement #342, which was regenerated before approval
    const FILE = `art-regen-342-${BEFORE}.jpg`;
    const db = fakeDb(
      { id: 7, status: "approved", replaces_id: null, image_path: FILE, image_url: url("chapter-art-images", FILE) },
      { replacedRows: [{ id: 342, replaces_id: 7, status: "replaced", image_path: FILE }] },
    );
    // Act
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 7, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: okFetch, tag: "t1" });
    // Assert
    assert.equal(out.outcome, "stamped");
    assert.deepEqual(db.lookups, [[["replaces_id", 7], ["status", "replaced"], ["image_path", FILE]]]);
    assert.equal(db.row!.image_path, FILE.replace(".jpg", "-t1-wm.jpg"));
  });

  test("an approved original whose -regen- file no replaced row holds is left alone", async () => {
    // Arrange: the only replaced row holds a different file
    const FILE = `art-regen-7-${BEFORE}.jpg`;
    const db = fakeDb(
      { id: 7, status: "approved", replaces_id: null, image_path: FILE, image_url: url("chapter-art-images", FILE) },
      { replacedRows: [{ id: 342, replaces_id: 7, status: "replaced", image_path: `art-regen-342-${BEFORE}.jpg` }] },
    );
    // Act
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 7, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: okFetch, tag: "t1" });
    // Assert
    assert.deepEqual([out.outcome, (out as { reason: string }).reason], ["skipped", "not a replacement's image"]);
    assert.deepEqual([db.uploads.length, db.updates.length], [0, 0]);
  });

  test("a failed replaced-row lookup is an error, never a guess", async () => {
    const FILE = `art-regen-342-${BEFORE}.jpg`;
    const db = fakeDb({ id: 7, status: "approved", image_path: FILE, image_url: url("chapter-art-images", FILE) }, { lookupError: "timeout" });
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "bhagavatam_chapter_art_review", id: 7, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: okFetch, tag: "t1" });
    assert.equal(out.outcome, "error");
    assert.equal(db.uploads.length, 0);
  });

  test("a candidate's file needs no lookup", async () => {
    const FILE = `candidate-41-${BEFORE}.jpg`;
    const db = fakeDb({ id: 41, status: "approved", image_path: FILE, image_url: url("instagram-images", FILE) });
    const out = await st.stampRow({ supabase: db, supabaseUrl: SB, table: "ig_pending_review", id: 41, stamp: stamping({ marked: true, alreadyMarked: false }).stamp, fetchImpl: okFetch, tag: "t1" });
    assert.equal(out.outcome, "stamped");
    assert.deepEqual(db.lookups, []);
  });

  test("refuses a table that is not a review table, and an id that is not a number", async () => {
    const db = fakeDb(pendingRow());
    const s = stamping({ marked: true, alreadyMarked: false }).stamp;
    assert.equal((await st.stampRow({ supabase: db, supabaseUrl: SB, table: "profiles", id: 90, stamp: s })).outcome, "error");
    assert.equal((await st.stampRow({ supabase: db, supabaseUrl: SB, table: "ig_pending_review", id: "90", stamp: s })).outcome, "error");
  });
});
