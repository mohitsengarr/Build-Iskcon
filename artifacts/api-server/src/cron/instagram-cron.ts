import cron from "node-cron";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";
import {
  generateInstagramForChapter,
  getInstagramManifest,
  publishSinglePost,
} from "../services/bhagwatham-instagram";
import { getImageManifest } from "../services/bhagwatham-image-gen";
import { getAllBatches, getBatch } from "../services/bhagwatham-sarvam";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────────

const FLOCK_WEBHOOK = "https://api.flock.com/hooks/sendMessage/b0159996-49f3-4f23-8d6b-bcd96dd2c316";

// Every 2 hours: posts 1 scene per tick, 2 scenes per chapter
// IST times: 12:30 AM, 2:30 AM, 4:30 AM, 6:30 AM, 8:30 AM, 10:30 AM, 12:30 PM, 2:30 PM, 4:30 PM, 6:30 PM, 8:30 PM, 10:30 PM
const INSTAGRAM_CRON_INTERVAL = "30 13 * * *"; // Once daily at 7:00 PM IST (13:30 UTC) — peak evening engagement

// State file to track reverse-order progress
const STATE_FILE = path.resolve(
  __dirname, "..", "..", "..", "..", "data", "bhagwatham", "instagram", "ig-cron-state.json",
);

// ── Canto mapping (global chapter → canto number) ───────────────────────────
// Srimad Bhagavatam has 12 cantos (skandhs). We build a chapter index from
// batch data using the same logic as the website's buildChapterIndex().
// This maps globalChapterNumber → { skandh, chapterInSkandh }.

interface ChapterInfo {
  globalNumber: number;
  skandh: number;
  chapterInSkandh: number;
  title: string;
}

const HINDI_NUMS: Record<string, number> = {
  // 1–10
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छः: 6, छह: 6,
  सात: 7, आठ: 8, नौ: 9, दस: 10,
  // 11–20
  ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पन्द्रह: 15, पंद्रह: 15,
  सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20,
  // 21–30
  इक्कीस: 21, बाईस: 22, तेईस: 23, चौबीस: 24, पच्चीस: 25,
  छब्बीस: 26, सत्ताईस: 27, सताईस: 27, अट्ठाईस: 28,
  उनतीस: 29, उन्तीस: 29, तीस: 30,
  // 31–40
  इकतीस: 31, बत्तीस: 32, तैंतीस: 33, चौंतीस: 34,
  पैंतीस: 35, छत्तीस: 36, सैंतीस: 37, अड़तीस: 38,
  उनतालीस: 39, चालीस: 40,
  // 41–50
  इकतालीस: 41, बयालीस: 42, तैंतालीस: 43, चवालीस: 44,
  पैंतालीस: 45, छियालीस: 46, छियालिस: 46, सैंतालीस: 47,
  अड़तालीस: 48, उनचास: 49, पचास: 50,
  // 51–60
  इक्यावन: 51, बावन: 52, तिरपन: 53, चौवन: 54, पचपन: 55,
  छप्पन: 56, सत्तावन: 57, अट्ठावन: 58, उनसठ: 59, साठ: 60,
  // 61–70
  इकसठ: 61, बासठ: 62, तिरसठ: 63, चौंसठ: 64, पैंसठ: 65,
  छियासठ: 66, सतसठ: 67, सड़सठ: 67, अड़सठ: 68, उनहत्तर: 69, सत्तर: 70,
  // 71–80
  इकहत्तर: 71, बहत्तर: 72, तिहत्तर: 73, चौहत्तर: 74, पचहत्तर: 75,
  छिहत्तर: 76, सतहत्तर: 77, अठहत्तर: 78, उन्यासी: 79, उनासी: 79, अस्सी: 80,
  // 81–90
  इक्यासी: 81, बयासी: 82, तिरासी: 83, चौरासी: 84, पिचासी: 85, पचासी: 85,
  छियासी: 86, सत्तासी: 87, अट्ठासी: 88, नवासी: 89, नब्बे: 90,
  // 91–99
  इक्यानवे: 91, इक्यानबे: 91, बानवे: 92, बानबे: 92,
  तिरानवे: 93, तिरानबे: 93, चौरानवे: 94, चौरानबे: 94,
  पचानवे: 95, पचानबे: 95, छियानवे: 96, छियानबे: 96,
  सत्तानवे: 97, सत्तानबे: 97, अट्ठानवे: 98, अट्ठानबे: 98,
  निन्यानवे: 99, निन्यानबे: 99,
  // 100
  सौ: 100,
  // OCR spelling variants
  तेइस: 23, तेइेस: 23, छियलीस: 46, पचीस: 25, सत्ताइस: 27,
};

const HINDI_HUNDREDS: Record<string, number> = {
  एक: 100, दो: 200, तीन: 300, चार: 400, पाँच: 500, पांच: 500,
};

/** Parse compound Hindi numbers like "एक सौ इक्कीस" → 121 */
function parseHindiNumber(text: string): number {
  const trimmed = text.trim();
  if (HINDI_NUMS[trimmed] !== undefined) return HINDI_NUMS[trimmed];
  const sauMatch = trimmed.match(/^(.+?)\s+सौ(?:\s+(.+))?$/u);
  if (sauMatch) {
    const hundredVal = HINDI_HUNDREDS[sauMatch[1].trim()];
    if (hundredVal) {
      const remainder = sauMatch[2]?.trim();
      if (!remainder) return hundredVal;
      const unit = HINDI_NUMS[remainder];
      if (unit !== undefined) return hundredVal + unit;
    }
  }
  return 0;
}

const OCR_CHAPTER_FIXES: Record<string, { num: number; title: string }> = {
  "Chapter 278 अध्याय": { num: 8, title: "अध्याय आठ" },
  "Chapter it": { num: 9, title: "अध्याय नौ" },
  "(शुषा दो": { num: 2, title: "अध्याय दो" },
  "Chapter 3:": { num: 6, title: "अध्याय छह" },
  "(नौ": { num: 9, title: "अध्याय नौ" },
  "Chapter 36": { num: 8, title: "अध्याय आठ" },
  "Chapter छ:": { num: 6, title: "अध्याय छह" },
  "छल्नीस": { num: 26, title: "अध्याय छब्बीस" },
  "अदुईस": { num: 28, title: "अध्याय अट्ठाईस" },
  "Chapter इक्तीस": { num: 21, title: "अध्याय इक्कीस" }, // OCR "इक्कीस"(21) → "इक्तीस"(looks like 31)
};

let _chapterIndexCache: ChapterInfo[] | null = null;
let _chapterCacheTime = 0;
const CHAPTER_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Skandh page-range anchors (derived from OCR title pages and colophons)
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

function getSkandh(pageNumber: number): number {
  for (let i = SKANDH_PAGE_RANGES.length - 1; i >= 0; i--) {
    if (pageNumber >= SKANDH_PAGE_RANGES[i].startPage) return SKANDH_PAGE_RANGES[i].skandh;
  }
  return 1;
}

function buildChapterIndex(): ChapterInfo[] {
  if (_chapterIndexCache && Date.now() - _chapterCacheTime < CHAPTER_CACHE_TTL) {
    return _chapterIndexCache;
  }

  const allBatches = getAllBatches();
  const allPages = allBatches.flatMap((b) => b.pages);
  const chapterPattern = /^(?:\d+\s+)?(?:Chapter|अध्याय)\s+(.+)/imu;

  const chapters: ChapterInfo[] = [];
  let globalCounter = 0;
  const lastChapterPerSkandh = new Map<number, number>();

  for (const page of allPages) {
    const skandh = getSkandh(page.pageNumber);
    const lines = page.text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes("पूर्ण हुए") || trimmed.includes("पूर्ण हुआ")) continue;
      if (trimmed.length > 60) continue; // reject long lines (inline text, not headings)

      const match = trimmed.match(chapterPattern);
      if (!match) continue;

      let title = match[0].replace(/^\d+\s+/, "").trim();
      let chNum = 0;

      // Apply OCR fixes
      for (const [key, fix] of Object.entries(OCR_CHAPTER_FIXES)) {
        if (title.includes(key) || trimmed.includes(key)) {
          chNum = fix.num;
          title = fix.title;
          break;
        }
      }

      // Parse Hindi number (compound parser)
      if (!chNum) {
        const afterHeading = title.replace(/^(?:अध्याय|Chapter)\s*/iu, "").trim();
        if (afterHeading) {
          const compound = parseHindiNumber(afterHeading);
          if (compound > 0) chNum = compound;
        }
      }

      // Fallback: simple Hindi word lookup
      if (!chNum) {
        for (const [word, num] of Object.entries(HINDI_NUMS)) {
          if (title.includes(word)) { chNum = num; break; }
        }
      }

      // Parse Arabic number
      if (!chNum) {
        const numMatch = title.match(/\d+/);
        if (numMatch) {
          const n = parseInt(numMatch[0], 10);
          if (n > 0 && n <= 500) chNum = n;
        }
      }

      if (!chNum) continue;

      const lastNum = lastChapterPerSkandh.get(skandh) ?? 0;
      // Skip backward jumps within same skandh
      if (chNum < lastNum && lastNum > 2) continue;

      // Skip duplicates within same skandh
      if (chapters.find((c) => c.chapterInSkandh === chNum && c.skandh === skandh)) continue;

      globalCounter++;
      lastChapterPerSkandh.set(skandh, chNum);
      chapters.push({
        globalNumber: globalCounter,
        skandh,
        chapterInSkandh: chNum,
        title,
      });
    }
  }

  const sorted = chapters.sort((a, b) =>
    a.skandh !== b.skandh ? a.skandh - b.skandh : a.chapterInSkandh - b.chapterInSkandh
  );
  // Use offset-based global numbering (matches audit + image manifest)
  const EXPECTED_PER_CANTO = [19, 10, 33, 31, 26, 19, 15, 24, 24, 90, 31, 13];
  sorted.forEach((ch) => {
    let offset = 0;
    for (let i = 0; i < ch.skandh - 1; i++) offset += EXPECTED_PER_CANTO[i];
    ch.globalNumber = offset + ch.chapterInSkandh;
  });
  _chapterIndexCache = sorted;
  _chapterCacheTime = Date.now();

  const totalCantos = new Set(chapters.map((c) => c.skandh)).size;
  logger.info({ totalChapters: chapters.length, totalCantos }, "Built chapter index for Instagram cron");
  return _chapterIndexCache;
}

function getCantoNumber(globalChapter: number): number {
  // Map from image manifest globalChapterNumber to skandh
  // The image manifest uses its own sequential numbering which may differ
  // from the batch-derived chapter index. Try to find by matching.
  const chapters = buildChapterIndex();

  // Direct lookup
  const ch = chapters.find((c) => c.globalNumber === globalChapter);
  if (ch) return ch.skandh;

  // Fallback: find nearest chapter
  let closest = chapters[0];
  for (const c of chapters) {
    if (Math.abs(c.globalNumber - globalChapter) < Math.abs(closest.globalNumber - globalChapter)) {
      closest = c;
    }
  }
  return closest?.skandh || 1;
}

function getChapterInCanto(globalChapter: number): number {
  const chapters = buildChapterIndex();
  const ch = chapters.find((c) => c.globalNumber === globalChapter);
  return ch?.chapterInSkandh || 0;
}

// ── State management ────────────────────────────────────────────────────────

interface CronState {
  nextChapter: number;       // global chapter to process next (counting down)
  totalPosted: number;       // lifetime counter
  lastPostedAt: string | null;
  lastError: string | null;
  startedAt: string;
  paused: boolean;
}

function readState(): CronState {
  if (fs.existsSync(STATE_FILE)) {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); }
    catch { /* corrupted — reset */ }
  }
  // Default: start from the highest chapter
  const chapters = getChaptersDescending();
  return {
    nextChapter: chapters[0] || 170,
    totalPosted: 0,
    lastPostedAt: null,
    lastError: null,
    startedAt: new Date().toISOString(),
    paused: false,
  };
}

function writeState(state: CronState) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

// ── Flock notifications ─────────────────────────────────────────────────────

async function sendFlock(message: string) {
  try {
    await fetch(FLOCK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    logger.info("Instagram cron Flock notification sent");
  } catch (err) {
    logger.error({ err }, "Failed to send Flock notification");
  }
}

// ── Git commit, push & deploy ───────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const PUBLIC_API_DIR = path.resolve(REPO_ROOT, "artifacts", "temple-tracker", "public", "api", "bhagwatham");

function syncIGManifestToPublicDir() {
  try {
    const igManifestSrc = path.join(REPO_ROOT, "data", "bhagwatham", "instagram", "ig-manifest.json");
    if (!fs.existsSync(igManifestSrc)) return;

    const destDir = path.join(PUBLIC_API_DIR, "instagram");
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    fs.copyFileSync(igManifestSrc, path.join(destDir, "manifest"));
    logger.info("Synced IG manifest to public API dir");
  } catch (err) {
    logger.warn({ err }, "Failed to sync IG manifest to public dir");
  }
}

function gitCommitPushDeploy(chapterNumber: number, cantoNumber: number, sceneIndex: number) {
  try {
    // Sync manifest to public dir so Vercel static site has the data
    syncIGManifestToPublicDir();

    // Stage IG data + cron state + public API
    execSync("git add data/bhagwatham/instagram/", { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git add artifacts/temple-tracker/public/api/bhagwatham/instagram/", { cwd: REPO_ROOT, stdio: "pipe" });

    // Check if there are staged changes
    const diff = execSync("git diff --cached --stat", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
    if (!diff) {
      logger.info("No IG changes to commit — skipping");
      return;
    }

    const commitMsg = `feat(instagram): post ch ${chapterNumber} scene ${sceneIndex + 1} (canto ${cantoNumber})`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git push", { cwd: REPO_ROOT, stdio: "pipe" });
    logger.info({ chapterNumber, cantoNumber, sceneIndex }, "IG cron: git commit + push done → Vercel deploy triggered");
  } catch (err) {
    logger.warn({ err }, "IG cron: git commit/push failed — continuing");
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getChaptersDescending(): number[] {
  // Use detected chapters from batch data (not just image manifest)
  // This ensures we generate IG content for ALL 274+ detected chapters
  const chapterIndex = buildChapterIndex();
  if (chapterIndex.length > 0) {
    return chapterIndex.map(c => c.globalNumber).sort((a, b) => b - a);
  }
  // Fallback to image manifest if batch data unavailable
  const manifest = getImageManifest();
  const chapters = [...new Set(manifest.images.map((img) => img.chapterNumber))];
  return chapters.sort((a, b) => b - a);
}

function findChapterContent(chapterNumber: number): { title: string; content: string } | null {
  // First try chapter index for title
  const chapters = buildChapterIndex();
  const chInfo = chapters.find(c => c.globalNumber === chapterNumber);

  // Also try image manifest
  const imgManifest = getImageManifest();
  const chImg = imgManifest.images.find((img) => img.chapterNumber === chapterNumber);

  let title = chInfo?.title || chImg?.chapterTitle || "";
  if (!title) return null;

  const descHi = (chImg as any)?.descriptionHi || "";

  // Add subtitle from description if title doesn't have one
  if (descHi && !title.includes("—")) {
    const firstSentence = descHi.split(/[।.]/)[0].trim();
    if (firstSentence && firstSentence.length < 100) {
      title = `${title} — ${firstSentence}`;
    }
  }

  // Try to load richer content from batches
  let content = "";
  try {
    const searchTerm = (chInfo?.title || chImg?.chapterTitle || "").replace(/^Chapter\s+/, "").trim();
    if (searchTerm) {
      const allBatches = getAllBatches();
      outer: for (const b of allBatches) {
        const batch = getBatch(b.batchNumber);
        if (!batch) continue;
        for (const page of batch.pages || []) {
          if (page.text?.includes(searchTerm)) {
            const lines = page.text.split("\n");
            const idx = lines.findIndex((l: string) => l.includes(searchTerm));
            if (idx >= 0) {
              content = lines.slice(idx, idx + 40).join("\n");
              const pageIdx = batch.pages.indexOf(page);
              const next = batch.pages.slice(pageIdx + 1, pageIdx + 4);
              content += "\n" + next.map((p: any) => p.text).join("\n").substring(0, 2000);
              break outer;
            }
          }
        }
      }
    }
  } catch { /* fallback below */ }

  // Fallback to description + prompt
  if (!content || content.length < 50) {
    content = `${title}\n${descHi}\nScene: ${chImg?.prompt || ""}`;
  }

  return { title, content };
}

// ── Main cron tick — posts 1 image per run ──────────────────────────────────

let isRunning = false;

async function instagramCronTick() {
  if (isRunning) {
    logger.info("Instagram cron already running — skipping");
    return;
  }
  isRunning = true;

  const state = readState();
  if (state.paused) {
    logger.info("Instagram cron is paused — skipping");
    isRunning = false;
    return;
  }

  try {
    const chapters = getChaptersDescending();

    // Done?
    if (state.nextChapter < 1) {
      logger.info("Instagram cron completed all chapters!");
      await sendFlock("✅ Instagram Bhagwatham cron completed! All chapters processed from last to first.");
      state.paused = true;
      writeState(state);
      isRunning = false;
      return;
    }

    let currentChapter = state.nextChapter;

    // Skip chapters that don't exist in detected chapters — jump straight to
    // the next valid one instead of decrementing one at a time (avoids days of
    // empty skips over large gaps like 280→231).
    if (!chapters.includes(currentChapter)) {
      const nextValid = chapters.filter((c) => c < currentChapter).sort((a, b) => b - a)[0];
      if (!nextValid || nextValid < 1) {
        logger.info({ currentChapter }, "No valid chapters remaining — pausing cron");
        state.paused = true;
        writeState(state);
        isRunning = false;
        return;
      }
      logger.info({ from: currentChapter, to: nextValid, skipped: currentChapter - nextValid }, "Batch-skipping missing chapters");
      state.nextChapter = nextValid;
      currentChapter = nextValid;
      writeState(state);
    }

    const cantoNumber = getCantoNumber(currentChapter);
    const chapterInCanto = getChapterInCanto(currentChapter);
    logger.info({ chapter: currentChapter, canto: cantoNumber, chapterInCanto }, "Instagram cron tick — processing");

    // Step 1: Check if we have IG images for this chapter
    const igManifest = getInstagramManifest();
    let scenes = igManifest.images.filter((img) => img.chapterNumber === currentChapter);

    // Step 2: Generate if no scenes exist yet
    if (scenes.length === 0) {
      const chapterData = findChapterContent(currentChapter);
      if (!chapterData) {
        logger.warn({ currentChapter }, "No content for chapter — skipping");
        state.nextChapter = currentChapter - 1;
        writeState(state);
        isRunning = false;
        return;
      }

      logger.info({ currentChapter, canto: cantoNumber }, "Generating 2 Instagram scenes");
      try {
        const result = await generateInstagramForChapter(
          currentChapter, chapterData.title, chapterData.content,
          { queueToBuffer: false, numScenes: 2, cantoNumber, chapterInCanto },
        );
        scenes = result.images;
        if (scenes.length === 0) {
          logger.warn({ currentChapter }, "Generation produced 0 images — skipping");
          await sendFlock(`⚠️ IG Cron: 0 images generated for Ch ${currentChapter} (Canto ${cantoNumber}). Skipping.`);
          state.nextChapter = currentChapter - 1;
          writeState(state);
          isRunning = false;
          return;
        }
        logger.info({ currentChapter, generated: scenes.length }, "Scenes generated");
      } catch (err: any) {
        logger.error({ err: err?.message, currentChapter }, "Instagram generation failed");
        state.lastError = err?.message;
        writeState(state);
        await sendFlock(`❌ IG Cron: Generation failed for Ch ${currentChapter} (Canto ${cantoNumber}):\n${err?.message}`);
        isRunning = false;
        return;
      }
    }

    // Step 3: Find the next unposted scene
    const unposted = scenes.filter((s) => !s.bufferId);
    if (unposted.length === 0) {
      // All scenes posted — move to previous chapter
      logger.info({ currentChapter }, "All scenes posted for chapter — moving backward");
      state.nextChapter = currentChapter - 1;
      writeState(state);
      isRunning = false;
      return;
    }

    // Step 4: Post exactly 1 scene
    const scene = unposted[0];
    try {
      const results = await publishSinglePost(scene);

      state.totalPosted++;
      state.lastPostedAt = new Date().toISOString();
      state.lastError = null;

      logger.info({
        chapter: currentChapter,
        canto: cantoNumber,
        scene: scene.sceneIndex + 1,
        totalPosted: state.totalPosted,
        channels: results.length,
      }, "Instagram cron: posted 1 scene");

      // Git commit, push & deploy (Vercel auto-deploys on push)
      gitCommitPushDeploy(currentChapter, cantoNumber, scene.sceneIndex);

      // Check if this was the last scene for the chapter
      const updatedManifest = getInstagramManifest();
      const stillUnposted = updatedManifest.images.filter(
        (img) => img.chapterNumber === currentChapter && !img.bufferId,
      );
      if (stillUnposted.length === 0) {
        state.nextChapter = currentChapter - 1;
        logger.info({ completedChapter: currentChapter, nextChapter: state.nextChapter }, "Chapter done, moving backward");
      }

      writeState(state);
    } catch (err: any) {
      logger.error({ err: err?.message, currentChapter, sceneIndex: scene.sceneIndex }, "Post failed");
      state.lastError = err?.message;
      writeState(state);
      await sendFlock(`❌ IG Cron: Post failed for Ch ${currentChapter} Scene ${scene.sceneIndex + 1} (Canto ${cantoNumber}):\n${err?.message}`);
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, "Instagram cron tick crashed");
    await sendFlock(`❌ IG Cron crashed: ${err?.message}`);
  } finally {
    isRunning = false;
  }
}

// ── Start cron ──────────────────────────────────────────────────────────────

export function startInstagramCron(): void {
  logger.info(
    { interval: INSTAGRAM_CRON_INTERVAL },
    "Instagram posting cron started (once daily at 6:30 PM IST)",
  );

  cron.schedule(INSTAGRAM_CRON_INTERVAL, async () => {
    logger.info("Instagram cron tick triggered");
    await instagramCronTick();
  });
}

// Export for manual trigger via API
export { instagramCronTick };
