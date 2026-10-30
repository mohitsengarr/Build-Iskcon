// The once-a-day nudge under the verse on dailybhagwatham, in a selling voice
// (Mohit, 30 Oct 2026: "these download messages should be sales style"). It is
// one of several lines, rotating by day so a follower does not read the same
// advert every morning. Each names a benefit, says what the app gives today
// (darshan, japa, the Bhagavatam and the Gita), asks for the download, and ends
// with the Play Store link on its own line. Nothing is claimed that is not in
// the build, and no figures are invented.
//
// Pure: no Deno globals, so tests/download-nudge.test.ts runs it under Node.

export const PLAY_URL = "https://play.google.com/store/apps/details?id=com.buildiskcon.bhaktigram";

/** Threads refuses a post longer than this. */
export const THREADS_LIMIT = 500;

export const NUDGES: readonly string[] = [
  "Loved this verse? Bhaktigram gives you a new darshan every morning, a japa counter that keeps your rounds, and the whole Srimad Bhagavatam to read. Free on Android. Download it today:",
  "Make Krishna the first thing you see each day. Bhaktigram brings you daily darshan, japa and the Bhagavatam in one free Android app. Get it now:",
  "Five minutes with Krishna before the day begins. Open Bhaktigram for darshan, chant your rounds with the japa counter, read a chapter of the Bhagavatam. Free on Android:",
  "Want more than one verse a day? Read the Bhagavad-gita and the Srimad Bhagavatam chapter by chapter, count your japa, and take darshan every morning. Bhaktigram is free on Android. Download it here:",
  "Turn your phone into a temple corner. Bhaktigram: daily darshan, a japa counter and the full Srimad Bhagavatam, free on Android. Tap to download:",
  "Your daily sadhana in one place: darshan, japa and the Bhagavatam. Bhaktigram is free on Android. Start today:",
  "Krishna's words, every day, in your pocket. Bhaktigram pairs daily darshan with a japa counter and the Srimad Bhagavatam. Free on Android. Download now:",
  "Read the Bhagavatam the way it was meant to be read: a little every day, with darshan and japa beside it. Bhaktigram is free on Android. Get the app:",
];

/** Which line today gets: the day count since 1970 (UTC) around the list, so a retry on the same day repeats the same line. */
export function nudgeIndex(day: Date): number {
  const days = Math.floor(day.getTime() / 86_400_000);
  return ((days % NUDGES.length) + NUDGES.length) % NUDGES.length;
}

/** The nudge for a day: its line, then the link on its own line. */
export function downloadNudge(day: Date = new Date()): string {
  return `${NUDGES[nudgeIndex(day)]}\n${PLAY_URL}`;
}
