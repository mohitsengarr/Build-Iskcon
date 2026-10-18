// The storage side of an automatic re-render: what redoInBackground
// (visualCheck.ts) needs to put a better image on a review row, for any of the
// review tables.
//
// Gallery-triggered images — a Gita cover, a chapter or sample cover, a reader
// scene, a reviewer's Regenerate — used to be checked and only flagged: a card
// said "1 detail wrong" and waited for someone to click again. Now they are
// re-rendered with the correction like unattended runs, and these handlers are
// what keep that safe on a row a reviewer may be looking at:
//
// - swap() stores the new image as a NEW file and points the row at it only by a
//   compare-and-swap: the row must still be pending (when the table has a
//   status) and still hold the file this run stored. A reviewer's Approve,
//   Reject or another Regenerate always wins. The file it replaces is kept, never
//   deleted: an approval that read the row a moment before may still be posting
//   it. A new file the swap did not take is deleted.
// - stillCurrent() asks the same before each re-render, so a row reviewed
//   meanwhile costs no further render or check.
// - writeRecord() stores the final check record on whichever image the row holds.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface RowRedoTarget {
  supabase: SupabaseLike;
  /** The review table, e.g. "bhagavatam_chapter_art_review". */
  table: string;
  id: number | string;
  /** Storage bucket the row's images live in. */
  bucket: string;
  /** The image the row holds now: the compare-and-swap target. */
  stored: { url: string; path: string };
  /** A new file name for re-render `index`, never the stored one's. */
  fileName: (index: number) => string;
  /** Whether the table has a status column whose "pending" a swap requires. Default true. */
  requirePending?: boolean;
  /**
   * The column that names the stored image, for the compare-and-swap. Review
   * tables have image_path; reader_scenes has only image_url.
   */
  casColumn?: "image_path" | "image_url";
  /** Further compare-and-swap conditions, e.g. q.is("reviewed_at", null). */
  guard?: (query: SupabaseLike) => SupabaseLike;
  /** Extra fields stored beside visual_check on a swap (e.g. image_url's companion columns). */
  swapFields?: (url: string, path: string) => Record<string, unknown>;
  /** The visual_check value to store for a record (e.g. with safe_fallback). */
  recordValue?: (record: Record<string, unknown>) => Record<string, unknown>;
  tag: string;
  log?: (line: string) => void;
}

export interface RowRedoHandlers {
  swap: (attempt: { b64: string; index: number }, record: Record<string, unknown>) => Promise<boolean>;
  stillCurrent: () => Promise<boolean>;
  writeRecord: (record: Record<string, unknown>) => Promise<boolean>;
  /** The file the row holds now (moves on with each swap). */
  current: () => { url: string; path: string };
}

function decode(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function rowRedoHandlers(t: RowRedoTarget): RowRedoHandlers {
  const log = (line: string) => {
    try {
      (t.log ?? console.log)(line);
    } catch {
      // logging only
    }
  };
  let current = { ...t.stored };
  const requirePending = t.requirePending !== false;
  const casColumn = t.casColumn ?? "image_path";
  const held = () => (casColumn === "image_url" ? current.url : current.path);
  const recordValue = t.recordValue ?? ((r) => r);
  const guarded = (q: SupabaseLike) => {
    let out = q.eq("id", t.id).eq(casColumn, held());
    if (requirePending) out = out.eq("status", "pending");
    return t.guard ? t.guard(out) : out;
  };
  const removeFile = async (path: string) => {
    try {
      const { error } = await t.supabase.storage.from(t.bucket).remove([path]);
      if (error) log(`${t.tag} could not delete ${path}: ${error.message}`);
    } catch (e) {
      log(`${t.tag} could not delete ${path}: ${e}`);
    }
  };
  const heldNow = async (): Promise<string | null | undefined> => {
    try {
      const { data, error } = await t.supabase.from(t.table).select(casColumn).eq("id", t.id).maybeSingle();
      if (error) return undefined;
      return typeof data?.[casColumn] === "string" ? data[casColumn] : null;
    } catch {
      return undefined;
    }
  };

  const swap: RowRedoHandlers["swap"] = async (attempt, record) => {
    const path = t.fileName(attempt.index);
    try {
      const { error } = await t.supabase.storage.from(t.bucket).upload(path, decode(attempt.b64), { contentType: "image/jpeg", upsert: false });
      if (error) {
        log(`${t.tag} re-render ${attempt.index} not stored: ${error.message}`);
        return false;
      }
    } catch (e) {
      log(`${t.tag} re-render ${attempt.index} not stored: ${e}`);
      return false;
    }
    const url = t.supabase.storage.from(t.bucket).getPublicUrl(path).data.publicUrl;
    let result: { data: unknown; error: { message: string } | null };
    try {
      const image = casColumn === "image_url" ? { image_url: url } : { image_url: url, image_path: path };
      result = await guarded(
        t.supabase.from(t.table).update({ ...image, visual_check: recordValue(record), ...(t.swapFields?.(url, path) ?? {}) }),
      ).select("id");
    } catch (e) {
      result = { data: null, error: { message: String(e) } };
    }
    let swapped = !result.error && Array.isArray(result.data) && result.data.length === 1;
    if (result.error) {
      // An error can hide an update that was applied: ask the row before deleting
      // a file it may hold.
      const now = await heldNow();
      if (now === undefined) {
        log(`${t.tag} re-render ${attempt.index}: update failed (${result.error.message}) and the row could not be read; both files kept`);
        return false;
      }
      swapped = now === (casColumn === "image_url" ? url : path);
    }
    if (swapped) {
      log(`${t.tag} re-render ${attempt.index} replaced ${current.path} with ${path}; ${current.path} is kept in storage`);
      current = { url, path };
      return true;
    }
    log(`${t.tag} re-render ${attempt.index} not swapped in: ${result.error ? result.error.message : "the row was reviewed or its image replaced"}`);
    await removeFile(path);
    return false;
  };

  const stillCurrent: RowRedoHandlers["stillCurrent"] = async () => {
    try {
      const { data, error } = await guarded(t.supabase.from(t.table).select("id")).maybeSingle();
      if (error) {
        log(`${t.tag} could not read the row (${error.message}); carrying on`);
        return true;
      }
      return data !== null && data !== undefined;
    } catch (e) {
      log(`${t.tag} could not read the row (${e}); carrying on`);
      return true;
    }
  };

  const writeRecord: RowRedoHandlers["writeRecord"] = async (record) => {
    try {
      const { data, error } = await t.supabase
        .from(t.table)
        .update({ visual_check: recordValue(record) })
        .eq("id", t.id)
        .eq(casColumn, held())
        .select("id");
      if (error) {
        log(`${t.tag} visual_check not stored: ${error.message}`);
        return false;
      }
      if (!Array.isArray(data) || data.length === 0) {
        log(`${t.tag} visual_check not stored: the row no longer holds ${held()}`);
        return false;
      }
      return true;
    } catch (e) {
      log(`${t.tag} visual_check not stored: ${e}`);
      return false;
    }
  };

  return { swap, stillCurrent, writeRecord, current: () => current };
}
