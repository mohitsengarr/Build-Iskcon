/**
 * Bhagavad Gita Cron Jobs
 *
 * Adapted from bhagwatham-cron.ts with all intervals OFFSET by +2 minutes
 * to avoid overlap with the Bhagwatham crons.
 *
 * Differences from Bhagwatham:
 *   - Imports from gita-ocr and gita-audit
 *   - No Instagram cron (Gita doesn't use Instagram)
 *   - No credit check cron (shared with Bhagwatham, runs there)
 *   - All cron intervals offset by +2 minutes
 */

import cron from "node-cron";
import { processNextBatch, getProgress, backfillEnglishTranslations, recoverStaleProgress, reprocessEmptyPages } from "../services/gita-ocr";
import { runGitaAuditPass } from "../services/gita-audit";
import { logger } from "../lib/logger";

// COST OPTIMIZATION: all Gita crons reduced to ONCE DAILY.
// Staggered after Bhagwatham crons, before daily commit at 18:30 UTC.
const CRON_INTERVAL = "0 9 * * *";         // 09:00 UTC = 14:30 IST — Gita OCR batch
const BACKFILL_INTERVAL = "0 10 * * *";    // 10:00 UTC = 15:30 IST — English backfill
const AUDIT_INTERVAL = "0 11 * * *";       // 11:00 UTC = 16:30 IST — Gita audit
const REOCR_INTERVAL = "0 12 * * *";       // 12:00 UTC = 17:30 IST — re-OCR empty pages
const REOCR_BATCH_SIZE = 50;

export function startGitaCron(): void {
  // Recover from stale "processing" state left by previous server crash
  recoverStaleProgress();

  logger.info(
    { interval: CRON_INTERVAL },
    "Gita PDF processor cron started",
  );

  // ── Main OCR + image generation cron ─────────────────────────────────────
  cron.schedule(CRON_INTERVAL, async () => {
    const progress = getProgress();

    if (progress.status === "completed") {
      logger.info("All Gita pages processed -- cron skipping");
      return;
    }

    if (progress.status === "processing") {
      logger.info("Gita batch already in progress -- cron skipping");
      return;
    }

    logger.info(
      {
        nextPage: progress.lastProcessedPage + 1,
        totalProcessed: progress.totalPagesProcessed,
        totalInPdf: progress.totalPagesInPdf || "unknown",
      },
      "Gita cron triggering batch: OCR -> translate -> images -> git commit -> push -> deploy",
    );

    try {
      const result = await processNextBatch();
      logger.info({ success: result.success, message: result.message }, "Gita cron batch completed");
    } catch (err) {
      logger.error({ err }, "Gita cron batch failed unexpectedly");
    }
  });

  // ── Backfill English translations for previously processed pages ────────
  logger.info(
    { interval: BACKFILL_INTERVAL },
    "Gita English backfill cron started",
  );

  cron.schedule(BACKFILL_INTERVAL, async () => {
    try {
      const result = await backfillEnglishTranslations();
      if (result.translated > 0) {
        logger.info(
          { batch: result.batchNumber, translated: result.translated, remaining: result.remainingBatches },
          "Gita backfill cron: English translations added",
        );
      } else {
        logger.info({ message: result.message }, "Gita backfill cron: nothing to do");
      }
    } catch (err) {
      logger.error({ err }, "Gita backfill cron failed unexpectedly");
    }
  });

  // ── Audit cron — verify images, descriptions, shlok detection ─────────
  logger.info(
    { interval: AUDIT_INTERVAL },
    "Gita audit cron started",
  );

  cron.schedule(AUDIT_INTERVAL, async () => {
    try {
      const result = await runGitaAuditPass();
      if (result.issuesFound > 0) {
        logger.info(
          { chaptersAudited: result.chaptersAudited, issues: result.issuesFound, fixed: result.issuesFixed },
          `Gita audit cron: ${result.message}`,
        );
      } else {
        logger.info({ message: result.message }, "Gita audit cron: chapter clean");
      }
    } catch (err) {
      logger.error({ err }, "Gita audit cron failed unexpectedly");
    }
  });

  // ── Re-OCR empty pages cron ──────────────────────────────────────────────
  logger.info({ interval: REOCR_INTERVAL, batchSize: REOCR_BATCH_SIZE }, "Gita re-OCR empty pages cron started");

  cron.schedule(REOCR_INTERVAL, async () => {
    try {
      const result = await reprocessEmptyPages(REOCR_BATCH_SIZE, true);
      if (result.reprocessed > 0) {
        logger.info(
          { reprocessed: result.reprocessed, totalEmpty: result.totalEmpty },
          `Gita re-OCR cron: ${result.message}`,
        );
      } else if (result.totalEmpty > 0) {
        logger.info({ totalEmpty: result.totalEmpty }, "Gita re-OCR cron: no pages recovered this tick");
      }
    } catch (err) {
      logger.error({ err }, "Gita re-OCR cron failed");
    }
  });
}
