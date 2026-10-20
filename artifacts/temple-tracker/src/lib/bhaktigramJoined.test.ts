import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sbRest", () => ({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon" }));

import {
  EXCLUDED_DEVICES,
  LAUNCH_ISO,
  PLAY_URL,
  countUrl,
  notOurs,
  sinceLaunch,
  totalFromContentRange,
} from "@/lib/bhaktigramJoined";

describe("totalFromContentRange", () => {
  it("reads the total from a limit=0 header", () => {
    expect(totalFromContentRange("*/83")).toBe(83);
  });

  it("reads the total from a ranged header", () => {
    expect(totalFromContentRange("0-24/1200")).toBe(1200);
  });

  it("accepts zero devotees", () => {
    expect(totalFromContentRange("*/0")).toBe(0);
  });

  it("returns null when the header is missing", () => {
    expect(totalFromContentRange(null)).toBeNull();
    expect(totalFromContentRange(undefined)).toBeNull();
    expect(totalFromContentRange("")).toBeNull();
  });

  it("returns null when PostgREST did not count (total is *)", () => {
    expect(totalFromContentRange("0-24/*")).toBeNull();
  });

  it("returns null for garbage rather than NaN or a negative", () => {
    expect(totalFromContentRange("*/abc")).toBeNull();
    expect(totalFromContentRange("*/-3")).toBeNull();
    expect(totalFromContentRange("*/2.5")).toBeNull();
    expect(totalFromContentRange("no-slash")).toBeNull();
  });
});

describe("count filters", () => {
  it("excludes every one of our own devices", () => {
    for (const d of EXCLUDED_DEVICES) expect(notOurs).toContain(d);
    expect(notOurs.startsWith("&device_id=not.in.(")).toBe(true);
  });

  it("counts from launch and still excludes our devices", () => {
    expect(sinceLaunch).toBe(`&created_at=gte.${LAUNCH_ISO}${notOurs}`);
  });

  it("builds a count URL that fetches no rows", () => {
    const u = countUrl(sinceLaunch);
    expect(u.startsWith("https://example.supabase.co/rest/v1/bhaktigram_profiles?")).toBe(true);
    expect(u).toContain("limit=0");
    expect(u).toContain("select=device_id");
    expect(u.endsWith(sinceLaunch)).toBe(true);
  });

  it("builds an unfiltered count URL when no filter is given", () => {
    expect(countUrl()).toBe("https://example.supabase.co/rest/v1/bhaktigram_profiles?select=device_id&limit=0");
  });
});

describe("PLAY_URL", () => {
  it("points at the live Bhaktigram listing", () => {
    expect(PLAY_URL).toBe("https://play.google.com/store/apps/details?id=com.buildiskcon.bhaktigram");
  });
});
