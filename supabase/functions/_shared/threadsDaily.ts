// At least one picture on Threads every day (owner, 2026-10-30: "make sure daily
// one image goes in Threads"). threads-daily-image runs once a day after the
// posting queue: when no picture went to Threads in the last 24 hours
// (social_post_log), it runs the usual posting steps once more, one at a time —
// the posting queue for one post, then the daily cover — and stops as soon as a
// picture is on Threads. Each step keeps its own rules (Krishna only, one post),
// so this never posts in bulk. When the log cannot be read it does nothing, so a
// read error never doubles a post.

export interface ThreadsStep {
  name: string;
  run: () => Promise<unknown>;
}

export type ThreadsDailyOutcome =
  | { outcome: "already_posted"; tried: string[] }
  | { outcome: "posted"; via: string; tried: string[] }
  | { outcome: "nothing_to_post"; tried: string[] }
  | { outcome: "unknown"; tried: string[] };

export async function ensureDailyThreadsImage(o: {
  /** Whether a picture went to Threads in the last 24 hours; null when unknown. */
  postedRecently: () => Promise<boolean | null>;
  steps: ThreadsStep[];
  log?: (line: string) => void;
}): Promise<ThreadsDailyOutcome> {
  const log = o.log ?? console.log;
  const tried: string[] = [];
  const before = await o.postedRecently();
  if (before === true) return { outcome: "already_posted", tried };
  if (before === null) {
    log("[threads-daily] could not read the post log; posting nothing");
    return { outcome: "unknown", tried };
  }
  for (const step of o.steps) {
    tried.push(step.name);
    try {
      await step.run();
    } catch (e) {
      log(`[threads-daily] ${step.name} failed: ${String(e)}`);
    }
    if ((await o.postedRecently()) === true) return { outcome: "posted", via: step.name, tried };
  }
  log("[threads-daily] no picture with Krishna in it was available for Threads today");
  return { outcome: "nothing_to_post", tried };
}
