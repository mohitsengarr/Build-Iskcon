-- Instagram Reels (owner, 2026-10-30: "yes build the reels, i will send the audio").
-- A rendered reel (a short video of the painting with a Hare Krishna recording)
-- is stored per Instagram post and per Gita/Chaitanya cover. The Instagram publish
-- sends it instead of the photo when IG_REELS_ENABLED is on; until the reel exists
-- the Instagram send waits. Rendering: GitHub Actions (.github/workflows/reels.yml,
-- scripts/reels/) in the Build-Iskcon repo; reel_path names the image it was
-- rendered from (_shared/instagramMedia.ts), so a replaced image gets a new reel.
-- Applied 2026-10-30.
alter table public.ig_pending_review
  add column if not exists reel_path text,
  add column if not exists reel_url text,
  add column if not exists reel_made_at timestamptz;
alter table public.gita_chapter_art_review
  add column if not exists reel_path text,
  add column if not exists reel_url text,
  add column if not exists reel_made_at timestamptz;
alter table public.chaitanya_chapter_art_review
  add column if not exists reel_path text,
  add column if not exists reel_url text,
  add column if not exists reel_made_at timestamptz;
