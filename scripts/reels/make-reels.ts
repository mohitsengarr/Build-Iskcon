// Renders Instagram Reels for the pictures about to be posted and stores them
// (owner, 2026-10-30: "yes build the reels, i will send the audio"). Run by
// .github/workflows/reels.yml every three hours, and by hand:
//
//   SUPABASE_SERVICE_ROLE_KEY=... node --experimental-strip-types scripts/reels/make-reels.ts
//
// Environment:
//   SUPABASE_SERVICE_ROLE_KEY  required (a GitHub Actions secret; never in the repo)
//   SUPABASE_URL               default: the project
//   REEL_AUDIO                 default assets/reels/hare-krishna.mp3, the owner's recording
//   REEL_AUDIO_OFFSET          seconds into the recording to start from (default 0)
//   REEL_LIMIT                 reels a run (default 6, at most 25)
//   DRY_RUN=1                  list what would be rendered; render and write nothing
//
// Without the audio file it renders nothing (a silent reel is not what the owner
// asked for) and ends quietly. Each reel is uploaded to the public instagram-images bucket under reels/
// and recorded on its row (reel_path, reel_url, reel_made_at) only while the row
// still holds the image it was rendered from.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compositeArgs, planReels, REEL_TABLES, type ReelCandidate, reelsPerRun, videoArgs } from "./reelPlan.ts";

const URL_BASE = (process.env.SUPABASE_URL || "https://etfmndcrchundvgtvmot.supabase.co").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const AUDIO = process.env.REEL_AUDIO || "assets/reels/hare-krishna.mp3";
const AUDIO_OFFSET = Number(process.env.REEL_AUDIO_OFFSET || 0) || 0;
const LIMIT = reelsPerRun(process.env.REEL_LIMIT);
const DRY = process.env.DRY_RUN === "1";
const BUCKET = "instagram-images";

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, ...extra };
}

async function readRows(table: string, kind: "post" | "cover"): Promise<ReelCandidate[]> {
  const select = "id,status,image_path,image_url,reel_path,krishna_check,repost_requested_at,posted_at,error_message,created_at";
  const filter = kind === "post"
    ? "status=eq.approved&repost_requested_at=not.is.null&order=repost_requested_at.asc"
    : "status=eq.approved&or=(posted_at.is.null,error_message.ilike.*instagram:*)&order=created_at.asc";
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?select=${select}&${filter}&limit=60`, { headers: headers() });
  if (!r.ok) throw new Error(`reading ${table}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json() as ReelCandidate["row"][];
  return rows.map((row) => ({ table, kind, row }));
}

function run(args: string[]): void {
  const p = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (p.status !== 0) throw new Error(`ffmpeg failed (${p.status}): ${(p.stderr || "").slice(0, 400)}`);
}

async function render(c: ReelCandidate & { path: string }, work: string): Promise<{ bytes: Buffer }> {
  const img = await fetch(String(c.row.image_url));
  if (!img.ok) throw new Error(`image HTTP ${img.status}`);
  const input = join(work, `in-${String(c.row.id)}.jpg`);
  writeFileSync(input, Buffer.from(await img.arrayBuffer()));
  const composite = join(work, `composite-${String(c.row.id)}.png`);
  const out = join(work, `reel-${String(c.row.id)}.mp4`);
  run(compositeArgs(input, composite));
  run(videoArgs(composite, AUDIO, out, { audioOffset: AUDIO_OFFSET }));
  return { bytes: readFileSync(out) };
}

async function upload(path: string, bytes: Buffer): Promise<string> {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers({ "Content-Type": "video/mp4", "x-upsert": "false" }),
    body: new Uint8Array(bytes),
  });
  if (!r.ok) throw new Error(`upload HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return `${URL_BASE}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Records the reel on the row only while it still holds the image the reel was made from. */
async function record(c: ReelCandidate & { path: string }, url: string): Promise<boolean> {
  const q = `${URL_BASE}/rest/v1/${c.table}?id=eq.${String(c.row.id)}&image_path=eq.${encodeURIComponent(String(c.row.image_path))}`;
  const r = await fetch(q, {
    method: "PATCH",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify({ reel_path: c.path, reel_url: url, reel_made_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`record HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length === 1;
}

async function main(): Promise<number> {
  if (!KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY is not set"); return 2; }
  // No recording yet is an expected state until the owner delivers it, so the run
  // ends quietly; a silent reel is never rendered in its place.
  if (!existsSync(AUDIO)) { console.log(`[reels] no recording at ${AUDIO} yet: nothing rendered`); return 0; }
  const candidates: ReelCandidate[] = [];
  for (const t of REEL_TABLES) candidates.push(...await readRows(t.table, t.kind));
  const { make, held } = planReels(candidates, LIMIT);
  console.log(`[reels] ${candidates.length} candidates, ${make.length} to render, ${held.length} held`);
  for (const h of held.filter((x) => !x.reason.startsWith("has its reel"))) console.log(`[reels] held ${h.table} #${String(h.id)}: ${h.reason}`);
  if (DRY) { for (const m of make) console.log(`[reels] would render ${m.table} #${String(m.row.id)} -> ${m.path}`); return 0; }
  const work = mkdtempSync(join(tmpdir(), "reels-"));
  let made = 0, failed = 0;
  try {
    for (const m of make) {
      try {
        const { bytes } = await render(m, work);
        const url = await upload(m.path, bytes);
        const recorded = await record(m, url);
        console.log(`[reels] ${m.table} #${String(m.row.id)}: ${recorded ? "rendered and recorded" : "rendered, but the row's image changed meanwhile; not recorded"} (${Math.round(bytes.length / 1024)} KB)`);
        if (recorded) made++;
      } catch (e) {
        failed++;
        console.error(`[reels] ${m.table} #${String(m.row.id)} failed: ${String(e).slice(0, 300)}`);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`[reels] done: ${made} made, ${failed} failed`);
  return make.length > 0 && made === 0 ? 1 : 0;
}

process.exitCode = await main();
