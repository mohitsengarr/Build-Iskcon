import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/sbRest";

// buildiskcon.com/livecounter — how many devotees have joined Bhaktigram, counted
// live (SEN-907).
//
// The count comes from PostgREST's `Prefer: count=exact`, which reports the total
// in the content-range header while `limit=0` returns no rows at all. So the page
// learns the number without ever pulling a devotee's profile into the browser.
//
// "Live" here means polled, not streamed: every POLL_MS the page asks again. It
// says so on the page rather than implying a socket it does not have.

const POLL_MS = 20_000;

// Bhaktigram went public on Google Play late on 6 October 2026, and the installs
// start arriving at 02:00 UTC on the 7th. Everything before that line is the
// closed test and our own devices — 45 profiles that are not devotees who found
// the app (SEN-907). The counter therefore counts from launch, and says so, rather
// than quietly inflating itself with its own test accounts.
const LAUNCH_ISO = "2026-10-07T00:00:00Z";
const LAUNCH_LABEL = "7 October 2026";

// Our own devices, excluded by id as well as by date. dev_762f… is the emulator
// this app is developed on — it identifies itself in the data as "Test Mohit" and
// predates launch, but naming it here means a test install can never quietly
// become a devotee in the count (Mohit, 8 Oct).
const EXCLUDED_DEVICES = ["dev_762fbwdgbe3mtsqgeo3"];

const notOurs = `&device_id=not.in.(${EXCLUDED_DEVICES.join(",")})`;
const sinceLaunch = `&created_at=gte.${LAUNCH_ISO}${notOurs}`;

/** Count rows matching a filter without fetching any of them. */
async function countRows(filter = ""): Promise<number | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/bhaktigram_profiles?select=device_id&limit=0${filter}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "count=exact",
      },
    },
  );
  if (!r.ok) return null;
  // content-range looks like "*/100" when limit=0.
  const total = r.headers.get("content-range")?.split("/")[1];
  const n = Number(total);
  return Number.isFinite(n) ? n : null;
}

const startOfTodayUtc = () => `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
const startOfYesterdayUtc = () =>
  `${new Date(Date.now() - 864e5).toISOString().slice(0, 10)}T00:00:00Z`;

/** Rolls the number up to a new value instead of snapping, so an arrival is felt. */
function useCountUp(target: number | null) {
  const [shown, setShown] = useState(target ?? 0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null) return;
    const start = from.current;
    const delta = target - start;
    if (delta === 0) return;
    const t0 = performance.now();
    const ms = Math.min(1200, 260 + Math.abs(delta) * 90);
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + delta * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

export default function LiveCounter() {
  const [total, setTotal] = useState<number | null>(null);
  const [today, setToday] = useState<number | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const [t, d, y] = await Promise.all([
      countRows(sinceLaunch),
      countRows(`&created_at=gte.${startOfTodayUtc()}${notOurs}`),
      countRows(`&created_at=gte.${startOfYesterdayUtc()}&created_at=lt.${startOfTodayUtc()}${notOurs}`),
    ]);
    // A failed poll keeps the last good number on screen rather than flashing a
    // zero: a counter that drops to nothing reads as "the app lost its users".
    if (t == null) { setFailed(true); return; }
    setFailed(false);
    setTotal(t);
    if (d != null) setToday(d);
    if (y != null) setWeek(y);
    setUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const shown = useCountUp(total);

  return (
    <Layout>
      <Helmet>
        <title>Bhaktigram — devotees joined | Build Iskcon</title>
        <meta
          name="description"
          content="A live count of the devotees who have joined Bhaktigram, the devotional app for darshan, japa and the Bhagavatam."
        />
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 sm:px-8 pb-20 pt-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-700/80 mb-3">Bhaktigram</p>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-stone-800">
          Devotees who have joined
        </h1>
        <p className="text-xs text-stone-400 mt-2">since Bhaktigram went live on Google Play, {LAUNCH_LABEL}</p>

        <div className="mt-10 mb-2 tabular-nums font-serif font-bold text-stone-800 text-7xl sm:text-8xl leading-none">
          {total == null && !failed ? (
            <span className="text-stone-300">—</span>
          ) : (
            shown.toLocaleString("en-IN")
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-stone-400">
          <span className={`inline-block w-2 h-2 rounded-full ${failed ? "bg-stone-300" : "bg-emerald-500 animate-pulse"}`} />
          {failed
            ? "Could not reach the server — showing the last count"
            : updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · refreshes every 20s`
              : "Counting…"}
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4 max-w-sm mx-auto">
          <div className="rounded-2xl bg-white/70 border border-stone-200/70 py-5">
            <div className="font-serif text-3xl font-bold text-stone-800 tabular-nums">
              {today ?? "—"}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-stone-400 mt-1">Joined today</div>
          </div>
          <div className="rounded-2xl bg-white/70 border border-stone-200/70 py-5">
            <div className="font-serif text-3xl font-bold text-stone-800 tabular-nums">
              {week ?? "—"}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-stone-400 mt-1">Joined yesterday</div>
          </div>
        </div>

        <p className="mt-12 text-sm text-stone-500 leading-relaxed max-w-md mx-auto">
          Daily darshan with the shloka, the Bhagavatam and Chaitanya-charitamrita to read,
          a japa counter, aarti, and a sangha of devotees.
        </p>

        <a
          href="https://play.google.com/store/apps/details?id=com.buildiskcon.bhaktigram"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-6 rounded-full bg-stone-800 text-white text-sm font-semibold px-7 py-3 hover:bg-stone-700 transition-colors"
        >
          Get Bhaktigram — free on Android
        </a>

        <p className="mt-4 text-[11px] text-stone-400">
          A devotee is counted once their profile is created in the app. Accounts from the
          closed test, before launch, are not counted.
        </p>
      </div>
    </Layout>
  );
}
