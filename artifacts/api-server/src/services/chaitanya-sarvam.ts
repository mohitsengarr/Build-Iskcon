/**
 * Chaitanya Charitamrit OCR pipeline.
 *
 * Sister to bhagwatham-sarvam.ts but built for a different shape of input:
 * Bhagavatam is one giant PDF processed in 25-page batches; Chaitanya is
 * 18 separate per-chapter PDFs (Adi-lila Introduction + Chapters 1-17,
 * with Madhya-lila and Antya-lila to come). One cron tick = one chapter.
 *
 * State lives in the Supabase `chaitanya_chapters` table — column
 * `ocr_status` cycles `queued → processing → ready` (or `failed`). The
 * batch JSON output per chapter is written to
 * `data/chaitanya/batches/{global_number}.json` so the reader UI can
 * fetch it via `/api/chaitanya/batch/:n`.
 *
 * The actual Sarvam Document Digitization REST flow is identical to
 * bhagwatham-sarvam.ts (`ocrSinglePageSarvam`); to avoid a sweeping
 * refactor it's copied here verbatim. TODO: extract into a shared
 * `services/_sarvam-client.ts` and use from both books.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { logger } from "../lib/logger";
import { reportAIFailure } from "./ai-credit-monitor";
import { DATA_DIR as ROOT_DATA_DIR } from "../lib/repo-root";

const DATA_DIR = path.join(ROOT_DATA_DIR, "chaitanya");
const PDF_DIR = path.join(DATA_DIR, "pdfs");
const BATCHES_DIR = path.join(DATA_DIR, "batches");

if (!fs.existsSync(BATCHES_DIR)) fs.mkdirSync(BATCHES_DIR, { recursive: true });

// ── Types (kept shape-compatible with bhagwatham-sarvam) ─────────────────────

export interface ChaitanyaPageContent {
  pageNumber: number;
  text: string;
}

export interface ChaitanyaBatchData {
  chapterGlobalNumber: number;
  chapterPart: string;
  chapterInPart: number;
  chapterTitle: string;
  pageCount: number;
  processedAt: string;
  pages: ChaitanyaPageContent[];
}

export interface ChaitanyaProgress {
  total: number;
  queued: number;
  processing: number;
  ready: number;
  failed: number;
  lastProcessedAt: string | null;
  lastProcessedTitle: string | null;
}

interface ChapterRow {
  global_number: number;
  part: string;
  number_in_part: number;
  title: string;
  pdf_path: string | null;
  ocr_status: string;
}

// ── Supabase REST helpers (no @supabase/supabase-js dependency) ──────────────

function supaUrl(): string {
  const u = process.env.SUPABASE_URL || "";
  if (!u) throw new Error("SUPABASE_URL not set");
  return u;
}

function supaKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY not set");
  return k;
}

async function supaRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: supaKey(),
    Authorization: `Bearer ${supaKey()}`,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  return fetch(`${supaUrl()}/rest/v1/${path}`, { ...init, headers });
}

async function getChapterByStatus(status: string, excludeGlobals: number[] = []): Promise<ChapterRow | null> {
  const exclude = excludeGlobals.length > 0 ? `&global_number=not.in.(${excludeGlobals.join(",")})` : "";
  const res = await supaRequest(
    `chaitanya_chapters?ocr_status=eq.${status}${exclude}&order=global_number.asc&limit=1&select=*`,
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as ChapterRow[];
  return rows[0] || null;
}

async function setChapterStatus(globalNumber: number, ocr_status: string, extra: Partial<{ batch_number: number; page_number: number }> = {}): Promise<void> {
  const res = await supaRequest(`chaitanya_chapters?global_number=eq.${globalNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ ocr_status, ...extra }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`setChapterStatus(${globalNumber} → ${ocr_status}) failed: ${res.status} ${detail.substring(0, 200)}`);
  }
}

export async function getChaitanyaProgress(): Promise<ChaitanyaProgress> {
  const res = await supaRequest("chaitanya_chapters?select=ocr_status,title&order=global_number.asc");
  if (!res.ok) {
    return { total: 0, queued: 0, processing: 0, ready: 0, failed: 0, lastProcessedAt: null, lastProcessedTitle: null };
  }
  const rows = (await res.json()) as Array<{ ocr_status: string; title: string }>;
  const counts = { queued: 0, processing: 0, ready: 0, failed: 0 };
  let lastTitle: string | null = null;
  for (const r of rows) {
    if (r.ocr_status in counts) (counts as Record<string, number>)[r.ocr_status]++;
    if (r.ocr_status === "ready") lastTitle = r.title;
  }

  let lastProcessedAt: string | null = null;
  try {
    const files = fs.readdirSync(BATCHES_DIR).filter(f => f.endsWith(".json"));
    if (files.length > 0) {
      const newest = files
        .map(f => ({ f, m: fs.statSync(path.join(BATCHES_DIR, f)).mtimeMs }))
        .sort((a, b) => b.m - a.m)[0];
      lastProcessedAt = new Date(newest.m).toISOString();
    }
  } catch { /* batches dir empty */ }

  return { total: rows.length, ...counts, lastProcessedAt, lastProcessedTitle: lastTitle };
}

/** Best-effort: ALL chapters stuck in `processing` after a crash get reset (bulk). */
export async function recoverStaleChaitanyaProgress(): Promise<void> {
  try {
    const res = await supaRequest("chaitanya_chapters?ocr_status=eq.processing", {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ocr_status: "queued" }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Could not reset stale Chaitanya 'processing' chapters");
      return;
    }
    const rows = (await res.json()) as ChapterRow[];
    if (rows.length > 0) {
      logger.warn(
        { count: rows.length, chapters: rows.map(r => r.global_number) },
        "Recovered stale Chaitanya 'processing' chapters back to 'queued'",
      );
    }
  } catch (err) {
    logger.warn({ err }, "recoverStaleChaitanyaProgress failed");
  }
}

// ── Batch JSON helpers ────────────────────────────────────────────────────────

export function getChaitanyaBatch(globalNumber: number): ChaitanyaBatchData | null {
  const file = path.join(BATCHES_DIR, `${globalNumber}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf-8")) as ChaitanyaBatchData; }
  catch { return null; }
}

export function getAllChaitanyaBatches(): ChaitanyaBatchData[] {
  if (!fs.existsSync(BATCHES_DIR)) return [];
  const out: ChaitanyaBatchData[] = [];
  for (const f of fs.readdirSync(BATCHES_DIR)) {
    if (!f.endsWith(".json")) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(BATCHES_DIR, f), "utf-8")) as ChaitanyaBatchData); }
    catch { /* skip corrupt */ }
  }
  return out.sort((a, b) => a.chapterGlobalNumber - b.chapterGlobalNumber);
}

// ── PDF → Images ──────────────────────────────────────────────────────────────

function getTotalPages(pdfPath: string): number {
  // Some PDFs (e.g. Canon iR-ADV scanner output) embed binary bytes in
  // their metadata. Piping pdfinfo through `grep` makes grep treat the
  // stream as binary and skip line-matching entirely. Capture the full
  // pdfinfo output in JS and parse it as a string instead.
  try {
    const out = execSync(`pdfinfo "${pdfPath}" 2>/dev/null`, { encoding: "utf-8" });
    // Take the LAST match — scanner metadata can embed fake earlier "Pages:" lines.
    const matches = [...out.matchAll(/^Pages:\s+(\d+)/gm)];
    if (matches.length > 0) return parseInt(matches[matches.length - 1][1], 10) || 0;
    return 0;
  } catch { return 0; }
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
  execSync(
    `pdftoppm -f ${startPage} -l ${endPage} -r 200 -png "${pdfPath}" "${path.join(tmpDir, "page")}"`,
    { stdio: "pipe", timeout: 180_000 },
  );

  const images: PageImage[] = [];
  for (const f of fs.readdirSync(tmpDir)) {
    const m = f.match(/^page-(\d+)\.png$/);
    if (!m) continue;
    images.push({ pageNumber: parseInt(m[1], 10), imagePath: path.join(tmpDir, f) });
  }
  return images.sort((a, b) => a.pageNumber - b.pageNumber);
}

// ── Sarvam OCR (per-page) ─────────────────────────────────────────────────────
//
// Verbatim copy of ocrSinglePageSarvam from bhagwatham-sarvam.ts (the Sarvam
// REST flow is identical regardless of which book we're processing). Future
// refactor: extract to services/_sarvam-client.ts.

async function ocrSinglePageSarvam(imagePath: string, pageNumber: number, apiKey: string): Promise<string> {
  const baseUrl = "https://api.sarvam.ai";
  const apiPath = "/doc-digitization/job/v1";
  const headers = { "API-Subscription-Key": apiKey, "Content-Type": "application/json" };
  const SARVAM_MAX_RETRIES = 3;

  // 1) Create job
  let createRes: Response | null = null;
  for (let attempt = 1; attempt <= SARVAM_MAX_RETRIES; attempt++) {
    createRes = await fetch(`${baseUrl}${apiPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ job_parameters: { language_code: "hi-IN", output_format: "md" } }),
    });
    if (createRes.ok) break;
    const errText = await createRes.text();
    logger.warn({ pageNumber, attempt, status: createRes.status, errText }, "Sarvam create job failed, retrying");
    if (attempt < SARVAM_MAX_RETRIES) await new Promise(r => setTimeout(r, 3000 * attempt));
    else throw new Error(`Create job failed: ${createRes.status} ${errText}`);
  }
  if (!createRes || !createRes.ok) throw new Error("Create job: no response");
  const jobRaw = (await createRes.json()) as Record<string, unknown>;
  const jobId = (jobRaw.job_id || jobRaw.id || (jobRaw as any).job?.id) as string;
  if (!jobId) throw new Error(`No job_id in Sarvam response`);

  // 2) Get upload URL
  const inlineUploadLinks = (jobRaw.upload_links || jobRaw.upload_urls) as Array<{ upload_url: string }> | undefined;
  let uploadUrl: string | undefined;
  if (inlineUploadLinks?.[0]?.upload_url) {
    uploadUrl = inlineUploadLinks[0].upload_url;
  } else {
    const fileName = path.basename(imagePath);
    const uploadReq = await fetch(`${baseUrl}${apiPath}/upload-files`, {
      method: "POST", headers,
      body: JSON.stringify({ job_id: jobId, files: [fileName] }),
    });
    if (!uploadReq.ok) throw new Error(`Upload URL req failed: ${uploadReq.status}`);
    const uploadData = (await uploadReq.json()) as Record<string, unknown>;
    const uploadUrls = uploadData.upload_urls as Record<string, { file_url?: string; upload_url?: string }> | undefined;
    if (uploadUrls) {
      const entry = uploadUrls[fileName] || Object.values(uploadUrls)[0];
      uploadUrl = entry?.file_url || entry?.upload_url;
    }
  }
  if (!uploadUrl) throw new Error("No upload URL from Sarvam");

  // 3) Upload image
  const imageBuffer = fs.readFileSync(imagePath);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png", "x-ms-blob-type": "BlockBlob" },
    body: imageBuffer,
  });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

  // 4) Start processing
  const startRes = await fetch(`${baseUrl}${apiPath}/${jobId}/start`, { method: "POST", headers });
  if (!startRes.ok) throw new Error(`Start failed: ${startRes.status}`);

  // 5) Poll for completion (max 90s)
  let status = "Processing";
  for (let attempt = 0; attempt < 45; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`${baseUrl}${apiPath}/${jobId}/status`, { headers });
    if (!statusRes.ok) continue;
    const statusData = (await statusRes.json()) as Record<string, unknown>;
    status = (statusData.status || statusData.job_state || statusData.state || "unknown") as string;
    if (status === "Completed" || status === "completed") break;
    if (status === "Failed" || status === "failed") throw new Error("Sarvam job failed");
  }
  if (!/^[Cc]ompleted$/.test(status)) throw new Error(`Sarvam timed out: ${status}`);

  // 6) Download
  const dlRes = await fetch(`${baseUrl}${apiPath}/${jobId}/download-files`, { method: "POST", headers });
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
  const dlData = (await dlRes.json()) as Record<string, unknown>;

  let extractedText = "";
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
    if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(buf);
      for (const entry of zip.getEntries()) {
        if (entry.entryName.endsWith(".md") || entry.entryName.endsWith(".txt")) {
          extractedText += entry.getData().toString("utf-8");
        }
      }
    } else {
      extractedText += buf.toString("utf-8");
    }
  }

  return extractedText
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .trim();
}

// ── Main entry point: process one queued chapter ─────────────────────────────

export async function processNextChaitanyaChapter(): Promise<{ ok: boolean; chapter?: ChapterRow; pageCount?: number; message: string }> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return { ok: false, message: "SARVAM_API_KEY not set" };

  // Internal guard: refuse if any chapter is already mid-OCR. The atomic claim
  // below is the real protection; this keeps the route/cron from even trying.
  const progress = await getChaitanyaProgress();
  if (progress.processing > 0) {
    return { ok: false, message: "chapter already in progress" };
  }

  // Atomic claim: conditional PATCH (queued → processing) filtered on
  // ocr_status=eq.queued. If the returned representation is empty, another
  // worker claimed the row first — loop to the next queued chapter.
  let chapter: ChapterRow | null = null;
  const attempted: number[] = [];
  for (let i = 0; i < 25; i++) {
    const candidate = await getChapterByStatus("queued", attempted);
    if (!candidate) break;
    attempted.push(candidate.global_number);

    const claimRes = await supaRequest(
      `chaitanya_chapters?global_number=eq.${candidate.global_number}&ocr_status=eq.queued`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ ocr_status: "processing" }),
      },
    );
    if (!claimRes.ok) {
      logger.warn({ chapter: candidate.global_number, status: claimRes.status }, "Chaitanya claim PATCH failed — trying next chapter");
      continue;
    }
    const claimed = (await claimRes.json()) as ChapterRow[];
    if (claimed.length === 0) {
      logger.info({ chapter: candidate.global_number }, "Chaitanya chapter already claimed by another worker — trying next");
      continue;
    }
    chapter = claimed[0];
    break;
  }
  if (!chapter) {
    return { ok: true, message: attempted.length > 0 ? "nothing to claim" : "No queued chapters" };
  }

  logger.info({ chapter: chapter.global_number }, "Chaitanya OCR started");

  let tmpDir: string | null = null;
  try {
    if (!chapter.pdf_path) throw new Error("Chapter has no pdf_path");
    const pdfPath = path.join(PDF_DIR, chapter.pdf_path);
    if (!fs.existsSync(pdfPath)) throw new Error(`PDF missing: ${pdfPath}`);

    const totalPages = getTotalPages(pdfPath);
    if (totalPages <= 0) throw new Error(`pdfinfo returned 0 pages for ${pdfPath}`);

    // Per-run temp dir — a shared dir gets wiped by every concurrent run.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-ocr-"));
    const pageImages = convertPagesToImages(pdfPath, 1, totalPages, tmpDir);
    if (pageImages.length === 0) throw new Error("pdftoppm produced no images");

    const pages: ChaitanyaPageContent[] = [];
    for (const { pageNumber, imagePath } of pageImages) {
      try {
        const text = await ocrSinglePageSarvam(imagePath, pageNumber, apiKey);
        pages.push({ pageNumber, text });
        logger.info({ chapter: chapter.global_number, pageNumber, len: text.length }, "Chaitanya OCR page complete");
      } catch (err) {
        logger.error({ chapter: chapter.global_number, pageNumber, err }, "Chaitanya OCR page failed");
        reportAIFailure("Sarvam AI (Chaitanya)", (err as Error)?.message || "OCR failed");
        pages.push({ pageNumber, text: "" });
      }
    }

    // Empty-OCR guard: if more than half the pages came back blank, mark the
    // chapter failed instead of publishing a mostly-blank book as "ready".
    const emptyCount = pages.filter(p => !p.text || p.text.trim().length === 0).length;
    if (emptyCount * 2 > pages.length) {
      logger.warn(
        { chapter: chapter.global_number, emptyCount, pageCount: pages.length },
        "Chaitanya OCR: >50% of pages are empty — marking chapter failed, batch JSON NOT written",
      );
      await setChapterStatus(chapter.global_number, "failed");
      return { ok: false, chapter, pageCount: pages.length, message: `OCR mostly empty: ${emptyCount}/${pages.length} pages blank` };
    }

    const batch: ChaitanyaBatchData = {
      chapterGlobalNumber: chapter.global_number,
      chapterPart: chapter.part,
      chapterInPart: chapter.number_in_part,
      chapterTitle: chapter.title,
      pageCount: pages.length,
      processedAt: new Date().toISOString(),
      pages,
    };

    const outFile = path.join(BATCHES_DIR, `${chapter.global_number}.json`);
    fs.writeFileSync(outFile, JSON.stringify(batch, null, 2) + "\n");

    await setChapterStatus(chapter.global_number, "ready", {
      batch_number: chapter.global_number,
      page_number: 1,
    });

    logger.info({ chapter: chapter.global_number, pageCount: pages.length, outFile }, "Chaitanya OCR chapter complete");
    return { ok: true, chapter, pageCount: pages.length, message: `OCR complete: ${pages.length} pages` };
  } catch (err) {
    logger.error({ chapter: chapter.global_number, err }, "Chaitanya OCR chapter failed");
    // We only reach here after a successful claim, so marking failed is safe.
    // setChapterStatus throws on HTTP failure — don't mask the original error.
    try {
      await setChapterStatus(chapter.global_number, "failed");
    } catch (statusErr) {
      logger.error({ chapter: chapter.global_number, statusErr }, "Could not mark Chaitanya chapter failed");
    }
    return { ok: false, chapter, message: `OCR failed: ${(err as Error).message}` };
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}
