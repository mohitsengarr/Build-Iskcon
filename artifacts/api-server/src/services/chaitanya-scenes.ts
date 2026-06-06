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

import fs from "fs";
import path from "path";
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

/**
 * Returns the next chapter whose OCR is ready but whose scenes have not
 * been extracted yet. Iterates ocr_status='ready' chapters in
 * global_number order and skips any that already have a
 * chaitanya_chapter_scenes row.
 */
async function findNextReadyChapter(): Promise<ChapterRow | null> {
  const readyRes = await supaRest(
    "chaitanya_chapters?ocr_status=eq.ready&order=global_number.asc&select=global_number,part,number_in_part,title,ocr_status",
  );
  if (!readyRes.ok) {
    logger.warn({ status: readyRes.status }, "[chaitanya-scenes] cannot list ready chapters");
    return null;
  }
  const ready = (await readyRes.json()) as ChapterRow[];
  if (ready.length === 0) return null;

  // Fetch which ones already have scenes
  const idCsv = ready.map(r => r.global_number).join(",");
  const sceneRes = await supaRest(
    `chaitanya_chapter_scenes?chapter_global_number=in.(${idCsv})&select=chapter_global_number`,
  );
  const haveScenes = new Set<number>();
  if (sceneRes.ok) {
    const rows = (await sceneRes.json()) as Array<{ chapter_global_number: number }>;
    for (const r of rows) haveScenes.add(r.chapter_global_number);
  }
  return ready.find(r => !haveScenes.has(r.global_number)) || null;
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
 * Process a single chapter through the chaitanya-extract-scenes Edge
 * Function and insert the returned scenes row. Returns true on success.
 */
async function processChapter(chapter: ChapterRow): Promise<{ ok: boolean; reason?: string; sceneCount?: number }> {
  const ct = chapterTextFromBatch(chapter.global_number);
  if (!ct) return { ok: false, reason: "no batch JSON on disk" };
  if (ct.text.length < 100) return { ok: false, reason: "chapter text < 100 chars" };

  logger.info({ chapter: chapter.global_number, title: chapter.title, chars: ct.text.length }, "[chaitanya-scenes] extracting");

  const url = `${supaUrl()}/functions/v1/chaitanya-extract-scenes`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supaKey(),
      Authorization: `Bearer ${supaKey()}`,
    },
    body: JSON.stringify({
      chapter_global_number: chapter.global_number,
      chapter_part: chapter.part,
      chapter_in_part: chapter.number_in_part,
      chapter_title: chapter.title,
      chapter_text: ct.text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, reason: `extract-scenes ${res.status}: ${detail.substring(0, 200)}` };
  }

  const data = await res.json() as {
    chapter_global_number: number;
    scenes: Array<Record<string, unknown>>;
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
  };

  // Insert row. Upsert via on_conflict so re-runs don't error out.
  const insertRes = await supaRest("chaitanya_chapter_scenes?on_conflict=chapter_global_number", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      chapter_global_number: chapter.global_number,
      chapter_part: chapter.part,
      chapter_in_part: chapter.number_in_part,
      chapter_title: chapter.title,
      scenes: data.scenes,
      used_scene_indexes: [],
      extracted_at: new Date().toISOString(),
      model: data.model || "claude-haiku-4-5",
      input_tokens: data.input_tokens || null,
      output_tokens: data.output_tokens || null,
    }),
  });
  if (!insertRes.ok) {
    const detail = await insertRes.text();
    return { ok: false, reason: `insert failed ${insertRes.status}: ${detail.substring(0, 200)}` };
  }

  return { ok: true, sceneCount: data.scenes.length };
}

/**
 * Cron entry point: process up to N chapters per tick. Bounded so a single
 * tick can't run away with the API.
 */
export async function extractNextChaitanyaScenes(maxPerTick = 3): Promise<{ processed: number; results: Array<{ globalNumber: number; ok: boolean; reason?: string; sceneCount?: number }> }> {
  const results: Array<{ globalNumber: number; ok: boolean; reason?: string; sceneCount?: number }> = [];
  for (let i = 0; i < maxPerTick; i++) {
    const chapter = await findNextReadyChapter();
    if (!chapter) break;
    const r = await processChapter(chapter);
    results.push({ globalNumber: chapter.global_number, ...r });
    if (!r.ok) {
      logger.warn({ chapter: chapter.global_number, reason: r.reason }, "[chaitanya-scenes] extraction failed — stopping tick");
      break;
    }
    logger.info({ chapter: chapter.global_number, sceneCount: r.sceneCount }, "[chaitanya-scenes] extracted");
  }
  return { processed: results.length, results };
}
