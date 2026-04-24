import cron from "node-cron";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

// Run at midnight IST (18:30 UTC) — single daily commit + push
const DAILY_COMMIT_SCHEDULE = "30 18 * * *";

export function startDailyCommitCron(): void {
  logger.info({ schedule: DAILY_COMMIT_SCHEDULE }, "Daily commit cron started (midnight IST)");

  cron.schedule(DAILY_COMMIT_SCHEDULE, () => {
    commitAndPush();
  });
}

/**
 * Sync data/ → public/api/ so the static files Vercel serves are up to date.
 * Vercel skips builds for data-only commits (vercel.json ignoreCommand), so
 * without this step, newly generated images never reach the deployed site.
 */
function syncDataToPublic(): void {
  const scriptPath = path.join(REPO_ROOT, "artifacts", "temple-tracker", "scripts", "generate-static-api.mjs");
  try {
    execSync(`node "${scriptPath}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    logger.info("Daily commit: synced data → public/api/");
  } catch (err) {
    logger.warn({ err }, "Daily commit: sync script failed (continuing with whatever is in public/api/)");
  }
}

/**
 * Stage all data/ changes, commit with a summary, and push.
 * Called once daily by cron, or manually via API.
 */
export function commitAndPush(): { committed: boolean; message: string } {
  try {
    // First sync data → public/api/ so Vercel serves the latest images/manifests
    syncDataToPublic();

    // Stage all data directories AND the synced public/api/
    execSync("git add data/", { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git add artifacts/temple-tracker/public/api/", { cwd: REPO_ROOT, stdio: "pipe" });

    // Check if there are staged changes
    const diff = execSync("git diff --cached --stat", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
    if (!diff) {
      logger.info("Daily commit: no changes to commit");
      return { committed: false, message: "No changes to commit" };
    }

    // Count changed files for commit message
    const fileCount = diff.split("\n").length - 1; // last line is summary
    const today = new Date().toISOString().slice(0, 10);
    const commitMsg = `chore: daily data sync ${today} (${fileCount} files)`;

    execSync(`git commit -m "${commitMsg}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git push", { cwd: REPO_ROOT, stdio: "pipe" });

    logger.info({ fileCount, date: today }, "Daily commit: pushed successfully");
    return { committed: true, message: `Committed and pushed ${fileCount} files` };
  } catch (err) {
    logger.error({ err }, "Daily commit: failed");
    return { committed: false, message: `Failed: ${err}` };
  }
}
