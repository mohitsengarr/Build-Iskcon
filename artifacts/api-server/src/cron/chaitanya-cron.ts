import cron from "node-cron";
import { processNextChaitanyaChapter, recoverStaleChaitanyaProgress, getChaitanyaProgress } from "../services/chaitanya-sarvam";
import { logger } from "../lib/logger";

// One chapter per tick. Sarvam OCR on a 20-30 page chapter takes ~5-15 minutes
// (mostly the per-page job poll). Every 30 minutes keeps the queue moving
// without flooding the API or burning compute.
//
// User-imposed run window: 11:00 AM → 04:00 AM Dubai time only. That maps to
// hours [11,12,...,23,0,1,2,3] in Asia/Dubai (UTC+4, no DST). Outside this
// window the cron simply doesn't fire — any chapter already mid-OCR keeps
// running to completion; no new chapter is picked up.
const CHAITANYA_OCR_INTERVAL = "0,30 11-23,0-3 * * *";
const CHAITANYA_TZ = "Asia/Dubai";

export function startChaitanyaCron(): void {
  // Recover any chapter stuck in "processing" after a previous server crash.
  void recoverStaleChaitanyaProgress();

  logger.info({ interval: CHAITANYA_OCR_INTERVAL, tz: CHAITANYA_TZ }, "Chaitanya OCR cron started (Dubai 11am-4am only)");

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
  }, { timezone: CHAITANYA_TZ });
}
