-- The daily Mahajana story picker (cron 65; first defined in the app repo,
-- ~/bg-build supabase/migrations/20260920_mahajan_daily_stories.sql) never posts
-- the same artwork twice: it skips art whose image_url a story already used.
--
-- The watermark backfill (2026-10-23, fn watermark-image with {stamp}) moves an
-- approved post onto a marked copy of its own image, x.jpg -> x-<tag>-wm.jpg,
-- which is a new URL. Without this, artwork already posted as a story under its
-- old URL would look unused and be posted again. A story's URL now also matches
-- the art's URL with that suffix removed. Everything else is unchanged, and
-- CREATE OR REPLACE keeps the function's grants (service_role only).
create or replace function public.bhaktigram_post_mahajan_stories(p_count int default 3)
returns int
language plpgsql
as $$
declare
  v_inserted int := 0;
begin
  with eligible as (
    select
      p.device_id,
      r.id as art_id,
      r.image_url,
      coalesce(nullif(btrim(r.chapter_title), ''), '') as title,
      row_number() over (
        partition by p.device_id
        order by coalesce(r.reviewed_at, r.created_at) desc, r.id desc
      ) as rn,
      (select max(s.created_at) from bhaktigram_stories s where s.author_device = p.device_id) as last_story
    from ig_pending_review r
    join bhaktigram_profiles p
      on p.is_mahajan and p.mahajan_key = r.mahajan_key
    where r.status = 'approved'
      and r.image_url is not null
      and not exists (
        select 1 from bhaktigram_stories s2
        where s2.media_url in (r.image_url, regexp_replace(r.image_url, '-[a-z0-9]{1,16}-wm(\.[a-z0-9]+)$', '\1', 'i'))
      )
      and not exists (
        select 1 from bhaktigram_stories s3
        where s3.author_device = p.device_id and s3.expires_at > now()
      )
  ),
  picked as (
    select device_id, image_url, title
    from eligible
    where rn = 1
    order by last_story asc nulls first, art_id asc
    limit greatest(coalesce(p_count, 0), 0)
  )
  insert into bhaktigram_stories (author_device, media_url, media_type, caption, audience, expires_at)
  select device_id, image_url, 'image', left(title, 120), 'all', now() + interval '24 hours'
  from picked;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.bhaktigram_post_mahajan_stories(int) from public, anon, authenticated;
grant execute on function public.bhaktigram_post_mahajan_stories(int) to service_role;
