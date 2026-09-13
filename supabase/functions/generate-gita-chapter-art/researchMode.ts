// Research network policy for one generate-gita-chapter-art request.
//
// A request renders its target chapters one after another. Network research can
// take up to 60s per chapter (Firecrawl + Claude), so a run of up to 18 chapters
// could add minutes of research in sequence and push the request past the edge
// function's wall-clock limit. Multi-chapter runs therefore read research from
// the cache only: allowNetwork: false serves a fresh cached row plus canon and
// never calls Firecrawl or Claude. A single-chapter run keeps network research.
//
// Pure: no Deno, no IO, so node tests import it directly.

import type { SceneResearchOptions } from "../_shared/sceneResearch.ts";

export interface GitaRun {
  /** true when the request took the { missing: true } path (not { chapter }). */
  missingPath: boolean;
  /** body.limit exactly as the request sent it. */
  limit?: unknown;
  /** How many chapters this request will render. */
  targetCount: number;
}

/**
 * A multi-chapter run: more than one target chapter, or the { missing: true }
 * path with a limit above 1 (a batch request, even when fewer chapters remain).
 */
export function isMultiChapterRun(run: GitaRun): boolean {
  if (Number(run?.targetCount) > 1) return true;
  return run?.missingPath === true && Number(run?.limit) > 1;
}

/** Options for getSceneResearch for every chapter of this run. */
export function gitaResearchOptions(run: GitaRun): SceneResearchOptions {
  return { allowNetwork: !isMultiChapterRun(run) };
}
