import { Router } from "express";
import express from "express";
import {
  getProgress,
  getAllBatches,
  getBatch,
  processNextBatch,
  backfillEnglishTranslations,
} from "../services/bhagwatham-sarvam";
import {
  getImageManifest,
  getImagesDir,
} from "../services/bhagwatham-image-gen";

const router = Router();

// Serve generated chapter images as static files
router.use("/bhagwatham/images", express.static(getImagesDir(), { maxAge: 0, etag: true, lastModified: true }));

// Serve character face bank images (used as reference_images for consistency)
import path from "path";
const FACES_DIR = path.resolve(getImagesDir(), "..", "faces");
router.use("/bhagwatham/faces", express.static(FACES_DIR, { maxAge: "7d", etag: true }));

// GET /api/bhagwatham/progress — processing status
router.get("/bhagwatham/progress", (_req, res) => {
  try {
    const progress = getProgress();
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: "Failed to read progress" });
  }
});

// GET /api/bhagwatham/batches — all processed batches (metadata only, no full text)
router.get("/bhagwatham/batches", (_req, res) => {
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

// GET /api/bhagwatham/batch/:number — single batch with full content
router.get("/bhagwatham/batch/:number", (req, res) => {
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

// GET /api/bhagwatham/content — all processed content (paginated)
router.get("/bhagwatham/content", (req, res) => {
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

// GET /api/bhagwatham/image-manifest — chapter images metadata
router.get("/bhagwatham/image-manifest", (_req, res) => {
  try {
    const manifest = getImageManifest();
    res.json(manifest);
  } catch (err) {
    res.status(500).json({ error: "Failed to read image manifest" });
  }
});

// POST /api/bhagwatham/generate-images — generate images for existing chapters
router.post("/bhagwatham/generate-images", async (req, res) => {
  try {
    const { generateImagesForBatch } = await import("../services/bhagwatham-image-gen");

    // If ?regenerate=true, delete existing images first so they get re-created with new engine
    if (req.query.regenerate === "true") {
      const imagesDir = getImagesDir();
      const files = await import("fs").then((f) => f.default.readdirSync(imagesDir));
      for (const file of files) {
        if (file.startsWith("chapter-") && (file.endsWith(".jpg") || file.endsWith(".png"))) {
          await import("fs").then((f) => f.default.unlinkSync(require("path").join(imagesDir, file)));
        }
      }
    }

    const allBatches = getAllBatches();
    const allPages = allBatches.flatMap((b) => b.pages);
    await generateImagesForBatch(allPages);
    const manifest = getImageManifest();
    res.json({ success: true, imagesGenerated: manifest.images.length });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

// ── Bookmarks (Supabase) ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";

function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

// GET /api/bhagwatham/bookmarks?reader_id=email@example.com
router.get("/bhagwatham/bookmarks", async (req, res) => {
  const readerId = req.query.reader_id as string;
  if (!readerId) { res.status(400).json({ error: "reader_id required" }); return; }
  try {
    const url = `${SUPABASE_URL}/rest/v1/bhagavatam_bookmarks?reader_id=eq.${encodeURIComponent(readerId)}&order=created_at.desc`;
    const r = await fetch(url, { headers: sbHeaders() });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

// POST /api/bhagwatham/bookmarks — create or update a bookmark
router.post("/bhagwatham/bookmarks", async (req, res) => {
  const { reader_id, reader_name, page_number, chapter_number, chapter_title, label } = req.body;
  if (!reader_id || !page_number) { res.status(400).json({ error: "reader_id and page_number required" }); return; }
  try {
    const url = `${SUPABASE_URL}/rest/v1/bhagavatam_bookmarks`;
    const headers = { ...sbHeaders(), Prefer: "return=representation,resolution=merge-duplicates" };
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        reader_id, reader_name, page_number,
        chapter_number: chapter_number || null,
        chapter_title: chapter_title || null,
        label: label || null,
        updated_at: new Date().toISOString(),
      }),
    });
    const data = await r.json();
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    res.status(500).json({ error: "Failed to save bookmark" });
  }
});

// DELETE /api/bhagwatham/bookmarks/:id?reader_id=...
router.delete("/bhagwatham/bookmarks/:id", async (req, res) => {
  const { id } = req.params;
  const readerId = req.query.reader_id as string;
  if (!readerId) { res.status(400).json({ error: "reader_id required" }); return; }
  try {
    const url = `${SUPABASE_URL}/rest/v1/bhagavatam_bookmarks?id=eq.${id}&reader_id=eq.${encodeURIComponent(readerId)}`;
    await fetch(url, { method: "DELETE", headers: sbHeaders() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete bookmark" });
  }
});

// POST /api/bhagwatham/backfill-translations — manually trigger English translation backfill
router.post("/bhagwatham/backfill-translations", async (_req, res) => {
  try {
    const result = await backfillEnglishTranslations();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to backfill translations" });
  }
});

// POST /api/bhagwatham/process — manually trigger next batch
router.post("/bhagwatham/process", async (_req, res) => {
  try {
    const result = await processNextBatch();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to process batch",
    });
  }
});

export default router;
