-- Visual check, running: re-document visual_check now that the check runs after
-- the response.
--
-- Why: Supabase cuts every request at 150s, a streamed response too, and in a
-- live run the in-request check was skipped for lack of time. A generator now
-- stores its image with a "running" record, responds, and checks the image in
-- EdgeRuntime.waitUntil (_shared/visualCheck.ts initialRecord, checkInBackground,
-- redoInBackground). Gallery-triggered generation only flags a contradicted
-- image. The daily instagram-post run re-renders it and may replace the image of
-- a still-pending ig_pending_review row. The finished record is written with a
-- compare-and-swap on the stored image, so the result for an image that was
-- replaced in the meantime is never stored against the new one.
--
-- Shape changes (visualCheckRecord and runningRecord in _shared/visualCheckCore.ts):
--   status      gains 'running': stored with the image, before its check
--   checked_at  null while running
--   started_at  new: ISO time the background check was queued. Records written
--               by background bulk runs, which check before the insert, have none.
-- Every other key is unchanged from 20260913230000_visual_check.sql.
--
-- Background work ends within 400s of the request, so a record still running
-- long after started_at lost its worker; the gallery shows a running record
-- older than 10 minutes as "Image check did not finish".
--
-- Comments only: no DDL, data, policy, grant or RLS change. Needs the columns
-- added by 20260913230000_visual_check.sql. Idempotent: safe to run more than once.

comment on column public.gita_chapter_art_review.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped|running, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at (null while running), started_at}. running: the image is stored and its check runs after the response. started_at: when that background check was queued (ISO); absent on records from background bulk runs, which check before the insert. The background check only records its result on this table: it never replaces the image.';
comment on column public.bhagavatam_chapter_art_review.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped|running, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at (null while running), started_at}. running: the image is stored and its check runs after the response. started_at: when that background check was queued (ISO); absent on records from background bulk runs, which check before the insert. The background check only records its result on this table: it never replaces the image.';
comment on column public.chaitanya_chapter_art_review.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped|running, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at (null while running), started_at}. running: the image is stored and its check runs after the response. started_at: when that background check was queued (ISO); absent on records from background bulk runs, which check before the insert. The background check only records its result on this table: it never replaces the image.';
comment on column public.ig_pending_review.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped|running, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at (null while running), started_at}. running: the image is stored and its check runs after the response. started_at: when that background check was queued (ISO); absent on records from background bulk runs, which check before the insert. After the daily instagram-post run the background check re-renders a contradicted image and, while the row is still pending, may replace image_url and image_path; attempts then counts those renders and chosen_attempt names the stored one.';
comment on column public.reader_scenes.visual_check is
  'Claude vision check of image_url against the research facts in its prompt. Null when no check ran. Shape: {status: pass|fail|error|skipped|running, attempts, chosen_attempt (0-based), failed: [{fact, observed}], unclear, reason (null on pass), image_model, checked_at (null while running), started_at}. running: the image is stored and its check runs after the response. started_at: when that background check was queued (ISO); absent on records from background bulk runs, which check before the insert. The background check only records its result on this table: it never replaces the image.';
