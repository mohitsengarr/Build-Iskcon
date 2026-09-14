-- Publish marker: record on an ig_pending_review row when an approval starts
-- publishing it.
--
-- Why: approve-instagram-post claims a pending post (stamps reviewed_at) before it
-- publishes or deletes its image, and a claim older than 10 minutes, left by a
-- request that died, can be taken over. The takeover could not tell a request that
-- died before publishing from one that published and then failed to mark the post
-- approved (its final update failed, or its worker was stopped), so the post could
-- go out to Instagram and the in-app channel a second time.
--
-- approve-instagram-post now sets publish_started_at on its own claim right before
-- it calls Instagram (the Meta Graph API, or Buffer when Meta is not configured)
-- and cross-posts to the channel. A stale claim with publish_started_at set is
-- never taken over: approve and reject answer 409 publish_unknown, and the
-- reviewer checks Instagram before approving again.
--
-- Nullable with no default: existing rows stay null. No policy or grant change:
-- the column follows the table's existing RLS and grants.
--
-- Idempotent: safe to run more than once.

alter table public.ig_pending_review add column if not exists publish_started_at timestamptz;

comment on column public.ig_pending_review.publish_started_at is
  'Set by approve-instagram-post on its own claim (reviewed_at) right before it calls Instagram (Meta Graph API, or Buffer) and cross-posts to the in-app channel; null until an approval starts publishing. A stale claim (reviewed_at older than 10 minutes) with publish_started_at set is never taken over: the post may already be on Instagram, so approve and reject answer 409 publish_unknown and the reviewer must check Instagram before approving again.';
