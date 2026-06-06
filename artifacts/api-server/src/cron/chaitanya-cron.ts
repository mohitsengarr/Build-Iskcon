import cron from "node-cron";
import { processNextChaitanyaChapter, recoverStaleChaitanyaProgress, getChaitanyaProgress } from "../services/chaitanya-sarvam";
import { logger } from "../lib/logger";

// One chapter per tick. Sarvam OCR on a 20-30 page chapter takes ~5-15 minutes
// (mostly the per-page job poll). Every 30 minutes keeps the queue moving
// without flooding the API or burning compute. At 18 chapters × ~10min, the
// full Adi-lila completes in roughly 9 hours of wall-clock time.
const CHAITANYA_OCR_INTERVAL = "*/30 * * * *";

export function startChaitanyaCron(): void {
  // Recover any chapter stuck in "processing" after a previous server crash.
  void recoverStaleChaitanyaProgress();

  logger.info({ interval: CHAITANYA_OCR_INTERVAL }, "Chaitanya OCR cron started");

  cron.schedule(CHAITANYA_OCR_INTERVAL, async () => {
    try {
      const progress = await getChaitanyaProgress();
      if (progress.queued === 0) {
        logger.info({ progress }, "Chaitanya OCR cron: no queued chapters");
        return;
      }
      if (progress.processing > 0) {
        logger.info({ progress }, "Chaitanya OCR cron: chapter already in progress — skipping");
        return;
      }
      logger.info({ progress }, "Chaitanya OCR cron: picking next queued chapter");
      const r = await processNextChaitanyaChapter();
      logger.info({ result: r }, "Chaitanya OCR cron: tick complete");
    } catch (err) {
      logger.error({ err }, "Chaitanya OCR cron failed unexpectedly");
    }
  });
}
