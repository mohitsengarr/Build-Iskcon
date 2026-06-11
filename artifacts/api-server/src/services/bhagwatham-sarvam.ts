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
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { logger } from "../lib/logger";
import { reportAIFailure } from "./ai-credit-monitor";
import { REPO_ROOT, DATA_DIR as ROOT_DATA_DIR } from "../lib/repo-root";

const DATA_DIR = path.join(ROOT_DATA_DIR, "bhagwatham");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");

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
  // Some scanner-generated PDFs (e.g. Canon iR-ADV output) embed binary bytes
  // in metadata. Piping `pdfinfo` through `grep` makes grep treat the stream
  // as binary and skip line matching entirely → 0 pages → chapter is
  // mis-marked "failed". Capture the full pdfinfo output in JS and parse with
  // a multiline regex instead. Same fix as chaitanya-sarvam.
  try {
    const output = execSync(`pdfinfo "${pdfPath}" 2>/dev/null`, { encoding: "utf-8" });
    // Take the LAST match — scanner metadata can embed fake earlier "Pages:" lines.
    const matches = [...output.matchAll(/^Pages:\s+(\d+)/gm)];
    if (matches.length > 0) return parseInt(matches[matches.length - 1][1], 10) || 0;
    return 0;
  } catch {
    return 0;
  }
}

interface PageImage {
  pageNumber: number;
  imagePath: string;
}

/**
 * Renders pages into the given per-run temp dir. Page numbers are derived
 * from the produced PNG filenames (page-NNNNN.png), NOT from array position,
 * so a page dropped by pdftoppm can't shift every subsequent page's number.
 */
function convertPagesToImages(pdfPath: string, startPage: number, endPage: number, tmpDir: string): PageImage[] {
  // 200 DPI is good for OCR
  execSync(
    `pdftoppm -f ${startPage} -l ${endPage} -r 200 -png "${pdfPath}" "${path.join(tmpDir, "page")}"`,
    { stdio: "pipe", timeout: 120_000 },
  );

  const images: PageImage[] = [];
  for (const f of fs.readdirSync(tmpDir)) {
    const m = f.match(/^page-(\d+)\.png$/);
    if (!m) continue;
    images.push({ pageNumber: parseInt(m[1], 10), imagePath: path.join(tmpDir, f) });
  }
  return images.sort((a, b) => a.pageNumber - b.pageNumber);
}

function removeTmpDir(tmpDir: string | null): void {
  if (!tmpDir) return;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── Sarvam AI OCR (primary engine) ──────────────────────────────────────────

/**
 * Process a single image through Sarvam Document Intelligence API (REST).
 * Uses the job-based flow: createJob → upload → start → poll → download.
 */
async function ocrSinglePageSarvam(imagePath: string, pageNumber: number, apiKey: string): Promise<string> {
  const baseUrl = "https://api.sarvam.ai";
  const apiPath = "/doc-digitization/job/v1";
  const headers = {
    "API-Subscription-Key": apiKey,
    "Content-Type": "application/json",
  };

  const SARVAM_MAX_RETRIES = 3;

  // Step 1: Create a job
  let createRes: Response | null = null;
  for (let attempt = 1; attempt <= SARVAM_MAX_RETRIES; attempt++) {
    createRes = await fetch(`${baseUrl}${apiPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        job_parameters: {
          language_code: "hi-IN",
          output_format: "md",
        },
      }),
    });
    if (createRes.ok) break;
    const errText = await createRes.text();
    logger.warn({ pageNumber, attempt, status: createRes.status, errText }, "Sarvam create job failed, retrying");
    if (attempt < SARVAM_MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 3000 * attempt));
    } else {
      throw new Error(`Create job failed after ${SARVAM_MAX_RETRIES} retries: ${createRes.status} ${errText}`);
    }
  }
  if (!createRes || !createRes.ok) throw new Error("Create job failed: no response");
  const jobRaw = await createRes.json() as Record<string, unknown>;
  logger.info({ pageNumber, jobResponse: JSON.stringify(jobRaw).substring(0, 500) }, "Sarvam create job response");
  const jobId = (jobRaw.job_id || jobRaw.id || (jobRaw as any).job?.id) as string;
  if (!jobId) throw new Error(`No job_id in Sarvam response: ${JSON.stringify(jobRaw).substring(0, 200)}`);

  // Check if upload URLs were returned in create response (old API style)
  const inlineUploadLinks = (jobRaw.upload_links || jobRaw.upload_urls) as Array<{ upload_url: string }> | undefined;

  let uploadUrl: string | undefined;

  if (inlineUploadLinks?.[0]?.upload_url) {
    // Old-style: upload URLs in create response
    uploadUrl = inlineUploadLinks[0].upload_url;
  } else {
    // New-style: separate upload-files endpoint
    const fileName = path.basename(imagePath);
    const uploadReq = await fetch(`${baseUrl}${apiPath}/upload-files`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        job_id: jobId,
        files: [fileName],
      }),
    });
    if (!uploadReq.ok) throw new Error(`Upload URL request failed: ${uploadReq.status} ${await uploadReq.text()}`);
    const uploadData = await uploadReq.json() as Record<string, unknown>;
    // upload_urls is a dict keyed by filename: { "file.png": { "file_url": "...", ... } }
    const uploadUrls = uploadData.upload_urls as Record<string, { file_url?: string; upload_url?: string }> | undefined;
    if (uploadUrls) {
      const entry = uploadUrls[fileName] || Object.values(uploadUrls)[0];
      uploadUrl = entry?.file_url || entry?.upload_url;
    }
  }
  if (!uploadUrl) throw new Error("No upload URL returned from Sarvam");

  // Step 3: Upload the image to Azure Blob Storage
  const imageBuffer = fs.readFileSync(imagePath);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
      "x-ms-blob-type": "BlockBlob",
    },
    body: imageBuffer,
  });
  if (!uploadRes.ok) {
    const uploadErr = await uploadRes.text();
    throw new Error(`Upload failed: ${uploadRes.status} ${uploadErr.substring(0, 200)}`);
  }

  // Step 4: Start processing
  const startRes = await fetch(`${baseUrl}${apiPath}/${jobId}/start`, {
    method: "POST",
    headers,
  });
  if (!startRes.ok) throw new Error(`Start failed: ${startRes.status} ${await startRes.text()}`);

  // Step 5: Poll for completion (max 90 seconds)
  let status = "Processing";
  for (let attempt = 0; attempt < 45; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusRes = await fetch(`${baseUrl}${apiPath}/${jobId}/status`, { headers });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json() as Record<string, unknown>;
    // API may use "status" or "job_state"
    status = (statusData.status || statusData.job_state || statusData.state || "unknown") as string;
    if (attempt === 0) logger.info({ pageNumber, statusKeys: Object.keys(statusData), status }, "Sarvam status poll sample");
    if (status === "Completed" || status === "completed") break;
    if (status === "Failed" || status === "failed") throw new Error("Sarvam job failed");
  }
  if (!/^[Cc]ompleted$/.test(status)) throw new Error(`Sarvam job timed out (status: ${status})`);

  // Step 6: Download results
  const dlRes = await fetch(`${baseUrl}${apiPath}/${jobId}/download-files`, {
    method: "POST",
    headers,
  });
  if (!dlRes.ok) throw new Error(`Download files failed: ${dlRes.status} ${await dlRes.text()}`);
  const dlData = await dlRes.json() as Record<string, unknown>;
  logger.info({ pageNumber, downloadKeys: Object.keys(dlData) }, "Sarvam download response keys");

  let extractedText = "";

  // Collect all download URLs from dict or array format
  const dlUrls = dlData.download_urls as Record<string, { file_url?: string; download_url?: string }> | undefined;
  const dlLinks = dlData.download_links as Array<{ download_url?: string; file_url?: string }> | undefined;

  const urls: string[] = [];
  if (dlUrls && !Array.isArray(dlUrls)) {
    for (const entry of Object.values(dlUrls)) {
      const url = entry.file_url || entry.download_url;
      if (url) urls.push(url);
    }
  } else if (dlLinks) {
    for (const link of dlLinks) {
      const url = link.file_url || link.download_url;
      if (url) urls.push(url);
    }
  }

  for (const url of urls) {
    const fileRes = await fetch(url);
    if (!fileRes.ok) continue;

    const buf = Buffer.from(await fileRes.arrayBuffer());

    // Check if the response is a ZIP file (starts with PK\x03\x04)
    if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) {
      // Extract text files from ZIP
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(buf);
      for (const entry of zip.getEntries()) {
        if (entry.entryName.endsWith(".md") || entry.entryName.endsWith(".txt")) {
          extractedText += entry.getData().toString("utf-8");
        }
      }
    } else {
      // Plain text response
      extractedText += buf.toString("utf-8");
    }
  }

  // Strip markdown formatting (headers, bold, etc.) to get clean text
  extractedText = extractedText
    .replace(/^#{1,6}\s*/gm, "")        // Remove markdown headers
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // Remove bold markers
    .replace(/\*([^*]+)\*/g, "$1")       // Remove italic markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove markdown links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "") // Remove images
    .trim();

  return extractedText;
}

/**
 * Process images through OCR.
 * Sarvam AI primary → Tesseract fallback.
 */
async function ocrWithSarvam(pageImages: PageImage[]): Promise<PageContent[]> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    logger.warn("SARVAM_API_KEY not set — falling back to Tesseract");
    return ocrWithTesseract(pageImages);
  }

  const pages: PageContent[] = [];

  for (const { pageNumber, imagePath } of pageImages) {
    try {
      logger.info({ pageNumber }, "Processing page with Sarvam Vision");
      const text = await ocrSinglePageSarvam(imagePath, pageNumber, apiKey);
      pages.push({ pageNumber, text });
      logger.info({ pageNumber, textLength: text.length }, "Sarvam OCR completed for page");
    } catch (err) {
      logger.error({ pageNumber, err }, "Sarvam OCR failed for page");
      reportAIFailure("Sarvam AI", (err as Error)?.message || "OCR failed");
      pages.push({ pageNumber, text: "" });
    }
  }

  return pages;
}

// ── Tesseract fallback ────────────────────────────────────────────────────────

async function ocrWithTesseract(pageImages: PageImage[]): Promise<PageContent[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("hin+san+eng", 1);
  const pages: PageContent[] = [];

  for (const { pageNumber, imagePath } of pageImages) {
    try {
      const { data } = await worker.recognize(imagePath);
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

    const emptyChunks = translatedChunks.filter((c) => !c.trim()).length;
    if (translatedChunks.length > 0 && emptyChunks / translatedChunks.length > 0.3) {
      logger.warn({ emptyChunks, totalChunks: translatedChunks.length }, "Translation: >30% of chunks came back empty");
    }
    const joined = translatedChunks.join("\n");
    // When every chunk failed, join("\n") yields a truthy "\n" which callers
    // would store as a real translation — return "" for whitespace-only output.
    return joined.trim().length > 0 ? joined : "";
  } catch (err) {
    logger.warn({ err }, "Translation to English failed");
    return "";
  }
}

// ── Sync data to Vercel public dir ───────────────────────────────────────────

const PUBLIC_API_DIR = path.resolve(REPO_ROOT, "artifacts", "temple-tracker", "public", "api", "bhagwatham");

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

    // Sync content (paginated — all batches)
    const all = getAllBatches();
    const content = {
      batches: all,
      pagination: { page: 1, limit: all.length, totalBatches: all.length, totalPages: 1, hasMore: false },
    };
    fs.writeFileSync(path.join(PUBLIC_API_DIR, "content"), JSON.stringify(content, null, 2));

    logger.info({ batchCount: batchFiles.length }, "Synced data to public dir for Vercel");
  } catch (err) {
    logger.warn({ err }, "Failed to sync data to public dir");
  }
}

// ── Git commit ────────────────────────────────────────────────────────────────

function gitCommitAndPush(batchNumber: number, startPage: number, endPage: number, hasImages: boolean): void {
  try {
    // Sync batch data to public dir for Vercel static hosting
    syncToPublicDir();

    // Stage only — daily commit cron handles commit + push once per day
    execSync("git add data/bhagwatham/", { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git add artifacts/temple-tracker/public/api/bhagwatham/", { cwd: REPO_ROOT, stdio: "pipe" });
    logger.info({ batchNumber, startPage, endPage, hasImages }, "Changes staged (daily commit will push)");
  } catch (err) {
    logger.warn({ err }, "Git stage failed — continuing");
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
    // Track exactly which pages this run translated, so the final write can
    // merge ONLY those textEn fields onto a fresh copy of the file.
    const changedEn = new Map<number, string>();

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
        const en = await translateToEnglish(page.text);
        if (en) {
          page.textEn = en;
          changedEn.set(page.pageNumber, en);
          translatedCount++;
          logger.info(
            { pageNumber: page.pageNumber, enLength: en.length },
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
      try {
        // Re-read the batch from disk and merge ONLY the textEn fields this
        // run changed — a concurrent re-OCR may have recovered page text
        // since we loaded the file, and writing our stale copy would revert it.
        const fresh: BatchData = JSON.parse(fs.readFileSync(batchFile, "utf-8"));
        for (const p of fresh.pages) {
          const en = changedEn.get(p.pageNumber);
          if (en !== undefined) p.textEn = en;
        }
        fs.writeFileSync(batchFile, JSON.stringify(fresh, null, 2) + "\n");
      } catch (mergeErr) {
        // Fresh copy unreadable — fall back to writing the in-memory batch
        logger.warn({ mergeErr, batchNumber: batch.batchNumber }, "Backfill: merge re-read failed — writing in-memory batch");
        fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2) + "\n");
      }
      logger.info({ batchNumber: batch.batchNumber, translatedCount }, "Backfill: batch file updated with translations");

      // Stage only — daily commit cron handles commit + push
      try {
        execSync("git add data/bhagwatham/pages/", { cwd: REPO_ROOT, stdio: "pipe" });
        logger.info({ batchNumber: batch.batchNumber }, "Backfill: changes staged (daily commit will push)");
      } catch (err) {
        logger.warn({ err }, "Backfill: git stage failed");
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

  let tmpDir: string | null = null;
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

    logger.info({ batchNumber, startPage, endPage, ocr: "sarvam (primary) → tesseract (fallback)" },
      "Starting batch processing");

    // Step 1: Convert PDF pages to images (per-run temp dir — a shared dir
    // gets wiped by every concurrent run)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bh-ocr-"));
    const pageImages = convertPagesToImages(pdfPath, startPage, endPage, tmpDir);
    if (pageImages.length === 0) {
      progress.status = "idle";
      writeProgress(progress);
      return { success: false, message: "No images generated from PDF pages" };
    }

    logger.info({ imageCount: pageImages.length }, "Images generated, starting OCR");

    // Step 2: OCR — use Sarvam if key available, else Tesseract
    const extractedPages = await ocrWithSarvam(pageImages);

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

    const ocrEngine = "Sarvam Vision";
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
    logger.error({ err }, "Error processing batch");
    return {
      success: false,
      message: `Error processing batch: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    removeTmpDir(tmpDir);
  }
}

// ── Re-OCR empty pages ────────────────────────────────────────────────────────

/**
 * Find all pages with empty/near-empty text in existing batches and re-OCR them.
 * Processes up to `limit` pages per call to avoid overloading the API.
 * When reverse=true, processes highest page numbers first (prioritizes later cantos).
 */
export async function reprocessEmptyPages(limit = 20, reverse = false): Promise<{
  reprocessed: number;
  totalEmpty: number;
  message: string;
}> {
  const progress = readProgress();
  // Same guard as processNextBatch: a batch run owns the progress file and
  // the Sarvam quota — refuse instead of racing it.
  if (progress.status === "processing") {
    return { reprocessed: 0, totalEmpty: 0, message: "Batch run in progress — re-OCR deferred to next tick" };
  }
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

  // Sort by page number: reverse=true processes highest pages first (Canto 11-12 priority)
  if (reverse) {
    emptyPages.sort((a, b) => b.pageNumber - a.pageNumber);
  }

  logger.info({ totalEmpty: emptyPages.length, limit, reverse }, "Found empty pages to reprocess");

  // Process up to `limit` pages
  const toProcess = emptyPages.slice(0, limit);
  let reprocessed = 0;

  for (const ep of toProcess) {
    let tmpDir: string | null = null;
    try {
      // Convert single PDF page to image (per-run temp dir, see D1c rationale)
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bh-reocr-"));
      const pageImages = convertPagesToImages(pdfPath, ep.pageNumber, ep.pageNumber, tmpDir);
      if (pageImages.length === 0) {
        logger.warn({ pageNumber: ep.pageNumber }, "No image generated for page");
        continue;
      }

      // OCR the page
      const [page] = await ocrWithSarvam(pageImages);

      if (!page || !page.text || page.text.trim().length < 10) {
        logger.warn({ pageNumber: ep.pageNumber }, "Re-OCR still produced empty text");
        continue;
      }

      // Translate if possible
      const apiKey = process.env.SARVAM_API_KEY;
      if (apiKey && page.text.length > 30) {
        try {
          page.textEn = await translateToEnglish(page.text);
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
      fs.copyFileSync(batchPath, path.join(publicBatchDir, String(batchNum)));

      reprocessed++;
      logger.info({ pageNumber: ep.pageNumber, textLength: page.text.length }, "Page re-OCR'd successfully");
    } catch (err) {
      logger.error({ pageNumber: ep.pageNumber, err }, "Failed to re-OCR page");
    } finally {
      removeTmpDir(tmpDir);
    }
  }

  return {
    reprocessed,
    totalEmpty: emptyPages.length,
    message: `Re-OCR'd ${reprocessed}/${toProcess.length} pages (${emptyPages.length - reprocessed} still empty)`,
  };
}
