// The daily shape of Bhaktigram's arrivals, for the live counter's chart.
//
// The counter already reckons in UTC days — "joined today" asks for rows since
// midnight UTC — so the chart reckons the same way. Bucketing by the viewer's
// local day instead would put the last bar out of step with the tile above it.

export interface JoinDay {
  /** YYYY-MM-DD, in UTC. */
  key: string;
  /** Midnight UTC of that day. */
  date: Date;
  count: number;
}

const DAY_MS = 86_400_000;

function asDate(value: Date | string | number): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The UTC day a timestamp falls in, or null if it is not a timestamp at all. */
export function utcDayKey(value: Date | string | number): string | null {
  const d = asDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Midnight UTC of the day a timestamp falls in. */
export function utcMidnight(value: Date | string | number): Date | null {
  const key = utcDayKey(value);
  return key ? new Date(`${key}T00:00:00.000Z`) : null;
}

export interface DailyJoinsOptions {
  /** How many days the window covers, counting today. */
  days: number;
  now?: Date;
  /**
   * The earliest day the window may reach. Days before the app was on Play are
   * not quiet zero days — nobody could have joined — so the chart does not draw
   * them rather than showing a fortnight of honest-looking emptiness.
   */
  since?: Date | string;
}

/**
 * The last `days` UTC days ending today, oldest first, with the days nobody
 * joined filled in as zero. Timestamps outside the window, and anything that is
 * not a timestamp, are ignored.
 */
export function dailyJoins(
  timestamps: Iterable<Date | string | number>,
  { days, now = new Date(), since }: DailyJoinsOptions,
): JoinDay[] {
  const today = utcMidnight(now);
  if (!today || !Number.isFinite(days) || days < 1) return [];

  let first = new Date(today.getTime() - (Math.floor(days) - 1) * DAY_MS);
  const floor = since === undefined ? null : utcMidnight(since);
  if (floor && floor.getTime() > first.getTime()) first = floor;
  if (first.getTime() > today.getTime()) return [];

  const counts = new Map<string, number>();
  for (const t of timestamps) {
    const key = utcDayKey(t);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const series: JoinDay[] = [];
  for (let ms = first.getTime(); ms <= today.getTime(); ms += DAY_MS) {
    const date = new Date(ms);
    const key = date.toISOString().slice(0, 10);
    series.push({ key, date, count: counts.get(key) ?? 0 });
  }
  return series;
}

export function totalJoins(series: readonly JoinDay[]): number {
  return series.reduce((n, d) => n + d.count, 0);
}

/** The busiest day, or null when nobody joined on any of them. */
export function peakDay(series: readonly JoinDay[]): JoinDay | null {
  let best: JoinDay | null = null;
  for (const day of series) {
    if (day.count > 0 && (!best || day.count > best.count)) best = day;
  }
  return best;
}

/** Arrivals per day across the window, to one decimal place. */
export function averagePerDay(series: readonly JoinDay[]): number {
  if (series.length === 0) return 0;
  return Math.round((totalJoins(series) / series.length) * 10) / 10;
}

/**
 * Label every nth bar, so a month of days does not print 30 dates on top of one
 * another. Always at least 1, so every bar is labelled when there is room.
 */
export function labelStride(count: number, maxLabels = 8): number {
  if (count <= 0 || maxLabels < 1) return 1;
  return Math.max(1, Math.ceil(count / maxLabels));
}

/** "Sat 17" — the weekday and date of a UTC day, read in UTC. */
export function dayLabel(day: JoinDay): string {
  return day.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

/** "Saturday 17 October" — the long form, for the peak line under the chart. */
export function longDayLabel(day: JoinDay): string {
  return day.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
