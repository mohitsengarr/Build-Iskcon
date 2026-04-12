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

// Every 6 hours: 9 AM, 3 PM, 9 PM, 3 AM IST
// IST = UTC+5:30 → 9 AM IST = 3:30 UTC, 3 PM IST = 9:30 UTC, etc.
const INSTAGRAM_CRON_INTERVAL = "30 3,9,15,21 * * *";

// State file to track reverse-order progress
const STATE_FILE = path.resolve(
  __dirname, "..", "..", "..", "..", "data", "bhagwatham", "instagram", "ig-cron-state.json",
);

// ── Canto mapping (global chapter → canto number) ───────────────────────────

const CANTO_BOUNDARIES = [1, 20, 65, 70, 107, 136];

function getCantoNumber(globalChapter: number): number {
  for (let i = CANTO_BOUNDARIES.length - 1; i >= 0; i--) {
    if (globalChapter >= CANTO_BOUNDARIES[i]) return i + 1;
  }
  return 1;
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
  const manifest = getImageManifest();
  const chapters = [...new Set(manifest.images.map((img) => img.chapterNumber))];
  return chapters.sort((a, b) => b - a);
}

function findChapterContent(chapterNumber: number): { title: string; content: string } | null {
  const imgManifest = getImageManifest();
  const chImg = imgManifest.images.find((img) => img.chapterNumber === chapterNumber);
  if (!chImg) return null;

  let title = chImg.chapterTitle;
  const descHi = (chImg as any).descriptionHi || "";

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
    const allBatches = getAllBatches();
    const searchTerm = chImg.chapterTitle.replace(/^Chapter\s+/, "").trim();
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
  } catch { /* fallback below */ }

  // Fallback to description + prompt
  if (!content || content.length < 50) {
    content = `${title}\n${descHi}\nScene: ${chImg.prompt || ""}`;
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

    const currentChapter = state.nextChapter;
    const cantoNumber = getCantoNumber(currentChapter);

    // Skip chapters that don't exist in the image manifest
    if (!chapters.includes(currentChapter)) {
      logger.info({ currentChapter }, "Chapter not in manifest, skipping backward");
      state.nextChapter = currentChapter - 1;
      writeState(state);
      isRunning = false;
      return;
    }

    logger.info({ chapter: currentChapter, canto: cantoNumber }, "Instagram cron tick — processing");

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

      logger.info({ currentChapter, canto: cantoNumber }, "Generating 3 Instagram scenes");
      try {
        const result = await generateInstagramForChapter(
          currentChapter, chapterData.title, chapterData.content,
          { queueToBuffer: false, numScenes: 3, cantoNumber },
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
    "Instagram posting cron started (every 6h: 9AM, 3PM, 9PM, 3AM IST)",
  );

  cron.schedule(INSTAGRAM_CRON_INTERVAL, async () => {
    logger.info("Instagram cron tick triggered");
    await instagramCronTick();
  });
}

// Export for manual trigger via API
export { instagramCronTick };
