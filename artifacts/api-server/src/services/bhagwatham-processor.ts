import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { createWorker } from "tesseract.js";
import { logger } from "../lib/logger";
import { generateImagesForBatch } from "./bhagwatham-image-gen";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "bhagwatham");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const TMP_DIR = path.join(DATA_DIR, ".tmp-images");

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
  text: string;
}

export interface BatchData {
  batchNumber: number;
  startPage: number;
  endPage: number;
  processedAt: string;
  pages: PageContent[];
}

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
  const filePath = path.join(
    PAGES_DIR,
    `batch-${String(batchNumber).padStart(4, "0")}.json`,
  );
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function gitCommitAndPush(batchNumber: number, startPage: number, endPage: number): void {
  try {
    const commitMsg = `feat(bhagwatham): process pages ${startPage}-${endPage} (batch ${batchNumber})`;
    execSync("git add data/bhagwatham/", { cwd: REPO_ROOT, stdio: "pipe" });
    execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git push", { cwd: REPO_ROOT, stdio: "pipe" });
    logger.info({ batchNumber, startPage, endPage }, "Git commit and push successful");
  } catch (err) {
    logger.warn({ err }, "Git commit/push failed — continuing without push");
  }
}

function getTotalPages(pdfPath: string): number {
  try {
    // Use pdfinfo to get page count
    const output = execSync(`pdfinfo "${pdfPath}" 2>/dev/null | grep "Pages:" | awk '{print $2}'`, {
      encoding: "utf-8",
    }).trim();
    return parseInt(output, 10) || 0;
  } catch {
    // Fallback: try pdftoppm with just first page to check
    return 0;
  }
}

function convertPagesToImages(pdfPath: string, startPage: number, endPage: number): string[] {
  // Ensure tmp directory exists
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // Clear old images
  for (const f of fs.readdirSync(TMP_DIR)) {
    fs.unlinkSync(path.join(TMP_DIR, f));
  }

  // Convert PDF pages to PNG images using pdftoppm (200 DPI is sufficient for OCR)
  execSync(
    `pdftoppm -f ${startPage} -l ${endPage} -r 200 -png "${pdfPath}" "${path.join(TMP_DIR, "page")}"`,
    { stdio: "pipe", timeout: 120_000 },
  );

  // Collect generated images in order
  const images: string[] = [];
  for (let p = startPage; p <= endPage; p++) {
    // pdftoppm names files like page-00002.png (zero-padded based on total pages)
    const patterns = [
      `page-${String(p).padStart(5, "0")}.png`,
      `page-${String(p).padStart(4, "0")}.png`,
      `page-${String(p).padStart(3, "0")}.png`,
      `page-${String(p).padStart(2, "0")}.png`,
      `page-${String(p)}.png`,
    ];
    const found = patterns.find((pat) => fs.existsSync(path.join(TMP_DIR, pat)));
    if (found) {
      images.push(path.join(TMP_DIR, found));
    }
  }

  return images;
}

async function ocrImages(imagePaths: string[], startPage: number): Promise<PageContent[]> {
  const worker = await createWorker("hin+san+eng", 1, {
    // tesseract.js downloads training data automatically
  });

  const pages: PageContent[] = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    const pageNumber = startPage + i;

    try {
      const { data } = await worker.recognize(imagePath);
      pages.push({
        pageNumber,
        text: data.text.trim(),
      });
      logger.info({ pageNumber, textLength: data.text.length }, "OCR completed for page");
    } catch (err) {
      logger.warn({ pageNumber, err }, "OCR failed for page, using empty text");
      pages.push({ pageNumber, text: "" });
    }
  }

  await worker.terminate();
  return pages;
}

function cleanupTmpImages(): void {
  try {
    if (fs.existsSync(TMP_DIR)) {
      for (const f of fs.readdirSync(TMP_DIR)) {
        fs.unlinkSync(path.join(TMP_DIR, f));
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

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
    // Get total pages on first run
    if (progress.totalPagesInPdf === 0) {
      const total = getTotalPages(pdfPath);
      if (total > 0) {
        progress.totalPagesInPdf = total;
      }
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

    logger.info(
      { batchNumber, startPage, endPage },
      "Starting batch processing: converting PDF pages to images",
    );

    // Step 1: Convert PDF pages to images
    const imagePaths = convertPagesToImages(pdfPath, startPage, endPage);

    if (imagePaths.length === 0) {
      progress.status = "idle";
      writeProgress(progress);
      return { success: false, message: "No images generated from PDF pages" };
    }

    logger.info(
      { imageCount: imagePaths.length },
      "Images generated, starting OCR",
    );

    // Step 2: OCR the images to extract Hindi/Sanskrit text
    const extractedPages = await ocrImages(imagePaths, startPage);

    // Step 3: Cleanup temp images
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
    const batchFile = path.join(
      PAGES_DIR,
      `batch-${String(batchNumber).padStart(4, "0")}.json`,
    );
    fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2) + "\n");

    // Update progress
    progress.lastProcessedPage = actualEndPage;
    progress.totalPagesProcessed += extractedPages.length;
    progress.batchesCompleted = batchNumber;
    progress.lastProcessedAt = new Date().toISOString();
    progress.status = isComplete ? "completed" : "idle";
    writeProgress(progress);

    logger.info(
      {
        batchNumber,
        startPage,
        endPage: actualEndPage,
        pagesExtracted: extractedPages.length,
        totalProcessed: progress.totalPagesProcessed,
        totalInPdf: progress.totalPagesInPdf,
        percentComplete: progress.totalPagesInPdf > 0
          ? ((progress.totalPagesProcessed / progress.totalPagesInPdf) * 100).toFixed(1)
          : "unknown",
      },
      "Batch processed successfully via OCR",
    );

    // Generate chapter images (async, best-effort — doesn't block processing)
    try {
      await generateImagesForBatch(extractedPages);
    } catch (imgErr) {
      logger.warn({ imgErr }, "Image generation failed — continuing without images");
    }

    // Auto commit and push to git
    gitCommitAndPush(batchNumber, startPage, actualEndPage);

    return {
      success: true,
      batch,
      message: `Processed pages ${startPage}-${actualEndPage} (batch ${batchNumber}). ${progress.totalPagesProcessed}/${progress.totalPagesInPdf} pages done.`,
    };
  } catch (err) {
    progress.status = "idle"; // Reset to idle so it can retry
    writeProgress(progress);
    cleanupTmpImages();
    logger.error({ err }, "Error processing batch");
    return {
      success: false,
      message: `Error processing batch: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
