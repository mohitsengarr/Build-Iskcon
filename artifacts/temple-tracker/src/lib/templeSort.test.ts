import { describe, expect, it } from "vitest";
import { distanceKm, fundedPercent, sortByFunding, type SortableTemple } from "./templeSort";

function temple(name: string, raised: number, goal: number, at: [number, number] | null = null): SortableTemple {
  return {
    name,
    fundraisingGoal: goal,
    fundraisingRaised: raised,
    latitude: at ? at[0] : null,
    longitude: at ? at[1] : null,
  };
}

const names = (ts: SortableTemple[]) => ts.map((t) => t.name);

const DELHI: [number, number] = [28.61, 77.21];
const NOIDA: [number, number] = [28.47, 77.5];
const MUMBAI: [number, number] = [19.08, 72.88];

describe("fundedPercent", () => {
  it("returns the rounded percentage of the goal raised", () => {
    expect(fundedPercent(temple("a", 4_500_000, 10_000_000))).toBe(45);
    expect(fundedPercent(temple("a", 2, 3))).toBe(67);
  });

  it("returns null when there is no goal, rather than 0%", () => {
    expect(fundedPercent(temple("a", 0, 0))).toBeNull();
    expect(fundedPercent(temple("a", 500, 0))).toBeNull();
    expect(fundedPercent(temple("a", 0, -1))).toBeNull();
    expect(fundedPercent(temple("a", 0, Number.NaN))).toBeNull();
  });

  it("reports 0 for a real goal with nothing raised", () => {
    expect(fundedPercent(temple("a", 0, 1_000_000))).toBe(0);
  });

  it("can exceed 100 when a temple has raised more than its goal", () => {
    expect(fundedPercent(temple("a", 12, 10))).toBe(120);
  });
});

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm(...DELHI, ...DELHI)).toBe(0);
  });

  it("puts Noida nearer to Delhi than Mumbai is", () => {
    expect(distanceKm(...DELHI, ...NOIDA)).toBeLessThan(distanceKm(...DELHI, ...MUMBAI));
    expect(distanceKm(...DELHI, ...MUMBAI)).toBeGreaterThan(1100);
    expect(distanceKm(...DELHI, ...MUMBAI)).toBeLessThan(1200);
  });
});

describe("sortByFunding", () => {
  const mixed = [
    temple("Dwarka", 48, 100),
    temple("Wave City", 0, 0),
    temple("Vrindavan", 63, 100),
    temple("Kangra", 0, 50),
    temple("Kurukshetra", 81, 100),
    temple("Gaur Dham", 45, 100),
  ];

  it("puts the best-funded temple first when descending", () => {
    expect(names(sortByFunding(mixed, "desc"))).toEqual([
      "Kurukshetra", "Vrindavan", "Dwarka", "Gaur Dham", "Kangra", "Wave City",
    ]);
  });

  it("puts the least-funded real goal first when ascending", () => {
    expect(names(sortByFunding(mixed, "asc"))).toEqual([
      "Kangra", "Gaur Dham", "Dwarka", "Vrindavan", "Kurukshetra", "Wave City",
    ]);
  });

  it("keeps temples without a goal at the bottom in both directions", () => {
    const noGoal = [temple("B none", 0, 0), temple("Funded", 90, 100), temple("A none", 0, 0)];
    expect(names(sortByFunding(noGoal, "desc"))).toEqual(["Funded", "A none", "B none"]);
    expect(names(sortByFunding(noGoal, "asc"))).toEqual(["Funded", "A none", "B none"]);
  });

  it("ranks by the percentage as displayed, so 45.2% and 44.9% tie", () => {
    const close = [temple("Beta", 449, 1000), temple("Alpha", 452, 1000)];
    expect(names(sortByFunding(close, "desc"))).toEqual(["Alpha", "Beta"]);
    expect(names(sortByFunding(close, "asc"))).toEqual(["Alpha", "Beta"]);
  });

  it("breaks a funding tie by distance from the visitor", () => {
    const tied = [temple("Mumbai", 0, 10, MUMBAI), temple("Noida", 0, 10, NOIDA)];
    expect(names(sortByFunding(tied, "desc", { lat: DELHI[0], lon: DELHI[1] }))).toEqual(["Noida", "Mumbai"]);
  });

  it("orders unfunded temples nearest first too", () => {
    const unknown = [temple("Mumbai", 0, 0, MUMBAI), temple("Noida", 0, 0, NOIDA)];
    expect(names(sortByFunding(unknown, "desc", { lat: DELHI[0], lon: DELHI[1] }))).toEqual(["Noida", "Mumbai"]);
  });

  it("never lets distance outrank funding", () => {
    const ts = [temple("Near", 10, 100, NOIDA), temple("Far", 90, 100, MUMBAI)];
    expect(names(sortByFunding(ts, "desc", { lat: DELHI[0], lon: DELHI[1] }))).toEqual(["Far", "Near"]);
  });

  it("puts a tied temple without coordinates after the ones that have them", () => {
    const ts = [temple("Unplaced", 5, 10), temple("Placed", 5, 10, MUMBAI)];
    expect(names(sortByFunding(ts, "desc", { lat: DELHI[0], lon: DELHI[1] }))).toEqual(["Placed", "Unplaced"]);
  });

  it("falls back to name order when there is no location", () => {
    const ts = [temple("Charlie", 5, 10, MUMBAI), temple("Alpha", 5, 10, NOIDA)];
    expect(names(sortByFunding(ts, "desc"))).toEqual(["Alpha", "Charlie"]);
  });

  it("does not mutate the input and returns the same objects", () => {
    const input = [temple("Low", 1, 10), temple("High", 9, 10)];
    const before = [...input];
    const out = sortByFunding(input, "desc");
    expect(input).toEqual(before);
    expect(out[0]).toBe(input[1]);
  });

  it("returns an empty list for no temples", () => {
    expect(sortByFunding([], "desc")).toEqual([]);
  });
});
