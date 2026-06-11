// Single source of truth for filesystem anchoring.
//
// Why this exists: ~20 files used `path.resolve(__dirname, "..", "..", ...)`
// to find the repo root. That arithmetic is correct under dev tsx (modules
// run from src/<dir>/) but WRONG in the production esbuild bundle, where
// every module's import.meta.url collapses to dist/index.mjs — the climbs
// then resolve one level above the repo and all data/git paths break.
//
// Strategy: walk up from process.cwd() looking for repo markers. Both dev
// (`pnpm dev` in artifacts/api-server) and prod (run from anywhere inside
// the checkout) hit a marker. The __dirname climb survives only as a last
// resort for exotic cwd setups.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: src/lib/ → up 4 = repo root (dev layout only).
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "..");
}

export const REPO_ROOT = findRepoRoot();
export const DATA_DIR = path.join(REPO_ROOT, "data");
