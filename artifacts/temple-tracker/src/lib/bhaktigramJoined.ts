import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/sbRest";

// Who counts as a devotee who joined Bhaktigram, for every public number on the
// site (/livecounter, /app). One place, so the two pages can never disagree.

// Bhaktigram went public on Google Play late on 6 October 2026, and the installs
// start arriving at 02:00 UTC on the 7th. Everything before that line is the
// closed test and our own devices — 45 profiles that are not devotees who found
// the app (SEN-907). Counts therefore start at launch, and say so, rather than
// quietly inflating themselves with test accounts.
export const LAUNCH_ISO = "2026-10-07T00:00:00Z";
export const LAUNCH_LABEL = "7 October 2026";

// Our own devices, excluded by id as well as by date. dev_762f… is the emulator
// this app is developed on — it identifies itself in the data as "Test Mohit" and
// predates launch, but naming it here means a test install can never quietly
// become a devotee in the count (Mohit, 8 Oct).
export const EXCLUDED_DEVICES = ["dev_762fbwdgbe3mtsqgeo3"];

export const PLAY_URL = "https://play.google.com/store/apps/details?id=com.buildiskcon.bhaktigram";

/** PostgREST filter fragment that drops our own devices. */
export const notOurs = `&device_id=not.in.(${EXCLUDED_DEVICES.join(",")})`;

/** PostgREST filter fragment for "joined since launch, and not one of ours". */
export const sinceLaunch = `&created_at=gte.${LAUNCH_ISO}${notOurs}`;

/**
 * The total out of a PostgREST content-range header. With limit=0 it reads
 * "*\/83"; anything unparseable is null so a page keeps its last good value.
 */
export function totalFromContentRange(header: string | null | undefined): number | null {
  if (!header) return null;
  const total = header.split("/")[1];
  if (total === undefined || total === "" || total === "*") return null;
  const n = Number(total);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** The request URL for counting profiles that match a filter, fetching no rows. */
export function countUrl(filter = ""): string {
  return `${SUPABASE_URL}/rest/v1/bhaktigram_profiles?select=device_id&limit=0${filter}`;
}

/**
 * Count rows matching a filter without fetching any of them: `Prefer:
 * count=exact` reports the total in content-range while limit=0 returns no
 * rows, so no devotee's profile ever reaches the browser.
 */
export async function countRows(filter = ""): Promise<number | null> {
  const r = await fetch(countUrl(filter), {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!r.ok) return null;
  return totalFromContentRange(r.headers.get("content-range"));
}
