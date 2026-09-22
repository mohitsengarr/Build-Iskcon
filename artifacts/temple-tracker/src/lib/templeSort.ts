// Ordering for the home page temple table: by how much of the goal is funded,
// with the visitor's nearest temples first among equals.

export type SortDirection = "desc" | "asc";

export interface SortableTemple {
  name: string;
  fundraisingGoal: number;
  fundraisingRaised: number;
  latitude: number | null;
  longitude: number | null;
}

export interface Coords { lat: number; lon: number }

// The rounded percentage the table shows, or null when there is no goal to
// measure against. A temple with no goal is unknown, not 0% funded.
export function fundedPercent(t: Pick<SortableTemple, "fundraisingGoal" | "fundraisingRaised">): number | null {
  if (!(t.fundraisingGoal > 0)) return null;
  return Math.round((t.fundraisingRaised / t.fundraisingGoal) * 100);
}

// Haversine distance in km — good enough for ranking.
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function distanceFrom(t: SortableTemple, from: Coords | null): number {
  if (!from || t.latitude == null || t.longitude == null) return Infinity;
  return distanceKm(from.lat, from.lon, t.latitude, t.longitude);
}

// Sorts by the percentage as displayed, so rows that read the same stay
// together. Temples without a goal always sink to the bottom, whichever way
// the column is sorted. Ties go to the nearer temple, then by name.
export function sortByFunding<T extends SortableTemple>(temples: readonly T[], direction: SortDirection, from: Coords | null = null): T[] {
  return temples
    .map((t) => ({ t, pct: fundedPercent(t), km: distanceFrom(t, from) }))
    .sort((a, b) => {
      if (a.pct === null || b.pct === null) {
        if (a.pct !== b.pct) return a.pct === null ? 1 : -1;
      } else if (a.pct !== b.pct) {
        return direction === "desc" ? b.pct - a.pct : a.pct - b.pct;
      }
      if (a.km !== b.km) return a.km === Infinity ? 1 : b.km === Infinity ? -1 : a.km - b.km;
      return a.t.name.localeCompare(b.t.name);
    })
    .map(({ t }) => t);
}
