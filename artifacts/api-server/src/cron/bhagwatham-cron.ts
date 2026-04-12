import cron from "node-cron";
import { processNextBatch, getProgress, backfillEnglishTranslations, recoverStaleProgress, reprocessEmptyPages } from "../services/bhagwatham-sarvam";
import { runAuditPass } from "../services/bhagwatham-audit";
import { checkAllCredits } from "../services/ai-credit-monitor";
import { logger } from "../lib/logger";

const CRON_INTERVAL = "*/5 * * * *"; // Every 5 minutes
const BACKFILL_INTERVAL = "3,13,23,33,43,53 * * * *"; // Offset by 3 min to avoid overlap
const AUDIT_INTERVAL = "*/5 * * * *"; // Every 5 min — prioritizes chapters without images
const CREDIT_CHECK_INTERVAL = "0 */2 * * *"; // Every 2 hours

export function startBhagwathamCron(): void {
  // Recover from stale "processing" state left by previous server crash
  recoverStaleProgress();

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

  // ── Audit cron — verify images, descriptions, shlok detection ─────────
  logger.info(
    { interval: AUDIT_INTERVAL },
    "Bhagwatham audit cron started",
  );

  cron.schedule(AUDIT_INTERVAL, async () => {
    try {
      const result = await runAuditPass();
      if (result.issuesFound > 0) {
        logger.info(
          { chaptersAudited: result.chaptersAudited, issues: result.issuesFound, fixed: result.issuesFixed },
          `Audit cron: ${result.message}`,
        );
      } else {
        logger.info({ message: result.message }, "Audit cron: chapter clean");
      }
    } catch (err) {
      logger.error({ err }, "Audit cron failed unexpectedly");
    }
  });

  // ── Re-OCR empty pages cron — fills gaps from failed OCR passes ──────
  // High throughput: 50 pages every 5 min (reverse order = Canto 11-12 first)
  // This processes ~600 pages/hour to fill the 1,000+ empty Canto 11-12 pages quickly.
  const REOCR_INTERVAL = "*/5 * * * *"; // Every 5 min
  const REOCR_BATCH_SIZE = 50;
  logger.info({ interval: REOCR_INTERVAL, batchSize: REOCR_BATCH_SIZE }, "Bhagwatham re-OCR empty pages cron started (reverse priority)");

  cron.schedule(REOCR_INTERVAL, async () => {
    try {
      const result = await reprocessEmptyPages(REOCR_BATCH_SIZE, true); // reverse=true: highest pages first
      if (result.reprocessed > 0) {
        logger.info(
          { reprocessed: result.reprocessed, totalEmpty: result.totalEmpty },
          `Re-OCR cron: ${result.message}`,
        );
      } else if (result.totalEmpty > 0) {
        logger.info({ totalEmpty: result.totalEmpty }, "Re-OCR cron: no pages recovered this tick");
      }
    } catch (err) {
      logger.error({ err }, "Re-OCR cron failed");
    }
  });

  // ── AI credit monitoring — check balances and alert via Flock ─────────
  logger.info(
    { interval: CREDIT_CHECK_INTERVAL },
    "AI credit monitor cron started",
  );

  cron.schedule(CREDIT_CHECK_INTERVAL, async () => {
    try {
      const statuses = await checkAllCredits();
      const issues = statuses.filter(s => s.status !== "ok" && s.status !== "unknown");
      if (issues.length > 0) {
        logger.warn({ issues }, "AI credit issues detected");
      }
    } catch (err) {
      logger.error({ err }, "Credit check cron failed");
    }
  });

  // Run initial credit check on startup
  checkAllCredits().catch(() => {});
}
