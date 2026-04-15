import { Router } from "express";
import express from "express";
import {
  getProgress,
  getAllBatches,
  getBatch,
  processNextBatch,
  backfillEnglishTranslations,
  reprocessEmptyPages,
} from "../services/bhagwatham-sarvam";
import {
  getImageManifest,
  getImagesDir,
  regenerateChapterImages,
  regenerateWithCustomPrompt,
  deleteChapterImage,
  restoreImage,
  enhancePersona,
  getPersonaVersions,
  buildAIScenePrompt,
  extractTatparyaStory,
  backfillMissingImages,
  getPersonaGallery,
} from "../services/bhagwatham-image-gen";
import {
  runAuditPass,
  getAuditProgress,
  resetAudit,
} from "../services/bhagwatham-audit";
import { checkAllCredits, getCreditStatuses } from "../services/ai-credit-monitor";
import {
  generateInstagramForChapter,
  queueChapterToBuffer,
  getInstagramManifest,
  getInstagramDir,
  getBufferChannels,
} from "../services/bhagwatham-instagram";

const router = Router();

// ── Helper: find chapter content from batches ────────────────────────────────

function findChapterContent(chapterNumber: number): { chapterTitle: string; contentSnippet: string } | null {
  const allBatches = getAllBatches();
  const allPages = allBatches.flatMap((b) => b.pages);
  const chapterPattern = /^(?:\d+\s+)?(?:Chapter|अध्याय)\s+(.+)/imu;
  const hindiNums: Record<string, number> = {
    एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, छः: 6, छह: 6,
    सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
    तेरह: 13, चौदह: 14, पन्द्रह: 15, सोलह: 16, सत्रह: 17,
    अठारह: 18, उन्नीस: 19, बीस: 20, इक्कीस: 21, बाईस: 22,
    तेईस: 23, चौबीस: 24, पच्चीस: 25, छब्बीस: 26, सत्ताईस: 27,
    अट्ठाईस: 28, उनतीस: 29, तीस: 30,
  };
  const OCR_CHAPTER_FIXES: Record<string, { num: number; title: string }> = {
    "Chapter 278 अध्याय": { num: 8, title: "अध्याय आठ" },
    "Chapter it": { num: 9, title: "अध्याय नौ" },
  };

  for (const page of allPages) {
    const lines = page.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const match = trimmed.match(chapterPattern);
      if (match && !trimmed.includes("पूर्ण हुए")) {
        let title = match[0].replace(/^\d+\s+/, "").trim();
        let chNum = 0;

        for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
          if (title.includes(key) || trimmed.includes(key)) {
            chNum = fix.num;
            title = fix.title;
            break;
          }
        }
        if (!chNum) {
          for (const [word, num] of Object.entries(hindiNums)) {
            if (title.includes(word)) { chNum = num; break; }
          }
        }
        if (!chNum) {
          const numMatch = title.match(/\d+/);
          if (numMatch) {
            const n = parseInt(numMatch[0], 10);
            if (n > 0 && n <= 100) chNum = n;
          }
        }

        if (chNum === chapterNumber) {
          const remainingLines = lines.slice(i + 1, i + 40).join("\n");
          const pageIdx = allPages.indexOf(page);
          const nextPages = allPages.slice(pageIdx + 1, pageIdx + 5);
          const nextContent = nextPages.map((p) => p.text).join("\n");
          const contentSnippet = remainingLines + "\n" + nextContent.substring(0, 3000);
          return { chapterTitle: title, contentSnippet };
        }
      }
    }
  }
  return null;
}

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

// DELETE /api/bhagwatham/image/:chapter/:scene — delete a specific chapter image
router.delete("/bhagwatham/image/:chapter/:scene", (req, res) => {
  try {
    const chapterNumber = parseInt(req.params.chapter, 10);
    const sceneIndex = parseInt(req.params.scene, 10);
    if (isNaN(chapterNumber) || isNaN(sceneIndex)) {
      res.status(400).json({ error: "Invalid chapter or scene number" });
      return;
    }
    const result = deleteChapterImage(chapterNumber, sceneIndex);
    if (!result.success) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// POST /api/bhagwatham/image/restore/:trashId — undo a delete or regenerate
router.post("/bhagwatham/image/restore/:trashId", (req, res) => {
  try {
    const { trashId } = req.params;
    const result = restoreImage(trashId);
    if (!result.success) {
      res.status(404).json({ error: "Trash entry not found or file missing" });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to restore image" });
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

// POST /api/bhagwatham/backfill-images — generate images for chapters that are missing them
router.post("/bhagwatham/backfill-images", async (_req, res) => {
  try {
    const allBatches = getAllBatches();
    const allPages = allBatches.flatMap((b) => b.pages);
    const result = await backfillMissingImages(allPages);
    const manifest = getImageManifest();
    res.json({ success: true, ...result, totalImages: manifest.images.length });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

// GET /api/bhagwatham/suggest-prompt/:number — get AI-generated prompt + available stories for editing
// Cache for AI-generated prompts — avoids re-calling Anthropic for the same chapter
const promptCache = new Map<number, { scene: string; descriptionHi: string }>();

router.get("/bhagwatham/suggest-prompt/:number", async (req, res) => {
  try {
    const chapterNumber = parseInt(req.params.number, 10);
    if (isNaN(chapterNumber) || chapterNumber < 1) {
      res.status(400).json({ error: "Invalid chapter number" });
      return;
    }

    const chapter = findChapterContent(chapterNumber);
    if (!chapter) {
      res.status(404).json({ error: `Chapter ${chapterNumber} not found in processed content` });
      return;
    }

    // Use cached prompt if available, otherwise generate and cache
    let aiScene = promptCache.get(chapterNumber) || null;
    if (!aiScene) {
      aiScene = await buildAIScenePrompt(chapter.chapterTitle, chapter.contentSnippet);
      if (aiScene) promptCache.set(chapterNumber, aiScene);
    }

    // Get available tatparya stories from the chapter
    const stories = extractTatparyaStory(chapter.contentSnippet);

    // Get existing image prompt if any
    const manifest = getImageManifest();
    const existingImage = manifest.images.find((img) => img.chapterNumber === chapterNumber);

    res.json({
      chapterNumber,
      chapterTitle: chapter.chapterTitle,
      suggestedPrompt: aiScene?.scene || existingImage?.prompt || "",
      summaryHi: aiScene?.descriptionHi || existingImage?.descriptionHi || "",
      existingPrompt: existingImage?.prompt || null,
      stories: stories.map((s, i) => ({
        index: i,
        text: s.length > 200 ? s.slice(0, 197) + "…" : s,
        fullText: s,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate prompt suggestion" });
  }
});

// POST /api/bhagwatham/regenerate-chapter/:number — regenerate images for a specific chapter
// Accepts optional body: { customPrompt?: string } to use a user-edited prompt
router.post("/bhagwatham/regenerate-chapter/:number", async (req, res) => {
  try {
    const chapterNumber = parseInt(req.params.number, 10);
    if (isNaN(chapterNumber) || chapterNumber < 1) {
      res.status(400).json({ error: "Invalid chapter number" });
      return;
    }

    const chapter = findChapterContent(chapterNumber);
    if (!chapter) {
      res.status(404).json({ error: `Chapter ${chapterNumber} not found in processed content` });
      return;
    }

    const customPrompt = req.body?.customPrompt as string | undefined;
    const summaryHi = req.body?.summaryHi as string | undefined;

    if (customPrompt) {
      // Use custom prompt for regeneration
      const result = await regenerateWithCustomPrompt(chapterNumber, chapter.chapterTitle, customPrompt, 0, summaryHi);
      const manifest = getImageManifest();
      const chapterImages = manifest.images.filter((img) => img.chapterNumber === chapterNumber);

      res.json({
        success: true,
        chapterNumber,
        chapterTitle: chapter.chapterTitle,
        imagesGenerated: result.file ? 1 : 0,
        images: chapterImages,
        trashIds: result.trashId ? [result.trashId] : [],
      });
    } else {
      // Default: auto-generate prompt via AI
      const result = await regenerateChapterImages(chapterNumber, chapter.chapterTitle, chapter.contentSnippet);
      const manifest = getImageManifest();
      const chapterImages = manifest.images.filter((img) => img.chapterNumber === chapterNumber);

      res.json({
        success: true,
        chapterNumber,
        chapterTitle: chapter.chapterTitle,
        imagesGenerated: result.files.length,
        images: chapterImages,
        trashIds: result.trashIds,
      });
    }
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

// POST /api/bhagwatham/reprocess-empty — re-OCR empty pages
router.post("/bhagwatham/reprocess-empty", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const reverse = req.query.reverse === "true";
    const result = await reprocessEmptyPages(limit, reverse);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to reprocess empty pages" });
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

// GET /api/bhagwatham/persona/gallery — all personas with face images for gallery page
router.get("/bhagwatham/persona/gallery", (_req, res) => {
  try {
    const gallery = getPersonaGallery();
    res.json(gallery);
  } catch (err) {
    res.status(500).json({ error: "Failed to load persona gallery" });
  }
});

// ── Persona endpoints ──────────────────────────────────────────────────────

// GET /api/bhagwatham/persona/versions — current persona versions and enhancement log
router.get("/bhagwatham/persona/versions", (_req, res) => {
  try {
    const versions = getPersonaVersions();
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: "Failed to read persona versions" });
  }
});

// POST /api/bhagwatham/persona/enhance — enhance a persona with new details
router.post("/bhagwatham/persona/enhance", (req, res) => {
  try {
    const { personaKey, enhancement } = req.body;
    if (!personaKey || !enhancement) {
      res.status(400).json({ error: "personaKey and enhancement are required" });
      return;
    }
    const result = enhancePersona(personaKey, enhancement);
    if (!result.success) {
      res.status(404).json({ error: `Unknown persona: ${personaKey}` });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to enhance persona" });
  }
});

// ── Audit endpoints ─────────────────────────────────────────────────────────

// GET /api/bhagwatham/audit — audit progress and recent log
router.get("/bhagwatham/audit", (_req, res) => {
  try {
    const progress = getAuditProgress();
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: "Failed to read audit progress" });
  }
});

// POST /api/bhagwatham/audit — manually trigger one audit pass
router.post("/bhagwatham/audit", async (_req, res) => {
  try {
    const result = await runAuditPass();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "Audit pass failed" });
  }
});

// POST /api/bhagwatham/audit/reset — reset audit to re-check all chapters
router.post("/bhagwatham/audit/reset", (_req, res) => {
  try {
    resetAudit();
    res.json({ success: true, message: "Audit reset — will re-check all chapters from highest" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset audit" });
  }
});

// ── AI Credit monitoring ───────────────────────────────────────────────────

// GET /api/bhagwatham/credits — check AI platform credit statuses
router.get("/bhagwatham/credits", async (_req, res) => {
  try {
    const statuses = await checkAllCredits();
    res.json(statuses);
  } catch (err) {
    res.status(500).json({ error: "Failed to check credits" });
  }
});

// ── Instagram image pipeline ─────────────────────────────────────────────────

// Serve Instagram images
router.use("/bhagwatham/instagram/images", express.static(getInstagramDir(), { maxAge: "7d" }));

// GET /api/bhagwatham/instagram/manifest — list all generated Instagram images
router.get("/bhagwatham/instagram/manifest", (_req, res) => {
  try {
    res.json(getInstagramManifest());
  } catch (err) {
    res.status(500).json({ error: "Failed to read Instagram manifest" });
  }
});

// POST /api/bhagwatham/instagram/generate/:chapter — generate Instagram images for a chapter
router.post("/bhagwatham/instagram/generate/:chapter", async (req, res): Promise<void> => {
  try {
    const chapterNumber = parseInt(req.params.chapter, 10);
    if (!chapterNumber) { res.status(400).json({ error: "Invalid chapter number" }); return; }

    const { title, content, queueToBuffer: queue, numScenes, cantoNumber, forceRegenerate } = req.body as {
      title?: string;
      content?: string;
      queueToBuffer?: boolean;
      numScenes?: number;
      cantoNumber?: number;
      forceRegenerate?: boolean;
    };

    // Try to get chapter info from image manifest if not provided
    let chapterTitle = title || "";
    let contentSnippet = content || "";

    if (!chapterTitle || !contentSnippet) {
      const manifest = getImageManifest();
      const chImg = manifest.images.find((img) => img.chapterNumber === chapterNumber);
      if (chImg) {
        chapterTitle = chapterTitle || chImg.chapterTitle;
      }
      if (!contentSnippet) {
        // Load from batch data
        const batchFiles = getAllBatches();
        for (const b of batchFiles) {
          const batch = getBatch(b.batchNumber);
          if (batch) {
            for (const page of batch.pages || []) {
              if (page.text && page.text.includes(chapterTitle)) {
                contentSnippet = page.text.substring(0, 2000);
                break;
              }
            }
          }
          if (contentSnippet) break;
        }
      }
    }

    if (!chapterTitle) {
      res.status(400).json({ error: "Chapter title required — provide in body or chapter must exist in manifest" });
      return;
    }

    const result = await generateInstagramForChapter(chapterNumber, chapterTitle, contentSnippet, {
      queueToBuffer: queue,
      numScenes: numScenes || 4,
      cantoNumber,
      forceRegenerate,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Instagram generation failed" });
  }
});

// POST /api/bhagwatham/instagram/queue/:chapter — queue existing images to Buffer
router.post("/bhagwatham/instagram/queue/:chapter", async (req, res): Promise<void> => {
  try {
    const chapterNumber = parseInt(req.params.chapter, 10);
    if (!chapterNumber) { res.status(400).json({ error: "Invalid chapter number" }); return; }

    const result = await queueChapterToBuffer(chapterNumber);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Buffer queue failed" });
  }
});

// POST /api/bhagwatham/instagram/generate-batch — generate Instagram images for all chapters missing them
router.post("/bhagwatham/instagram/generate-batch", async (req, res) => {
  try {
    const { queueToBuffer: queue, limit: maxChapters } = req.body as {
      queueToBuffer?: boolean;
      limit?: number;
    };

    const imageManifest = getImageManifest();
    const igManifest = getInstagramManifest();
    const processedChapters = new Set(igManifest.images.map((img) => img.chapterNumber));

    // Find chapters that have chapter images but no Instagram images
    const chaptersToProcess = imageManifest.images
      .filter((img) => !processedChapters.has(img.chapterNumber))
      .slice(0, maxChapters || 5); // Default: process 5 chapters per call

    let totalGenerated = 0;
    let totalQueued = 0;
    const results: Array<{ chapter: number; generated: number; queued: number }> = [];

    for (const chImg of chaptersToProcess) {
      // Get content from batches
      let contentSnippet = "";
      const batchFiles = getAllBatches();
      for (const b of batchFiles) {
        const batch = getBatch(b.batchNumber);
        if (batch) {
          for (const page of batch.pages || []) {
            if (page.text && page.text.includes(chImg.chapterTitle)) {
              contentSnippet = page.text.substring(0, 2000);
              break;
            }
          }
        }
        if (contentSnippet) break;
      }

      const result = await generateInstagramForChapter(
        chImg.chapterNumber,
        chImg.chapterTitle,
        contentSnippet,
        { queueToBuffer: queue, numScenes: 4 },
      );

      totalGenerated += result.generated;
      totalQueued += result.queued;
      results.push({ chapter: chImg.chapterNumber, generated: result.generated, queued: result.queued });
    }

    res.json({
      processed: results.length,
      totalGenerated,
      totalQueued,
      remaining: imageManifest.images.length - processedChapters.size - results.length,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Batch Instagram generation failed" });
  }
});

// GET /api/bhagwatham/instagram/channels — list Buffer channels (to find Instagram channel)
router.get("/bhagwatham/instagram/channels", async (_req, res) => {
  try {
    const channels = await getBufferChannels();
    res.json({ channels });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch Buffer channels" });
  }
});

// ── Instagram Cron Controls ─────────────────────────────────────────────────

import { instagramCronTick } from "../cron/instagram-cron";
import fs from "fs";
import path from "path";

const IG_CRON_STATE_FILE = path.resolve(
  new URL(".", import.meta.url).pathname, "..", "..", "..", "..", "data", "bhagwatham", "instagram", "ig-cron-state.json",
);

// GET /api/bhagwatham/instagram/cron-status — check cron state
router.get("/bhagwatham/instagram/cron-status", (_req, res) => {
  try {
    if (fs.existsSync(IG_CRON_STATE_FILE)) {
      res.json(JSON.parse(fs.readFileSync(IG_CRON_STATE_FILE, "utf-8")));
    } else {
      res.json({ status: "not started", message: "Cron state file does not exist yet" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bhagwatham/instagram/cron-trigger — manually trigger one tick
router.post("/bhagwatham/instagram/cron-trigger", async (_req, res): Promise<void> => {
  try {
    await instagramCronTick();
    if (fs.existsSync(IG_CRON_STATE_FILE)) {
      res.json({ triggered: true, state: JSON.parse(fs.readFileSync(IG_CRON_STATE_FILE, "utf-8")) });
    } else {
      res.json({ triggered: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bhagwatham/tts — Sarvam Bulbul v3 text-to-speech for shlok recitation
router.post("/bhagwatham/tts", async (req, res) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "SARVAM_API_KEY not configured" });
    return;
  }

  const { text } = req.body;
  if (!text || typeof text !== "string" || text.length > 2500) {
    res.status(400).json({ error: "text required (max 2500 chars)" });
    return;
  }

  try {
    const ttsRes = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        target_language_code: "hi-IN",
        speaker: "soham",
        model: "bulbul:v3",
        pace: 0.95,
        speech_sample_rate: 48000,
        enable_preprocessing: true,
      }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      res.status(ttsRes.status).json({ error: errText });
      return;
    }

    const data: any = await ttsRes.json();
    const audioBase64 = data.audios?.[0];
    if (!audioBase64) {
      res.status(500).json({ error: "No audio in response" });
      return;
    }

    // Return base64 audio directly
    res.json({ audio: audioBase64, format: "wav" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bhagwatham/stt — Sarvam Saaras v3 speech-to-text for voice editing
router.post("/bhagwatham/stt", async (req, res) => {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "SARVAM_API_KEY not configured" });
    return;
  }

  try {
    // Read raw audio from request body (sent as application/octet-stream)
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length < 100) {
      res.status(400).json({ error: "No audio data received" });
      return;
    }

    // Send to Sarvam STT API as multipart form data
    const boundary = "----SarvamSTT" + Date.now();
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
      audioBuffer,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nsaaras:v3\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\nhi-IN\r\n`),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const sttRes = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!sttRes.ok) {
      const errText = await sttRes.text();
      res.status(sttRes.status).json({ error: errText });
      return;
    }

    const data: any = await sttRes.json();
    res.json({ transcript: data.transcript || "", language: data.language_code || "hi-IN" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bhagwatham/summarize — summarize a page range using Claude
router.post("/bhagwatham/summarize", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "ANTHROPIC_API_KEY not set" }); return; }

  const { pages, fromPage, toPage } = req.body;
  if (!pages || typeof pages !== "string") {
    res.status(400).json({ error: "pages text required" }); return;
  }

  // Truncate to ~12K chars to stay within Claude context limits
  const truncated = pages.length > 12000 ? pages.slice(0, 12000) + "\n...(truncated)" : pages;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a scholar of Srimad Bhagavatam. Summarize pages ${fromPage}–${toPage} from this text in Hindi with bullet points.

Give:
1. 📖 विषय — Which chapters/topics are covered
2. 📝 मुख्य श्लोक अर्थ — Key verse meanings (2-3 bullets)
3. 🔑 तात्पर्य सार — Main purport points by Srila Prabhupada (3-5 bullets)
4. 💡 शिक्षा — Practical spiritual lessons (2-3 bullets)

Use Hindi. Be concise — each bullet max 2 lines. Use Devanagari script.

Text:
${truncated}`
        }],
      }),
    });

    if (!claudeRes.ok) { res.status(500).json({ error: "Claude API failed" }); return; }
    const data: any = await claudeRes.json();
    const summary = data.content?.[0]?.text || "Summary generation failed.";
    res.json({ summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bhagwatham/dictionary — look up Hindi/Sanskrit word meaning via Claude
router.post("/bhagwatham/dictionary", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "ANTHROPIC_API_KEY not set" }); return; }

  const { word } = req.body;
  if (!word || typeof word !== "string" || word.length > 100) {
    res.status(400).json({ error: "word required (max 100 chars)" });
    return;
  }

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `You are a Sanskrit/Hindi dictionary. For the word "${word}":
1. Give the meaning in Hindi and English (2-3 lines max)
2. If it's Sanskrit, give the root (dhatu) and grammatical form
3. Give 2-3 example sentences showing how this word is used in Srimad Bhagavatam or Hindu scripture context

Return JSON only: {"word":"${word}","meaning":"...","examples":["...","..."]}`
        }],
      }),
    });

    if (!claudeRes.ok) { res.status(500).json({ error: "Claude API failed" }); return; }
    const data: any = await claudeRes.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json(JSON.parse(jsonMatch[0]));
    } else {
      res.json({ word, meaning: text.substring(0, 300), examples: [] });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Shlok Dictionary endpoints ──────────────────────────────────────────────

// GET /api/bhagwatham/shloks?q=search&canto=1&chapter=5&limit=20
router.get("/bhagwatham/shloks", async (req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!SUPABASE_URL) { res.json({ shloks: [] }); return; }

  const q = req.query.q as string;
  const canto = req.query.canto as string;
  const chapter = req.query.chapter as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  let url = `${SUPABASE_URL}/rest/v1/shlok_dictionary?select=*&order=canto.asc,chapter.asc,verse_number.asc&limit=${limit}`;
  if (q) url += `&shlok_text=ilike.*${encodeURIComponent(q)}*`;
  if (canto) url += `&canto=eq.${canto}`;
  if (chapter) url += `&chapter=eq.${chapter}`;

  try {
    const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    const data = await r.json();
    res.json({ shloks: Array.isArray(data) ? data : [] });
  } catch { res.json({ shloks: [] }); }
});

// GET /api/bhagwatham/shlok-stats — index progress
router.get("/bhagwatham/shlok-stats", async (_req, res) => {
  try {
    const { getIndexState } = await import("../services/shlok-indexer");
    const state = getIndexState();
    const SUPABASE_URL = process.env.SUPABASE_URL || "";
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
    let totalInDb = 0;
    if (SUPABASE_URL) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/shlok_dictionary?select=id`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" },
        method: "HEAD",
      });
      totalInDb = parseInt(r.headers.get("content-range")?.split("/")[1] || "0", 10);
    }
    res.json({ ...state, totalInDb });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bhagwatham/shlok-index — manually trigger one indexing batch
router.post("/bhagwatham/shlok-index", async (_req, res) => {
  try {
    const { indexNextBatch } = await import("../services/shlok-indexer");
    const result = await indexNextBatch();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
