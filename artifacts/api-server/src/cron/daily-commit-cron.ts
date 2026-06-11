import cron from "node-cron";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";
import { REPO_ROOT, DATA_DIR } from "../lib/repo-root";

// Run at midnight IST (18:30 UTC) — single daily commit + push
const DAILY_COMMIT_SCHEDULE = "30 18 * * *";

// Only these pathspecs are ever committed by this cron — a human's staged
// files (.env, WIP code) must never ride along.
const COMMIT_PATHSPECS = "data/ artifacts/temple-tracker/public/api/";

// Read lazily (not at module init): ESM import hoisting means this module is
// evaluated before index.ts runs dotenv.config().
function supaUrl(): string {
  return process.env.SUPABASE_URL || "";
}

function supaKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
}

function supaHeaders(): Record<string, string> {
  return {
    apikey: supaKey(),
    Authorization: `Bearer ${supaKey()}`,
    "Content-Type": "application/json",
  };
}

export function startDailyCommitCron(): void {
  logger.info({ schedule: DAILY_COMMIT_SCHEDULE }, "Daily commit cron started (midnight IST)");

  cron.schedule(DAILY_COMMIT_SCHEDULE, async () => {
    // commitAndPush applies pending Supabase page edits itself — do not also
    // apply them here (they used to run twice per tick).
    await commitAndPush();
  });
}

interface PageEditRow {
  page_number: number;
  text?: string;
  text_en?: string;
}

/** Mark one edit row applied; returns true only when the PATCH succeeded. */
async function markEditApplied(table: string, pageNumber: number): Promise<boolean> {
  const res = await fetch(
    `${supaUrl()}/rest/v1/${table}?page_number=eq.${pageNumber}&applied_to_git=eq.false`,
    {
      method: "PATCH",
      headers: supaHeaders(),
      body: JSON.stringify({ applied_to_git: true }),
    },
  );
  if (!res.ok) {
    logger.warn({ table, pageNumber, status: res.status }, "Failed to mark page edit applied");
  }
  return res.ok;
}

/**
 * Pull every Supabase page edit that hasn't been written to git yet, apply it
 * to the matching batch JSON file, and mark it applied. Runs before the daily
 * commit so the live edits become part of the source-of-truth data/ snapshot.
 */
async function applySupabasePageEdits(): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  if (!supaUrl() || !supaKey()) {
    logger.warn("Daily commit: SUPABASE_URL / key env vars not set — skipping page edits");
    return { applied, failed };
  }
  try {
    const fetchUrl = `${supaUrl()}/rest/v1/bhagavatam_page_edits?applied_to_git=eq.false&select=page_number,text,text_en&order=edited_at.asc`;
    const res = await fetch(fetchUrl, { headers: supaHeaders() });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Could not fetch pending page edits — skipping");
      return { applied: 0, failed: 0 };
    }
    const rows = await res.json() as PageEditRow[];
    if (rows.length === 0) {
      logger.info("Daily commit: no pending Supabase page edits");
      return { applied: 0, failed: 0 };
    }

    const PAGES_DIR = path.join(DATA_DIR, "bhagwatham", "pages");
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

        // Count as applied only when Supabase confirmed the flag flip;
        // otherwise the edit will (harmlessly) be re-applied next run.
        if (await markEditApplied("bhagavatam_page_edits", row.page_number)) {
          applied++;
        } else {
          failed++;
        }
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
 * Same flow for Chaitanya. chaitanya_page_edits synthesizes page_number as
 * batch * 100000 + pageInBatch; the target file is
 * data/chaitanya/batches/{batch}.json and the page is matched by
 * pages[].pageNumber === pageInBatch.
 */
async function applyChaitanyaPageEdits(): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  if (!supaUrl() || !supaKey()) {
    return { applied, failed };
  }
  try {
    const fetchUrl = `${supaUrl()}/rest/v1/chaitanya_page_edits?applied_to_git=eq.false&select=page_number,text,text_en&order=edited_at.asc`;
    const res = await fetch(fetchUrl, { headers: supaHeaders() });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Could not fetch pending Chaitanya page edits — skipping");
      return { applied: 0, failed: 0 };
    }
    const rows = await res.json() as PageEditRow[];
    if (rows.length === 0) {
      logger.info("Daily commit: no pending Chaitanya page edits");
      return { applied: 0, failed: 0 };
    }

    const BATCHES_DIR = path.join(DATA_DIR, "chaitanya", "batches");
    for (const row of rows) {
      try {
        // Synthesized page_number encodes batch + page-in-batch
        const batchNum = Math.floor(row.page_number / 100000);
        const pageInBatch = row.page_number % 100000;
        const batchFile = path.join(BATCHES_DIR, `${batchNum}.json`);
        if (!fs.existsSync(batchFile)) {
          logger.warn({ pageNumber: row.page_number, batchFile }, "Chaitanya batch file missing for edit");
          failed++;
          continue;
        }
        const batch = JSON.parse(fs.readFileSync(batchFile, "utf-8"));
        const idx = (batch.pages || []).findIndex((p: { pageNumber: number }) => p.pageNumber === pageInBatch);
        if (idx < 0) {
          logger.warn({ pageNumber: row.page_number, batchNum, pageInBatch }, "Page not found in Chaitanya batch");
          failed++;
          continue;
        }
        if (typeof row.text === "string") batch.pages[idx].text = row.text;
        if (typeof row.text_en === "string") batch.pages[idx].textEn = row.text_en;
        batch.pages[idx].editedAt = new Date().toISOString();
        fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2) + "\n");

        if (await markEditApplied("chaitanya_page_edits", row.page_number)) {
          applied++;
        } else {
          failed++;
        }
      } catch (err) {
        logger.warn({ err, pageNumber: row.page_number }, "Failed to apply Chaitanya page edit");
        failed++;
      }
    }
    logger.info({ applied, failed, total: rows.length }, "Daily commit: applied Chaitanya page edits");
  } catch (err) {
    logger.warn({ err }, "applyChaitanyaPageEdits failed");
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
    await applyChaitanyaPageEdits();

    // Then sync data → public/api/ so Vercel serves the latest images/manifests
    syncDataToPublic();

    // Stage all data directories AND the synced public/api/
    execSync("git add data/", { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git add artifacts/temple-tracker/public/api/", { cwd: REPO_ROOT, stdio: "pipe" });

    // Check staged changes within OUR pathspecs only
    const diff = execSync(`git diff --cached --stat -- ${COMMIT_PATHSPECS}`, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
    if (!diff) {
      logger.info("Daily commit: no changes to commit");
      return { committed: false, message: "No changes to commit" };
    }

    // Count changed files for commit message
    const fileCount = diff.split("\n").length - 1; // last line is summary
    const today = new Date().toISOString().slice(0, 10);
    const commitMsg = `chore: daily data sync ${today} (${fileCount} files)`;

    // Pathspec-limited commit: only data/ + public/api/ go in, even if a
    // human left other files staged (.env, WIP code).
    execSync(`git commit -m "${commitMsg}" -- ${COMMIT_PATHSPECS}`, { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git push", { cwd: REPO_ROOT, stdio: "pipe" });

    logger.info({ fileCount, date: today }, "Daily commit: pushed successfully");
    return { committed: true, message: `Committed and pushed ${fileCount} files` };
  } catch (err) {
    logger.error({ err }, "Daily commit: failed");
    return { committed: false, message: `Failed: ${err}` };
  }
}
