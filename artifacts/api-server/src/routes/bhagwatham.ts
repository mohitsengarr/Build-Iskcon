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
  getAllPersonas,
  upsertCustomPersona,
  deleteCustomPersona,
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
  deleteAndRegenerateIG,
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

// ── Chapter index — precomputed for instant sidebar ────────────────────────

const SKANDH_PAGE_RANGES: Array<{ skandh: number; startPage: number }> = [
  { skandh: 1,  startPage: 1 },
  { skandh: 2,  startPage: 874 },
  { skandh: 3,  startPage: 1399 },
  { skandh: 4,  startPage: 2617 },
  { skandh: 5,  startPage: 3900 },
  { skandh: 6,  startPage: 4540 },
  { skandh: 7,  startPage: 5204 },
  { skandh: 8,  startPage: 5849 },
  { skandh: 9,  startPage: 6373 },
  { skandh: 10, startPage: 7080 },
  { skandh: 11, startPage: 9059 },
  { skandh: 12, startPage: 9500 },
];

const EXPECTED_PER_CANTO = [19, 10, 33, 31, 26, 19, 15, 24, 24, 90, 31, 13];

const CI_HINDI_NUMS: Record<string, number> = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छः: 6, छह: 6,
  सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
  तेरह: 13, चौदह: 14, पन्द्रह: 15, पंद्रह: 15, सोलह: 16, सत्रह: 17,
  अठारह: 18, उन्नीस: 19, बीस: 20, इक्कीस: 21, बाईस: 22,
  तेईस: 23, चौबीस: 24, पच्चीस: 25, छब्बीस: 26, सत्ताईस: 27,
  अट्ठाईस: 28, उनतीस: 29, तीस: 30, इकतीस: 31, बत्तीस: 32,
  तैंतीस: 33,
  // OCR variants
  इक्तीस: 21,
};

const CI_OCR_FIXES: Record<string, { num: number; title: string }> = {
  "Chapter 278 अध्याय": { num: 8, title: "अध्याय आठ" },
  "Chapter it": { num: 9, title: "अध्याय नौ" },
  "(शुषा दो": { num: 2, title: "अध्याय दो" },
  "Chapter 3:": { num: 6, title: "अध्याय छह" },
  "(नौ": { num: 9, title: "अध्याय नौ" },
  "Chapter 36": { num: 8, title: "अध्याय आठ" },
  "Chapter छ:": { num: 6, title: "अध्याय छह" },
  "छल्नीस": { num: 26, title: "अध्याय छब्बीस" },
  "अदुईस": { num: 28, title: "अध्याय अट्ठाईस" },
  "Chapter इक्तीस": { num: 21, title: "अध्याय इक्कीस" },
};

function ciGetSkandh(pageNumber: number): number {
  for (let i = SKANDH_PAGE_RANGES.length - 1; i >= 0; i--) {
    if (pageNumber >= SKANDH_PAGE_RANGES[i].startPage) return SKANDH_PAGE_RANGES[i].skandh;
  }
  return 1;
}

let _ciCache: Array<{ number: number; skandh: number; globalNumber: number; title: string; pageNumber: number }> | null = null;
let _ciCacheTime = 0;
const CI_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function buildServerChapterIndex() {
  if (_ciCache && Date.now() - _ciCacheTime < CI_CACHE_TTL) return _ciCache;

  const allBatches = getAllBatches();
  const allPages = allBatches.flatMap((b) => b.pages);
  const chapterPattern = /^(?:\d+\s+)?(?:Chapter|अध्याय)\s+(.+)/imu;

  const chapters: Array<{ number: number; skandh: number; globalNumber: number; title: string; pageNumber: number }> = [];
  const lastChapterPerSkandh = new Map<number, number>();

  for (const page of allPages) {
    const skandh = ciGetSkandh(page.pageNumber);
    const lines = page.text.split("\n");

    // ToC detection: skip pages with 2+ chapter headings
    const headingCount = lines.filter((l) => chapterPattern.test(l.trim()) && !l.includes("पूर्ण हुए")).length;
    if (headingCount >= 2) continue;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes("पूर्ण हुए") || trimmed.includes("पूर्ण हुआ")) continue;
      if (trimmed.length > 60) continue;

      const match = trimmed.match(chapterPattern);
      if (!match) continue;

      let title = match[0].replace(/^\d+\s+/, "").trim();
      let chNum = 0;

      for (const [key, fix] of Object.entries(CI_OCR_FIXES)) {
        if (title.includes(key) || trimmed.includes(key)) {
          chNum = fix.num;
          title = fix.title;
          break;
        }
      }

      if (!chNum) {
        for (const [word, num] of Object.entries(CI_HINDI_NUMS)) {
          if (title.includes(word)) { chNum = num; break; }
        }
      }

      if (!chNum) {
        const numMatch = title.match(/\d+/);
        if (numMatch) {
          const n = parseInt(numMatch[0], 10);
          if (n > 0 && n <= 500) chNum = n;
        }
      }

      if (!chNum) continue;

      const lastNum = lastChapterPerSkandh.get(skandh) ?? 0;
      if (chNum < lastNum && lastNum > 2) continue;
      if (chapters.find((c) => c.number === chNum && c.skandh === skandh)) continue;

      lastChapterPerSkandh.set(skandh, chNum);

      // Get subtitle from next 1-2 lines
      const idx = lines.indexOf(line);
      const subtitle = lines.slice(idx + 1, idx + 3).map((l) => l.trim()).filter(Boolean).join(" ");

      chapters.push({
        number: chNum,
        skandh,
        globalNumber: 0,
        title: title + (subtitle ? ` — ${subtitle}` : ""),
        pageNumber: page.pageNumber,
      });
    }
  }

  const sorted = chapters.sort((a, b) => a.skandh !== b.skandh ? a.skandh - b.skandh : a.number - b.number);
  sorted.forEach((ch) => {
    let offset = 0;
    for (let i = 0; i < ch.skandh - 1; i++) offset += EXPECTED_PER_CANTO[i];
    ch.globalNumber = offset + ch.number;
  });

  _ciCache = sorted;
  _ciCacheTime = Date.now();
  return sorted;
}

// GET /api/bhagwatham/chapter-index — precomputed chapter list for instant sidebar
router.get("/bhagwatham/chapter-index", (_req, res) => {
  try {
    const chapters = buildServerChapterIndex();
    const totalBatches = getAllBatches().length;
    res.json({ chapters, totalBatches });
  } catch (err) {
    res.status(500).json({ error: "Failed to build chapter index" });
  }
});

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

// DELETE /api/bhagwatham/image/delete/:chapter/:scene — permanently delete image (no regeneration)
router.delete("/bhagwatham/image/delete/:chapter/:scene", async (req, res) => {
  try {
    const chapterNumber = parseInt(req.params.chapter, 10);
    const sceneIndex = parseInt(req.params.scene, 10);
    if (isNaN(chapterNumber) || isNaN(sceneIndex)) {
      res.status(400).json({ error: "Invalid chapter or scene number" });
      return;
    }
    // Delete regular chapter image
    const deleteResult = deleteChapterImage(chapterNumber, sceneIndex);
    // Delete IG image (from manifest + Supabase Storage + Buffer — NO regeneration)
    const { deleteIGImage } = await import("../services/bhagwatham-instagram");
    const igResult = await deleteIGImage(chapterNumber, sceneIndex);

    res.json({ success: true, chapterImage: deleteResult, instagram: igResult });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/bhagwatham/image/delete-and-regenerate/:chapter/:scene — delete image + Buffer posts, regenerate + requeue
router.post("/bhagwatham/image/delete-and-regenerate/:chapter/:scene", async (req, res) => {
  try {
    const chapterNumber = parseInt(req.params.chapter, 10);
    const sceneIndex = parseInt(req.params.scene, 10);
    if (isNaN(chapterNumber) || isNaN(sceneIndex)) {
      res.status(400).json({ error: "Invalid chapter or scene number" });
      return;
    }

    // Also delete the regular chapter image from manifest
    const deleteResult = deleteChapterImage(chapterNumber, sceneIndex);

    // Delete IG/Threads posts from Buffer and regenerate
    const igResult = await deleteAndRegenerateIG(chapterNumber, sceneIndex);

    res.json({
      success: true,
      chapterImage: deleteResult,
      instagram: igResult,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
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

// PATCH /api/bhagwatham/page/:pageNumber — save edited page text
// Updates the batch JSON file on disk, then refreshes the public/api copy
// so the change is visible on the live site after the next deploy.
router.patch("/bhagwatham/page/:pageNumber", async (req, res) => {
  try {
    const pageNumber = parseInt(req.params.pageNumber, 10);
    if (isNaN(pageNumber) || pageNumber < 1) {
      res.status(400).json({ error: "Invalid page number" });
      return;
    }
    const newText = typeof req.body?.text === "string" ? req.body.text : null;
    const newTextEn = typeof req.body?.textEn === "string" ? req.body.textEn : null;
    if (newText === null && newTextEn === null) {
      res.status(400).json({ error: "Body must include 'text' and/or 'textEn'" });
      return;
    }

    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const REPO_ROOT = path.resolve(here, "..", "..", "..", "..");
    const PAGES_DIR = path.resolve(REPO_ROOT, "data", "bhagwatham", "pages");

    // Find the batch file containing this page (pages are 20 per batch — batch N covers
    // pages (N-1)*20+1 .. N*20). Confirm by reading the batch and matching pageNumber.
    const candidateBatch = Math.ceil(pageNumber / 20);
    const batchFile = path.join(PAGES_DIR, `batch-${String(candidateBatch).padStart(4, "0")}.json`);
    if (!fs.existsSync(batchFile)) {
      res.status(404).json({ error: `Batch file for page ${pageNumber} not found` });
      return;
    }

    const batch = JSON.parse(fs.readFileSync(batchFile, "utf-8"));
    const pageIdx = (batch.pages || []).findIndex((p: { pageNumber: number }) => p.pageNumber === pageNumber);
    if (pageIdx < 0) {
      res.status(404).json({ error: `Page ${pageNumber} not found in batch ${candidateBatch}` });
      return;
    }

    if (newText !== null) batch.pages[pageIdx].text = newText;
    if (newTextEn !== null) batch.pages[pageIdx].textEn = newTextEn;
    batch.pages[pageIdx].editedAt = new Date().toISOString();

    fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2) + "\n");

    // Refresh public/api/bhagwatham/batch/:n + content + batches so the live site
    // sees the edit on the next Vercel deploy (or immediately if served from this server)
    const PUBLIC_API_DIR = path.resolve(REPO_ROOT, "artifacts", "temple-tracker", "public", "api", "bhagwatham");
    const publicBatchPath = path.join(PUBLIC_API_DIR, "batch", String(candidateBatch));
    fs.mkdirSync(path.dirname(publicBatchPath), { recursive: true });
    fs.writeFileSync(publicBatchPath, JSON.stringify(batch));

    // Stage for the daily commit
    try {
      const { execSync } = await import("child_process");
      execSync(`git add "${batchFile}" "${publicBatchPath}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    } catch { /* git staging best-effort */ }

    res.json({ success: true, pageNumber, batchNumber: candidateBatch });
  } catch (err) {
    res.status(500).json({ error: String(err) });
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

// ── Custom Persona endpoints ──────────────────────────────────────────────

// GET /api/bhagwatham/personas — list all personas (built-in + custom)
router.get("/bhagwatham/personas", (_req, res) => {
  try {
    const all = getAllPersonas();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: "Failed to read personas" });
  }
});

// POST /api/bhagwatham/personas/custom — add or update a custom persona
router.post("/bhagwatham/personas/custom", (req, res) => {
  try {
    const { key, name, fullDescription, shortDescription, patterns, gender, source } = req.body;
    if (!key || !name || !fullDescription || !shortDescription || !patterns || !gender) {
      res.status(400).json({ error: "Missing required fields: key, name, fullDescription, shortDescription, patterns, gender" });
      return;
    }
    const result = upsertCustomPersona({ key, name, fullDescription, shortDescription, patterns, gender, source });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to save custom persona" });
  }
});

// DELETE /api/bhagwatham/personas/custom/:key — remove a custom persona
router.delete("/bhagwatham/personas/custom/:key", (req, res) => {
  try {
    const deleted = deleteCustomPersona(req.params.key);
    if (!deleted) {
      res.status(404).json({ error: `Custom persona not found: ${req.params.key}` });
      return;
    }
    res.json({ success: true, deleted: req.params.key });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete custom persona" });
  }
});

// ── Persona Discovery endpoints ───────────────────────────────────────────

// GET /api/bhagwatham/persona-discovery/status — check auto-discovery progress
router.get("/bhagwatham/persona-discovery/status", async (_req, res) => {
  try {
    const { getDiscoveryStatus } = await import("../services/persona-discovery");
    res.json(getDiscoveryStatus());
  } catch (err) {
    res.status(500).json({ error: "Failed to get discovery status" });
  }
});

// POST /api/bhagwatham/persona-discovery/trigger — manually trigger one discovery tick
router.post("/bhagwatham/persona-discovery/trigger", async (_req, res) => {
  try {
    const { personaDiscoveryTick } = await import("../services/persona-discovery");
    const result = await personaDiscoveryTick();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Discovery tick failed" });
  }
});

// POST /api/bhagwatham/persona-discovery/reset — reset discovery state to re-run
router.post("/bhagwatham/persona-discovery/reset", async (_req, res) => {
  try {
    const { resetDiscovery } = await import("../services/persona-discovery");
    resetDiscovery();
    res.json({ success: true, message: "Discovery state reset. Next cron tick will start fresh." });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset discovery" });
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
router.use("/bhagwatham/instagram/images", express.static(getInstagramDir(), { maxAge: 0, etag: true, lastModified: true }));

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
        model: "claude-haiku-4-5",
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
        model: "claude-haiku-4-5",
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
