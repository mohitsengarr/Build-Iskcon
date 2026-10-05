import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROGRESS_TABLE,
  SAVE_PAGE_GAP,
  fetchProgress,
  resumeLabel,
  saveProgress,
  worthOffering,
  worthSaving,
} from "./readerProgress";

const calls: Array<{ url: string; init?: RequestInit }> = [];
function fakeFetch(response: { ok: boolean; body?: unknown }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: response.ok, json: async () => response.body } as Response;
  });
}

afterEach(() => { calls.length = 0; vi.unstubAllGlobals(); });

describe("worthSaving", () => {
  it("saves the first place there is", () => {
    expect(worthSaving({ pageNumber: 42 }, null)).toBe(true);
  });

  it("does not write again for the page the reader is already stored on", () => {
    expect(worthSaving({ pageNumber: 42 }, { pageNumber: 42 })).toBe(false);
    expect(worthSaving({ pageNumber: 43 }, { pageNumber: 42 })).toBe(false); // within the gap
  });

  it("saves once the reader has actually moved on", () => {
    expect(worthSaving({ pageNumber: 44 }, { pageNumber: 42 })).toBe(true);
    expect(worthSaving({ pageNumber: 40 }, { pageNumber: 42 })).toBe(true);
  });

  it("saves a new line on the same page, which is a different place to return to", () => {
    expect(worthSaving({ pageNumber: 42, lineAnchor: "दूसरी पंक्ति" }, { pageNumber: 42, lineAnchor: "पहली पंक्ति" })).toBe(true);
  });

  it("refuses a place that is not one", () => {
    for (const bad of [null, undefined, { pageNumber: 0 }, { pageNumber: -3 }, { pageNumber: Number.NaN }]) {
      expect(worthSaving(bad as never, null)).toBe(false);
    }
  });
});

describe("worthOffering", () => {
  it("offers a place the reader is not already at", () => {
    expect(worthOffering({ pageNumber: 418 }, 12)).toBe(true);
  });

  it("says nothing when the reader is already there", () => {
    expect(worthOffering({ pageNumber: 418 }, 418)).toBe(false);
    expect(worthOffering({ pageNumber: 418 }, 418 + SAVE_PAGE_GAP)).toBe(false);
  });

  it("offers it when there is no current page yet", () => {
    expect(worthOffering({ pageNumber: 418 }, null)).toBe(true);
  });

  it("has nothing to offer without a stored place", () => {
    expect(worthOffering(null, 12)).toBe(false);
    expect(worthOffering({ pageNumber: 0 }, 12)).toBe(false);
  });
});

describe("resumeLabel", () => {
  it("names the page, and how far in when that is known", () => {
    expect(resumeLabel({ pageNumber: 418, percent: 37 })).toBe("Continue from page 418 — 37% in");
    expect(resumeLabel({ pageNumber: 418 })).toBe("Continue from page 418");
    expect(resumeLabel({ pageNumber: 418, percent: 0 })).toBe("Continue from page 418");
  });

  it("says nothing without a place", () => {
    expect(resumeLabel(null)).toBe("");
  });
});

describe("fetchProgress", () => {
  it("asks for this reader's place in this book", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ok: true, body: [{ page_number: 418, line_anchor: "पंक्ति", percent: 37, updated_at: "2026-10-05T00:00:00Z" }] }));
    const place = await fetchProgress("gita", "reader-1");
    expect(place).toEqual({ pageNumber: 418, lineAnchor: "पंक्ति", percent: 37, updatedAt: "2026-10-05T00:00:00Z" });
    expect(calls[0].url).toContain(`${PROGRESS_TABLE}?reader_id=eq.reader-1&book=eq.gita`);
  });

  it("returns nothing rather than failing when there is no row, a bad row or an error", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ok: true, body: [] }));
    expect(await fetchProgress("gita", "reader-1")).toBeNull();
    vi.stubGlobal("fetch", fakeFetch({ ok: true, body: [{ page_number: "nonsense" }] }));
    expect(await fetchProgress("gita", "reader-1")).toBeNull();
    vi.stubGlobal("fetch", fakeFetch({ ok: false }));
    expect(await fetchProgress("gita", "reader-1")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchProgress("gita", "reader-1")).toBeNull();
  });

  it("does not call out at all without a reader", async () => {
    const f = fakeFetch({ ok: true, body: [] });
    vi.stubGlobal("fetch", f);
    expect(await fetchProgress("gita", "")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("saveProgress", () => {
  it("upserts on the reader and the book together", async () => {
    vi.stubGlobal("fetch", fakeFetch({ ok: true }));
    expect(await saveProgress("chaitanya", "reader-1", { pageNumber: 100100007, percent: 4 })).toBe(true);
    expect(calls[0].url).toContain("on_conflict=reader_id,book");
    expect(String((calls[0].init?.headers as Record<string, string>)?.Prefer)).toContain("merge-duplicates");
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ reader_id: "reader-1", book: "chaitanya", page_number: 100100007, percent: 4 });
  });

  it("never throws when the network does", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(saveProgress("gita", "reader-1", { pageNumber: 42 })).resolves.toBe(false);
  });

  it("does not write without a reader or a page", async () => {
    const f = fakeFetch({ ok: true });
    vi.stubGlobal("fetch", f);
    expect(await saveProgress("gita", "", { pageNumber: 42 })).toBe(false);
    expect(await saveProgress("gita", "reader-1", { pageNumber: 0 })).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
