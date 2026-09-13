// Scene research call for one generateOne run (bulk-generate-chapter-art and
// bulk-generate-chaitanya-art keep identical copies of this file; a test checks
// that they match).
//
// Bulk mode only picks chapters with no pending/approved row, and a reject moves
// to the NEXT scene (a new key), so a bulk item is nearly always a cache miss.
// With network research one click could send up to 50 x (3 searches + 2 scrapes)
// to the Firecrawl pool shared with the CRM crons, plus 50 Opus calls, and add up
// to 60s per chapter inside the waitUntil worker. So bulk reads research from the
// cache only (allowNetwork: false): a fresh cached row (for example from a
// pre-warm run) plus canon, otherwise canon only. It never calls Firecrawl or
// Claude and never writes. Chapter and sample modes keep network research and
// call getSceneResearch exactly as before (no options).
//
// Pure: no Deno, no IO, so node tests import it directly.

import type { SceneResearchInput, SceneResearchOptions, SceneResearchResult } from "../_shared/sceneResearch.ts";

export type ResearchFn = (input: SceneResearchInput, opts?: SceneResearchOptions) => Promise<SceneResearchResult>;

/** undefined (the default: network research) unless this is a bulk run. */
export function researchOptionsFor(networkResearch: boolean): SceneResearchOptions | undefined {
  return networkResearch === false ? { allowNetwork: false } : undefined;
}

/** Never rejects: a research call that throws or rejects means no research result. */
export async function researchScene(
  research: ResearchFn,
  input: SceneResearchInput,
  networkResearch: boolean,
): Promise<SceneResearchResult | null> {
  try {
    return await research(input, researchOptionsFor(networkResearch));
  } catch {
    return null;
  }
}
