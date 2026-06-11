/**
 * Shlok Indexer Service
 *
 * Scans all OCR pages, extracts unique Sanskrit shloks with their
 * shabdarth, anuvad, tatparya, and stores them in Supabase with
 * occurrence counts, page references, and vector embeddings.
 *
 * Runs as a cron job — processes one batch per tick to avoid overload.
 */

import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";
import { DATA_DIR as ROOT_DATA_DIR } from "../lib/repo-root";

const DATA_DIR = path.join(ROOT_DATA_DIR, "bhagwatham");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const INDEX_STATE_FILE = path.join(DATA_DIR, "shlok-index-state.json");

function getSbUrl() { return process.env.SUPABASE_URL || ""; }
function getSbKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ""; }

function sbHeaders(prefer = "return=representation") {
  const key = getSbKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  };
}

// ── Skandh detection ────────────────────────────────────────────────────────

const SKANDH_RANGES = [
  { s: 1, p: 1 }, { s: 2, p: 874 }, { s: 3, p: 1399 }, { s: 4, p: 2617 },
  { s: 5, p: 3900 }, { s: 6, p: 4540 }, { s: 7, p: 5204 }, { s: 8, p: 5849 },
  { s: 9, p: 6373 }, { s: 10, p: 7080 }, { s: 11, p: 9059 }, { s: 12, p: 9500 },
];
const EXPECTED = [19, 10, 33, 31, 26, 19, 15, 24, 24, 90, 31, 13];

function getSkandh(pn: number) {
  for (let i = SKANDH_RANGES.length - 1; i >= 0; i--)
    if (pn >= SKANDH_RANGES[i].p) return SKANDH_RANGES[i].s;
  return 1;
}

// ── State tracking ──────────────────────────────────────────────────────────

interface IndexState {
  lastProcessedBatch: number;
  totalShloksIndexed: number;
  lastRunAt: string;
  status: "idle" | "running";
  startedAt?: string;     // when status flipped to "running" — for crash recovery
  lastChapterNum?: number; // C10: carry chapter number across pages/batches
}

// C8: a crash mid-batch leaves status="running" persisted forever, blocking
// all future indexer ticks. Treat a running state older than this as stale.
const STALE_RUNNING_MS = 30 * 60 * 1000;

function readState(): IndexState {
  if (fs.existsSync(INDEX_STATE_FILE)) {
    try { return JSON.parse(fs.readFileSync(INDEX_STATE_FILE, "utf-8")); }
    catch { /* corrupted */ }
  }
  return { lastProcessedBatch: 0, totalShloksIndexed: 0, lastRunAt: "", status: "idle" };
}

function writeState(state: IndexState) {
  fs.writeFileSync(INDEX_STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

// ── Shlok extraction from page text ─────────────────────────────────────────

interface ExtractedShlok {
  shlokText: string;
  verseNumber: number | null;
  shabdarth: string;
  anuvad: string;
  tatparya: string;
  pageNumber: number;
  canto: number;
  chapter: number;
  globalChapter: number;
}

const SECTION_FIELD_CAP = 2000; // C10: per-field accumulation cap (~2000 chars)

function extractShloksFromPage(
  text: string,
  pageNumber: number,
  startChapterNum = 0, // C10: chapter carried over from previous pages/batches
): { shloks: ExtractedShlok[]; lastChapterNum: number } {
  const canto = getSkandh(pageNumber);
  // C10: most pages have no chapter heading — start from the carried-over
  // chapter instead of defaulting everything to chapter 1.
  let chapterNum = startChapterNum;

  if (!text || text.length < 50) return { shloks: [], lastChapterNum: chapterNum };

  const lines = text.split("\n");
  const shloks: ExtractedShlok[] = [];

  let currentShlok: string[] = [];
  let currentVerseNum: number | null = null;
  let inShlok = false;
  let currentSection = "text"; // text, shlok, shabdarth, anuvad, tatparya

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;

    // Track chapter number
    const chMatch = t.match(/^(?:Chapter|अध्याय)\s+/iu);
    if (chMatch) {
      // Simple chapter detection — just increment
      const HINDI_NUMS: Record<string, number> = {
        एक:1,दो:2,तीन:3,चार:4,पाँच:5,छह:6,सात:7,आठ:8,नौ:9,दस:10,
        ग्यारह:11,बारह:12,तेरह:13,चौदह:14,पन्द्रह:15,सोलह:16,सत्रह:17,
        अठारह:18,उन्नीस:19,बीस:20,
      };
      for (const [w, n] of Object.entries(HINDI_NUMS)) {
        if (t.includes(w)) { chapterNum = n; break; }
      }
    }

    // Section markers
    if (/^तात्पर्य/u.test(t)) { currentSection = "tatparya"; continue; }
    if (/^अनुवाद/u.test(t)) { currentSection = "anuvad"; continue; }
    if (/^शब्दार्थ/u.test(t)) { currentSection = "shabdarth"; continue; }

    // Shlok detection: line contains ॥
    if (/॥/u.test(t)) {
      // Extract verse number
      const vMatch = t.match(/॥\s*([\d१२३४५६७८९०]+)\s*॥/u);
      if (vMatch) {
        const numStr = vMatch[1].replace(/[१२३४५६७८९०]/g, (c) => "०१२३४५६७८९".indexOf(c).toString());
        currentVerseNum = parseInt(numStr, 10) || null;
      }

      currentShlok.push(t);
      inShlok = false;

      // Flush the shlok
      if (currentShlok.length > 0) {
        const shlokText = currentShlok.join("\n").trim();
        if (shlokText.length > 10) {
          let offset = 0;
          for (let c = 0; c < canto - 1; c++) offset += EXPECTED[c];

          shloks.push({
            shlokText,
            verseNumber: currentVerseNum,
            shabdarth: "",
            anuvad: "",
            tatparya: "",
            pageNumber,
            canto,
            chapter: chapterNum || 1,
            globalChapter: offset + (chapterNum || 1),
          });
        }
        currentShlok = [];
        currentVerseNum = null;
      }
      currentSection = "post-shlok";
      continue;
    }

    // Accumulate shlok lines (Sanskrit-looking lines before ॥)
    const isSanskritLike = /[\u0900-\u097F]/.test(t) && t.length < 100 &&
      !/(है|हैं|था|थी|करता|होता)(?:\s|[।,]|$)/u.test(t);

    if (isSanskritLike && (currentSection === "text" || currentSection === "post-shlok" || inShlok)) {
      currentShlok.push(t);
      inShlok = true;
      continue;
    }

    // Accumulate section text for the last shlok.
    // C10: the old `!last.shabdarth` / `!last.anuvad` guards made multi-line
    // accumulation dead code — only the FIRST line of each section was ever
    // stored. Accumulate all lines, capped at ~2000 chars per field.
    if (shloks.length > 0) {
      const last = shloks[shloks.length - 1];
      if (currentSection === "shabdarth") {
        if (last.shabdarth.length < SECTION_FIELD_CAP) {
          last.shabdarth += (last.shabdarth ? "\n" : "") + t;
          if (last.shabdarth.length > SECTION_FIELD_CAP) last.shabdarth = last.shabdarth.substring(0, SECTION_FIELD_CAP);
        }
      } else if (currentSection === "anuvad") {
        if (last.anuvad.length < SECTION_FIELD_CAP) {
          last.anuvad += (last.anuvad ? "\n" : "") + t;
          if (last.anuvad.length > SECTION_FIELD_CAP) last.anuvad = last.anuvad.substring(0, SECTION_FIELD_CAP);
        }
      } else if (currentSection === "tatparya") {
        if (last.tatparya.length < SECTION_FIELD_CAP) {
          last.tatparya += (last.tatparya ? "\n" : "") + t;
          if (last.tatparya.length > SECTION_FIELD_CAP) last.tatparya = last.tatparya.substring(0, SECTION_FIELD_CAP);
        }
      }
    }

    if (!inShlok) currentShlok = [];
  }

  return { shloks, lastChapterNum: chapterNum };
}

// ── Normalize shlok text for dedup ──────────────────────────────────────────

function normalizeShlok(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[।॥\d१२३४५६७८९०\s]/g, "")
    .trim()
    .toLowerCase();
}

// ── Upsert shlok to Supabase ────────────────────────────────────────────────

async function upsertShlok(shlok: ExtractedShlok): Promise<"inserted" | "updated" | "skipped"> {
  const normalized = normalizeShlok(shlok.shlokText);
  if (normalized.length < 5) return "skipped";

  // Check if exists
  const checkUrl = `${getSbUrl()}/rest/v1/shlok_dictionary?shlok_text_normalized=eq.${encodeURIComponent(normalized)}&book=eq.bhagavatam&select=id,occurrence_count,page_numbers`;
  const checkRes = await fetch(checkUrl, { headers: sbHeaders() });
  const existing = await checkRes.json();

  if (Array.isArray(existing) && existing.length > 0) {
    const row = existing[0];
    const pageNums: number[] = row.page_numbers || [];
    if (!pageNums.includes(shlok.pageNumber)) {
      pageNums.push(shlok.pageNumber);
      // Update occurrence count and page list
      await fetch(`${getSbUrl()}/rest/v1/shlok_dictionary?id=eq.${row.id}`, {
        method: "PATCH",
        headers: sbHeaders(),
        body: JSON.stringify({
          occurrence_count: (row.occurrence_count || 1) + 1,
          page_numbers: pageNums,
          updated_at: new Date().toISOString(),
        }),
      });

      // Add reference
      await fetch(`${getSbUrl()}/rest/v1/shlok_references`, {
        method: "POST",
        headers: sbHeaders("return=minimal"),
        body: JSON.stringify({
          shlok_id: row.id,
          book: "bhagavatam",
          page_number: shlok.pageNumber,
          canto: shlok.canto,
          chapter: shlok.chapter,
        }),
      });

      return "updated";
    }
    return "skipped";
  }

  // Insert new
  const insertRes = await fetch(`${getSbUrl()}/rest/v1/shlok_dictionary`, {
    method: "POST",
    headers: sbHeaders("return=representation"),
    body: JSON.stringify({
      shlok_text: shlok.shlokText,
      shlok_text_normalized: normalized,
      book: "bhagavatam",
      canto: shlok.canto,
      chapter: shlok.chapter,
      verse_number: shlok.verseNumber,
      global_chapter: shlok.globalChapter,
      page_number: shlok.pageNumber,
      page_numbers: [shlok.pageNumber],
      shabdarth: shlok.shabdarth || null,
      anuvad: shlok.anuvad || null,
      tatparya_snippet: shlok.tatparya?.substring(0, 500) || null,
      occurrence_count: 1,
    }),
  });

  if (!insertRes.ok) {
    const err = await insertRes.text();
    if (err.includes("duplicate") || err.includes("unique")) return "skipped";
    logger.warn({ err, shlok: shlok.shlokText.substring(0, 50) }, "Shlok insert failed");
    return "skipped";
  }

  // Add first reference
  const inserted: any = await insertRes.json();
  const shlokId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
  if (shlokId) {
    await fetch(`${getSbUrl()}/rest/v1/shlok_references`, {
      method: "POST",
      headers: sbHeaders("return=minimal"),
      body: JSON.stringify({
        shlok_id: shlokId,
        book: "bhagavatam",
        page_number: shlok.pageNumber,
        canto: shlok.canto,
        chapter: shlok.chapter,
      }),
    });
  }

  return "inserted";
}

// ── Main indexer function (processes one batch per call) ─────────────────────

export async function indexNextBatch(): Promise<{
  batchNumber: number;
  shloksFound: number;
  inserted: number;
  updated: number;
  message: string;
}> {
  const state = readState();
  if (state.status === "running") {
    // C8: crash recovery — a persisted "running" older than 30 min is stale.
    if (!state.startedAt) {
      // Legacy state without a timestamp: stamp it now so the stale clock starts.
      state.startedAt = new Date().toISOString();
      writeState(state);
      return { batchNumber: 0, shloksFound: 0, inserted: 0, updated: 0, message: "Already running" };
    }
    const ageMs = Date.now() - new Date(state.startedAt).getTime();
    if (ageMs < STALE_RUNNING_MS) {
      return { batchNumber: 0, shloksFound: 0, inserted: 0, updated: 0, message: "Already running" };
    }
    logger.warn({ startedAt: state.startedAt }, "Shlok indexer stuck in 'running' >30min — resetting (crash recovery)");
  }

  if (!getSbUrl() || !getSbKey()) {
    return { batchNumber: 0, shloksFound: 0, inserted: 0, updated: 0, message: "Supabase not configured" };
  }

  state.status = "running";
  state.startedAt = new Date().toISOString();
  writeState(state);

  try {
    const batchFiles = fs.readdirSync(PAGES_DIR)
      .filter(f => f.startsWith("batch-") && f.endsWith(".json"))
      .sort();

    const nextBatch = state.lastProcessedBatch + 1;
    if (nextBatch > batchFiles.length) {
      state.status = "idle";
      writeState(state);
      return { batchNumber: 0, shloksFound: 0, inserted: 0, updated: 0, message: "All batches indexed" };
    }

    const batchFile = batchFiles[nextBatch - 1];
    const batch = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, batchFile), "utf-8"));

    let totalShloks = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    // C10: carry the current chapter number across pages (and across batches
    // via persisted state) — most pages have no heading line.
    let chapterCursor = state.lastChapterNum || 0;

    for (const page of batch.pages) {
      if (!page.text || page.text.length < 50) continue;

      const { shloks, lastChapterNum } = extractShloksFromPage(page.text, page.pageNumber, chapterCursor);
      chapterCursor = lastChapterNum;
      totalShloks += shloks.length;

      for (const shlok of shloks) {
        try {
          const result = await upsertShlok(shlok);
          if (result === "inserted") totalInserted++;
          else if (result === "updated") totalUpdated++;
        } catch (shlokErr: any) {
          logger.warn({ pageNumber: shlok.pageNumber, err: shlokErr?.message?.substring(0, 100) }, "Shlok upsert failed, skipping");
        }
      }
    }

    state.lastProcessedBatch = nextBatch;
    state.totalShloksIndexed += totalInserted;
    state.lastRunAt = new Date().toISOString();
    state.lastChapterNum = chapterCursor; // C10: persist chapter carry for next batch
    state.status = "idle";
    writeState(state);

    logger.info({
      batch: nextBatch, shloks: totalShloks,
      inserted: totalInserted, updated: totalUpdated,
    }, "Shlok indexer: batch processed");

    return {
      batchNumber: nextBatch,
      shloksFound: totalShloks,
      inserted: totalInserted,
      updated: totalUpdated,
      message: `Batch ${nextBatch}: ${totalShloks} shloks found, ${totalInserted} new, ${totalUpdated} updated`,
    };
  } catch (err: any) {
    state.status = "idle";
    writeState(state);
    logger.error({ err }, "Shlok indexer failed");
    return { batchNumber: 0, shloksFound: 0, inserted: 0, updated: 0, message: err.message };
  }
}

export function getIndexState(): IndexState {
  return readState();
}

export function resetIndex(): void {
  writeState({ lastProcessedBatch: 0, totalShloksIndexed: 0, lastRunAt: "", status: "idle" });
}
