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
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";
import {
  type ChapterImage,
  type ImageManifest,
  generateChapterImages,
  regenerateChapterImages,
  getPersonaVersions,
} from "./bhagwatham-image-gen";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "data", "bhagwatham");
const PAGES_DIR = path.join(DATA_DIR, "pages");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const MANIFEST_FILE = path.join(IMAGES_DIR, "manifest.json");
const AUDIT_PROGRESS_FILE = path.join(DATA_DIR, "audit-progress.json");

// ── Audit progress tracking ─────────────────────────────────────────────────

interface AuditProgress {
  lastAuditedChapter: number; // counts down from max chapter
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

/** Find all chapter headings across all batches */
function findChaptersInBatches(batches: BatchData[]): Map<number, { title: string; contentSnippet: string; pageNumber: number }> {
  const chapters = new Map<number, { title: string; contentSnippet: string; pageNumber: number }>();
  const chapterPattern = /^(?:\d+\s+)?(?:Chapter|अध्याय)\s+(.+)/imu;
  const hindiNums: Record<string, number> = {
    एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, छः: 6, छह: 6,
    सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12,
    तेरह: 13, चौदह: 14, पन्द्रह: 15, सोलह: 16, सत्रह: 17,
    अठारह: 18, उन्नीस: 19, बीस: 20,
  };
  // OCR-mangled chapter headings
  const OCR_CHAPTER_FIXES: Record<string, { num: number; title: string }> = {
    "Chapter 278 अध्याय": { num: 8, title: "अध्याय आठ" },
    "Chapter it": { num: 9, title: "अध्याय नौ" },
  };

  for (const batch of batches) {
    for (const page of batch.pages) {
      const lines = page.text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const match = trimmed.match(chapterPattern);
        if (match && !trimmed.includes("पूर्ण हुए")) {
          let chapterTitle = match[0].replace(/^\d+\s+/, "").trim();
          let chapterNum = 0;

          // Check OCR fixes first
          for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
            if (chapterTitle.includes(key) || trimmed.includes(key)) {
              chapterNum = fix.num;
              chapterTitle = fix.title;
              break;
            }
          }

          if (!chapterNum) {
            for (const [word, num] of Object.entries(hindiNums)) {
              if (chapterTitle.includes(word)) { chapterNum = num; break; }
            }
          }
          if (!chapterNum) {
            const numMatch = chapterTitle.match(/\d+/);
            if (numMatch) {
              const n = parseInt(numMatch[0], 10);
              if (n > 0 && n <= 100) chapterNum = n;
            }
          }

          if (chapterNum > 0 && !chapters.has(chapterNum)) {
            const remainingLines = lines.slice(i + 1, i + 40).join("\n");
            const contentSnippet = remainingLines.substring(0, 1500);
            chapters.set(chapterNum, { title: chapterTitle, contentSnippet, pageNumber: page.pageNumber });
          }
        }
      }
    }
  }
  return chapters;
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

// ── Shlok detection sanity check ────────────────────────────────────────────

function checkShlokDetection(contentSnippet: string): { hasShloks: boolean; shlokCount: number; issues: string[] } {
  const issues: string[] = [];
  const shlokMarkers = (contentSnippet.match(/॥/gu) || []).length;
  const shabdarthMarkers = (contentSnippet.match(/शब्दार्थ/gu) || []).length;
  const tatparyaMarkers = (contentSnippet.match(/तात्पर्य/gu) || []).length;

  if (shlokMarkers === 0) {
    issues.push("No shlok markers (॥) found in content");
  }
  if (shlokMarkers > 0 && shabdarthMarkers === 0 && tatparyaMarkers === 0) {
    issues.push("Shloks found but no शब्दार्थ or तात्पर्य sections — possible parsing issue");
  }

  return { hasShloks: shlokMarkers > 0, shlokCount: shlokMarkers, issues };
}

// ── Main audit function ─────────────────────────────────────────────────────

export async function runAuditPass(): Promise<{ chaptersAudited: number; issuesFound: number; issuesFixed: number; message: string }> {
  const auditProgress = readAuditProgress();

  if (auditProgress.status === "running") {
    return { chaptersAudited: 0, issuesFound: 0, issuesFixed: 0, message: "Audit already running" };
  }

  auditProgress.status = "running";
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

    // Find the next chapter to audit (going in reverse)
    let targetChapter: number | null = null;
    for (const ch of sortedChapters) {
      if (ch < auditProgress.lastAuditedChapter) {
        targetChapter = ch;
        break;
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

    logger.info({ chapter: targetChapter, title: chapterInfo.title }, "Auditing chapter");

    // ── Check 1: Image files exist on disk ──────────────────────────────────
    const chapterImages = manifest.images.filter((img) => img.chapterNumber === targetChapter);

    if (chapterImages.length === 0) {
      issues.push("No images in manifest for this chapter");
      // Regenerate images
      try {
        const generated = await generateChapterImages(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
        if (generated.length > 0) {
          fixes.push(`Generated ${generated.length} new image(s): ${generated.join(", ")}`);
        }
      } catch (err: any) {
        issues.push(`Failed to generate images: ${err?.message}`);
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

    for (const img of updatedImages) {
      if (!img.descriptionHi) {
        issues.push(`Missing descriptionHi for ${img.imagePath}`);
        const desc = await generateDescriptionHi(targetChapter, chapterInfo.title, chapterInfo.contentSnippet);
        if (desc) {
          img.descriptionHi = desc;
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
      logger.info({ chapter: targetChapter, shlokCount: shlokCheck.shlokCount }, "Shlok detection check");
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
    // Keep last 50 log entries
    auditProgress.log = [logEntry, ...auditProgress.log].slice(0, 50);
    writeAuditProgress(auditProgress);

    const msg = issues.length === 0
      ? `Chapter ${targetChapter} — all checks passed`
      : `Chapter ${targetChapter} — ${issues.length} issue(s), ${fixes.length} fixed`;

    logger.info({ chapter: targetChapter, issues: issues.length, fixes: fixes.length }, msg);

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

/** Reset audit to re-check all chapters from the beginning (highest chapter first) */
export function resetAudit(): void {
  const progress = readAuditProgress();
  progress.lastAuditedChapter = 999;
  progress.status = "idle";
  writeAuditProgress(progress);
}
