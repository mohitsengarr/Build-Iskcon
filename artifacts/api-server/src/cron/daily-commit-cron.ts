import cron from "node-cron";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

// Run at midnight IST (18:30 UTC) — single daily commit + push
const DAILY_COMMIT_SCHEDULE = "30 18 * * *";

const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

export function startDailyCommitCron(): void {
  logger.info({ schedule: DAILY_COMMIT_SCHEDULE }, "Daily commit cron started (midnight IST)");

  cron.schedule(DAILY_COMMIT_SCHEDULE, async () => {
    await applySupabasePageEdits();
    commitAndPush();
  });
}

/**
 * Pull every Supabase page edit that hasn't been written to git yet, apply it
 * to the matching batch JSON file, and mark it applied. Runs before the daily
 * commit so the live edits become part of the source-of-truth data/ snapshot.
 */
async function applySupabasePageEdits(): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  try {
    const fetchUrl = `${SUPABASE_URL}/rest/v1/bhagavatam_page_edits?applied_to_git=eq.false&select=page_number,text,text_en`;
    const res = await fetch(fetchUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Could not fetch pending page edits — skipping");
      return { applied: 0, failed: 0 };
    }
    const rows = await res.json() as Array<{ page_number: number; text?: string; text_en?: string }>;
    if (rows.length === 0) {
      logger.info("Daily commit: no pending Supabase page edits");
      return { applied: 0, failed: 0 };
    }

    const PAGES_DIR = path.resolve(REPO_ROOT, "data", "bhagwatham", "pages");
    for (const row of rows) {
      try {
        const batchNum = Math.ceil(row.page_number / 20);
        const batchFile = path.join(PAGES_DIR, `batch-${String(batchNum).padStart(4, "0")}.json`);
        if (!fs.existsSync(batchFile)) {
          logger.warn({ pageNumber: row.page_number, batchFile }, "Batch file missing for edit");
          failed++;
          continue;
        }
        const batch = JSON.parse(fs.readFileSync(batchFile, "utf-8"));
        const idx = (batch.pages || []).findIndex((p: { pageNumber: number }) => p.pageNumber === row.page_number);
        if (idx < 0) {
          logger.warn({ pageNumber: row.page_number }, "Page not found in batch");
          failed++;
          continue;
        }
        if (typeof row.text === "string") batch.pages[idx].text = row.text;
        if (typeof row.text_en === "string") batch.pages[idx].textEn = row.text_en;
        batch.pages[idx].editedAt = new Date().toISOString();
        fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2) + "\n");

        // Mark applied in Supabase
        await fetch(
          `${SUPABASE_URL}/rest/v1/bhagavatam_page_edits?page_number=eq.${row.page_number}`,
          {
            method: "PATCH",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ applied_to_git: true }),
          },
        );
        applied++;
      } catch (err) {
        logger.warn({ err, pageNumber: row.page_number }, "Failed to apply page edit");
        failed++;
      }
    }
    logger.info({ applied, failed, total: rows.length }, "Daily commit: applied Supabase page edits");
  } catch (err) {
    logger.warn({ err }, "applySupabasePageEdits failed");
  }
  return { applied, failed };
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
export async function commitAndPush(): Promise<{ committed: boolean; message: string }> {
  try {
    // Pull any pending Supabase edits down into the batch JSON files first
    await applySupabasePageEdits();

    // Then sync data → public/api/ so Vercel serves the latest images/manifests
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
