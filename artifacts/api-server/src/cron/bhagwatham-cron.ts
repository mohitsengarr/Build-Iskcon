import cron from "node-cron";
import { processNextBatch, getProgress, backfillEnglishTranslations, recoverStaleProgress } from "../services/bhagwatham-sarvam";
import { runAuditPass } from "../services/bhagwatham-audit";
import { checkAllCredits } from "../services/ai-credit-monitor";
import { logger } from "../lib/logger";

const CRON_INTERVAL = "*/10 * * * *"; // Every 10 minutes
const BACKFILL_INTERVAL = "3,13,23,33,43,53 * * * *"; // Offset by 3 min to avoid overlap
const AUDIT_INTERVAL = "7,37 * * * *"; // Every 30 min, offset by 7 to avoid overlap
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
