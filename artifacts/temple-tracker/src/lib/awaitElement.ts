// Waiting for a page that is still being mounted.
//
// Jumping to a bookmark, or to the place a reader reached on another device,
// often crosses the set of pages the reader has mounted. The page is chosen,
// React re-renders, and only then does the element exist — so a single timeout
// looks for it too early, finds nothing, and the reader stays where they were.
// This waits a little, a few times, and gives up quietly.

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export interface FindWhenReadyOptions {
  /** How many times to look, including the first. */
  tries?: number;
  /** How long to wait between looks. */
  delayMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_TRIES = 10;
export const DEFAULT_DELAY_MS = 120;

/**
 * The first non-null result of `lookup`, or null once the tries run out. The
 * first look happens immediately: a page that is already mounted costs nothing.
 */
export async function findWhenReady<T>(
  lookup: () => T | null | undefined,
  { tries = DEFAULT_TRIES, delayMs = DEFAULT_DELAY_MS, sleep = defaultSleep }: FindWhenReadyOptions = {},
): Promise<T | null> {
  const attempts = Math.max(1, Math.floor(tries));
  for (let i = 0; i < attempts; i++) {
    let found: T | null | undefined;
    try {
      found = lookup();
    } catch {
      found = null;
    }
    if (found) return found;
    if (i < attempts - 1) await sleep(Math.max(0, delayMs));
  }
  return null;
}
