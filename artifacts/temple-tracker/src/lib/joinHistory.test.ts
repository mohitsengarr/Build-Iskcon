import { describe, expect, it } from "vitest";
import {
  averagePerDay, dailyJoins, dayLabel, labelStride, longDayLabel,
  peakDay, totalJoins, utcDayKey, utcMidnight,
} from "./joinHistory";

const NOW = new Date("2026-10-18T17:59:00.000Z");
const LAUNCH = "2026-10-07T00:00:00Z";

describe("utcDayKey", () => {
  it("reads the UTC day of a timestamp", () => {
    expect(utcDayKey("2026-10-17T11:30:00.000Z")).toBe("2026-10-17");
  });

  it("keeps the UTC day for a late-evening arrival, not the next local one", () => {
    expect(utcDayKey("2026-10-17T23:45:00.000Z")).toBe("2026-10-17");
  });

  it("returns null for something that is not a timestamp", () => {
    expect(utcDayKey("not a date")).toBeNull();
  });
});

describe("utcMidnight", () => {
  it("floors a timestamp to midnight UTC of its own day", () => {
    expect(utcMidnight("2026-10-17T23:45:00.000Z")?.toISOString()).toBe("2026-10-17T00:00:00.000Z");
  });

  it("returns null for rubbish", () => {
    expect(utcMidnight("")).toBeNull();
  });
});

describe("dailyJoins", () => {
  it("counts arrivals into the UTC day each one falls in", () => {
    const series = dailyJoins(
      ["2026-10-17T09:00:00Z", "2026-10-17T22:10:00Z", "2026-10-18T04:00:00Z"],
      { days: 2, now: NOW },
    );
    expect(series.map(d => [d.key, d.count])).toEqual([["2026-10-17", 2], ["2026-10-18", 1]]);
  });

  it("fills in the days nobody joined", () => {
    // 13 and 14 October really had no arrivals; the chart has to draw the gap.
    const series = dailyJoins(["2026-10-12T10:00:00Z", "2026-10-15T10:00:00Z"], { days: 4, now: new Date("2026-10-15T12:00:00Z") });
    expect(series.map(d => d.count)).toEqual([1, 0, 0, 1]);
  });

  it("ends on today, oldest first", () => {
    const series = dailyJoins([], { days: 3, now: NOW });
    expect(series.map(d => d.key)).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("never reaches back before the app was on Play", () => {
    const series = dailyJoins([], { days: 30, now: NOW, since: LAUNCH });
    expect(series[0].key).toBe("2026-10-07");
    expect(series).toHaveLength(12);
  });

  it("leaves a window that already starts after launch alone", () => {
    const series = dailyJoins([], { days: 3, now: NOW, since: LAUNCH });
    expect(series.map(d => d.key)).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("ignores arrivals from outside the window", () => {
    const series = dailyJoins(["2026-10-01T10:00:00Z", "2026-10-18T10:00:00Z"], { days: 2, now: NOW });
    expect(totalJoins(series)).toBe(1);
  });

  it("ignores values that are not timestamps", () => {
    const series = dailyJoins(["nonsense", null as unknown as string, "2026-10-18T10:00:00Z"], { days: 1, now: NOW });
    expect(totalJoins(series)).toBe(1);
  });

  it("gives a single day for a one-day window", () => {
    expect(dailyJoins([], { days: 1, now: NOW })).toHaveLength(1);
  });

  it("returns nothing for a window of no days", () => {
    expect(dailyJoins([], { days: 0, now: NOW })).toEqual([]);
  });

  it("returns nothing when launch is still ahead of today", () => {
    expect(dailyJoins([], { days: 7, now: NOW, since: "2026-11-01T00:00:00Z" })).toEqual([]);
  });
});

describe("totalJoins", () => {
  it("adds the window up", () => {
    const series = dailyJoins(["2026-10-17T09:00:00Z", "2026-10-18T09:00:00Z"], { days: 2, now: NOW });
    expect(totalJoins(series)).toBe(2);
  });

  it("is zero for an empty window", () => {
    expect(totalJoins([])).toBe(0);
  });
});

describe("peakDay", () => {
  it("finds the busiest day", () => {
    const series = dailyJoins(
      ["2026-10-17T01:00:00Z", "2026-10-17T02:00:00Z", "2026-10-18T01:00:00Z"],
      { days: 2, now: NOW },
    );
    expect(peakDay(series)?.key).toBe("2026-10-17");
  });

  it("keeps the earlier day when two tie", () => {
    const series = dailyJoins(["2026-10-17T01:00:00Z", "2026-10-18T01:00:00Z"], { days: 2, now: NOW });
    expect(peakDay(series)?.key).toBe("2026-10-17");
  });

  it("is null when nobody joined at all", () => {
    expect(peakDay(dailyJoins([], { days: 5, now: NOW }))).toBeNull();
  });
});

describe("averagePerDay", () => {
  it("spreads the arrivals across the window, to one decimal", () => {
    const series = dailyJoins(
      ["2026-10-17T01:00:00Z", "2026-10-17T02:00:00Z", "2026-10-18T01:00:00Z"],
      { days: 4, now: NOW },
    );
    expect(averagePerDay(series)).toBe(0.8);
  });

  it("is zero for an empty window rather than dividing by nothing", () => {
    expect(averagePerDay([])).toBe(0);
  });
});

describe("labelStride", () => {
  it("labels every bar when they all fit", () => {
    expect(labelStride(7)).toBe(1);
  });

  it("thins the labels out for a long window", () => {
    expect(labelStride(30)).toBe(4);
  });

  it("never returns zero, which would label nothing", () => {
    expect(labelStride(0)).toBe(1);
    expect(labelStride(10, 0)).toBe(1);
  });
});

describe("day labels", () => {
  it("names the weekday and date in UTC", () => {
    const [day] = dailyJoins([], { days: 1, now: new Date("2026-10-17T23:50:00Z") });
    expect(dayLabel(day)).toBe("Sat 17");
  });

  it("spells the day out for the peak line", () => {
    const [day] = dailyJoins([], { days: 1, now: new Date("2026-10-17T23:50:00Z") });
    expect(longDayLabel(day)).toBe("Saturday 17 October");
  });
});
