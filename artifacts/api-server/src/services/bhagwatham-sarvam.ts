/**
 * Sarvam AI Document Digitisation — replaces Tesseract OCR for Bhagavatam PDF.
 *
 * Benefits over Tesseract:
 *   • ~87% accuracy on Hindi/Sanskrit vs ~70% with Tesseract
 *   • Structured Markdown output (headings, tables, lists preserved)
 *   • Native support for all 22 Indian languages + English
 *   • ₹1.50 per page (~$0.018)
 *
 * Also includes Sarvam Translate for Hindi→English translation.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "bhagwatham");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const TMP_DIR = path.join(DATA_DIR, ".tmp-images");

// Re-export types from the original processor
export interface Progress {
  lastProcessedPage: number;
  totalPagesProcessed: number;
  totalPagesInPdf: number;
  batchSize: number;
  batchesCompleted: number;
  lastProcessedAt: string | null;
  status: "idle" | "processing" | "completed" | "error";
  pdfPath: string;
}

export interface PageContent {
  pageNumber: number;
  text: string;        // Hindi/Sanskrit OCR text
  textEn?: string;     // English translation (generated via Sarvam Translate)
}

export interface BatchData {
  batchNumber: number;
  startPage: number;
  endPage: number;
  processedAt: string;
  pages: PageContent[];
}

// ── Progress helpers ──────────────────────────────────────────────────────────

function readProgress(): Progress {
  const raw = fs.readFileSync(PROGRESS_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeProgress(progress: Progress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2) + "\n");
}

export function getProgress(): Progress {
  return readProgress();
}

export function getAllBatches(): BatchData[] {
  if (!fs.existsSync(PAGES_DIR)) return [];
  const files = fs
    .readdirSync(PAGES_DIR)
    .filter((f) => f.startsWith("batch-") && f.endsWith(".json"))
    .sort((a, b) => {
      const numA = parseInt(a.replace("batch-", "").replace(".json", ""));
      const numB = parseInt(b.replace("batch-", "").replace(".json", ""));
      return numA - numB;
    });
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(PAGES_DIR, f), "utf-8");
    return JSON.parse(raw);
  });
}

export function getBatch(batchNumber: number): BatchData | null {
  const filePath = path.join(PAGES_DIR, `batch-${String(batchNumber).padStart(4, "0")}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// ── PDF → Images ──────────────────────────────────────────────────────────────

function getTotalPages(pdfPath: string): number {
  try {
    const output = execSync(`pdfinfo "${pdfPath}" 2>/dev/null | grep "Pages:" | awk '{print $2}'`, {
      encoding: "utf-8",
    }).trim();
    return parseInt(output, 10) || 0;
  } catch {
    return 0;
  }
}

function convertPagesToImages(pdfPath: string, startPage: number, endPage: number): string[] {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  for (const f of fs.readdirSync(TMP_DIR)) fs.unlinkSync(path.join(TMP_DIR, f));

  // 200 DPI is good for OCR
  execSync(
    `pdftoppm -f ${startPage} -l ${endPage} -r 200 -png "${pdfPath}" "${path.join(TMP_DIR, "page")}"`,
    { stdio: "pipe", timeout: 120_000 },
  );

  const images: string[] = [];
  for (let p = startPage; p <= endPage; p++) {
    const patterns = [
      `page-${String(p).padStart(5, "0")}.png`,
      `page-${String(p).padStart(4, "0")}.png`,
      `page-${String(p).padStart(3, "0")}.png`,
      `page-${String(p).padStart(2, "0")}.png`,
      `page-${String(p)}.png`,
    ];
    const found = patterns.find((pat) => fs.existsSync(path.join(TMP_DIR, pat)));
    if (found) images.push(path.join(TMP_DIR, found));
  }
  return images;
}

function cleanupTmpImages(): void {
  try {
    if (fs.existsSync(TMP_DIR)) {
      for (const f of fs.readdirSync(TMP_DIR)) fs.unlinkSync(path.join(TMP_DIR, f));
    }
  } catch { /* ignore */ }
}

// ── Sarvam AI OCR ─────────────────────────────────────────────────────────────

/**
 * Process a single image through Sarvam Document Intelligence API (REST).
 * Uses the job-based flow: createJob → upload → start → poll → download.
 */
async function ocrSinglePageSarvam(imagePath: string, pageNumber: number, apiKey: string): Promise<string> {
  const baseUrl = "https://api.sarvam.ai";
  const headers = {
    "API-Subscription-Key": apiKey,
    "Content-Type": "application/json",
  };

  // Step 1: Create a job
  const createRes = await fetch(`${baseUrl}/documents/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      page_count: 1,
      document_category: "general",
      language_hint: "hi",
      output_content_types: ["text"],
    }),
  });
  if (!createRes.ok) throw new Error(`Create job failed: ${createRes.status} ${await createRes.text()}`);
  const job = await createRes.json() as { job_id: string; upload_links: Array<{ page_number: number; upload_url: string }> };

  // Step 2: Upload the image
  const imageBuffer = fs.readFileSync(imagePath);
  const uploadUrl = job.upload_links[0]?.upload_url;
  if (!uploadUrl) throw new Error("No upload URL returned");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: imageBuffer,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

  // Step 3: Start processing
  const startRes = await fetch(`${baseUrl}/documents/jobs/${job.job_id}/start`, {
    method: "POST",
    headers,
  });
  if (!startRes.ok) throw new Error(`Start failed: ${startRes.status} ${await startRes.text()}`);

  // Step 4: Poll for completion (max 60 seconds)
  let status = "Processing";
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`${baseUrl}/documents/jobs/${job.job_id}`, { headers });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json() as { status: string };
    status = statusData.status;
    if (status === "Completed") break;
    if (status === "Failed") throw new Error("Sarvam job failed");
  }
  if (status !== "Completed") throw new Error(`Sarvam job timed out (status: ${status})`);

  // Step 5: Download results
  const dlRes = await fetch(`${baseUrl}/documents/jobs/${job.job_id}/download-links`, { headers });
  if (!dlRes.ok) throw new Error(`Download links failed: ${dlRes.status}`);
  const dlData = await dlRes.json() as { download_links: Array<{ page_number: number; download_url: string; content_type: string }> };

  let extractedText = "";
  for (const link of dlData.download_links) {
    if (link.content_type === "text" || !link.content_type) {
      const textRes = await fetch(link.download_url);
      if (textRes.ok) extractedText += await textRes.text();
    }
  }

  return extractedText.trim();
}

/**
 * Process images through Sarvam Document Intelligence API.
 * Falls back to Tesseract if SARVAM_API_KEY is not set.
 */
async function ocrWithSarvam(imagePaths: string[], startPage: number): Promise<PageContent[]> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    logger.warn("SARVAM_API_KEY not set — falling back to Tesseract");
    return ocrWithTesseract(imagePaths, startPage);
  }

  const pages: PageContent[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    const pageNumber = startPage + i;

    try {
      logger.info({ pageNumber }, "Processing page with Sarvam Vision");
      const text = await ocrSinglePageSarvam(imagePath, pageNumber, apiKey);
      pages.push({ pageNumber, text });
      logger.info({ pageNumber, textLength: text.length }, "Sarvam OCR completed for page");
    } catch (err) {
      logger.warn({ pageNumber, err }, "Sarvam OCR failed for page, trying Tesseract fallback");
      const fallback = await ocrSinglePageTesseract(imagePath, pageNumber);
      pages.push(fallback);
    }
  }

  return pages;
}

// ── Tesseract fallback ────────────────────────────────────────────────────────

async function ocrWithTesseract(imagePaths: string[], startPage: number): Promise<PageContent[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("hin+san+eng", 1);
  const pages: PageContent[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const pageNumber = startPage + i;
    try {
      const { data } = await worker.recognize(imagePaths[i]);
      pages.push({ pageNumber, text: data.text.trim() });
      logger.info({ pageNumber, textLength: data.text.length }, "Tesseract OCR completed for page");
    } catch (err) {
      logger.warn({ pageNumber, err }, "Tesseract OCR failed for page");
      pages.push({ pageNumber, text: "" });
    }
  }

  await worker.terminate();
  return pages;
}

async function ocrSinglePageTesseract(imagePath: string, pageNumber: number): Promise<PageContent> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("hin+san+eng", 1);
    const { data } = await worker.recognize(imagePath);
    await worker.terminate();
    return { pageNumber, text: data.text.trim() };
  } catch {
    return { pageNumber, text: "" };
  }
}

// ── Sarvam Translate (Hindi → English) ────────────────────────────────────────

async function translateToEnglish(hindiText: string): Promise<string> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey || !hindiText.trim()) return "";

  try {
    // Sarvam Translate (mayura:v1) has a 1000-char limit per call — chunk accordingly
    const MAX_CHARS = 900; // Use 900 to leave margin
    const chunks: string[] = [];
    let remaining = hindiText;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHARS) {
        chunks.push(remaining);
        break;
      }
      // Find a good break point (end of sentence or paragraph)
      let breakIdx = remaining.lastIndexOf("।", MAX_CHARS);
      if (breakIdx < MAX_CHARS * 0.5) breakIdx = remaining.lastIndexOf("\n", MAX_CHARS);
      if (breakIdx < MAX_CHARS * 0.5) breakIdx = MAX_CHARS;
      chunks.push(remaining.substring(0, breakIdx + 1));
      remaining = remaining.substring(breakIdx + 1);
    }

    const translatedChunks: string[] = [];
    for (const chunk of chunks) {
      try {
        const res = await fetch("https://api.sarvam.ai/translate", {
          method: "POST",
          headers: {
            "API-Subscription-Key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: chunk,
            source_language_code: "hi-IN",
            target_language_code: "en-IN",
            enable_preprocessing: true,
          }),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          logger.warn({ status: res.status, chunkLen: chunk.length, errBody: errBody.substring(0, 200) }, "Translation chunk HTTP error");
          translatedChunks.push("");
          continue;
        }
        const result = await res.json() as { translated_text?: string };
        translatedChunks.push(result.translated_text || "");
      } catch (err) {
        logger.warn({ err, chunkLen: chunk.length }, "Translation chunk failed");
        translatedChunks.push(""); // Skip failed chunks
      }
    }

    return translatedChunks.join("\n");
  } catch (err) {
    logger.warn({ err }, "Translation to English failed");
    return "";
  }
}

// ── Git commit ────────────────────────────────────────────────────────────────

function gitCommitAndPush(batchNumber: number, startPage: number, endPage: number, hasImages: boolean): void {
  try {
    // Stage all bhagwatham data: pages, progress, images, manifest
    execSync("git add data/bhagwatham/", { cwd: REPO_ROOT, stdio: "pipe" });

    // Check if there are staged changes
    const diff = execSync("git diff --cached --stat", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
    if (!diff) {
      logger.info("No changes to commit — skipping");
      return;
    }

    const imgNote = hasImages ? " with images" : "";
    const commitMsg = `feat(bhagwatham): process pages ${startPage}-${endPage} (batch ${batchNumber})${imgNote}`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git push", { cwd: REPO_ROOT, stdio: "pipe" });
    logger.info({ batchNumber, startPage, endPage, hasImages }, "Git commit and push successful");

    // Trigger Vercel deploy (Vercel auto-deploys on push, but log confirmation)
    logger.info("Vercel deploy triggered via git push");
  } catch (err) {
    logger.warn({ err }, "Git commit/push failed — continuing without push");
  }
}

// ── Backfill English translations ────────────────────────────────────────────

let backfillInProgress = false;

export async function backfillEnglishTranslations(): Promise<{
  batchNumber: number;
  translated: number;
  remainingBatches: number;
  message: string;
}> {
  if (backfillInProgress) {
    return { batchNumber: 0, translated: 0, remainingBatches: 0, message: "Backfill already in progress" };
  }

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return { batchNumber: 0, translated: 0, remainingBatches: 0, message: "SARVAM_API_KEY not set" };
  }

  backfillInProgress = true;

  try {
    // Find batches that have pages without English translations
    const allBatches = getAllBatches();
    const batchesNeedingTranslation = allBatches.filter((b) =>
      b.pages.some((p) => p.text && p.text.length > 30 && !p.textEn)
    );

    if (batchesNeedingTranslation.length === 0) {
      return { batchNumber: 0, translated: 0, remainingBatches: 0, message: "All batches already have English translations" };
    }

    // Process one batch per cron run to avoid rate limits
    const batch = batchesNeedingTranslation[0];
    let translatedCount = 0;

    logger.info(
      { batchNumber: batch.batchNumber, pages: batch.pages.length, remaining: batchesNeedingTranslation.length },
      "Backfilling English translations for batch",
    );

    for (const page of batch.pages) {
      if (page.textEn || !page.text || page.text.length <= 30) continue;

      // Skip garbage pages (low Devanagari ratio)
      const devanagari = (page.text.match(/[\u0900-\u097F]/gu) || []).length;
      const total = page.text.replace(/\s/g, "").length;
      if (total === 0 || devanagari / total < 0.4) {
        logger.info({ pageNumber: page.pageNumber }, "Backfill: skipping garbage page");
        continue;
      }

      try {
        page.textEn = await translateToEnglish(page.text);
        if (page.textEn) {
          translatedCount++;
          logger.info(
            { pageNumber: page.pageNumber, enLength: page.textEn.length },
            "Backfill: English translation added",
          );
        }
      } catch (err) {
        logger.warn({ pageNumber: page.pageNumber, err }, "Backfill: Translation failed for page");
      }

      // Small delay between pages to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
    }

    // Save updated batch back to disk
    if (translatedCount > 0) {
      const batchFile = path.join(PAGES_DIR, `batch-${String(batch.batchNumber).padStart(4, "0")}.json`);
      fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2) + "\n");
      logger.info({ batchNumber: batch.batchNumber, translatedCount }, "Backfill: batch file updated with translations");

      // Git commit + push the updated batch
      try {
        execSync("git add data/bhagwatham/pages/", { cwd: REPO_ROOT, stdio: "pipe" });
        const diff = execSync("git diff --cached --stat", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
        if (diff) {
          const msg = `feat(bhagwatham): backfill English translations for batch ${batch.batchNumber} (${translatedCount} pages)`;
          execSync(`git commit -m "${msg}"`, { cwd: REPO_ROOT, stdio: "pipe" });
          execSync("git push", { cwd: REPO_ROOT, stdio: "pipe" });
          logger.info({ batchNumber: batch.batchNumber }, "Backfill: git commit + push done");
        }
      } catch (err) {
        logger.warn({ err }, "Backfill: git commit/push failed");
      }
    }

    return {
      batchNumber: batch.batchNumber,
      translated: translatedCount,
      remainingBatches: batchesNeedingTranslation.length - 1,
      message: `Translated ${translatedCount} pages in batch ${batch.batchNumber}. ${batchesNeedingTranslation.length - 1} batches remaining.`,
    };
  } finally {
    backfillInProgress = false;
  }
}

// ── Main batch processor ──────────────────────────────────────────────────────

export async function processNextBatch(): Promise<{
  success: boolean;
  batch?: BatchData;
  message: string;
}> {
  const progress = readProgress();

  if (progress.status === "processing") {
    return { success: false, message: "Already processing a batch" };
  }
  if (progress.status === "completed") {
    return { success: false, message: "All pages have been processed" };
  }

  const pdfPath = progress.pdfPath;
  if (!fs.existsSync(pdfPath)) {
    return { success: false, message: `PDF not found at: ${pdfPath}` };
  }

  progress.status = "processing";
  writeProgress(progress);

  try {
    if (progress.totalPagesInPdf === 0) {
      const total = getTotalPages(pdfPath);
      if (total > 0) progress.totalPagesInPdf = total;
    }

    const startPage = progress.lastProcessedPage + 1;
    const batchNumber = progress.batchesCompleted + 1;
    const endPage = progress.totalPagesInPdf > 0
      ? Math.min(startPage + progress.batchSize - 1, progress.totalPagesInPdf)
      : startPage + progress.batchSize - 1;

    if (progress.totalPagesInPdf > 0 && startPage > progress.totalPagesInPdf) {
      progress.status = "completed";
      writeProgress(progress);
      return { success: false, message: "All pages have been processed" };
    }

    logger.info({ batchNumber, startPage, endPage, ocr: process.env.SARVAM_API_KEY ? "sarvam" : "tesseract" },
      "Starting batch processing");

    // Step 1: Convert PDF pages to images
    const imagePaths = convertPagesToImages(pdfPath, startPage, endPage);
    if (imagePaths.length === 0) {
      progress.status = "idle";
      writeProgress(progress);
      return { success: false, message: "No images generated from PDF pages" };
    }

    logger.info({ imageCount: imagePaths.length }, "Images generated, starting OCR");

    // Step 2: OCR — use Sarvam if key available, else Tesseract
    const extractedPages = await ocrWithSarvam(imagePaths, startPage);

    // Step 3: Translate to English (best-effort, non-blocking)
    if (process.env.SARVAM_API_KEY) {
      for (const page of extractedPages) {
        if (page.text && page.text.length > 30) {
          try {
            page.textEn = await translateToEnglish(page.text);
            logger.info({ pageNumber: page.pageNumber, enLength: page.textEn?.length || 0 }, "Translation completed");
          } catch (err) {
            logger.warn({ pageNumber: page.pageNumber, err }, "Translation failed — continuing without English");
          }
        }
      }
    }

    // Step 4: Cleanup temp images
    cleanupTmpImages();

    const actualEndPage = extractedPages.length > 0
      ? extractedPages[extractedPages.length - 1].pageNumber
      : startPage;

    const isComplete = progress.totalPagesInPdf > 0 && actualEndPage >= progress.totalPagesInPdf;

    const batch: BatchData = {
      batchNumber,
      startPage,
      endPage: actualEndPage,
      processedAt: new Date().toISOString(),
      pages: extractedPages,
    };

    // Save batch file
    const batchFile = path.join(PAGES_DIR, `batch-${String(batchNumber).padStart(4, "0")}.json`);
    fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2) + "\n");

    // Update progress
    progress.lastProcessedPage = actualEndPage;
    progress.totalPagesProcessed += extractedPages.length;
    progress.batchesCompleted = batchNumber;
    progress.lastProcessedAt = new Date().toISOString();
    progress.status = isComplete ? "completed" : "idle";
    writeProgress(progress);

    const ocrEngine = process.env.SARVAM_API_KEY ? "Sarvam Vision" : "Tesseract";
    const hasTranslations = extractedPages.some((p) => p.textEn);

    logger.info({
      batchNumber, startPage, endPage: actualEndPage,
      pagesExtracted: extractedPages.length,
      totalProcessed: progress.totalPagesProcessed,
      ocrEngine,
      hasEnglishTranslations: hasTranslations,
      percentComplete: progress.totalPagesInPdf > 0
        ? ((progress.totalPagesProcessed / progress.totalPagesInPdf) * 100).toFixed(1) : "unknown",
    }, "Batch processed successfully");

    // Generate chapter images (retry once on failure)
    let imagesGenerated = false;
    try {
      const { generateImagesForBatch } = await import("./bhagwatham-image-gen");
      await generateImagesForBatch(extractedPages);
      imagesGenerated = true;
      logger.info({ batchNumber }, "Chapter images generated successfully");
    } catch (imgErr) {
      logger.warn({ imgErr }, "Image generation failed on first attempt — retrying in 5s");
      try {
        await new Promise(r => setTimeout(r, 5000));
        const { generateImagesForBatch } = await import("./bhagwatham-image-gen");
        await generateImagesForBatch(extractedPages);
        imagesGenerated = true;
        logger.info({ batchNumber }, "Chapter images generated on retry");
      } catch (imgErr2) {
        logger.error({ imgErr2 }, "Image generation failed after retry — continuing without images");
      }
    }

    // Git commit, push (triggers Vercel deploy)
    gitCommitAndPush(batchNumber, startPage, actualEndPage, imagesGenerated);

    return {
      success: true,
      batch,
      message: `Processed pages ${startPage}-${actualEndPage} (batch ${batchNumber}) via ${ocrEngine}. ${progress.totalPagesProcessed}/${progress.totalPagesInPdf} pages done.${hasTranslations ? " English translations included." : ""}`,
    };
  } catch (err) {
    progress.status = "idle";
    writeProgress(progress);
    cleanupTmpImages();
    logger.error({ err }, "Error processing batch");
    return {
      success: false,
      message: `Error processing batch: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
