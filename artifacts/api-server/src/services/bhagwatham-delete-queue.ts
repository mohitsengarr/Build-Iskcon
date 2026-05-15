/**
 * Image delete queue processor.
 *
 * Mirror of bhagwatham-regen-queue but for deletions. The frontend writes a row
 * to `bhagavatam_image_deletes` and the image disappears from the gallery
 * immediately (the gallery merges the queue with the manifest). This processor
 * actually moves the file to trash + removes it from the manifest when the
 * laptop runs.
 */
import { logger } from "../lib/logger";
import { deleteChapterImage } from "./bhagwatham-image-gen";

const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

interface DeleteRequest {
  chapter_number: number;
  scene_index: number;
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

let _running = false;

export async function processImageDeleteQueue(): Promise<{ processed: number; failed: number }> {
  if (_running) return { processed: 0, failed: 0 };
  _running = true;
  let processed = 0;
  let failed = 0;
  try {
    const res = await sb(
      "bhagavatam_image_deletes?processed_at=is.null&select=chapter_number,scene_index&order=requested_at.asc&limit=50",
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "Could not fetch delete queue");
      return { processed: 0, failed: 0 };
    }
    const rows = (await res.json()) as DeleteRequest[];
    if (rows.length === 0) return { processed: 0, failed: 0 };

    logger.info({ pending: rows.length }, "Processing image delete queue");

    for (const req of rows) {
      try {
        const result = deleteChapterImage(req.chapter_number, req.scene_index);
        await sb(
          `bhagavatam_image_deletes?chapter_number=eq.${req.chapter_number}&scene_index=eq.${req.scene_index}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              processed_at: new Date().toISOString(),
              trash_id: result.trashId || null,
            }),
          },
        );
        processed++;
      } catch (err) {
        logger.error({ err, req }, "Delete queue: failed to process request");
        failed++;
      }
    }
  } finally {
    _running = false;
  }
  return { processed, failed };
}
