-- Every picture Buffer accepted for Instagram or Threads, one row per channel
-- (_shared/socialPostLog.ts). Written by approve-instagram-post (the posting queue
-- and reposts) and daily-approved-art-post. Read by threads-daily-image (owner,
-- 2026-10-30: at least one picture on Threads every day) and by the posting queue
-- so a post already sent to a channel is not sent there twice.
create table if not exists public.social_post_log (
  id bigserial primary key,
  service text not null,
  source_table text not null,
  source_id bigint not null,
  buffer_post_id text not null,
  image_url text,
  created_at timestamptz not null default now()
);
create index if not exists social_post_log_service_created on public.social_post_log (service, created_at desc);
create index if not exists social_post_log_source on public.social_post_log (source_table, source_id, service, created_at desc);

-- Service role only: RLS on with no policies, and nothing granted to the API roles.
alter table public.social_post_log enable row level security;
revoke all on table public.social_post_log from anon, authenticated;
revoke all on sequence public.social_post_log_id_seq from anon, authenticated;
