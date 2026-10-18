-- A regenerated approved Instagram post waits here to be posted again, a few a
-- day (repost-replaced-posts, on pg_cron), instead of all going out at once.
-- repost_requested_at: set when the new image replaces the post's; cleared once
-- the post has gone out again. reposted_at: when it last did.
alter table public.ig_pending_review
  add column if not exists repost_requested_at timestamptz,
  add column if not exists reposted_at timestamptz;

create index if not exists ig_pending_review_repost_queue
  on public.ig_pending_review (repost_requested_at)
  where repost_requested_at is not null;
