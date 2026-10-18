import { useMemo } from "react";
import { placesFromZones, totalPlaces, type ZoneCount } from "@/lib/timezoneRegions";

// Where devotees are joining from, as far as a timezone can say.
//
// The panel keeps itself honest in two ways. It never appears until at least
// one device has reported a region, so it cannot imply a breakdown of everyone;
// and it prints how many of the total it actually covers, because devotees who
// joined before the app started recording this will never be in it.

const MAX_ROWS = 8;

interface JoinsPlacesProps {
  /** Counts per IANA zone, from the aggregate; never per-device rows. */
  zones: readonly ZoneCount[];
  /** Everyone counted on the page, so the panel can say what share it covers. */
  totalDevotees: number | null;
}

export function JoinsPlaces({ zones, totalDevotees }: JoinsPlacesProps) {
  const places = useMemo(() => placesFromZones(zones), [zones]);
  const known = totalPlaces(places);

  if (places.length === 0) return null;

  const tallest = places[0].joined;
  const shown = places.slice(0, MAX_ROWS);
  const rest = places.slice(MAX_ROWS);
  const restTotal = totalPlaces(rest);

  return (
    <section className="mt-6 rounded-2xl border border-stone-200/70 bg-white/70 px-4 sm:px-6 py-5 text-left">
      <header>
        <h2 className="font-serif text-base font-bold text-stone-800">Where they are joining from</h2>
        <p className="text-[11px] text-stone-400 mt-0.5">
          {totalDevotees != null && known < totalDevotees
            ? `Known for ${known.toLocaleString("en-IN")} of ${totalDevotees.toLocaleString("en-IN")} devotees.`
            : `Known for ${known.toLocaleString("en-IN")} ${known === 1 ? "devotee" : "devotees"}.`}
        </p>
      </header>

      <ol className="mt-4 space-y-2">
        {shown.map((place) => (
          <li key={place.label} className="flex items-center gap-3">
            {/* Wraps rather than truncating: "United Arab Emirates" does not fit a
                phone's column, and there is no hover on a phone to reveal it. */}
            <span className="w-28 sm:w-40 shrink-0 text-xs text-stone-600 leading-tight">
              {place.label}
            </span>
            <span className="flex-1 h-2.5 rounded-full bg-stone-100 overflow-hidden">
              <span
                className="block h-full rounded-full bg-amber-500/70"
                style={{ width: `${Math.max(4, (place.joined / tallest) * 100)}%` }}
              />
            </span>
            <span className="w-8 text-right text-xs font-semibold text-stone-600 tabular-nums">{place.joined}</span>
          </li>
        ))}
        {rest.length > 0 && (
          <li className="flex items-center gap-3 pt-1">
            <span className="w-28 sm:w-40 shrink-0 text-xs text-stone-400">
              {rest.length} more {rest.length === 1 ? "place" : "places"}
            </span>
            <span className="flex-1" />
            <span className="w-8 text-right text-xs text-stone-400 tabular-nums">{restTotal}</span>
          </li>
        )}
      </ol>

      <p className="mt-4 text-[11px] text-stone-400 leading-relaxed">
        Taken from the timezone each device is set to — no location is collected and nothing is
        looked up. A devotee travelling, or using a VPN, is counted wherever their phone thinks it
        is.
      </p>
    </section>
  );
}
