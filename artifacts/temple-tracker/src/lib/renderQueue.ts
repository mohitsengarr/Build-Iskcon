// A render request holds an edge worker for tens of seconds and keeps a
// background visual check alive after it answers. Firing several at once put
// enough of them on one worker to exceed its budget: on 2026-09-20 a burst of
// Regenerate clicks ended in `POST | 546` — the worker was killed, and every
// request still in flight on it died with a body the page could not read.
//
// So renders queue. The button disables the moment it is clicked; the request
// itself waits its turn.

export interface TaskQueue {
  /** Runs `task` when a slot is free; resolves or rejects exactly as it does. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** How many are running right now (tests and diagnostics). */
  readonly active: number;
  /** How many are still waiting for a slot. */
  readonly waiting: number;
}

export function createQueue(limit: number): TaskQueue {
  const slots = Math.max(1, Math.floor(limit));
  const waiting: (() => void)[] = [];
  let active = 0;

  const release = () => {
    active--;
    // FIFO: the first click queued is the first to run.
    waiting.shift()?.();
  };

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const start = async (): Promise<T> => {
        active++;
        try {
          return await task();
        } finally {
          release();
        }
      };
      if (active < slots) return start();
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => { start().then(resolve, reject); });
      });
    },
    get active() { return active; },
    get waiting() { return waiting.length; },
  };
}

/** Shared by every render button on the gallery, so the page as a whole stays under the limit. */
export const renderQueue = createQueue(2);
