/**
 * Bhagwatham Audit Service
 *
 * Goes back through all already-processed chapters in reverse and verifies:
 *   1. Images exist on disk and are valid (>10KB)
 *   2. descriptionHi is populated for every image
 *   3. Chapter headings are detected correctly (no OCR-mangled titles)
 *   4. Missing chapters (8, 9, etc.) get images regenerated
 *   5. Shlok detection sanity check — ensures chapter content has verse markers
 *
 * Runs as a cron job, processing one chapter per tick to avoid overloading APIs.
 */

import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";
import {
  type ChapterImage,
  type ImageManifest,
  generateChapterImages,
  generateAdditionalScene,
  regenerateChapterImages,
  getPersonaVersions,
  withManifestLock,
} from "./bhagwatham-image-gen";
import { REPO_ROOT, DATA_DIR as ROOT_DATA_DIR } from "../lib/repo-root";
import { gitWithRetry } from "../lib/git-retry";

const DATA_DIR = path.join(ROOT_DATA_DIR, "bhagwatham");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const MANIFEST_FILE = path.join(IMAGES_DIR, "manifest.json");
const AUDIT_PROGRESS_FILE = path.join(DATA_DIR, "audit-progress.json");
const BACKFILL_FAILURES_FILE = path.join(DATA_DIR, "backfill-failures.json");

// ── Audit progress tracking ─────────────────────────────────────────────────

interface AuditProgress {
  lastAuditedChapter: number; // counts down from max chapter
  totalIssuesFixed: number;
  lastRunAt: string;
  status: "idle" | "running";
  startedAt?: string; // when status flipped to "running" — used for crash recovery
  log: AuditLogEntry[];
}

// C8: a crash mid-pass leaves status="running" persisted forever, blocking all
// future audit ticks. Treat a running state older than this as stale.
const STALE_RUNNING_MS = 30 * 60 * 1000;

interface AuditLogEntry {
  chapter: number;
  timestamp: string;
  issues: string[];
  fixes: string[];
}

function readAuditProgress(): AuditProgress {
  if (!fs.existsSync(AUDIT_PROGRESS_FILE)) {
    return {
      lastAuditedChapter: 999, // start from highest, count down
      totalIssuesFixed: 0,
      lastRunAt: "",
      status: "idle",
      log: [],
    };
  }
  return JSON.parse(fs.readFileSync(AUDIT_PROGRESS_FILE, "utf-8"));
}

function writeAuditProgress(progress: AuditProgress): void {
  fs.writeFileSync(AUDIT_PROGRESS_FILE, JSON.stringify(progress, null, 2) + "\n");
}

// ── Manifest helpers ────────────────────────────────────────────────────────

function readManifest(): ImageManifest {
  if (!fs.existsSync(MANIFEST_FILE)) return { images: [], lastUpdated: new Date().toISOString() };
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8"));
}

function writeManifest(manifest: ImageManifest): void {
  manifest.lastUpdated = new Date().toISOString();
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
}

// ── Batch/page helpers ──────────────────────────────────────────────────────

interface PageContent {
  pageNumber: number;
  text: string;
  textEn?: string;
}

interface BatchData {
  batchNumber: number;
  startPage: number;
  endPage: number;
  pages: PageContent[];
}

function loadAllBatches(): BatchData[] {
  if (!fs.existsSync(PAGES_DIR)) return [];
  const files = fs
    .readdirSync(PAGES_DIR)
    .filter((f) => f.startsWith("batch-") && f.endsWith(".json"))
    .sort();
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(PAGES_DIR, f), "utf-8")));
}

// ── Full Hindi number map (matches bhagwatham-utils.ts) ─────────────────────
const HINDI_NUMS: Record<string, number> = {
  एक:1,दो:2,तीन:3,चार:4,पाँच:5,पांच:5,छः:6,छह:6,सात:7,आठ:8,नौ:9,दस:10,
  ग्यारह:11,बारह:12,तेरह:13,चौदह:14,पन्द्रह:15,पंद्रह:15,सोलह:16,सत्रह:17,
  अठारह:18,उन्नीस:19,बीस:20,इक्कीस:21,बाईस:22,तेईस:23,चौबीस:24,पच्चीस:25,
  छब्बीस:26,सत्ताईस:27,सताईस:27,अट्ठाईस:28,उनतीस:29,उन्तीस:29,तीस:30,
  इकतीस:31,बत्तीस:32,तैंतीस:33,चौंतीस:34,पैंतीस:35,छत्तीस:36,
  सैंतीस:37,अड़तीस:38,उनतालीस:39,चालीस:40,इकतालीस:41,बयालीस:42,तैंतालीस:43,
  चवालीस:44,पैंतालीस:45,छियालीस:46,छियालिस:46,सैंतालीस:47,अड़तालीस:48,
  उनचास:49,पचास:50,इक्यावन:51,बावन:52,तिरपन:53,चौवन:54,पचपन:55,छप्पन:56,
  सत्तावन:57,अट्ठावन:58,उनसठ:59,साठ:60,इकसठ:61,बासठ:62,तिरसठ:63,चौंसठ:64,
  पैंसठ:65,छियासठ:66,सतसठ:67,सड़सठ:67,अड़सठ:68,उनहत्तर:69,सत्तर:70,
  इकहत्तर:71,बहत्तर:72,तिहत्तर:73,चौहत्तर:74,पचहत्तर:75,छिहत्तर:76,सतहत्तर:77,
  अठहत्तर:78,उन्यासी:79,उनासी:79,अस्सी:80,इक्यासी:81,बयासी:82,तिरासी:83,
  चौरासी:84,पिचासी:85,पचासी:85,छियासी:86,सत्तासी:87,अट्ठासी:88,नवासी:89,नब्बे:90,
  // OCR variants
  तेइस:23,छियलीस:46,पचीस:25,सत्ताइस:27,
};

const OCR_CHAPTER_FIXES: Record<string, number> = {
  "Chapter 278 अध्याय": 8, "Chapter it": 9, "(शुषा दो": 2, "Chapter 3:": 6,
  "(नौ": 9, "Chapter 36": 8, "Chapter छ:": 6, "छल्नीस": 26, "अदुईस": 28,
  "Chapter इक्तीस": 21,
};

const CHAPTER_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))\s*$/iu;

const SKANDH_PAGE_RANGES = [
  { s: 1, p: 1 }, { s: 2, p: 874 }, { s: 3, p: 1399 }, { s: 4, p: 2617 },
  { s: 5, p: 3900 }, { s: 6, p: 4540 }, { s: 7, p: 5204 }, { s: 8, p: 5849 },
  { s: 9, p: 6373 }, { s: 10, p: 7080 }, { s: 11, p: 9059 }, { s: 12, p: 9500 },
];

function getSkandh(pageNum: number): number {
  for (let i = SKANDH_PAGE_RANGES.length - 1; i >= 0; i--) {
    if (pageNum >= SKANDH_PAGE_RANGES[i].p) return SKANDH_PAGE_RANGES[i].s;
  }
  return 1;
}

function extractChapterNum(line: string): number {
  for (const [key, num] of Object.entries(OCR_CHAPTER_FIXES)) {
    if (line.includes(key)) return num;
  }
  const after = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
  if (after && HINDI_NUMS[after] !== undefined) return HINDI_NUMS[after];
  for (const [w, n] of Object.entries(HINDI_NUMS)) {
    if (line.includes(w)) return n;
  }
  const m = line.match(/\d+/);
  if (m) { const n = parseInt(m[0]); if (n > 0 && n <= 500) return n; }
  return 0;
}

function isChapterHeadingAudit(t: string): boolean {
  const cleaned = t.replace(/^\d+\s+/, "");
  if (cleaned.length > 60) return false;
  if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
  if (CHAPTER_RE.test(cleaned)) return true;
  for (const key of Object.keys(OCR_CHAPTER_FIXES)) {
    if (cleaned.includes(key) || t.includes(key)) return true;
  }
  return false;
}

/** Find all chapter headings across all batches — uses skandh-aware detection matching frontend logic */
function findChaptersInBatches(batches: BatchData[]): Map<number, { title: string; contentSnippet: string; pageNumber: number; skandh: number }> {
  const allPages = batches.flatMap(b => b.pages).filter(p => p.text && p.text.length >= 20);
  const chapters: Array<{ number: number; skandh: number; title: string; pageNumber: number }> = [];
  const lastChapterPerSkandh = new Map<number, number>();

  for (const page of allPages) {
    const skandh = getSkandh(page.pageNumber);
    const lines = page.text.split("\n");
    const headingCount = lines.filter(l => isChapterHeadingAudit(l.trim())).length;
    if (headingCount >= 2) continue; // TOC page

    for (const line of lines) {
      const t = line.trim();
      if (!isChapterHeadingAudit(t)) continue;
      const num = extractChapterNum(t);
      if (num <= 0) continue;

      const lastNum = lastChapterPerSkandh.get(skandh) ?? 0;
      if (num < lastNum && lastNum > 2) continue;
      if (chapters.find(c => c.number === num && c.skandh === skandh)) continue;

      lastChapterPerSkandh.set(skandh, num);
      chapters.push({ number: num, skandh, title: t.substring(0, 60), pageNumber: page.pageNumber });
    }
  }

  chapters.sort((a, b) => a.skandh !== b.skandh ? a.skandh - b.skandh : a.number - b.number);

  // Build global chapter numbers and return as Map
  const EXPECTED_PER_CANTO = [19, 10, 33, 31, 26, 19, 15, 24, 24, 90, 31, 13];
  const result = new Map<number, { title: string; contentSnippet: string; pageNumber: number; skandh: number }>();

  let globalNum = 0;
  for (const ch of chapters) {
    // Compute global number = sum of expected chapters in prior cantos + per-canto number
    let offset = 0;
    for (let i = 0; i < ch.skandh - 1; i++) offset += EXPECTED_PER_CANTO[i];
    globalNum = offset + ch.number;

    // Get content snippet for image generation
    const pageIdx = allPages.findIndex(p => p.pageNumber === ch.pageNumber);
    const remainingPages = allPages.slice(pageIdx, pageIdx + 5);
    const contentSnippet = remainingPages.map(p => p.text).join("\n").substring(0, 1500);

    result.set(globalNum, { title: ch.title, contentSnippet, pageNumber: ch.pageNumber, skandh: ch.skandh });
  }

  return result;
}

// ── descriptionHi generation via Sarvam Translate ───────────────────────────

async function generateDescriptionHi(chapterNum: number, chapterTitle: string, contentSnippet: string): Promise<string | null> {
  // Extract a meaningful Hindi sentence from the content for description
  const hindiLines = contentSnippet
    .split(/[।\n]/)
    .map((l) => l.trim())
    .filter((l) => {
      const devCount = (l.match(/[\u0900-\u097F]/gu) || []).length;
      return l.length > 20 && l.length < 200 && devCount / Math.max(l.replace(/\s/g, "").length, 1) > 0.7;
    });

  if (hindiLines.length > 0) {
    // Pick the first 2 meaningful Hindi lines as description
    const desc = hindiLines.slice(0, 2).join("। ") + "।";
    return desc.length > 200 ? desc.slice(0, 197) + "…" : desc;
  }

  // Fallback: use chapter title in Hindi
  const hindiTitle = chapterTitle.replace(/^Chapter\s*/i, "अध्याय ");
  if (/[\u0900-\u097F]/.test(hindiTitle)) return hindiTitle;

  return null;
}

// ── Shlok detection + BBT section structure check ──────────────────────────

/**
 * Validates BBT print-style section structure using lang-detect classifier.
 *
 * BBT Bhagavatam structure (per verse):
 *   1. Shlok (Sanskrit verse) → blue, bold
 *   2. Shabdarth (word-for-word meanings) → pink/magenta, centered, bold after dashes
 *   3. Anuvad (Hindi translation) → bold black, indented
 *   4. Tatparya (commentary by Prabhupada) → green, semibold, italic prefix
 *
 * This check validates that these sections are present and that Sanskrit/Hindi
 * separation is working correctly using the lang-detect classifier.
 */
function checkShlokDetection(contentSnippet: string): {
  hasShloks: boolean;
  shlokCount: number;
  sectionCounts: { shlok: number; shabdarth: number; anuvad: number; tatparya: number };
  langStats: { hindi: number; sanskrit: number; mixed: number; uncertain: number };
  issues: string[];
} {
  const issues: string[] = [];

  // ── Marker-based section detection (fast, reliable) ──
  const shlokMarkers = (contentSnippet.match(/॥/gu) || []).length;
  const shabdarthMarkers = (contentSnippet.match(/शब्दार्थ/gu) || []).length;
  const anuvadMarkers = (contentSnippet.match(/अनुवाद/gu) || []).length;
  const tatparyaMarkers = (contentSnippet.match(/तात्पर्य/gu) || []).length;

  const sectionCounts = {
    shlok: shlokMarkers,
    shabdarth: shabdarthMarkers,
    anuvad: anuvadMarkers,
    tatparya: tatparyaMarkers,
  };

  // ── Lang-detect based Hindi/Sanskrit classification ──
  // Lazy-import to avoid circular deps — this is loaded from @workspace/lang-detect
  let langStats = { hindi: 0, sanskrit: 0, mixed: 0, uncertain: 0 };
  try {
    // Use the simple rule-based detection (same signals as lang-detect classifier)
    const lines = contentSnippet.split("\n").filter(l => l.trim().length > 10);
    for (const line of lines) {
      const trimmed = line.trim();
      // Hindi postpositions (negative Sanskrit signal)
      const hindiPostpositions = ["में", "से", "को", "पर", "ने", "के", "की", "का"];
      const hindiPPCount = hindiPostpositions.filter(pp => trimmed.includes(pp)).length;
      // Hindi verbs
      const hindiVerbs = ["है", "हैं", "था", "थी", "थे", "होता", "करता", "गया", "किया"];
      const hindiVerbCount = trimmed.split(/\s+/).filter(w => hindiVerbs.includes(w)).length;
      // Sanskrit signals
      const visargaCount = (trimmed.match(/ः/gu) || []).length;
      const verseEndCount = (trimmed.match(/॥/gu) || []).length;

      const hasStrongHindi = hindiPPCount >= 2 || (hindiPPCount >= 1 && hindiVerbCount >= 1);
      const hasStrongSanskrit = visargaCount >= 1 || verseEndCount >= 1;

      if (hasStrongHindi && hasStrongSanskrit) langStats.mixed++;
      else if (hasStrongHindi) langStats.hindi++;
      else if (hasStrongSanskrit) langStats.sanskrit++;
      else langStats.uncertain++;
    }
  } catch { /* non-critical, continue without lang stats */ }

  // ── BBT structure validation ──
  if (shlokMarkers === 0) {
    issues.push("No shlok markers (॥) found — chapter may have OCR issues");
  }

  if (shlokMarkers > 0 && shabdarthMarkers === 0 && tatparyaMarkers === 0) {
    issues.push("Shloks found but no शब्दार्थ or तात्पर्य sections — BBT structure incomplete");
  }

  if (shlokMarkers > 0 && shabdarthMarkers > 0 && tatparyaMarkers === 0) {
    issues.push("Shloks + शब्दार्थ present but no तात्पर्य — Prabhupada commentary may be missing");
  }

  // Sanity: tatparya should roughly match or exceed shlok count (most verses have commentary)
  if (tatparyaMarkers > 0 && shlokMarkers > 0 && tatparyaMarkers < shlokMarkers * 0.3) {
    issues.push(`Low तात्पर्य count (${tatparyaMarkers}) vs shloks (${shlokMarkers}) — some commentaries may be missed`);
  }

  // Language separation check: a typical Bhagavatam chapter should have both Hindi and Sanskrit
  if (langStats.hindi === 0 && langStats.sanskrit > 0) {
    issues.push("Only Sanskrit detected, no Hindi commentary — possible page range issue");
  }
  if (langStats.sanskrit === 0 && langStats.hindi > 0 && shlokMarkers > 0) {
    issues.push("Shlok markers found but lang-detect found no Sanskrit lines — ॥ markers may be in Hindi text");
  }

  return { hasShloks: shlokMarkers > 0, shlokCount: shlokMarkers, sectionCounts, langStats, issues };
}

// ── Main audit function ─────────────────────────────────────────────────────

export async function runAuditPass(): Promise<{ chaptersAudited: number; issuesFound: number; issuesFixed: number; message: string }> {
  const auditProgress = readAuditProgress();

  if (auditProgress.status === "running") {
    // C8: crash recovery — a persisted "running" older than 30 min is stale.
    if (!auditProgress.startedAt) {
      // Legacy state without a timestamp: stamp it now so the stale clock starts.
      auditProgress.startedAt = new Date().toISOString();
      writeAuditProgress(auditProgress);
      return { chaptersAudited: 0, issuesFound: 0, issuesFixed: 0, message: "Audit already running" };
    }
    const ageMs = Date.now() - new Date(auditProgress.startedAt).getTime();
    if (ageMs < STALE_RUNNING_MS) {
      return { chaptersAudited: 0, issuesFound: 0, issuesFixed: 0, message: "Audit already running" };
    }
    logger.warn({ startedAt: auditProgress.startedAt }, "Audit stuck in 'running' >30min — resetting (crash recovery)");
  }

  auditProgress.status = "running";
  auditProgress.startedAt = new Date().toISOString();
  writeAuditProgress(auditProgress);

  try {
    const batches = loadAllBatches();
    if (batches.length === 0) {
      auditProgress.status = "idle";
      writeAuditProgress(auditProgress);
      return { chaptersAudited: 0, issuesFound: 0, issuesFixed: 0, message: "No batches to audit" };
    }

    const chapters = findChaptersInBatches(batches);
    const manifest = readManifest();
    const sortedChapters = Array.from(chapters.keys()).sort((a, b) => b - a); // reverse order

    // Count images per chapter
    const imageCountPerChapter = new Map<number, number>();
    for (const img of manifest.images) {
      imageCountPerChapter.set(img.chapterNumber, (imageCountPerChapter.get(img.chapterNumber) || 0) + 1);
    }

    // PRIORITY 1: chapters with 0 images (highest global number first)
    const chaptersWithoutImages = sortedChapters.filter(ch => !imageCountPerChapter.has(ch));
    // COST: PRIORITY 2 (generating 2nd scene for chapters with 1 image) disabled —
    // one image per chapter is sufficient. Saved ~300+ Claude+FLUX calls.
    const chaptersNeedingMore: number[] = [];

    let targetChapter: number | null = null;
    const needsAdditionalScene = false;

    if (chaptersWithoutImages.length > 0) {
      targetChapter = chaptersWithoutImages[0];
      logger.info({ targetChapter, missingCount: chaptersWithoutImages.length }, "Audit: prioritizing chapter without images");
    } else if (chaptersNeedingMore.length > 0) {
      targetChapter = chaptersNeedingMore[0];
      logger.info({ targetChapter, needMoreCount: chaptersNeedingMore.length }, "Audit: generating additional scene for chapter with 1 image");
    } else {
      // All chapters have 2+ images — fall back to reverse-order audit
      for (const ch of sortedChapters) {
        if (ch < auditProgress.lastAuditedChapter) {
          targetChapter = ch;
          break;
        }
      }
    }

    // If we've gone through all chapters, reset to start again
    if (targetChapter === null) {
      if (sortedChapters.length > 0) {
        auditProgress.lastAuditedChapter = 999;
        targetChapter = sortedChapters[0]; // highest chapter
      } else {
        auditProgress.status = "idle";
        writeAuditProgress(auditProgress);
        return { chaptersAudited: 0, issuesFound: 0, issuesFixed: 0, message: "No chapters found in batches" };
      }
    }

    const chapterInfo = chapters.get(targetChapter)!;
    const issues: string[] = [];
    const fixes: string[] = [];

    logger.info({ chapter: targetChapter, title: chapterInfo.title, additionalScene: needsAdditionalScene }, "Auditing chapter");

    // ── Check 1: Image files exist on disk ──────────────────────────────────
    const chapterImages = manifest.images.filter((img) => img.chapterNumber === targetChapter);

    if (chapterImages.length === 0) {
      issues.push("No images in manifest for this chapter");
      try {
        const generated = await generateChapterImages(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
        if (generated.length > 0) {
          fixes.push(`Generated ${generated.length} new image(s): ${generated.join(", ")}`);
        }
      } catch (err: any) {
        issues.push(`Failed to generate images: ${err?.message}`);
      }
    } else if (needsAdditionalScene) {
      // Chapter has 1 image — generate an additional scene with different content
      issues.push("Only 1 image — generating additional scene");
      try {
        const generated = await generateAdditionalScene(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
        if (generated.length > 0) {
          fixes.push(`Generated additional scene: ${generated.join(", ")}`);
        }
      } catch (err: any) {
        issues.push(`Failed to generate additional scene: ${err?.message}`);
      }
    } else {
      for (const img of chapterImages) {
        const imgPath = path.join(IMAGES_DIR, img.imagePath);
        if (!fs.existsSync(imgPath)) {
          issues.push(`Image file missing: ${img.imagePath}`);
          // Regenerate
          try {
            const generated = await generateChapterImages(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
            if (generated.length > 0) {
              fixes.push(`Regenerated missing image(s): ${generated.join(", ")}`);
            }
          } catch (err: any) {
            issues.push(`Failed to regenerate: ${err?.message}`);
          }
          break; // generateChapterImages handles all scenes
        } else {
          const stat = fs.statSync(imgPath);
          if (stat.size < 10_000) {
            issues.push(`Image too small (${stat.size} bytes): ${img.imagePath}`);
            fs.unlinkSync(imgPath);
            try {
              const generated = await generateChapterImages(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
              if (generated.length > 0) {
                fixes.push(`Regenerated broken image(s): ${generated.join(", ")}`);
              }
            } catch (err: any) {
              issues.push(`Failed to regenerate: ${err?.message}`);
            }
            break;
          }
        }
      }
    }

    // ── Check 2: descriptionHi populated ────────────────────────────────────
    // Re-read manifest in case it was updated by image generation
    const updatedManifest = readManifest();
    const updatedImages = updatedManifest.images.filter((img) => img.chapterNumber === targetChapter);
    let manifestDirty = false;
    // C1: record only the fields this audit changes so we can merge them into a
    // freshly-read manifest under the lock (instead of writing a stale snapshot).
    const fieldFixes = new Map<string, { descriptionHi?: string; chapterTitle?: string }>();
    const fixKey = (img: ChapterImage) => `${img.chapterNumber}:${img.sceneIndex ?? 0}`;

    for (const img of updatedImages) {
      if (!img.descriptionHi) {
        issues.push(`Missing descriptionHi for ${img.imagePath}`);
        const desc = await generateDescriptionHi(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
        if (desc) {
          img.descriptionHi = desc;
          fieldFixes.set(fixKey(img), { ...fieldFixes.get(fixKey(img)), descriptionHi: desc });
          manifestDirty = true;
          fixes.push(`Added descriptionHi for ${img.imagePath}: "${desc.slice(0, 60)}…"`);
        }
      }
    }

    // ── Check 3: Chapter title correctness ──────────────────────────────────
    for (const img of updatedImages) {
      // Ensure chapter title has Hindi
      if (!/[\u0900-\u097F]/.test(img.chapterTitle)) {
        issues.push(`Chapter title not in Hindi: "${img.chapterTitle}"`);
        if (/[\u0900-\u097F]/.test(chapterInfo.title)) {
          img.chapterTitle = chapterInfo.title;
          fieldFixes.set(fixKey(img), { ...fieldFixes.get(fixKey(img)), chapterTitle: chapterInfo.title });
          manifestDirty = true;
          fixes.push(`Fixed chapter title to: "${chapterInfo.title}"`);
        }
      }
    }

    // ── Check 4: Shlok detection sanity ─────────────────────────────────────
    // Get all page text for this chapter (from its start to the next chapter or batch end)
    const allText = batches.flatMap((b) => b.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const chapterStartIdx = allText.findIndex((p) => p.pageNumber === chapterInfo.pageNumber);
    if (chapterStartIdx >= 0) {
      // Get ~10 pages of content for this chapter
      const chapterPages = allText.slice(chapterStartIdx, chapterStartIdx + 10);
      const fullContent = chapterPages.map((p) => p.text).join("\n");
      const shlokCheck = checkShlokDetection(fullContent);
      if (shlokCheck.issues.length > 0) {
        issues.push(...shlokCheck.issues);
      }
      logger.info({
        chapter: targetChapter,
        shlokCount: shlokCheck.shlokCount,
        sections: shlokCheck.sectionCounts,
        langStats: shlokCheck.langStats,
      }, "BBT section structure + lang-detect check");
    }

    // ── Check 5: Prompt stored correctly (not enriched version) ─────────────
    for (const img of updatedImages) {
      // The prompt field should store the clean scene description, not the enriched one with persona
      if (img.prompt.includes(ART_STYLE_SNIPPET)) {
        issues.push(`Prompt contains art style (should be clean scene): ${img.imagePath}`);
        // Can't easily fix this without re-detecting the scene, so just log
      }
    }

    // ── Check 6: Persona version — regenerate if any used persona was enhanced ─
    const personaVersions = getPersonaVersions();
    let personaOutdated = false;
    for (const img of updatedImages) {
      if (img.personasUsed && img.personasUsed.length > 0) {
        const currentMax = Math.max(...img.personasUsed.map((k) => personaVersions.versions[k] || 1), 1);
        if ((img.personaVersion || 1) < currentMax) {
          issues.push(`Outdated persona version for ${img.imagePath}: image v${img.personaVersion || 1} < current v${currentMax} (personas: ${img.personasUsed.join(", ")})`);
          personaOutdated = true;
        }
      }
    }
    if (personaOutdated) {
      try {
        const generated = await regenerateChapterImages(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
        if (generated.files.length > 0) {
          fixes.push(`Regenerated ${generated.files.length} image(s) due to persona enhancement`);
        }
      } catch (err: any) {
        issues.push(`Failed to regenerate for persona update: ${err?.message}`);
      }
    }

    if (manifestDirty) {
      // C1: re-read the manifest just before writing and merge ONLY the fields
      // this audit changed, under the manifest lock. Writing the snapshot read
      // before the awaited regen above would clobber the regen's fresh entries.
      await withManifestLock(async () => {
        const fresh = readManifest();
        let merged = 0;
        for (const img of fresh.images) {
          const fix = fieldFixes.get(`${img.chapterNumber}:${img.sceneIndex ?? 0}`);
          if (!fix) continue;
          if (fix.descriptionHi && !img.descriptionHi) {
            img.descriptionHi = fix.descriptionHi;
            merged++;
          }
          if (fix.chapterTitle && !/[ऀ-ॿ]/.test(img.chapterTitle)) {
            img.chapterTitle = fix.chapterTitle;
            merged++;
          }
        }
        if (merged > 0) writeManifest(fresh);
      });
    }

    // ── Update audit progress ───────────────────────────────────────────────
    const logEntry: AuditLogEntry = {
      chapter: targetChapter,
      timestamp: new Date().toISOString(),
      issues,
      fixes,
    };

    auditProgress.lastAuditedChapter = targetChapter;
    auditProgress.totalIssuesFixed += fixes.length;
    auditProgress.lastRunAt = new Date().toISOString();
    auditProgress.status = "idle";
    // Keep last 50 log entries
    auditProgress.log = [logEntry, ...auditProgress.log].slice(0, 50);
    writeAuditProgress(auditProgress);

    const msg = issues.length === 0
      ? `Chapter ${targetChapter} — all checks passed`
      : `Chapter ${targetChapter} — ${issues.length} issue(s), ${fixes.length} fixed`;

    logger.info({ chapter: targetChapter, issues: issues.length, fixes: fixes.length }, msg);

    // Stage only — daily commit cron handles commit + push
    if (fixes.length > 0) {
      try {
        gitWithRetry("git add data/bhagwatham/images/ data/bhagwatham/audit-progress.json", { cwd: REPO_ROOT });
        logger.info({ chapter: targetChapter, fixes: fixes.length }, "Audit: changes staged (daily commit will push)");
      } catch (err) {
        logger.warn({ err }, "Audit: git stage failed — continuing");
      }
    }

    return {
      chaptersAudited: 1,
      issuesFound: issues.length,
      issuesFixed: fixes.length,
      message: msg,
    };
  } catch (err: any) {
    auditProgress.status = "idle";
    writeAuditProgress(auditProgress);
    logger.error({ err }, "Audit pass failed");
    throw err;
  }
}

// Snippet used to check if prompt was stored enriched
const ART_STYLE_SNIPPET = "Indian devotional calendar art";

export function getAuditProgress(): AuditProgress {
  return readAuditProgress();
}

// ── Fast parallel image backfill ───────────────────────────────────────────
// Generates images for multiple chapters in parallel to quickly fill gaps.
// Called by a dedicated cron every 2 minutes.

// C3: persisted per-chapter failure counts. A permanently-failing lowest
// chapter would otherwise sit at the head of the queue and block ALL backfill
// progress, retrying every tick forever.
interface BackfillFailures {
  counts: Record<string, number>; // global chapter number → consecutive failures
  lastUpdated: string;
}

const MAX_BACKFILL_FAILURES = 3;

function readBackfillFailures(): BackfillFailures {
  if (!fs.existsSync(BACKFILL_FAILURES_FILE)) return { counts: {}, lastUpdated: "" };
  try { return JSON.parse(fs.readFileSync(BACKFILL_FAILURES_FILE, "utf-8")); }
  catch { return { counts: {}, lastUpdated: "" }; }
}

function writeBackfillFailures(failures: BackfillFailures): void {
  failures.lastUpdated = new Date().toISOString();
  fs.writeFileSync(BACKFILL_FAILURES_FILE, JSON.stringify(failures, null, 2) + "\n");
}

let _fastBackfillRunning = false;

export async function fastImageBackfill(parallelCount = 3): Promise<{ generated: number; remaining: number }> {
  if (_fastBackfillRunning) return { generated: 0, remaining: -1 };
  _fastBackfillRunning = true;

  try {
    const batches = loadAllBatches();
    if (batches.length === 0) return { generated: 0, remaining: 0 };

    const chapters = findChaptersInBatches(batches);
    const manifest = readManifest();
    const hasImage = new Set(manifest.images.map(img => img.chapterNumber));

    // Find chapters without images, sorted by global number ascending (fill from beginning)
    const missingAll = Array.from(chapters.entries())
      .filter(([globalNum]) => !hasImage.has(globalNum))
      .sort((a, b) => a[0] - b[0]);

    // C3: park chapters that failed >= MAX_BACKFILL_FAILURES times so they stop
    // head-of-line blocking everything behind them.
    const failures = readBackfillFailures();
    const failCount = (globalNum: number) => failures.counts[String(globalNum)] || 0;
    const parked = missingAll.filter(([globalNum]) => failCount(globalNum) >= MAX_BACKFILL_FAILURES);
    const missing = missingAll.filter(([globalNum]) => failCount(globalNum) < MAX_BACKFILL_FAILURES);

    if (parked.length > 0) {
      logger.info(
        { parkedCount: parked.length, parkedChapters: parked.map(([n]) => n) },
        "Fast backfill: skipping chapters parked after repeated failures"
      );
    }

    if (missing.length === 0) return { generated: 0, remaining: 0 };

    // Take up to parallelCount chapters and generate in parallel
    const batch = missing.slice(0, parallelCount);
    const results = await Promise.allSettled(
      batch.map(async ([globalNum, info]) => {
        try {
          const files = await generateChapterImages(globalNum, info.title, info.contentSnippet);
          if (files.length > 0) {
            // Success — reset this chapter's failure count
            if (failures.counts[String(globalNum)]) delete failures.counts[String(globalNum)];
            logger.info({ chapter: globalNum, files: files.length, title: info.title }, "Fast backfill: generated image");
            return true;
          }
          failures.counts[String(globalNum)] = failCount(globalNum) + 1;
        } catch (err) {
          failures.counts[String(globalNum)] = failCount(globalNum) + 1;
          logger.warn({ err, chapter: globalNum, failCount: failures.counts[String(globalNum)] }, "Fast backfill: generation failed");
        }
        return false;
      })
    );

    writeBackfillFailures(failures);

    const generated = results.filter(r => r.status === "fulfilled" && r.value).length;

    // Stage only — daily commit cron handles commit + push
    if (generated > 0) {
      try {
        gitWithRetry("git add data/bhagwatham/images/", { cwd: REPO_ROOT });
        logger.info({ generated, chapters: batch.map(([n]) => n) }, "Fast backfill: changes staged (daily commit will push)");
      } catch { /* git errors non-fatal */ }
    }

    return { generated, remaining: missing.length - generated };
  } finally {
    _fastBackfillRunning = false;
  }
}

/**
 * C4: expose the audit's authoritative chapter map (skandh-aware, ToC-skipping,
 * OCR-fix-applying) keyed by GLOBAL chapter number — the same numbering the
 * image manifest uses. The regen queue uses this instead of a naive sequential
 * heading count, which drifted and fed the WRONG chapter's text into regens.
 */
export function getChapterMap(): Map<number, { title: string; contentSnippet: string; pageNumber: number; skandh: number }> {
  return findChaptersInBatches(loadAllBatches());
}

/** Reset audit to re-check all chapters from the beginning (highest chapter first) */
export function resetAudit(): void {
  const progress = readAuditProgress();
  progress.lastAuditedChapter = 999;
  progress.status = "idle";
  writeAuditProgress(progress);
}
