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
import { getChapterMap } from "./bhagwatham-audit";

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
 * Resolve a GLOBAL chapter number → { title, contentSnippet }.
 *
 * C4: uses the audit module's chapter detection (skandh-aware per-canto math,
 * ToC-page skipping, OCR heading fixes) — the exact same map the image
 * manifest numbering comes from. The previous sequential heading scan here
 * used neither, so its Nth heading often belonged to a DIFFERENT chapter and
 * regens were fed the wrong chapter's text.
 */
function resolveChapterContent(globalNumber: number): { title: string; contentSnippet: string } | null {
  const chapters = getChapterMap();
  const info = chapters.get(globalNumber);
  if (!info) return null;
  return { title: info.title, contentSnippet: info.contentSnippet };
}

/**
 * C8: crash recovery — rows stuck in status=processing (the process died after
 * marking them but before completing) would otherwise never be retried.
 * Re-queue them to pending. Called once at service start by the queue
 * processor; also exported so the cron can invoke it explicitly.
 */
export async function recoverStuckRegenRequests(): Promise<number> {
  try {
    const res = await sb("bhagavatam_image_regen_requests?status=eq.processing&select=id");
    if (!res.ok) return 0;
    const rows = (await res.json()) as Array<{ id: number }>;
    if (rows.length === 0) return 0;

    await sb("bhagavatam_image_regen_requests?status=eq.processing", {
      method: "PATCH",
      body: JSON.stringify({ status: "pending" }),
    });
    logger.info({ recovered: rows.length, ids: rows.map((r) => r.id) }, "Regen queue: re-queued stuck 'processing' rows to pending (crash recovery)");
    return rows.length;
  } catch (err) {
    logger.warn({ err }, "Regen queue: crash recovery failed (will retry next start)");
    return 0;
  }
}

let _running = false;
let _recoveredAtStartup = false;

export async function processImageRegenQueue(): Promise<{ processed: number; failed: number }> {
  if (_running) return { processed: 0, failed: 0 };
  _running = true;
  let processed = 0;
  let failed = 0;
  try {
    // C8: run crash recovery exactly once per process lifetime (= service start).
    if (!_recoveredAtStartup) {
      _recoveredAtStartup = true;
      await recoverStuckRegenRequests();
    }

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

        // C4: the reason is user-supplied and gets injected into the FLUX
        // prompt — clamp to 200 chars and strip newlines.
        const safeReason = (req.reason || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
        // C5: honor scene_index — regenerate ONLY the requested scene instead
        // of trashing every scene of the chapter.
        const sceneIndex =
          typeof req.scene_index === "number" && Number.isInteger(req.scene_index) && req.scene_index >= 0
            ? req.scene_index
            : undefined;

        logger.info(
          { chapter: req.chapter_number, sceneIndex, reason: safeReason },
          "Regenerating image with corrective reason",
        );

        const result = await regenerateChapterImages(
          req.chapter_number,
          chapterInfo.title,
          chapterInfo.contentSnippet,
          safeReason,
          sceneIndex,
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
