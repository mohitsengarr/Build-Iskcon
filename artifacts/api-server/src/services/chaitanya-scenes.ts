// Chaitanya scene extraction
//
// For every `ocr_status='ready'` chapter that doesn't yet have a row in
// `chaitanya_chapter_scenes`, read its batch JSON from disk, concatenate
// all page text, call the `chaitanya-extract-scenes` Edge Function with
// Claude Haiku 4.5, and insert the returned scenes.
//
// IMPORTANT: this service ONLY extracts scenes. It deliberately does NOT
// trigger image generation — per user instruction we're pausing image
// generation for Chaitanya until the OCR (and probably full Adi-lila plus
// later Madhya/Antya) is complete. The frontend respects the
// CHAITANYA_IMAGE_GEN_PAUSED flag in gallery.tsx.

import { getChaitanyaBatch } from "./chaitanya-sarvam";
import { logger } from "../lib/logger";

function supaUrl(): string {
  const u = process.env.SUPABASE_URL || "";
  if (!u) throw new Error("SUPABASE_URL not set");
  return u;
}

function supaKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY not set");
  return k;
}

async function supaRest(p: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: supaKey(),
    Authorization: `Bearer ${supaKey()}`,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  return fetch(`${supaUrl()}/rest/v1/${p}`, { ...init, headers });
}

interface ChapterRow {
  global_number: number;
  part: string;
  number_in_part: number;
  title: string;
  ocr_status: string;
}

const MAX_EXTRACT_ATTEMPTS = 3;

/**
 * Returns the next chapter whose OCR is ready and whose scenes are still
 * outstanding: either no chaitanya_chapter_scenes row at all, or a failure
 * marker row (extract_error set) with extract_attempts < MAX_EXTRACT_ATTEMPTS.
 * Chapters at >= MAX attempts are parked (skipped; counted once per tick).
 * `visited` excludes chapters already handled within the current tick.
 */
async function findNextReadyChapter(
  visited: Set<number>,
  logParked: boolean,
): Promise<{ chapter: ChapterRow; priorAttempts: number } | null> {
  const readyRes = await supaRest(
    "chaitanya_chapters?ocr_status=eq.ready&order=global_number.asc&select=global_number,part,number_in_part,title,ocr_status",
  );
  if (!readyRes.ok) {
    logger.warn({ status: readyRes.status }, "[chaitanya-scenes] cannot list ready chapters — skipping tick");
    return null;
  }
  const ready = (await readyRes.json()) as ChapterRow[];
  if (ready.length === 0) return null;

  // Fetch existing scene rows (including failure markers)
  const idCsv = ready.map(r => r.global_number).join(",");
  const sceneRes = await supaRest(
    `chaitanya_chapter_scenes?chapter_global_number=in.(${idCsv})&select=chapter_global_number,extract_error,extract_attempts`,
  );
  if (!sceneRes.ok) {
    // Don't assume "no rows" — that would re-extract every chapter. Skip tick.
    logger.warn({ status: sceneRes.status }, "[chaitanya-scenes] cannot list scene rows — skipping tick");
    return null;
  }
  const rows = (await sceneRes.json()) as Array<{
    chapter_global_number: number;
    extract_error: string | null;
    extract_attempts: number | null;
  }>;
  const byChapter = new Map(rows.map(r => [r.chapter_global_number, r]));

  let parked = 0;
  let pick: { chapter: ChapterRow; priorAttempts: number } | null = null;
  for (const r of ready) {
    const row = byChapter.get(r.global_number);
    if (!row) {
      if (!pick && !visited.has(r.global_number)) pick = { chapter: r, priorAttempts: 0 };
      continue;
    }
    if (row.extract_error == null) continue; // extracted successfully
    const attempts = row.extract_attempts ?? 0;
    if (attempts >= MAX_EXTRACT_ATTEMPTS) {
      parked++;
      continue;
    }
    if (!pick && !visited.has(r.global_number)) pick = { chapter: r, priorAttempts: attempts };
  }

  if (logParked && parked > 0) {
    logger.warn({ parked, maxAttempts: MAX_EXTRACT_ATTEMPTS }, "[chaitanya-scenes] chapters parked after repeated extraction failures");
  }
  return pick;
}

/**
 * Concatenate every page of a chapter into one string. Includes page
 * boundaries as light separators so Claude can reason about flow.
 */
function chapterTextFromBatch(globalNumber: number): { text: string; pageCount: number } | null {
  const batch = getChaitanyaBatch(globalNumber);
  if (!batch) return null;
  const parts: string[] = [];
  for (const p of batch.pages) {
    parts.push(`[Page ${p.pageNumber}]`);
    parts.push(p.text);
  }
  return { text: parts.join("\n"), pageCount: batch.pageCount };
}

/**
 * Upsert a failure marker row so a broken chapter stops blocking the queue:
 * scenes=[], extract_error set, extract_attempts bumped. used_scene_indexes
 * is deliberately omitted — the DB default '{}' covers the first insert and
 * merge-duplicates must not clobber an existing value.
 */
async function markExtractFailure(chapter: ChapterRow, priorAttempts: number, reason: string): Promise<void> {
  try {
    const res = await supaRest("chaitanya_chapter_scenes?on_conflict=chapter_global_number", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        chapter_global_number: chapter.global_number,
        chapter_part: chapter.part,
        chapter_in_part: chapter.number_in_part,
        chapter_title: chapter.title,
        scenes: [],
        extract_error: reason.substring(0, 500),
        extract_attempts: priorAttempts + 1,
        extracted_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.warn({ chapter: chapter.global_number, status: res.status, detail: detail.substring(0, 200) }, "[chaitanya-scenes] could not upsert failure marker");
    }
  } catch (err) {
    logger.warn({ chapter: chapter.global_number, err }, "[chaitanya-scenes] could not upsert failure marker");
  }
}

/**
 * Process a single chapter through the chaitanya-extract-scenes Edge
 * Function and upsert the returned scenes row. On any failure a marker row
 * is recorded so the chapter can be retried (up to MAX_EXTRACT_ATTEMPTS)
 * without blocking the chapters behind it.
 */
async function processChapter(chapter: ChapterRow, priorAttempts: number): Promise<{ ok: boolean; reason?: string; sceneCount?: number }> {
  const fail = async (reason: string) => {
    await markExtractFailure(chapter, priorAttempts, reason);
    return { ok: false as const, reason };
  };

  const ct = chapterTextFromBatch(chapter.global_number);
  if (!ct) return fail("no batch JSON on disk");
  if (ct.text.length < 100) return fail("chapter text < 100 chars");

  logger.info({ chapter: chapter.global_number, title: chapter.title, chars: ct.text.length }, "[chaitanya-scenes] extracting");

  const url = `${supaUrl()}/functions/v1/chaitanya-extract-scenes`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supaKey(),
        Authorization: `Bearer ${supaKey()}`,
        "x-cc-secret": process.env.CC_EXTRACT_SECRET || "",
      },
      body: JSON.stringify({
        chapter_global_number: chapter.global_number,
        chapter_part: chapter.part,
        chapter_in_part: chapter.number_in_part,
        chapter_title: chapter.title,
        chapter_text: ct.text,
      }),
    });
  } catch (err) {
    return fail(`extract-scenes fetch failed: ${(err as Error).message}`);
  }

  if (!res.ok) {
    const detail = await res.text();
    return fail(`extract-scenes ${res.status}: ${detail.substring(0, 200)}`);
  }

  interface ExtractResponse {
    chapter_global_number: number;
    scenes: Array<Record<string, unknown>>;
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
  }
  let data: ExtractResponse;
  try {
    data = await res.json() as ExtractResponse;
  } catch (err) {
    return fail(`extract-scenes returned invalid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(data.scenes)) return fail("extract-scenes returned no scenes array");

  // Upsert row via on_conflict so re-runs don't error out. On success clear
  // extract_error and leave extract_attempts as-is; used_scene_indexes is
  // omitted entirely so merge-duplicates can't clobber it (DB default '{}'
  // covers the first insert).
  const insertRes = await supaRest("chaitanya_chapter_scenes?on_conflict=chapter_global_number", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      chapter_global_number: chapter.global_number,
      chapter_part: chapter.part,
      chapter_in_part: chapter.number_in_part,
      chapter_title: chapter.title,
      scenes: data.scenes,
      extract_error: null,
      extracted_at: new Date().toISOString(),
      model: data.model || "claude-haiku-4-5",
      input_tokens: data.input_tokens || null,
      output_tokens: data.output_tokens || null,
    }),
  });
  if (!insertRes.ok) {
    const detail = await insertRes.text();
    return fail(`insert failed ${insertRes.status}: ${detail.substring(0, 200)}`);
  }

  return { ok: true, sceneCount: data.scenes.length };
}

// Guards against the cron tick and the manual POST route overlapping.
let extractionInProgress = false;

/**
 * Cron entry point: process up to N chapters per tick. Bounded so a single
 * tick can't run away with the API. A failed chapter gets a marker row and
 * the tick CONTINUES with the next chapter (no head-of-line blocking).
 */
export async function extractNextChaitanyaScenes(maxPerTick = 3): Promise<{ processed: number; results: Array<{ globalNumber: number; ok: boolean; reason?: string; sceneCount?: number }> }> {
  const results: Array<{ globalNumber: number; ok: boolean; reason?: string; sceneCount?: number }> = [];
  if (extractionInProgress) {
    logger.info("[chaitanya-scenes] extraction already in progress — skipping");
    return { processed: 0, results };
  }
  extractionInProgress = true;
  try {
    const visited = new Set<number>();
    for (let i = 0; i < maxPerTick; i++) {
      const next = await findNextReadyChapter(visited, i === 0);
      if (!next) break;
      const { chapter, priorAttempts } = next;
      visited.add(chapter.global_number);
      const r = await processChapter(chapter, priorAttempts);
      results.push({ globalNumber: chapter.global_number, ...r });
      if (!r.ok) {
        logger.warn({ chapter: chapter.global_number, reason: r.reason }, "[chaitanya-scenes] extraction failed — continuing with next chapter");
        continue;
      }
      logger.info({ chapter: chapter.global_number, sceneCount: r.sceneCount }, "[chaitanya-scenes] extracted");
    }
    return { processed: results.length, results };
  } finally {
    extractionInProgress = false;
  }
}
