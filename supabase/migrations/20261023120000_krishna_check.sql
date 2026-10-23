-- Owner, 2026-10-23: "do not post any photos on Threads or Instagram with no
-- Krishna in it". Before a picture goes to Buffer, Claude records whether Lord
-- Krishna is shown, in which form and how prominently, for the exact image it
-- judged (_shared/krishnaCheck.ts). The record lives on the row it judged:
--   { version, image_path, krishna_visible, form, prominence, observed, model, checked_at }
-- The posting paths (repost-replaced-posts, daily-approved-art-post,
-- approve-instagram-post) post only when it is current and says Krishna is
-- clearly shown in His own form. The tables' existing policies cover the column.
alter table public.ig_pending_review add column if not exists krishna_check jsonb;
alter table public.gita_chapter_art_review add column if not exists krishna_check jsonb;
alter table public.chaitanya_chapter_art_review add column if not exists krishna_check jsonb;
