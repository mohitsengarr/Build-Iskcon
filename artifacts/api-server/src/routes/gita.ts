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
import { logger } from "../lib/logger";

const router = Router();

// ── Chapter heading detection (mirrors gita-audit.ts) ──────────────────────
// C9: regenerate-chapter previously fed the START of the book (chapter 1's
// text) to EVERY chapter. These helpers locate the requested chapter's
// heading so the content snippet is sliced from THERE.

const GITA_HINDI_NUMS: Record<string, number> = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छः: 6, छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पन्द्रह: 15, पंद्रह: 15, सोलह: 16, सत्रह: 17,
  अठारह: 18,
};

const GITA_CHAPTER_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[ऀ-ॿ]+(?:\s+[ऀ-ॿ]+){0,2}|\d+))\s*$/iu;

function isGitaChapterHeading(line: string): boolean {
  const cleaned = line.replace(/^\d+\s+/, "");
  if (cleaned.length > 60) return false;
  if (line.includes("पूर्ण हुए") || line.includes("पूर्ण हुआ")) return false;
  return GITA_CHAPTER_RE.test(cleaned);
}

function extractGitaChapterNum(line: string): number {
  const after = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
  if (after && GITA_HINDI_NUMS[after] !== undefined) return GITA_HINDI_NUMS[after];
  for (const [w, n] of Object.entries(GITA_HINDI_NUMS)) {
    if (line.includes(w)) return n;
  }
  const m = line.match(/\d+/);
  if (m) {
    const n = parseInt(m[0], 10);
    if (n > 0 && n <= 18) return n;
  }
  return 0;
}

/** Slice ~3000 chars of content starting at the requested chapter's heading. */
function extractGitaChapterContent(
  allPages: Array<{ text: string }>,
  chapterNumber: number,
): string | null {
  for (let p = 0; p < allPages.length; p++) {
    const text = allPages[p]?.text || "";
    if (text.length < 20) continue;
    const lines = text.split("\n");
    // Skip ToC pages (2+ heading-looking lines on one page)
    const headingCount = lines.filter((l) => isGitaChapterHeading(l.trim())).length;
    if (headingCount >= 2) continue;

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!isGitaChapterHeading(t)) continue;
      if (extractGitaChapterNum(t) !== chapterNumber) continue;

      // Found the chapter heading — collect content from here across pages
      let content = lines.slice(i).join("\n");
      for (let q = p + 1; q < allPages.length && content.length < 3000; q++) {
        content += "\n" + (allPages[q]?.text || "");
      }
      return content.substring(0, 3000);
    }
  }
  return null;
}

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

    // Get chapter content from batches.
    // C9: slice from the requested chapter's own heading — joining all pages
    // and taking the first 3000 chars fed chapter 1's text to every chapter.
    const allBatches = getAllBatches();
    const allPages = allBatches.flatMap((b) => b.pages);
    const chapterTitle = `Chapter ${chapterNumber}`;
    let contentSnippet = extractGitaChapterContent(allPages, chapterNumber);
    if (!contentSnippet) {
      logger.warn(
        { chapterNumber },
        "Gita regenerate: chapter heading not found in pages — falling back to start-of-book content",
      );
      contentSnippet = allPages.map((p) => p.text).join("\n").substring(0, 3000);
    }

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
