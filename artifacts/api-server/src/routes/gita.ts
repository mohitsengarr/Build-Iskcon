import { Router } from "express";
import express from "express";
import path from "path";
import {
  getProgress,
  getAllBatches,
  getBatch,
  processNextBatch,
  backfillEnglishTranslations,
  reprocessEmptyPages,
} from "../services/gita-ocr";
import {
  runGitaAuditPass,
  getGitaAuditProgress,
  resetGitaAudit,
} from "../services/gita-audit";
import {
  getImageManifest,
  getImagesDir,
  generateImagesForBatch,
  regenerateChapterImages,
} from "../services/gita-image-gen";

const router = Router();

// ── Static file serving ────────────────────────────────────────────────────

router.use("/gita/images", express.static(getImagesDir(), { maxAge: 0, etag: true, lastModified: true }));

// ── OCR / Content endpoints ────────────────────────────────────────────────

// GET /api/gita/progress — processing status
router.get("/gita/progress", (_req, res) => {
  try {
    const progress = getProgress();
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: "Failed to read progress" });
  }
});

// GET /api/gita/batches — all processed batches (metadata only)
router.get("/gita/batches", (_req, res) => {
  try {
    const batches = getAllBatches().map((b) => ({
      batchNumber: b.batchNumber,
      startPage: b.startPage,
      endPage: b.endPage,
      processedAt: b.processedAt,
      pageCount: b.pages.length,
    }));
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: "Failed to read batches" });
  }
});

// GET /api/gita/batch/:number — single batch with full content
router.get("/gita/batch/:number", (req, res) => {
  try {
    const batchNumber = parseInt(req.params.number, 10);
    if (isNaN(batchNumber) || batchNumber < 1) {
      res.status(400).json({ error: "Invalid batch number" });
      return;
    }
    const batch = getBatch(batchNumber);
    if (!batch) {
      res.status(404).json({ error: "Batch not found" });
      return;
    }
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: "Failed to read batch" });
  }
});

// GET /api/gita/content — all processed content (paginated)
router.get("/gita/content", (req, res) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "5", 10);

    const allBatches = getAllBatches();
    const totalBatches = allBatches.length;
    const startIdx = (page - 1) * limit;
    const endIdx = startIdx + limit;
    const paginatedBatches = allBatches.slice(startIdx, endIdx);

    res.json({
      batches: paginatedBatches,
      pagination: {
        page,
        limit,
        totalBatches,
        totalPages: Math.ceil(totalBatches / limit),
        hasMore: endIdx < totalBatches,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to read content" });
  }
});

// POST /api/gita/process — manually trigger next batch
router.post("/gita/process", async (_req, res) => {
  try {
    const result = await processNextBatch();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to process batch" });
  }
});

// POST /api/gita/backfill-translations — trigger English translation backfill
router.post("/gita/backfill-translations", async (_req, res) => {
  try {
    const result = await backfillEnglishTranslations();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to backfill translations" });
  }
});

// POST /api/gita/reprocess-empty — re-OCR empty pages
router.post("/gita/reprocess-empty", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const reverse = req.query.reverse === "true";
    const result = await reprocessEmptyPages(limit, reverse);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to reprocess empty pages" });
  }
});

// ── Image endpoints ────────────────────────────────────────────────────────

// GET /api/gita/image-manifest — chapter images metadata
router.get("/gita/image-manifest", (_req, res) => {
  try {
    const manifest = getImageManifest();
    res.json(manifest);
  } catch (err) {
    res.status(500).json({ error: "Failed to read image manifest" });
  }
});

// POST /api/gita/generate-images — generate images for existing chapters
router.post("/gita/generate-images", async (_req, res) => {
  try {
    const allBatches = getAllBatches();
    const allPages = allBatches.flatMap((b) => b.pages);
    await generateImagesForBatch(allPages);
    const manifest = getImageManifest();
    res.json({ success: true, imagesGenerated: manifest.images.length });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

// POST /api/gita/backfill-images — generate images for chapters missing them
router.post("/gita/backfill-images", async (_req, res) => {
  try {
    const allBatches = getAllBatches();
    const allPages = allBatches.flatMap((b) => b.pages);
    await generateImagesForBatch(allPages);
    const manifest = getImageManifest();
    res.json({ success: true, totalImages: manifest.images.length });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

// POST /api/gita/regenerate-chapter/:number — regenerate images for a specific chapter
router.post("/gita/regenerate-chapter/:number", async (req, res) => {
  try {
    const chapterNumber = parseInt(req.params.number, 10);
    if (isNaN(chapterNumber) || chapterNumber < 1 || chapterNumber > 18) {
      res.status(400).json({ error: "Invalid chapter number (1-18)" });
      return;
    }

    // Get chapter content from batches
    const allBatches = getAllBatches();
    const allPages = allBatches.flatMap((b) => b.pages);
    const chapterTitle = `Chapter ${chapterNumber}`;
    const contentSnippet = allPages.map((p) => p.text).join("\n").substring(0, 3000);

    const result = await regenerateChapterImages(chapterNumber, chapterTitle, contentSnippet);
    const manifest = getImageManifest();
    const chapterImages = manifest.images.filter((img) => img.chapterNumber === chapterNumber);

    res.json({
      success: true,
      chapterNumber,
      chapterTitle,
      imagesGenerated: result.files.length,
      images: chapterImages,
      trashIds: result.trashIds,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

// ── Audit endpoints ────────────────────────────────────────────────────────

// GET /api/gita/audit — audit progress and recent log
router.get("/gita/audit", (_req, res) => {
  try {
    const progress = getGitaAuditProgress();
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: "Failed to read audit progress" });
  }
});

// POST /api/gita/audit — manually trigger one audit pass
router.post("/gita/audit", async (_req, res) => {
  try {
    const result = await runGitaAuditPass();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "Audit pass failed" });
  }
});

// POST /api/gita/audit/reset — reset audit to re-check all chapters
router.post("/gita/audit/reset", (_req, res) => {
  try {
    resetGitaAudit();
    res.json({ success: true, message: "Audit reset — will re-check all 18 chapters" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset audit" });
  }
});

export default router;
