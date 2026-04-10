import cron from "node-cron";
import { processNextBatch, getProgress, backfillEnglishTranslations } from "../services/bhagwatham-sarvam";
import { logger } from "../lib/logger";

const CRON_INTERVAL = "*/10 * * * *"; // Every 10 minutes
const BACKFILL_INTERVAL = "3,13,23,33,43,53 * * * *"; // Offset by 3 min to avoid overlap

export function startBhagwathamCron(): void {
  logger.info(
    { interval: CRON_INTERVAL },
    "Bhagwatham PDF processor cron started",
  );

  // ── Main OCR + image generation cron ─────────────────────────────────────
  cron.schedule(CRON_INTERVAL, async () => {
    const progress = getProgress();

    if (progress.status === "completed") {
      logger.info("All Bhagwatham pages processed — cron skipping");
      return;
    }

    if (progress.status === "processing") {
      logger.info("Bhagwatham batch already in progress — cron skipping");
      return;
    }

    logger.info(
      {
        nextPage: progress.lastProcessedPage + 1,
        totalProcessed: progress.totalPagesProcessed,
        totalInPdf: progress.totalPagesInPdf || "unknown",
      },
      "Cron triggering Bhagwatham batch: OCR → translate → images → git commit → push → deploy",
    );

    try {
      const result = await processNextBatch();
      logger.info({ success: result.success, message: result.message }, "Cron batch completed");
    } catch (err) {
      logger.error({ err }, "Cron batch failed unexpectedly");
    }
  });

  // ── Backfill English translations for previously processed pages ────────
  logger.info(
    { interval: BACKFILL_INTERVAL },
    "Bhagwatham English backfill cron started",
  );

  cron.schedule(BACKFILL_INTERVAL, async () => {
    try {
      const result = await backfillEnglishTranslations();
      if (result.translated > 0) {
        logger.info(
          { batch: result.batchNumber, translated: result.translated, remaining: result.remainingBatches },
          "Backfill cron: English translations added",
        );
      } else {
        logger.info({ message: result.message }, "Backfill cron: nothing to do");
      }
    } catch (err) {
      logger.error({ err }, "Backfill cron failed unexpectedly");
    }
  });
}
