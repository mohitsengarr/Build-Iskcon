import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TRIES, findWhenReady } from "./awaitElement";

const noSleep = vi.fn(async () => {});

describe("findWhenReady", () => {
  it("returns a page that is already mounted without waiting", async () => {
    const sleep = vi.fn(async () => {});
    const found = await findWhenReady(() => "page", { sleep });
    expect(found).toBe("page");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits for a page that is still being mounted", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => {});
    const found = await findWhenReady(() => (++calls >= 3 ? "page" : null), { sleep });
    expect(found).toBe("page");
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up quietly rather than waiting forever", async () => {
    const found = await findWhenReady(() => null, { tries: 4, sleep: noSleep });
    expect(found).toBeNull();
  });

  it("sleeps between looks, never after the last one", async () => {
    const sleep = vi.fn(async () => {});
    await findWhenReady(() => null, { tries: 3, delayMs: 50, sleep });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);
  });

  it("treats a lookup that throws as 'not yet'", async () => {
    let calls = 0;
    const found = await findWhenReady(() => {
      calls++;
      if (calls < 2) throw new Error("detached");
      return "page";
    }, { sleep: noSleep });
    expect(found).toBe("page");
  });

  it("looks at least once, whatever it is told", async () => {
    let calls = 0;
    await findWhenReady(() => { calls++; return null; }, { tries: 0, sleep: noSleep });
    expect(calls).toBe(1);
  });

  it("has a default patient enough for a page set to mount", () => {
    expect(DEFAULT_TRIES).toBeGreaterThanOrEqual(5);
  });
});
