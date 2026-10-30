// The Buffer channels Bhaktigram's pictures go to.
//
// Owner, 2026-10-30: Instagram posts go to the mohit.bhaktigram account. The
// earlier Instagram channel (69db52a5031bfa423cf5dd46) was removed from Buffer on
// 24 Oct 2026, and every Instagram post after that failed with "Channel not
// found". Threads stays on dailybhagwatham.
//
// Our Buffer key can list the account's channels (query channels(input:
// { organizationId })), so a channel's id can be read from the API; an older note
// in approve-instagram-post said it could not. BUFFER_INSTAGRAM_CHANNEL_ID and
// BUFFER_THREADS_CHANNEL_ID still override these when set.

export const BUFFER_INSTAGRAM_CHANNEL = "6adc337f778b240e2fa98c02"; // Instagram: mohit.bhaktigram
export const BUFFER_THREADS_CHANNEL = "69db52c2031bfa423cf5ddc7"; // Threads: dailybhagwatham

/** The channel ids to post to: the env overrides, else the ones above. */
export function bufferChannelIds(env: (name: string) => string | undefined): { instagram: string; threads: string } {
  return {
    instagram: env("BUFFER_INSTAGRAM_CHANNEL_ID") || BUFFER_INSTAGRAM_CHANNEL,
    threads: env("BUFFER_THREADS_CHANNEL_ID") || BUFFER_THREADS_CHANNEL,
  };
}
