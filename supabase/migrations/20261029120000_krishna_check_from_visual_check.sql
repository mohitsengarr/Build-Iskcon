-- SEN-975 (owner, 2026-10-29: "merge visual and krishna checks on sonnet").
--
-- The image check that runs after every render (_shared/visualCheckCore.ts) now
-- also answers the Krishna question, and its record carries the answer:
--   visual_check.krishna = { krishna_visible, form, prominence, observed, sure?, model }
-- Every write of visual_check is either made together with the image it describes
-- or is a compare-and-swap on that image's path, so at the moment a record is
-- written NEW.image_path is the image it judged. This trigger copies the answer to
-- krishna_check for that path, in the shape the posting gate reads
-- (_shared/krishnaCheckCore.ts, version 1), so the gate does not ask Claude again.
--
-- It changes nothing when visual_check is unchanged, has no krishna answer, or the
-- answer is malformed, and it never raises: a bad answer leaves krishna_check as it
-- was, and the gate then asks (fail closed). A later change of image_path alone (a
-- watermark copy, a new render) leaves the old record pinned to the old path, which
-- the gate no longer accepts.

create or replace function public.krishna_check_from_visual_check()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  k jsonb;
begin
  if tg_op = 'UPDATE' and new.visual_check is not distinct from old.visual_check then
    return new;
  end if;
  if new.visual_check is null or jsonb_typeof(new.visual_check) <> 'object' then
    return new;
  end if;
  k := new.visual_check -> 'krishna';
  if k is null or jsonb_typeof(k) <> 'object' then
    return new;
  end if;
  if new.image_path is null or new.image_path = '' then
    return new;
  end if;
  if jsonb_typeof(k -> 'krishna_visible') is distinct from 'boolean' then
    return new;
  end if;
  if coalesce(k ->> 'form', '') not in (
    'krishna', 'child_krishna', 'radha_krishna', 'krishna_deity', 'jagannath',
    'chaitanya', 'vishnu_or_narayana', 'rama', 'other_deity_or_avatar', 'none'
  ) then
    return new;
  end if;
  if coalesce(k ->> 'prominence', '') not in ('main', 'secondary', 'background', 'none') then
    return new;
  end if;

  new.krishna_check := jsonb_strip_nulls(jsonb_build_object(
    'version', 1,
    'image_path', new.image_path,
    'krishna_visible', k -> 'krishna_visible',
    'form', k ->> 'form',
    'prominence', k ->> 'prominence',
    'observed', coalesce(k ->> 'observed', ''),
    'sure', case when jsonb_typeof(k -> 'sure') = 'boolean' then k -> 'sure' end,
    'model', coalesce(nullif(k ->> 'model', ''), nullif(new.visual_check ->> 'check_model', ''), 'unknown'),
    'checked_at', coalesce(
      nullif(new.visual_check ->> 'checked_at', ''),
      to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'source', 'visual_check'
  ));
  return new;
end;
$fn$;

-- A trigger function: nobody calls it directly.
revoke all on function public.krishna_check_from_visual_check() from public, anon, authenticated, service_role;

drop trigger if exists trg_krishna_check_from_visual_check on public.ig_pending_review;
create trigger trg_krishna_check_from_visual_check
  before insert or update of visual_check on public.ig_pending_review
  for each row execute function public.krishna_check_from_visual_check();

drop trigger if exists trg_krishna_check_from_visual_check on public.gita_chapter_art_review;
create trigger trg_krishna_check_from_visual_check
  before insert or update of visual_check on public.gita_chapter_art_review
  for each row execute function public.krishna_check_from_visual_check();

drop trigger if exists trg_krishna_check_from_visual_check on public.chaitanya_chapter_art_review;
create trigger trg_krishna_check_from_visual_check
  before insert or update of visual_check on public.chaitanya_chapter_art_review
  for each row execute function public.krishna_check_from_visual_check();
