-- Replacement images that wait for review. A regenerated image for an approved
-- cover or Instagram post is a new PENDING row that names the row it would
-- replace (replaces_id); an older static Bhagavatam image has no row, so its
-- replacement names the manifest file instead (replaces_legacy:
-- {"image","chapter_number","scene_index"}). Approving one copies its image onto
-- the original, which keeps its id (and a post its likes and comments), and the
-- replacement row becomes status 'replaced'. Rejecting one leaves the original
-- as it is. _shared/replacements.ts does both.
alter table public.ig_pending_review add column if not exists replaces_id bigint;
alter table public.bhagavatam_chapter_art_review
  add column if not exists replaces_id integer,
  add column if not exists replaces_legacy jsonb;
alter table public.chaitanya_chapter_art_review add column if not exists replaces_id integer;
alter table public.gita_chapter_art_review add column if not exists replaces_id integer;

create index if not exists ig_pending_review_replaces on public.ig_pending_review (replaces_id) where replaces_id is not null;
create index if not exists bhagavatam_chapter_art_review_replaces on public.bhagavatam_chapter_art_review (replaces_id) where replaces_id is not null;
create index if not exists chaitanya_chapter_art_review_replaces on public.chaitanya_chapter_art_review (replaces_id) where replaces_id is not null;
create index if not exists gita_chapter_art_review_replaces on public.gita_chapter_art_review (replaces_id) where replaces_id is not null;

-- 'replaced': a replacement whose image now lives on the row it replaced.
alter table public.ig_pending_review drop constraint if exists ig_pending_review_status_check;
alter table public.ig_pending_review add constraint ig_pending_review_status_check
  check (status = any (array['pending', 'approved', 'rejected', 'replaced']));
alter table public.bhagavatam_chapter_art_review drop constraint if exists bhagavatam_chapter_art_review_status_check;
alter table public.bhagavatam_chapter_art_review add constraint bhagavatam_chapter_art_review_status_check
  check (status = any (array['pending', 'approved', 'rejected', 'replaced']));
alter table public.chaitanya_chapter_art_review drop constraint if exists chaitanya_chapter_art_review_status_check;
alter table public.chaitanya_chapter_art_review add constraint chaitanya_chapter_art_review_status_check
  check (status = any (array['pending', 'approved', 'rejected', 'replaced']));
