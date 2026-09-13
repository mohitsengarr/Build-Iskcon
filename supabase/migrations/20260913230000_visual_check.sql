-- Visual check: store what Claude vision found when it checked each generated
-- image against the research facts that went into its prompt.
--
-- Why: FLUX.2-pro drew Gita chapter 1 with three horses and Krishna holding the
-- bow although the prompt asked for four horses and put the Gandiva in Arjuna's
-- hands. Every render is now checked and re-rendered when a fact is clearly
-- contradicted (_shared/visualCheck.ts renderWithVisualCheck). The record of that
-- check is kept on the row next to the image, so the gallery can show a reviewer
-- which details are still wrong.
--
-- Writers: generate-gita-chapter-art, bulk-generate-chapter-art,
-- bulk-generate-chaitanya-art, regenerate-chapter-art (chapter art review
-- tables); instagram-post, bulk-generate-images, regenerate-pending-image
-- (ig_pending_review); generate-scene-image (reader_scenes). Any write that
-- stores a new image writes the record, or null when the check loop was not
-- reached; a regenerate overwrites it.
--
-- Shape (keys are snake_case, see visualCheckRecord in _shared/visualCheckCore.ts):
--   status          'pass' | 'fail' | 'error' | 'skipped'
--   attempts        renders started for this image
--   chosen_attempt  0-based index of the render that was stored
--   failed          [{fact, observed}] facts the stored image clearly contradicts,
--                   with what the image shows instead
--   unclear         facts that could not be judged
--   reason          why the check did not pass or did not run (null on pass)
--   image_model     the image model that drew the stored render
--   checked_at      ISO timestamp
--
-- Nullable with no default: existing rows stay null, which the gallery shows as
-- no check line. No policy or grant changes: the column follows each table's
-- existing RLS and grants.
--
-- Idempotent: safe to run more than once.

alter table public.gita_chapter_art_review add column if not exists visual_check jsonb;
alter table public.bhagavatam_chapter_art_review add column if not exists visual_check jsonb;
alter table public.chaitanya_chapter_art_review add column if not exists visual_check jsonb;
alter table public.ig_pending_review add column if not exists visual_check jsonb;
alter table public.reader_scenes add column if not exists visual_check jsonb;

comment on column public.gita_chapter_art_review.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at}.';
comment on column public.bhagavatam_chapter_art_review.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at}.';
comment on column public.chaitanya_chapter_art_review.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at}.';
comment on column public.ig_pending_review.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at}.';
comment on column public.reader_scenes.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at}.';
