/**
 * Bhagavad Gita Audit Service
 *
 * Goes back through all already-processed chapters in reverse and verifies:
 *   1. Images exist on disk and are valid (>10KB)
 *   2. descriptionHi is populated for every image
 *   3. Chapter headings are detected correctly
 *   4. Missing chapters get images regenerated
 *   5. Shlok detection sanity check — ensures chapter content has verse markers
 *
 * Simplified from bhagwatham-audit.ts:
 *   - No skandh/canto logic (Gita has 18 chapters, direct numbering)
 *   - Chapters 1-18 only, detected via "अध्याय" headings with Hindi numbers
 *   - Global chapter number = chapter number (no offset calculation)
 *
 * Runs as a cron job, processing one chapter per tick to avoid overloading APIs.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { logger } from "../lib/logger";
import {
  type ChapterImage,
  type ImageManifest,
  generateChapterImages,
  generateAdditionalScene,
  regenerateChapterImages,
  getPersonaVersions,
} from "./gita-image-gen";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "gita");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const MANIFEST_FILE = path.join(IMAGES_DIR, "manifest.json");
const AUDIT_PROGRESS_FILE = path.join(DATA_DIR, "audit-progress.json");

// ── Audit progress tracking ─────────────────────────────────────────────────

interface AuditProgress {
  lastAuditedChapter: number;
  totalIssuesFixed: number;
  lastRunAt: string;
  status: "idle" | "running";
  log: AuditLogEntry[];
}

interface AuditLogEntry {
  chapter: number;
  timestamp: string;
  issues: string[];
  fixes: string[];
}

function readAuditProgress(): AuditProgress {
  if (!fs.existsSync(AUDIT_PROGRESS_FILE)) {
    return {
      lastAuditedChapter: 19, // start above max chapter (18), count down
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

// ── Hindi number map (1-18 only for Gita) ─────────────────────────────────
const HINDI_NUMS: Record<string, number> = {
  एक:1,दो:2,तीन:3,चार:4,पाँच:5,पांच:5,छः:6,छह:6,सात:7,आठ:8,नौ:9,दस:10,
  ग्यारह:11,बारह:12,तेरह:13,चौदह:14,पन्द्रह:15,पंद्रह:15,सोलह:16,सत्रह:17,
  अठारह:18,
};

const CHAPTER_RE = /^(?:Chapter\s+\S+|अध्याय\s+(?:[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+){0,2}|\d+))\s*$/iu;

function extractChapterNum(line: string): number {
  const after = line.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
  if (after && HINDI_NUMS[after] !== undefined) return HINDI_NUMS[after];
  for (const [w, n] of Object.entries(HINDI_NUMS)) {
    if (line.includes(w)) return n;
  }
  const m = line.match(/\d+/);
  if (m) { const n = parseInt(m[0]); if (n > 0 && n <= 18) return n; }
  return 0;
}

function isChapterHeadingAudit(t: string): boolean {
  const cleaned = t.replace(/^\d+\s+/, "");
  if (cleaned.length > 60) return false;
  if (t.includes("पूर्ण हुए") || t.includes("पूर्ण हुआ")) return false;
  return CHAPTER_RE.test(cleaned);
}

/**
 * Find all chapter headings across all batches.
 * Gita has no skandh/canto logic — chapter number is the global number (1-18).
 */
function findChaptersInBatches(batches: BatchData[]): Map<number, { title: string; contentSnippet: string; pageNumber: number }> {
  const allPages = batches.flatMap(b => b.pages).filter(p => p.text && p.text.length >= 20);
  const result = new Map<number, { title: string; contentSnippet: string; pageNumber: number }>();

  for (const page of allPages) {
    const lines = page.text.split("\n");
    const headingCount = lines.filter(l => isChapterHeadingAudit(l.trim())).length;
    if (headingCount >= 2) continue; // ToC page

    for (const line of lines) {
      const t = line.trim();
      if (!isChapterHeadingAudit(t)) continue;
      const num = extractChapterNum(t);
      if (num <= 0 || num > 18) continue;

      // Skip if already found this chapter
      if (result.has(num)) continue;

      // Get content snippet for image generation
      const pageIdx = allPages.findIndex(p => p.pageNumber === page.pageNumber);
      const remainingPages = allPages.slice(pageIdx, pageIdx + 5);
      const contentSnippet = remainingPages.map(p => p.text).join("\n").substring(0, 1500);

      result.set(num, { title: t.substring(0, 60), contentSnippet, pageNumber: page.pageNumber });
    }
  }

  return result;
}

// ── descriptionHi generation ────────────────────────────────────────────────

async function generateDescriptionHi(chapterNum: number, chapterTitle: string, contentSnippet: string): Promise<string | null> {
  const hindiLines = contentSnippet
    .split(/[।\n]/)
    .map((l) => l.trim())
    .filter((l) => {
      const devCount = (l.match(/[\u0900-\u097F]/gu) || []).length;
      return l.length > 20 && l.length < 200 && devCount / Math.max(l.replace(/\s/g, "").length, 1) > 0.7;
    });

  if (hindiLines.length > 0) {
    const desc = hindiLines.slice(0, 2).join("। ") + "।";
    return desc.length > 200 ? desc.slice(0, 197) + "..." : desc;
  }

  const hindiTitle = chapterTitle.replace(/^Chapter\s*/i, "अध्याय ");
  if (/[\u0900-\u097F]/.test(hindiTitle)) return hindiTitle;

  return null;
}

// ── Shlok detection ─────────────────────────────────────────────────────────

function checkShlokDetection(contentSnippet: string): {
  hasShloks: boolean;
  shlokCount: number;
  sectionCounts: { shlok: number; shabdarth: number; anuvad: number; tatparya: number };
  langStats: { hindi: number; sanskrit: number; mixed: number; uncertain: number };
  issues: string[];
} {
  const issues: string[] = [];

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

  let langStats = { hindi: 0, sanskrit: 0, mixed: 0, uncertain: 0 };
  try {
    const lines = contentSnippet.split("\n").filter(l => l.trim().length > 10);
    for (const line of lines) {
      const trimmed = line.trim();
      const hindiPostpositions = ["में", "से", "को", "पर", "ने", "के", "की", "का"];
      const hindiPPCount = hindiPostpositions.filter(pp => trimmed.includes(pp)).length;
      const hindiVerbs = ["है", "हैं", "था", "थी", "थे", "होता", "करता", "गया", "किया"];
      const hindiVerbCount = trimmed.split(/\s+/).filter(w => hindiVerbs.includes(w)).length;
      const visargaCount = (trimmed.match(/ः/gu) || []).length;
      const verseEndCount = (trimmed.match(/॥/gu) || []).length;

      const hasStrongHindi = hindiPPCount >= 2 || (hindiPPCount >= 1 && hindiVerbCount >= 1);
      const hasStrongSanskrit = visargaCount >= 1 || verseEndCount >= 1;

      if (hasStrongHindi && hasStrongSanskrit) langStats.mixed++;
      else if (hasStrongHindi) langStats.hindi++;
      else if (hasStrongSanskrit) langStats.sanskrit++;
      else langStats.uncertain++;
    }
  } catch { /* non-critical */ }

  if (shlokMarkers === 0) {
    issues.push("No shlok markers (||) found -- chapter may have OCR issues");
  }

  if (shlokMarkers > 0 && shabdarthMarkers === 0 && tatparyaMarkers === 0) {
    issues.push("Shloks found but no shabdarth or tatparya sections -- BBT structure incomplete");
  }

  if (langStats.hindi === 0 && langStats.sanskrit > 0) {
    issues.push("Only Sanskrit detected, no Hindi commentary -- possible page range issue");
  }

  return { hasShloks: shlokMarkers > 0, shlokCount: shlokMarkers, sectionCounts, langStats, issues };
}

// ── Main audit function ─────────────────────────────────────────────────────

export async function runGitaAuditPass(): Promise<{ chaptersAudited: number; issuesFound: number; issuesFixed: number; message: string }> {
  const auditProgress = readAuditProgress();

  if (auditProgress.status === "running") {
    return { chaptersAudited: 0, issuesFound: 0, issuesFixed: 0, message: "Gita audit already running" };
  }

  auditProgress.status = "running";
  writeAuditProgress(auditProgress);

  try {
    const batches = loadAllBatches();
    if (batches.length === 0) {
      auditProgress.status = "idle";
      writeAuditProgress(auditProgress);
      return { chaptersAudited: 0, issuesFound: 0, issuesFixed: 0, message: "No Gita batches to audit" };
    }

    const chapters = findChaptersInBatches(batches);
    const manifest = readManifest();
    const sortedChapters = Array.from(chapters.keys()).sort((a, b) => b - a); // reverse order

    // Count images per chapter
    const imageCountPerChapter = new Map<number, number>();
    for (const img of manifest.images) {
      imageCountPerChapter.set(img.chapterNumber, (imageCountPerChapter.get(img.chapterNumber) || 0) + 1);
    }

    // PRIORITY 1: chapters with 0 images
    const chaptersWithoutImages = sortedChapters.filter(ch => !imageCountPerChapter.has(ch));
    // PRIORITY 2: chapters with only 1 image
    const chaptersNeedingMore = sortedChapters.filter(ch => (imageCountPerChapter.get(ch) || 0) === 1);

    let targetChapter: number | null = null;
    let needsAdditionalScene = false;

    if (chaptersWithoutImages.length > 0) {
      targetChapter = chaptersWithoutImages[0];
      logger.info({ targetChapter, missingCount: chaptersWithoutImages.length }, "Gita audit: prioritizing chapter without images");
    } else if (chaptersNeedingMore.length > 0) {
      targetChapter = chaptersNeedingMore[0];
      needsAdditionalScene = true;
      logger.info({ targetChapter, needMoreCount: chaptersNeedingMore.length }, "Gita audit: generating additional scene");
    } else {
      for (const ch of sortedChapters) {
        if (ch < auditProgress.lastAuditedChapter) {
          targetChapter = ch;
          break;
        }
      }
    }

    // If we've gone through all chapters, reset
    if (targetChapter === null) {
      if (sortedChapters.length > 0) {
        auditProgress.lastAuditedChapter = 19; // reset above max
        targetChapter = sortedChapters[0];
      } else {
        auditProgress.status = "idle";
        writeAuditProgress(auditProgress);
        return { chaptersAudited: 0, issuesFound: 0, issuesFixed: 0, message: "No Gita chapters found in batches" };
      }
    }

    const chapterInfo = chapters.get(targetChapter)!;
    const issues: string[] = [];
    const fixes: string[] = [];

    logger.info({ chapter: targetChapter, title: chapterInfo.title, additionalScene: needsAdditionalScene }, "Gita: Auditing chapter");

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
      issues.push("Only 1 image -- generating additional scene");
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
          try {
            const generated = await generateChapterImages(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
            if (generated.length > 0) {
              fixes.push(`Regenerated missing image(s): ${generated.join(", ")}`);
            }
          } catch (err: any) {
            issues.push(`Failed to regenerate: ${err?.message}`);
          }
          break;
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
    const updatedManifest = readManifest();
    const updatedImages = updatedManifest.images.filter((img) => img.chapterNumber === targetChapter);
    let manifestDirty = false;

    for (const img of updatedImages) {
      if (!img.descriptionHi) {
        issues.push(`Missing descriptionHi for ${img.imagePath}`);
        const desc = await generateDescriptionHi(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
        if (desc) {
          img.descriptionHi = desc;
          manifestDirty = true;
          fixes.push(`Added descriptionHi for ${img.imagePath}: "${desc.slice(0, 60)}..."`);
        }
      }
    }

    // ── Check 3: Chapter title correctness ──────────────────────────────────
    for (const img of updatedImages) {
      if (!/[\u0900-\u097F]/.test(img.chapterTitle)) {
        issues.push(`Chapter title not in Hindi: "${img.chapterTitle}"`);
        if (/[\u0900-\u097F]/.test(chapterInfo.title)) {
          img.chapterTitle = chapterInfo.title;
          manifestDirty = true;
          fixes.push(`Fixed chapter title to: "${chapterInfo.title}"`);
        }
      }
    }

    // ── Check 4: Shlok detection sanity ─────────────────────────────────────
    const allText = batches.flatMap((b) => b.pages).sort((a, b) => a.pageNumber - b.pageNumber);
    const chapterStartIdx = allText.findIndex((p) => p.pageNumber === chapterInfo.pageNumber);
    if (chapterStartIdx >= 0) {
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
      }, "Gita BBT section structure + lang-detect check");
    }

    // ── Check 5: Prompt stored correctly ────────────────────────────────────
    for (const img of updatedImages) {
      if (img.prompt.includes(ART_STYLE_SNIPPET)) {
        issues.push(`Prompt contains art style (should be clean scene): ${img.imagePath}`);
      }
    }

    // ── Check 6: Persona version ────────────────────────────────────────────
    const personaVersions = getPersonaVersions();
    let personaOutdated = false;
    for (const img of updatedImages) {
      if (img.personasUsed && img.personasUsed.length > 0) {
        const currentMax = Math.max(...img.personasUsed.map((k) => personaVersions.versions[k] || 1), 1);
        if ((img.personaVersion || 1) < currentMax) {
          issues.push(`Outdated persona version for ${img.imagePath}: image v${img.personaVersion || 1} < current v${currentMax}`);
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
      writeManifest(updatedManifest);
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
    auditProgress.log = [logEntry, ...auditProgress.log].slice(0, 50);
    writeAuditProgress(auditProgress);

    const msg = issues.length === 0
      ? `Gita chapter ${targetChapter} -- all checks passed`
      : `Gita chapter ${targetChapter} -- ${issues.length} issue(s), ${fixes.length} fixed`;

    logger.info({ chapter: targetChapter, issues: issues.length, fixes: fixes.length }, msg);

    // Git commit + push if any fixes were made
    if (fixes.length > 0) {
      try {
        const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
        execSync("git add data/gita/images/ data/gita/audit-progress.json", { cwd: REPO_ROOT, stdio: "pipe" });
        const diff = execSync("git diff --cached --stat", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
        if (diff) {
          const commitMsg = `feat(gita): audit ch ${targetChapter} -- ${fixes.length} fix(es)`;
          execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_ROOT, stdio: "pipe" });
          execSync("git push", { cwd: REPO_ROOT, stdio: "pipe" });
          logger.info({ chapter: targetChapter, fixes: fixes.length }, "Gita audit: git commit + push done");
        }
      } catch (err) {
        logger.warn({ err }, "Gita audit: git commit/push failed -- continuing");
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
    logger.error({ err }, "Gita audit pass failed");
    throw err;
  }
}

const ART_STYLE_SNIPPET = "Indian devotional calendar art";

export function getGitaAuditProgress(): AuditProgress {
  return readAuditProgress();
}

/** Reset audit to re-check all chapters from the beginning (chapter 18 first) */
export function resetGitaAudit(): void {
  const progress = readAuditProgress();
  progress.lastAuditedChapter = 19;
  progress.status = "idle";
  writeAuditProgress(progress);
}
