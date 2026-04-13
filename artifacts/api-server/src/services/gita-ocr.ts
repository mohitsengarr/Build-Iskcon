/**
 * Bhagavad Gita OCR Service — Sarvam AI primary, Tesseract fallback
 *
 * Processes Bhagavad Gita PDF pages through OCR and extracts text.
 * English translations are backfilled from an English PDF via pdf-parse.
 *
 * OCR priority chain:
 *   1. Sarvam AI Document Intelligence (~87% accuracy, ₹1.50/page)
 *   2. Tesseract (embedded, last resort)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "gita");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const TMP_DIR = path.join(DATA_DIR, ".tmp-images");

// ── Types ────────────────────────────────────────────────────────────────────

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
  textEn?: string;     // English text (extracted from English PDF)
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

/** Call once on server startup to recover from stale "processing" state */
export function recoverStaleProgress(): void {
  const progress = readProgress();
  if (progress.status === "processing") {
    progress.status = "idle";
    writeProgress(progress);
    logger.info("Auto-recovered stale 'processing' status to 'idle' on startup");
  }
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

// ── Sarvam AI OCR (primary engine, same as Bhagwatham) ───────────────────────

const SARVAM_MAX_RETRIES = 3;

async function ocrSinglePageSarvam(imagePath: string, pageNumber: number): Promise<string> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error("SARVAM_API_KEY not set");

  const baseUrl = "https://api.sarvam.ai";
  const apiPath = "/doc-digitization/job/v1";
  const headers: Record<string, string> = {
    "API-Subscription-Key": apiKey,
    "Content-Type": "application/json",
  };

  // Step 1: Create a job
  let createRes: Response | null = null;
  for (let attempt = 1; attempt <= SARVAM_MAX_RETRIES; attempt++) {
    createRes = await fetch(`${baseUrl}${apiPath}`, {
      method: "POST", headers,
      body: JSON.stringify({ job_parameters: { language_code: "hi-IN", output_format: "md" } }),
    });
    if (createRes.ok) break;
    if (attempt < SARVAM_MAX_RETRIES) await new Promise(r => setTimeout(r, 3000 * attempt));
    else throw new Error(`Create job failed: ${createRes.status}`);
  }
  const jobRaw: any = await createRes!.json();
  const jobId = jobRaw.job_id || jobRaw.id || jobRaw.job?.id;
  if (!jobId) throw new Error("No job_id in response");

  // Step 2: Get upload URL
  const uploadReq = await fetch(`${baseUrl}${apiPath}/upload-files`, {
    method: "POST", headers,
    body: JSON.stringify({ job_id: jobId, file_names: [path.basename(imagePath)] }),
  });
  const uploadData: any = await uploadReq.json();
  const uploadUrl = uploadData.upload_urls?.[0] || uploadData.upload_links?.[0]?.upload_url;
  if (!uploadUrl) throw new Error("No upload URL");

  // Step 3: Upload image
  const imageBuffer = fs.readFileSync(imagePath);
  await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: imageBuffer });

  // Step 4: Start processing
  await fetch(`${baseUrl}${apiPath}/start`, {
    method: "POST", headers,
    body: JSON.stringify({ job_id: jobId }),
  });

  // Step 5: Poll for completion
  for (let poll = 0; poll < 45; poll++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`${baseUrl}${apiPath}/status?job_id=${jobId}`, { headers });
    const status: any = await statusRes.json();
    if (status.status === "completed" || status.job_status === "completed") {
      // Step 6: Download result
      const dlRes = await fetch(`${baseUrl}${apiPath}/download?job_id=${jobId}`, { headers });
      const text = await dlRes.text();
      // Clean markdown artifacts
      return text.replace(/^#+\s*/gm, "").replace(/\*\*/g, "").replace(/\[.*?\]\(.*?\)/g, "").replace(/!\[.*?\]\(.*?\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
    }
    if (status.status === "failed" || status.job_status === "failed") throw new Error("Sarvam job failed");
  }
  throw new Error("Sarvam polling timeout");
}

// ── Tesseract fallback ────────────────────────────────────────────────────────

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

// ── OCR dispatcher (Sarvam primary → Tesseract fallback) ─────────────────────

async function ocrPages(imagePaths: string[], startPage: number): Promise<PageContent[]> {
  const pages: PageContent[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    const pageNumber = startPage + i;

    // 1. Try Sarvam AI first
    try {
      logger.info({ pageNumber }, "Processing page with Sarvam AI");
      const text = await ocrSinglePageSarvam(imagePath, pageNumber);
      if (text && text.trim().length >= 10) {
        pages.push({ pageNumber, text });
        logger.info({ pageNumber, textLength: text.length, engine: "sarvam" }, "OCR completed for page");
        continue;
      }
      logger.warn({ pageNumber }, "Sarvam returned insufficient text, trying Tesseract");
    } catch (err) {
      logger.warn({ pageNumber, err: (err as Error)?.message }, "Sarvam failed, trying Tesseract");
    }

    // 2. Fallback: Tesseract
    try {
      const result = await ocrSinglePageTesseract(imagePath, pageNumber);
      pages.push(result);
      logger.info({ pageNumber, textLength: result.text.length, engine: "tesseract" }, "OCR completed for page");
    } catch {
      pages.push({ pageNumber, text: "" });
      logger.error({ pageNumber }, "All OCR engines failed");
    }
  }

  return pages;
}

// ── English text extraction from PDF ────────────────────────────────────────

/**
 * Extract English text for a given page number from the English PDF.
 * Uses pdf-parse to extract text from the entire PDF and splits by page.
 */
async function extractEnglishFromPdf(pageNumber: number): Promise<string> {
  const englishPdfPath = path.join(DATA_DIR, "english.pdf");
  if (!fs.existsSync(englishPdfPath)) {
    logger.warn("English PDF not found at data/gita/english.pdf");
    return "";
  }

  try {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const dataBuffer = fs.readFileSync(englishPdfPath);

    // Extract text for the specific page range
    const result = await pdfParse(dataBuffer, {
      max: pageNumber,     // parse up to this page
    });

    if (!result.text) return "";

    // pdf-parse returns all text up to max page; split by form-feed or heuristic
    // Try to isolate just the requested page's text
    const allText = result.text;

    // Form-feed character is the standard PDF page separator
    const pageTexts = allText.split("\f");

    // pageNumber is 1-indexed; array is 0-indexed
    if (pageTexts.length >= pageNumber && pageTexts[pageNumber - 1]) {
      return pageTexts[pageNumber - 1].trim();
    }

    // Fallback: if form-feed splitting didn't work, return the last chunk
    if (pageTexts.length > 0) {
      return pageTexts[pageTexts.length - 1].trim();
    }

    return "";
  } catch (err) {
    logger.warn({ err, pageNumber }, "Failed to extract English text from PDF");
    return "";
  }
}

// ── Sync data to Vercel public dir ───────────────────────────────────────────

const PUBLIC_API_DIR = path.resolve(REPO_ROOT, "artifacts", "temple-tracker", "public", "api", "gita");

function syncToPublicDir(): void {
  try {
    const publicBatchDir = path.join(PUBLIC_API_DIR, "batch");
    if (!fs.existsSync(publicBatchDir)) fs.mkdirSync(publicBatchDir, { recursive: true });

    // Sync all batch files
    const batchFiles = fs.readdirSync(PAGES_DIR).filter(f => f.startsWith("batch-") && f.endsWith(".json")).sort();
    for (const file of batchFiles) {
      const num = parseInt(file.replace("batch-", "").replace(".json", ""), 10);
      const dest = path.join(publicBatchDir, String(num));
      fs.copyFileSync(path.join(PAGES_DIR, file), dest);
    }

    // Sync batches list (metadata only)
    const allBatches = getAllBatches().map(b => ({
      batchNumber: b.batchNumber,
      startPage: b.startPage,
      endPage: b.endPage,
      pageCount: b.pages.length,
    }));
    fs.writeFileSync(path.join(PUBLIC_API_DIR, "batches"), JSON.stringify(allBatches, null, 2));

    // Sync progress
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.copyFileSync(PROGRESS_FILE, path.join(PUBLIC_API_DIR, "progress"));
    }

    // Sync content (paginated -- all batches)
    const all = getAllBatches();
    const content = {
      batches: all,
      pagination: { page: 1, limit: all.length, totalBatches: all.length, totalPages: 1, hasMore: false },
    };
    fs.writeFileSync(path.join(PUBLIC_API_DIR, "content"), JSON.stringify(content, null, 2));

    logger.info({ batchCount: batchFiles.length }, "Synced gita data to public dir for Vercel");
  } catch (err) {
    logger.warn({ err }, "Failed to sync gita data to public dir");
  }
}

// ── Git commit ────────────────────────────────────────────────────────────────

function gitCommitAndPush(batchNumber: number, startPage: number, endPage: number): void {
  try {
    // Sync batch data to public dir for Vercel static hosting
    syncToPublicDir();

    // Stage all gita data: pages, progress + public API
    execSync("git add data/gita/", { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git add artifacts/temple-tracker/public/api/gita/", { cwd: REPO_ROOT, stdio: "pipe" });

    // Check if there are staged changes
    const diff = execSync("git diff --cached --stat", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
    if (!diff) {
      logger.info("No changes to commit -- skipping");
      return;
    }

    const commitMsg = `feat(gita): process pages ${startPage}-${endPage} (batch ${batchNumber})`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git push", { cwd: REPO_ROOT, stdio: "pipe" });
    logger.info({ batchNumber, startPage, endPage }, "Git commit and push successful");

    // Trigger Vercel deploy (Vercel auto-deploys on push, but log confirmation)
    logger.info("Vercel deploy triggered via git push");
  } catch (err) {
    logger.warn({ err }, "Git commit/push failed -- continuing without push");
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

  const englishPdfPath = path.join(DATA_DIR, "english.pdf");
  if (!fs.existsSync(englishPdfPath)) {
    return { batchNumber: 0, translated: 0, remainingBatches: 0, message: "English PDF not found at data/gita/english.pdf" };
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

    // Process one batch per cron run to avoid overloading
    const batch = batchesNeedingTranslation[0];
    let translatedCount = 0;

    logger.info(
      { batchNumber: batch.batchNumber, pages: batch.pages.length, remaining: batchesNeedingTranslation.length },
      "Backfilling English text for batch from English PDF",
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
        page.textEn = await extractEnglishFromPdf(page.pageNumber);
        if (page.textEn) {
          translatedCount++;
          logger.info(
            { pageNumber: page.pageNumber, enLength: page.textEn.length },
            "Backfill: English text extracted from PDF",
          );
        }
      } catch (err) {
        logger.warn({ pageNumber: page.pageNumber, err }, "Backfill: English extraction failed for page");
      }
    }

    // Save updated batch back to disk
    if (translatedCount > 0) {
      const batchFile = path.join(PAGES_DIR, `batch-${String(batch.batchNumber).padStart(4, "0")}.json`);
      fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2) + "\n");
      logger.info({ batchNumber: batch.batchNumber, translatedCount }, "Backfill: batch file updated with English text");

      // Git commit + push the updated batch
      try {
        execSync("git add data/gita/pages/", { cwd: REPO_ROOT, stdio: "pipe" });
        const diff = execSync("git diff --cached --stat", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
        if (diff) {
          const msg = `feat(gita): backfill English text for batch ${batch.batchNumber} (${translatedCount} pages)`;
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
      message: `Extracted English for ${translatedCount} pages in batch ${batch.batchNumber}. ${batchesNeedingTranslation.length - 1} batches remaining.`,
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

    logger.info({ batchNumber, startPage, endPage, ocr: "paddleocr (primary) -> tesseract (fallback)" },
      "Starting batch processing");

    // Step 1: Convert PDF pages to images
    const imagePaths = convertPagesToImages(pdfPath, startPage, endPage);
    if (imagePaths.length === 0) {
      progress.status = "idle";
      writeProgress(progress);
      return { success: false, message: "No images generated from PDF pages" };
    }

    logger.info({ imageCount: imagePaths.length }, "Images generated, starting OCR");

    // Step 2: OCR -- PaddleOCR primary, Tesseract fallback
    const extractedPages = await ocrPages(imagePaths, startPage);

    // Step 3: Extract English text from English PDF (best-effort, non-blocking)
    const englishPdfPath = path.join(DATA_DIR, "english.pdf");
    if (fs.existsSync(englishPdfPath)) {
      for (const page of extractedPages) {
        if (page.text && page.text.length > 30) {
          try {
            page.textEn = await extractEnglishFromPdf(page.pageNumber);
            logger.info({ pageNumber: page.pageNumber, enLength: page.textEn?.length || 0 }, "English text extracted");
          } catch (err) {
            logger.warn({ pageNumber: page.pageNumber, err }, "English extraction failed -- continuing without English");
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

    const ocrEngine = "PaddleOCR (primary)";
    const hasEnglish = extractedPages.some((p) => p.textEn);

    logger.info({
      batchNumber, startPage, endPage: actualEndPage,
      pagesExtracted: extractedPages.length,
      totalProcessed: progress.totalPagesProcessed,
      ocrEngine,
      hasEnglishText: hasEnglish,
      percentComplete: progress.totalPagesInPdf > 0
        ? ((progress.totalPagesProcessed / progress.totalPagesInPdf) * 100).toFixed(1) : "unknown",
    }, "Batch processed successfully");

    // Git commit, push (triggers Vercel deploy)
    gitCommitAndPush(batchNumber, startPage, actualEndPage);

    return {
      success: true,
      batch,
      message: `Processed pages ${startPage}-${actualEndPage} (batch ${batchNumber}) via ${ocrEngine}. ${progress.totalPagesProcessed}/${progress.totalPagesInPdf} pages done.${hasEnglish ? " English text included." : ""}`,
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

// ── Re-OCR empty pages ────────────────────────────────────────────────────────

/**
 * Find all pages with empty/near-empty text in existing batches and re-OCR them.
 * Processes up to `limit` pages per call to avoid overloading.
 * When reverse=true, processes highest page numbers first.
 */
export async function reprocessEmptyPages(limit = 20, reverse = false): Promise<{
  reprocessed: number;
  totalEmpty: number;
  message: string;
}> {
  const progress = readProgress();
  const pdfPath = progress.pdfPath;
  if (!fs.existsSync(pdfPath)) {
    return { reprocessed: 0, totalEmpty: 0, message: `PDF not found: ${pdfPath}` };
  }

  // Scan all batch files for empty pages
  const batchFiles = fs.readdirSync(PAGES_DIR)
    .filter(f => f.startsWith("batch-") && f.endsWith(".json"))
    .sort();

  const emptyPages: Array<{ pageNumber: number; batchFile: string; batchIndex: number }> = [];

  for (const bf of batchFiles) {
    const batch: BatchData = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, bf), "utf-8"));
    for (let i = 0; i < batch.pages.length; i++) {
      const page = batch.pages[i];
      if (!page.text || page.text.trim().length < 10) {
        emptyPages.push({ pageNumber: page.pageNumber, batchFile: bf, batchIndex: i });
      }
    }
  }

  if (emptyPages.length === 0) {
    return { reprocessed: 0, totalEmpty: 0, message: "No empty pages found" };
  }

  // Sort by page number: reverse=true processes highest pages first
  if (reverse) {
    emptyPages.sort((a, b) => b.pageNumber - a.pageNumber);
  }

  logger.info({ totalEmpty: emptyPages.length, limit, reverse }, "Found empty pages to reprocess");

  // Process up to `limit` pages
  const toProcess = emptyPages.slice(0, limit);
  let reprocessed = 0;

  for (const ep of toProcess) {
    try {
      // Convert single PDF page to image
      const imagePaths = convertPagesToImages(pdfPath, ep.pageNumber, ep.pageNumber);
      if (imagePaths.length === 0) {
        logger.warn({ pageNumber: ep.pageNumber }, "No image generated for page");
        continue;
      }

      // OCR the page (PaddleOCR -> Tesseract)
      const [page] = await ocrPages(imagePaths, ep.pageNumber);
      cleanupTmpImages();

      if (!page || !page.text || page.text.trim().length < 10) {
        logger.warn({ pageNumber: ep.pageNumber }, "Re-OCR still produced empty text");
        continue;
      }

      // Extract English text if available
      const englishPdfPath = path.join(DATA_DIR, "english.pdf");
      if (fs.existsSync(englishPdfPath) && page.text.length > 30) {
        try {
          page.textEn = await extractEnglishFromPdf(page.pageNumber);
        } catch { /* non-blocking */ }
      }

      // Update the batch file
      const batchPath = path.join(PAGES_DIR, ep.batchFile);
      const batch: BatchData = JSON.parse(fs.readFileSync(batchPath, "utf-8"));
      batch.pages[ep.batchIndex] = page;
      fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2) + "\n");

      // Also sync to public dir
      const publicBatchDir = path.join(PUBLIC_API_DIR, "batch");
      const batchNum = parseInt(ep.batchFile.replace("batch-", "").replace(".json", ""), 10);
      if (fs.existsSync(publicBatchDir)) {
        fs.copyFileSync(batchPath, path.join(publicBatchDir, String(batchNum)));
      }

      reprocessed++;
      logger.info({ pageNumber: ep.pageNumber, textLength: page.text.length }, "Page re-OCR'd successfully");
    } catch (err) {
      logger.error({ pageNumber: ep.pageNumber, err }, "Failed to re-OCR page");
      cleanupTmpImages();
    }
  }

  return {
    reprocessed,
    totalEmpty: emptyPages.length,
    message: `Re-OCR'd ${reprocessed}/${toProcess.length} pages (${emptyPages.length - reprocessed} still empty)`,
  };
}
