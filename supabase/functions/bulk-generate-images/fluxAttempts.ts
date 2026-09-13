// FLUX attempt loop for generateImage. Every generator whose last retry sends a
// fixed SAFE_FALLBACK prompt keeps an identical copy of this file (a test checks
// that the copies match): bulk-generate-chapter-art, bulk-generate-chaitanya-art,
// bulk-generate-images and instagram-post.
//
// SAFE_FALLBACK carries no research facts, so an image made from it can get a
// canonical detail wrong again. That attempt now logs one line saying how many
// facts it dropped. Otherwise the loop is unchanged: attempts run in order and
// the first image returned wins. A render the visual check has abandoned
// (opts.signal aborted) starts no further attempt.
//
// Pure: no Deno, no IO, so node tests import it directly.

export interface FluxAttempt {
  model: string;
  prompt: string;
  w: number;
  h: number;
  seed?: number;
  /** A fixed prompt that carries none of the research facts. */
  safeFallback?: boolean;
}

/** The log line for a SAFE_FALLBACK attempt, or null when no fact was in the prompt it replaces. */
export function safeFallbackFactsNote(tag: string, attemptNumber: number, factsInPrompt: number): string | null {
  const n = Math.floor(Number(factsInPrompt));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `[${tag}] FLUX attempt ${attemptNumber} uses SAFE_FALLBACK: ${n} research fact${n === 1 ? "" : "s"} dropped for this attempt`;
}

/** Runs attempts in order and returns the first image, or null when every attempt fails or the signal is aborted. */
export async function runFluxAttempts<A extends FluxAttempt>(
  attempts: readonly A[],
  generate: (attempt: A) => Promise<string | null>,
  opts: { tag: string; factsInPrompt: number; log?: (line: string) => void; signal?: AbortSignal },
): Promise<string | null> {
  const log = opts.log ?? ((line: string) => console.log(line));
  for (let i = 0; i < attempts.length; i++) {
    if (opts.signal?.aborted) return null;
    const attempt = attempts[i];
    if (attempt.safeFallback) {
      const note = safeFallbackFactsNote(opts.tag, i + 1, opts.factsInPrompt);
      if (note) log(note);
    }
    const b64 = await generate(attempt);
    if (b64) return b64;
  }
  return null;
}
