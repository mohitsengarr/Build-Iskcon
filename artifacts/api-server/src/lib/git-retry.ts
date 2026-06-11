// Git execSync wrapper with retry on index.lock contention.
//
// Multiple crons (instagram, audit, fast-backfill, daily-commit) stage/commit
// concurrently in the same repo. When two git processes race, git fails with
// "Unable to create '.../.git/index.lock': File exists". That error is
// transient — the right move is a short jittered backoff and retry.
// Any OTHER git error is rethrown immediately (no retry).

import { execSync } from "child_process";

/** Synchronous sleep without busy-waiting (callers of execSync are already sync). */
function sleepSync(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

/**
 * Run a git command via execSync, retrying ONLY on index.lock contention.
 * Defaults: 3 attempts, 300-900ms jittered backoff between attempts.
 * Returns stdout as a UTF-8 string.
 */
export function gitWithRetry(cmd: string, opts?: { cwd?: string; attempts?: number }): string {
  const attempts = opts?.attempts ?? 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return execSync(cmd, { cwd: opts?.cwd, stdio: "pipe", encoding: "utf-8" });
    } catch (err) {
      lastErr = err;
      const e = err as { message?: string; stderr?: unknown };
      const stderr =
        typeof e?.stderr === "string"
          ? e.stderr
          : Buffer.isBuffer(e?.stderr)
            ? e.stderr.toString("utf-8")
            : "";
      const combined = `${e?.message ?? ""}\n${stderr}`;
      const isIndexLock = /index\.lock/i.test(combined);
      if (!isIndexLock || attempt === attempts) throw err;
      sleepSync(300 + Math.floor(Math.random() * 600)); // 300-900ms jitter
    }
  }

  throw lastErr;
}
