import cron from "node-cron";
import { processNextBatch, getProgress, backfillEnglishTranslations, recoverStaleProgress, reprocessEmptyPages } from "../services/bhagwatham-sarvam";
import { runAuditPass, fastImageBackfill } from "../services/bhagwatham-audit";
import { checkAllCredits } from "../services/ai-credit-monitor";
import { logger } from "../lib/logger";

// COST OPTIMIZATION: all crons reduced to ONCE DAILY
// Staggered throughout the day — all complete well before daily-commit at 18:30 UTC
const CRON_INTERVAL = "0 2 * * *";            // 02:00 UTC = 07:30 IST — OCR batch
const BACKFILL_INTERVAL = "0 3 * * *";        // 03:00 UTC = 08:30 IST — English backfill
const AUDIT_INTERVAL = "0 5 * * *";           // 05:00 UTC = 10:30 IST — chapter audit
const FAST_BACKFILL_INTERVAL = "0 6 * * *";   // 06:00 UTC = 11:30 IST — image backfill
const CREDIT_CHECK_INTERVAL = "0 8 * * *";    // 08:00 UTC = 13:30 IST — credit monitor

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
  // COST: reduced to 1/4 frequency. Every 20 min, 50 pages per run.
  const REOCR_INTERVAL = "0 4 * * *"; // 04:00 UTC = 09:30 IST — re-OCR empty pages once daily
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

  // ── Fast image backfill — 1 image every 30 min ───────────
  // COST: reduced from 5 parallel @ 2 min → 1 per tick @ 30 min (75× fewer calls)
  //   Previously: 150 images/hr. Now: 2/hr → 48/day max.
  logger.info({ interval: FAST_BACKFILL_INTERVAL, parallelCount: 1 }, "Fast image backfill cron started");

  cron.schedule(FAST_BACKFILL_INTERVAL, async () => {
    try {
      const result = await fastImageBackfill(1);
      if (result.generated > 0) {
        logger.info(
          { generated: result.generated, remaining: result.remaining },
          "Fast backfill: images generated",
        );
      } else if (result.remaining === 0) {
        // All chapters covered — this will log once then be silent
      }
    } catch (err) {
      logger.error({ err }, "Fast backfill cron failed");
    }
  });

  // ── Persona Discovery — auto-discover Bhagavatam characters ────────────
  // Scans OCR'd pages for character names, validates via Claude,
  // researches appearance via Firecrawl, auto-populates persona system.
  const PERSONA_DISCOVERY_INTERVAL = "0 7 * * *"; // 07:00 UTC = 12:30 IST — persona discovery once daily
  logger.info({ interval: PERSONA_DISCOVERY_INTERVAL }, "Persona discovery cron started");

  cron.schedule(PERSONA_DISCOVERY_INTERVAL, async () => {
    try {
      const { personaDiscoveryTick } = await import("../services/persona-discovery");
      const result = await personaDiscoveryTick();
      if (result.phase !== "idle" && result.phase !== "completed") {
        logger.info({ phase: result.phase, details: result.details }, "Persona discovery tick");
      }
    } catch (err) {
      logger.error({ err }, "Persona discovery cron failed");
    }
  });

  // ── Image regeneration queue processor ─────────────────────────────────
  // Polls bhagavatam_image_regen_requests for pending rows and regenerates the
  // image with the user-supplied reason injected into the FLUX prompt. Runs
  // alongside the fast image backfill so requests are picked up the same day.
  const REGEN_QUEUE_INTERVAL = "30 6 * * *"; // 06:30 UTC = 12:00 IST — after fast backfill
  logger.info({ interval: REGEN_QUEUE_INTERVAL }, "Image regen-queue cron started");

  cron.schedule(REGEN_QUEUE_INTERVAL, async () => {
    try {
      const { processImageRegenQueue } = await import("../services/bhagwatham-regen-queue");
      const res = await processImageRegenQueue();
      if (res.processed > 0) {
        logger.info({ processed: res.processed, failed: res.failed }, "Regen queue processed");
      }
    } catch (err) {
      logger.error({ err }, "Image regen-queue cron failed");
    }
  });

  // Run initial credit check on startup
  checkAllCredits().catch(() => {});
}
