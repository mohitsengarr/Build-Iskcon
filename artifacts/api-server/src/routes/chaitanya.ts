import { Router } from "express";
import {
  getChaitanyaBatch,
  getAllChaitanyaBatches,
  getChaitanyaProgress,
  processNextChaitanyaChapter,
} from "../services/chaitanya-sarvam";
import { extractNextChaitanyaScenes } from "../services/chaitanya-scenes";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/chaitanya/chapter-index
 *
 * Returns the canonical chapter manifest from Supabase (chaitanya_chapters).
 * Mirrors the shape of /api/bhagwatham/chapter-index so the frontend can
 * reuse the same iteration patterns.
 */
router.get("/chaitanya/chapter-index", async (_req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || "";
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      res.status(500).json({ error: "Supabase env vars not set" });
      return;
    }
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/chaitanya_chapters?select=*&order=global_number.asc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
    );
    if (!r.ok) {
      res.status(502).json({ error: `Supabase ${r.status}` });
      return;
    }
    const chapters = await r.json();
    // Reshape into the same field names as bhagwatham's chapter-index so
    // downstream code can iterate identically. batchNumber === globalNumber
    // for Chaitanya since each chapter is its own batch.
    const reshaped = (chapters as Array<Record<string, unknown>>).map(c => ({
      globalNumber: c.global_number,
      part: c.part,
      number: c.number_in_part,
      title: c.title,
      pdfPath: c.pdf_path,
      batchNumber: c.global_number,
      pageNumber: c.page_number ?? null,
      ocrStatus: c.ocr_status,
    }));
    res.json({ chapters: reshaped });
  } catch (err) {
    logger.error({ err }, "Chaitanya chapter-index fetch failed");
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/chaitanya/batch/:n
 *
 * Returns the batch JSON for a chapter (one batch per chapter in Chaitanya).
 * Shape-compatible with /api/bhagwatham/batch/:n.
 */
router.get("/chaitanya/batch/:n", (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (!Number.isFinite(n)) {
    res.status(400).json({ error: "Invalid batch number" });
    return;
  }
  const batch = getChaitanyaBatch(n);
  if (!batch) {
    res.status(404).json({ error: `Batch ${n} not found` });
    return;
  }
  res.json(batch);
});

/**
 * GET /api/chaitanya/progress
 *
 * Counts of queued/processing/ready/failed chapters + last-processed metadata.
 * Used by the /chaitanya placeholder page to show live OCR progress.
 */
router.get("/chaitanya/progress", async (_req, res) => {
  try {
    const progress = await getChaitanyaProgress();
    res.json(progress);
  } catch (err) {
    logger.error({ err }, "Chaitanya progress fetch failed");
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/chaitanya/process-next
 *
 * Manually trigger the next OCR pass (does what the cron does, but on demand).
 * Useful for kicking off the first chapter without waiting for the next tick.
 */
router.post("/chaitanya/process-next", async (_req, res) => {
  try {
    const r = await processNextChaitanyaChapter();
    res.json(r);
  } catch (err) {
    logger.error({ err }, "Chaitanya process-next failed");
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/chaitanya/batches
 *
 * Diagnostic: list all batch JSON files currently on disk.
 */
router.get("/chaitanya/batches", (_req, res) => {
  const batches = getAllChaitanyaBatches().map(b => ({
    chapterGlobalNumber: b.chapterGlobalNumber,
    chapterPart: b.chapterPart,
    chapterInPart: b.chapterInPart,
    chapterTitle: b.chapterTitle,
    pageCount: b.pageCount,
    processedAt: b.processedAt,
  }));
  res.json({ count: batches.length, batches });
});

/**
 * POST /api/chaitanya/extract-next-scenes
 *
 * Manually trigger scene extraction for the next ready chapter (does what
 * the cron does, but on demand). Useful for catching up after OCR finishes.
 */
router.post("/chaitanya/extract-next-scenes", async (req, res) => {
  try {
    const max = parseInt(String((req.query.max as string) || "3"), 10) || 3;
    const r = await extractNextChaitanyaScenes(max);
    res.json(r);
  } catch (err) {
    logger.error({ err }, "Chaitanya extract-next-scenes failed");
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/chaitanya/scenes/:n
 *
 * Returns the extracted scenes for one chapter (jsonb scenes array).
 */
router.get("/chaitanya/scenes/:n", async (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (!Number.isFinite(n)) {
    res.status(400).json({ error: "Invalid global number" });
    return;
  }
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || "";
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/chaitanya_chapter_scenes?chapter_global_number=eq.${n}&select=*`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
    );
    if (!r.ok) {
      res.status(502).json({ error: `Supabase ${r.status}` });
      return;
    }
    const rows = await r.json() as Array<Record<string, unknown>>;
    if (!rows[0]) {
      res.status(404).json({ error: `No scenes yet for chapter ${n}` });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err, n }, "Chaitanya scenes fetch failed");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
