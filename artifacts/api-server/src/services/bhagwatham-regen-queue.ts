/**
 * Image regeneration queue processor.
 *
 * The frontend lets users request a chapter image regeneration with a reason
 * ("woman has beard", "Krishna shown as adult instead of child", etc.). Those
 * requests land in Supabase: bhagavatam_image_regen_requests.
 *
 * This module pulls pending rows and feeds them through regenerateChapterImages,
 * which injects the reason as a corrective instruction into the FLUX prompt so
 * the new image actively avoids the issue.
 */
import { logger } from "../lib/logger";
import { regenerateChapterImages } from "./bhagwatham-image-gen";
import { getAllBatches } from "./bhagwatham-sarvam";

const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

interface RegenRequest {
  id: number;
  chapter_number: number;
  scene_index: number;
  reason: string;
  status: string;
}

const sb = (path: string, init?: RequestInit) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

async function markStatus(id: number, fields: Record<string, unknown>): Promise<void> {
  await sb(`bhagavatam_image_regen_requests?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

/**
 * Resolve a sequential chapter number → { title, contentSnippet } using the OCR'd batches.
 * Walks through chapter headings in order and returns the contiguous content for the
 * Nth chapter (matches how findChaptersInBatches numbers them).
 */
function resolveChapterContent(globalNumber: number): { title: string; contentSnippet: string } | null {
  const batches = getAllBatches();
  const allPages = batches.flatMap((b) => b.pages);
  // Heading detection — same logic as bhagwatham-utils
  const isHeading = (line: string) => {
    const t = line.trim();
    if (!t || t.length > 100 || t.includes("पूर्ण हुए")) return false;
    return /^(?:\d+\s+)?(?:Chapter|अध्याय)\s+\S+/iu.test(t);
  };

  const chapterStarts: Array<{ pageIdx: number; lineIdx: number; title: string }> = [];
  for (let i = 0; i < allPages.length; i++) {
    const lines = allPages[i].text.split("\n");
    for (let j = 0; j < lines.length; j++) {
      if (isHeading(lines[j])) {
        chapterStarts.push({ pageIdx: i, lineIdx: j, title: lines[j].trim() });
      }
    }
  }

  if (globalNumber < 1 || globalNumber > chapterStarts.length) return null;
  const start = chapterStarts[globalNumber - 1];
  const end = chapterStarts[globalNumber] ?? null;

  // Concatenate text from the chapter heading up to (but not including) the next heading
  const parts: string[] = [];
  for (let i = start.pageIdx; i <= (end ? end.pageIdx : Math.min(allPages.length - 1, start.pageIdx + 5)); i++) {
    const lines = allPages[i].text.split("\n");
    const fromLine = i === start.pageIdx ? start.lineIdx + 1 : 0;
    const toLine = end && i === end.pageIdx ? end.lineIdx : lines.length;
    parts.push(lines.slice(fromLine, toLine).join("\n"));
    if (parts.join("\n").length > 4000) break;
  }
  return {
    title: start.title,
    contentSnippet: parts.join("\n").substring(0, 4000),
  };
}

let _running = false;

export async function processImageRegenQueue(): Promise<{ processed: number; failed: number }> {
  if (_running) return { processed: 0, failed: 0 };
  _running = true;
  let processed = 0;
  let failed = 0;
  try {
    const res = await sb(
      "bhagavatam_image_regen_requests?status=eq.pending&select=id,chapter_number,scene_index,reason,status&order=requested_at.asc&limit=10",
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "Could not fetch regen queue");
      return { processed: 0, failed: 0 };
    }
    const rows = (await res.json()) as RegenRequest[];
    if (rows.length === 0) return { processed: 0, failed: 0 };

    logger.info({ pending: rows.length }, "Processing image regen queue");

    for (const req of rows) {
      try {
        await markStatus(req.id, { status: "processing", started_at: new Date().toISOString() });

        const chapterInfo = resolveChapterContent(req.chapter_number);
        if (!chapterInfo) {
          await markStatus(req.id, {
            status: "failed",
            completed_at: new Date().toISOString(),
            error: `Chapter ${req.chapter_number} not found in OCR data`,
          });
          failed++;
          continue;
        }

        logger.info(
          { chapter: req.chapter_number, reason: req.reason },
          "Regenerating image with corrective reason",
        );

        const result = await regenerateChapterImages(
          req.chapter_number,
          chapterInfo.title,
          chapterInfo.contentSnippet,
          req.reason,
        );

        if (result.files.length > 0) {
          await markStatus(req.id, {
            status: "completed",
            completed_at: new Date().toISOString(),
            new_image_url: `/api/bhagwatham/images/${result.files[0]}`,
          });
          processed++;
        } else {
          await markStatus(req.id, {
            status: "failed",
            completed_at: new Date().toISOString(),
            error: "Generation returned no files",
          });
          failed++;
        }
      } catch (err) {
        logger.error({ err, id: req.id }, "Regen queue: failed to process request");
        try {
          await markStatus(req.id, {
            status: "failed",
            completed_at: new Date().toISOString(),
            error: String(err).substring(0, 500),
          });
        } catch { /* best-effort */ }
        failed++;
      }
    }
  } finally {
    _running = false;
  }
  return { processed, failed };
}
