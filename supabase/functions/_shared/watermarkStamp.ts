// Stamping images stored before the watermark existed (owner, 2026-10-22: the
// replacements drawn before 2026-10-21). Only a replacement's image qualifies — a
// pending replacement, one approved in its own right, or one approved onto the row
// it replaced (that row's file is a candidate's, or a 'replaced' row naming it
// holds the same file) — and only when its file was written before the generators started
// marking (WATERMARK_SINCE_MS, read from the file name's timestamp). The marked
// image is stored as a NEW file, named for this call alone (stampedPath), and the
// row moves to it only by a compare-and-swap on its status and the image it held,
// so a review in the meantime always wins; the old file is kept. A call deletes
// its own file only on a clean answer that no row changed; after an error it keeps
// the file, since the update may yet land, so two calls on one row, or a lost
// reply, never leave a row on a deleted file. An image that seems to carry the
// mark already is left alone (stampBytes), so nothing is marked twice.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

/** The generators marked every image they stored from this moment (2026-10-20 20:30 UTC). */
export const WATERMARK_SINCE_MS = Date.UTC(2026, 9, 20, 20, 30);

export const STAMP_TABLES = [
  "bhagavatam_chapter_art_review",
  "chaitanya_chapter_art_review",
  "gita_chapter_art_review",
  "ig_pending_review",
] as const;
export type StampTable = typeof STAMP_TABLES[number];

export function isStampTable(t: unknown): t is StampTable {
  return typeof t === "string" && (STAMP_TABLES as readonly string[]).includes(t);
}

/** A replacement's own file name: <prefix>-candidate-<id>-<ms>.jpg or candidate-<id>-<ms>.jpg. */
export function isCandidateFile(path: string): boolean {
  return /(^|\/|-)candidate-/.test(path);
}

/** When a stored file was written: the last 13-digit epoch-ms run in its name. */
export function fileTimestamp(path: unknown): number | null {
  if (typeof path !== "string") return null;
  const runs = path.match(/\d{13}/g);
  return runs ? Number(runs[runs.length - 1]) : null;
}

/**
 * Why a row's image may not be stamped, or null when it may. copiedFromReplacement:
 * a 'replaced' row that names this one holds the same file (stampRow asks).
 */
export function stampRefusal(
  row: Record<string, unknown> | null | undefined,
  o: { copiedFromReplacement?: boolean } = {},
): string | null {
  if (!row) return "not found";
  const path = row.image_path;
  if (typeof path !== "string" || !path) return "no image";
  if (/-wm\.[a-z]+$/i.test(path)) return "already stamped";
  const replacement = row.replaces_id != null || row.replaces_legacy != null;
  if (row.status === "pending") {
    if (!replacement) return "not a replacement";
  } else if (row.status === "approved") {
    // A replacement approved in its own right, or an original holding a
    // replacement's image: a candidate's file, or one a 'replaced' row also holds
    // (a replacement regenerated before approval has a -regen- name).
    if (!replacement && !isCandidateFile(path) && !o.copiedFromReplacement) return "not a replacement's image";
  } else {
    return `status ${row.status}`;
  }
  const ts = fileTimestamp(path);
  if (ts === null) return "no timestamp in the file name";
  if (ts >= WATERMARK_SINCE_MS) return "stored after the watermark existed";
  return null;
}

/** A short random tag, so each call's stamped copy has a name of its own. */
export function stampTag(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/**
 * The stamped copy's name, beside the original: x.jpg → x-<tag>-wm.jpg. The tag
 * is this call's own, so no two calls ever write, adopt or delete the same file.
 */
export function stampedPath(path: string, tag: string): string {
  if (!/^[a-z0-9]{1,16}$/i.test(tag)) throw new Error("stamp tag must be 1-16 letters or digits");
  return /\.[a-z0-9]+$/i.test(path) ? path.replace(/(\.[a-z0-9]+)$/i, `-${tag}-wm$1`) : `${path}-${tag}-wm`;
}

/** Whether a path is a stamped copy of another (stampedPath with any tag). */
export function isStampedCopyOf(path: unknown, original: unknown): boolean {
  if (typeof path !== "string" || typeof original !== "string" || !original) return false;
  const ext = original.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
  const base = original.slice(0, original.length - ext.length);
  if (!path.startsWith(`${base}-`) || !path.endsWith(`-wm${ext}`)) return false;
  return /^[a-z0-9]{1,16}$/i.test(path.slice(base.length + 1, path.length - ext.length - 3));
}

/** The bucket and path of one of this project's public storage URLs. */
export function storageObject(url: unknown, supabaseUrl: string): { bucket: string; path: string } | null {
  const prefix = `${supabaseUrl}/storage/v1/object/public/`;
  if (typeof url !== "string" || !url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length).split("?")[0];
  const slash = rest.indexOf("/");
  if (slash <= 0 || rest.includes("..")) return null;
  return { bucket: rest.slice(0, slash), path: decodeURIComponent(rest.slice(slash + 1)) };
}

export type StampOutcome =
  | { outcome: "stamped"; table: StampTable; id: number; path: string }
  | { outcome: "skipped" | "already_marked" | "changed" | "error"; table: string; id: unknown; reason: string };

export async function stampRow(o: {
  supabase: SupabaseLike;
  supabaseUrl: string;
  table: unknown;
  id: unknown;
  /** Marks image bytes (stampBytes). */
  stamp: (bytes: Uint8Array) => Promise<{ bytes: Uint8Array; marked: boolean; alreadyMarked: boolean }>;
  fetchImpl?: typeof fetch;
  /** This call's file-name tag (stampTag); tests pass a fixed one. */
  tag?: string;
}): Promise<StampOutcome> {
  const { supabase, table, id } = o;
  const fail = (outcome: "skipped" | "already_marked" | "changed" | "error", reason: string): StampOutcome => ({ outcome, table: String(table), id, reason });
  if (!isStampTable(table)) return fail("error", "not a review table");
  if (!Number.isInteger(id)) return fail("error", "id must be a whole number");
  const { data: row, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (error) return fail("error", `could not read the row: ${error.message}`);
  let copiedFromReplacement = false;
  if (row?.status === "approved" && typeof row.image_path === "string" && row.replaces_id == null &&
      row.replaces_legacy == null && !isCandidateFile(row.image_path)) {
    const { data: replaced, error: repErr } = await supabase.from(table).select("id")
      .eq("replaces_id", id).eq("status", "replaced").eq("image_path", row.image_path).limit(1);
    if (repErr) return fail("error", `could not look for the replacement: ${repErr.message}`);
    copiedFromReplacement = Array.isArray(replaced) && replaced.length > 0;
  }
  const refusal = stampRefusal(row, { copiedFromReplacement });
  if (refusal) return fail("skipped", refusal);
  const obj = storageObject(row.image_url, o.supabaseUrl);
  if (!obj || obj.path !== row.image_path) return fail("skipped", "image_url does not match image_path");

  const res = await (o.fetchImpl ?? fetch)(row.image_url.split("?")[0]);
  if (!res.ok) return fail("error", `could not read the image (HTTP ${res.status})`);
  const marked = await o.stamp(new Uint8Array(await res.arrayBuffer()));
  if (marked.alreadyMarked) return fail("already_marked", "the image seems to carry the mark already");
  if (!marked.marked) return fail("error", "the image could not be marked");

  const newPath = stampedPath(obj.path, o.tag ?? stampTag());
  // Never over an existing file: a name already taken is not this call's to use.
  const { error: upErr } = await supabase.storage.from(obj.bucket).upload(newPath, marked.bytes, { contentType: "image/jpeg", upsert: false });
  if (upErr) return fail("error", `could not store the stamped image: ${upErr.message}`);
  const newUrl = supabase.storage.from(obj.bucket).getPublicUrl(newPath).data.publicUrl;

  let q = supabase.from(table).update({ image_url: newUrl, image_path: newPath })
    .eq("id", id).eq("status", row.status).eq("image_path", row.image_path);
  // A pending post being approved or rejected right now is left alone.
  if (table === "ig_pending_review" && row.status === "pending") q = q.is("reviewed_at", null);
  const { data: moved, error: updErr } = await q.select("id");
  if (!updErr && Array.isArray(moved)) {
    if (moved.length === 1) return { outcome: "stamped", table, id: id as number, path: newPath };
    // A clean answer that no row changed is final, and the file is this call's alone.
    try { await supabase.storage.from(obj.bucket).remove([newPath]); } catch { /* best effort */ }
    return fail("changed", "the row was reviewed or its image changed meanwhile");
  }
  // An error can hide an update that was applied, or one that has yet to land, so
  // the file is kept whatever happens; the row says whether it was moved.
  let held: unknown;
  try {
    const { data: now, error: readErr } = await supabase.from(table).select("image_path").eq("id", id).maybeSingle();
    held = readErr ? undefined : (now?.image_path ?? null);
  } catch {
    held = undefined;
  }
  if (held === newPath) return { outcome: "stamped", table, id: id as number, path: newPath };
  return fail("error", `update failed: ${updErr?.message ?? "no answer"}; ${newPath} is kept`);
}
