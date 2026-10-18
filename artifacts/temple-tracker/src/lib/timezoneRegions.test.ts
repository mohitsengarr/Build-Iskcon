import { describe, expect, it } from "vitest";
import { cityFromZone, describeZone, placesFromZones, totalPlaces } from "./timezoneRegions";

describe("cityFromZone", () => {
  it("takes the city the zone is named after", () => {
    expect(cityFromZone("Asia/Kolkata")).toBe("Kolkata");
  });

  it("spaces out a multi-word city", () => {
    expect(cityFromZone("America/Los_Angeles")).toBe("Los Angeles");
  });

  it("takes the last part of a three-part zone", () => {
    expect(cityFromZone("America/Indiana/Indianapolis")).toBe("Indianapolis");
  });

  it("gives nothing back for nothing", () => {
    expect(cityFromZone("")).toBe("");
    expect(cityFromZone(null)).toBe("");
    expect(cityFromZone(undefined)).toBe("");
  });
});

describe("describeZone", () => {
  it("names the country of a zone it knows", () => {
    expect(describeZone("Asia/Kolkata")).toEqual({ city: "Kolkata", country: "India" });
  });

  it("knows the old spelling a device may still report", () => {
    // Older Androids report Asia/Calcutta for the same place.
    expect(describeZone("Asia/Calcutta").country).toBe("India");
  });

  it("still names the city of a zone it does not know", () => {
    expect(describeZone("Antarctica/Troll")).toEqual({ city: "Troll", country: null });
  });

  it("does not guess a country from rubbish", () => {
    expect(describeZone("not a zone").country).toBeNull();
  });
});

describe("placesFromZones", () => {
  it("counts a country once across all of its zones", () => {
    const places = placesFromZones([
      { timezone: "Australia/Sydney", joined: 2 },
      { timezone: "Australia/Perth", joined: 1 },
      { timezone: "Australia/Brisbane", joined: 1 },
    ]);
    expect(places).toEqual([{ label: "Australia", joined: 4, approximate: false }]);
  });

  it("puts the busiest place first", () => {
    const places = placesFromZones([
      { timezone: "Europe/London", joined: 3 },
      { timezone: "Asia/Kolkata", joined: 61 },
      { timezone: "America/New_York", joined: 8 },
    ]);
    expect(places.map(p => p.label)).toEqual(["India", "United States", "United Kingdom"]);
  });

  it("breaks a tie on the name, so the order never wobbles between polls", () => {
    const places = placesFromZones([
      { timezone: "Europe/Dublin", joined: 2 },
      { timezone: "Asia/Dubai", joined: 2 },
    ]);
    expect(places.map(p => p.label)).toEqual(["Ireland", "United Arab Emirates"]);
  });

  it("falls back to the city, and says the label is only approximate", () => {
    const [place] = placesFromZones([{ timezone: "Antarctica/Troll", joined: 1 }]);
    expect(place).toEqual({ label: "Troll", joined: 1, approximate: true });
  });

  it("merges the old and new spelling of one place", () => {
    const places = placesFromZones([
      { timezone: "Asia/Calcutta", joined: 2 },
      { timezone: "Asia/Kolkata", joined: 5 },
    ]);
    expect(places).toEqual([{ label: "India", joined: 7, approximate: false }]);
  });

  it("drops a row with no usable zone rather than inventing a place", () => {
    expect(placesFromZones([{ timezone: "", joined: 4 }])).toEqual([]);
  });

  it("ignores counts that are not counts", () => {
    const rows = [
      { timezone: "Asia/Kolkata", joined: Number.NaN },
      { timezone: "Asia/Dubai", joined: 0 },
      { timezone: "Europe/London", joined: -3 },
    ] as Array<{ timezone: string; joined: number }>;
    expect(placesFromZones(rows)).toEqual([]);
  });

  it("gives nothing back for nothing", () => {
    expect(placesFromZones([])).toEqual([]);
  });
});

describe("totalPlaces", () => {
  it("adds the places up", () => {
    const places = placesFromZones([
      { timezone: "Asia/Kolkata", joined: 61 },
      { timezone: "Europe/London", joined: 3 },
    ]);
    expect(totalPlaces(places)).toBe(64);
  });

  it("is zero for nothing", () => {
    expect(totalPlaces([])).toBe(0);
  });
});
