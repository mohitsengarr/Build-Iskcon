import { useMemo, useState } from "react";
import {
  averagePerDay, dailyJoins, dayLabel, labelStride, longDayLabel,
  peakDay, totalJoins, type JoinDay,
} from "@/lib/joinHistory";

// The day-by-day shape of the live counter: one bar per day since Bhaktigram
// went on Play, in the page's own warm palette rather than a dashboard blue.
//
// Bars are plain elements, not a chart library. The whole drawing is a dozen
// divs with a height each, which reflows at any width without the library's
// own breakpoints getting a say — and the page already carries enough weight.

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

/** Above this many bars the numbers collide, so only the peak keeps its label. */
const MAX_BARS_WITH_LABELS = 16;

interface JoinsChartProps {
  /** Arrival timestamps, newest or oldest first — the order does not matter. */
  timestamps: readonly string[];
  /** The day the app went live; the chart never reaches back past it. */
  since: string;
  /** Null until the first poll lands. */
  loaded: boolean;
}

export function JoinsChart({ timestamps, since, loaded }: JoinsChartProps) {
  const [range, setRange] = useState<Range>(30);

  const series = useMemo(
    () => dailyJoins(timestamps, { days: range, since }),
    [timestamps, range, since],
  );

  const total = totalJoins(series);
  const peak = peakDay(series);
  const average = averagePerDay(series);
  const tallest = peak?.count ?? 0;
  const stride = labelStride(series.length);
  const showEveryLabel = series.length <= MAX_BARS_WITH_LABELS;

  if (!loaded) {
    return (
      <div className="mt-12 h-56 rounded-2xl border border-stone-200/70 bg-white/60 animate-pulse" aria-hidden />
    );
  }

  return (
    <section className="mt-12 rounded-2xl border border-stone-200/70 bg-white/70 px-4 sm:px-6 py-5 text-left">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-base font-bold text-stone-800">Joined each day</h2>
          <p className="text-[11px] text-stone-400 mt-0.5">Counted by UTC day, like the figures above.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-stone-100 p-0.5" role="group" aria-label="How many days to show">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                  range === r ? "bg-amber-700 text-white" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
          <span className="rounded-full bg-amber-50 text-amber-800 text-xs font-semibold px-3 py-1 tabular-nums">
            Total: {total.toLocaleString("en-IN")}
          </span>
        </div>
      </header>

      {series.length === 0 ? (
        <p className="mt-8 mb-4 text-sm text-stone-400">Nothing to show for this window yet.</p>
      ) : (
        <>
          <ol className="mt-7 flex items-end gap-[3px] sm:gap-1.5 h-40" aria-hidden>
            {series.map((day) => (
              <Bar
                key={day.key}
                day={day}
                tallest={tallest}
                isPeak={peak?.key === day.key && day.count > 0}
                showLabel={showEveryLabel || peak?.key === day.key}
              />
            ))}
          </ol>

          <div className="mt-2 flex gap-[3px] sm:gap-1.5 border-t border-stone-200/70 pt-2" aria-hidden>
            {series.map((day, i) => (
              <div key={day.key} className="flex-1 min-w-0 text-center">
                {i % stride === 0 && (
                  <span className="text-[9px] sm:text-[10px] text-stone-400 whitespace-nowrap">{dayLabel(day)}</span>
                )}
              </div>
            ))}
          </div>

          {/* The bars are decoration for a screen reader; this is the actual reading. */}
          <p className="sr-only">
            {series.map((day) => `${longDayLabel(day)}: ${day.count}`).join(". ")}
          </p>

          <p className="mt-3 text-[11px] text-stone-400">
            {peak ? (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-700 align-middle mr-1.5" />
                Busiest day: <span className="font-semibold text-stone-600 tabular-nums">{peak.count}</span> on{" "}
                {longDayLabel(peak)}
                <span className="mx-2 text-stone-300">|</span>
              </>
            ) : null}
            Average <span className="font-semibold text-stone-600 tabular-nums">{average}</span>/day
          </p>
        </>
      )}
    </section>
  );
}

function Bar({ day, tallest, isPeak, showLabel }: {
  day: JoinDay;
  tallest: number;
  isPeak: boolean;
  showLabel: boolean;
}) {
  // A day nobody joined still gets a sliver, so the row reads as a row of days
  // rather than a gap in the chart.
  const height = tallest > 0 && day.count > 0 ? Math.max(6, (day.count / tallest) * 100) : 0;

  return (
    <li className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${longDayLabel(day)}: ${day.count}`}>
      {showLabel && (
        <span className={`text-[10px] sm:text-xs font-semibold tabular-nums mb-1 ${day.count > 0 ? (isPeak ? "text-amber-700" : "text-stone-500") : "text-stone-300"}`}>
          {day.count}
        </span>
      )}
      {day.count > 0 ? (
        <div
          className={`w-full rounded-t-md transition-[height] duration-500 ${isPeak ? "bg-amber-700" : "bg-amber-500/70"}`}
          style={{ height: `${height}%` }}
        />
      ) : (
        <div className="w-full h-px bg-stone-200" />
      )}
    </li>
  );
}
