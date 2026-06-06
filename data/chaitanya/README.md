# Chaitanya Charitamrit — OCR & content pipeline

Sister project to `data/bhagwatham/`. Same architecture: PDF → OCR → batched
JSON pages → scene extraction → FLUX image generation → reader/gallery/
Bhaktigram surfaces.

## Source PDFs

The 18 Adi-lila Hindi PDFs sit in `pdfs/adi-lila/`:

```
Adi_Lila_Chapter_-_Introduction_-_Hindi.pdf
Adi_Lila_Chapter-01_-_Hindi.pdf
...
Adi_Lila_Chapter-17_-_Hindi.pdf
```

Source: `~/Library/Mobile Documents/com~apple~CloudDocs/Spiritual Books/Chaitanya Charitramrit/Adilila/`

Madhya-lila and Antya-lila to be added later under `pdfs/madhya-lila/` and
`pdfs/antya-lila/`.

## Sequential conversion pipeline

Each chapter goes through five stages. State per chapter is tracked in
`bhagavatam_chapter_scenes`-equivalent table (to be created):
`chaitanya_chapter_scenes`.

### 1. OCR — PDF → page text

  - Mirrors the laptop-side service at
    `artifacts/api-server/src/services/bhagwatham-sarvam.ts`.
  - Per-page Sarvam OCR call with caching + retry.
  - Output: `data/chaitanya/batches/N.json` (one batch ≈ 25 pages) with
    `{ pages: [{ pageNumber, text }, ...] }`.
  - Indexed by `data/chaitanya/chapter-index.json` similar to bhagwatham's.

### 2. Scene extraction — page text → 3-5 scenes per chapter

  - Reuse the existing Supabase Edge Function `bhagavatam-extract-scenes`
    via a new sibling `chaitanya-extract-scenes` (same prompt, different
    table target).
  - Output table `chaitanya_chapter_scenes`:
    ```sql
    (chapter_global_number, chapter_part TEXT,  -- 'adi'/'madhya'/'antya'
     chapter_in_part, chapter_title, scenes JSONB, used_scene_indexes int[])
    ```

### 3. Image generation — scenes → chapter art + IG posts

  - Mirror `bulk-generate-chapter-art` and `instagram-post` Edge Functions
    as `bulk-generate-chaitanya-art` and `chaitanya-instagram-post`.
  - Storage bucket: `chaitanya-art-images` (already approved-style flow).
  - Review queue table: `chaitanya_chapter_art_review` +
    `cc_pending_review` (mirroring `ig_pending_review`).

### 4. Reader UI — adapt `bhagwatham.tsx`

  - Copy `src/pages/bhagwatham.tsx` to `chaitanya.tsx` (or extract shared
    reader component).
  - Wire it to `/api/chaitanya/chapter-index` + `/api/chaitanya/batch/N`
    endpoints in the api-server.
  - Same selection toolbar (Listen / Look-up / AI fix / Manual Hindi
    keyboard).

### 5. Gallery + Bhaktigram integration

  - `gallery.tsx` already iterates over `bhagavatam_chapter_scenes` —
    extend to ALSO pull from `chaitanya_chapter_scenes` so both books'
    images appear in /gallery and approved CC posts appear in /bhaktigram.
  - Add a "Source" badge on each card so users can tell which book a
    given scene comes from.

## Order of operations

Process chapters one-at-a-time in the order:
`Introduction → Ch. 1 → Ch. 2 → … → Ch. 17`.

A progress row per chapter lives in a new `chaitanya_processing_state`
table to support pause/resume + restart from the last incomplete chapter.

## What's done now

- [x] 18 PDFs copied into `pdfs/adi-lila/`.
- [x] `/chaitanya` placeholder route registered with the chapter manifest.
- [x] Navigation restructured: top-level **Books** dropdown with both books.
- [x] Supabase tables (`chaitanya_chapters`, `chaitanya_chapter_scenes`,
      `chaitanya_chapter_art_review`) + `chaitanya-art-images` storage bucket.
- [x] Edge Functions `bulk-generate-chaitanya-art` + `approve-chaitanya-art`
      deployed and verified.
- [x] Gallery review queue UI built (indigo bulk banner + violet pending
      panel) — **currently hidden via the pause flag, see below**.
- [ ] OCR pipeline cloned and run per chapter (next).
- [ ] Scene extraction edge function deployed.
- [ ] Reader UI built.
- [ ] Bhaktigram integration.

## ⏸  Image generation is paused

Per project decision (2026-06-06): the FLUX image-generation pipeline for
Chaitanya is intentionally **off** until OCR completes for all 18 Adi-lila
chapters. This way, every chapter cover is rendered against the full
chapter text, not Claude's general knowledge — better persona accuracy
and zero wasted FLUX budget on re-renders.

What's still allowed while paused:

- OCR runs (Sarvam) → produces `data/chaitanya/batches/N.json`
- Scene extraction runs → populates `chaitanya_chapter_scenes`
- DB tables + Edge Functions remain deployed (no need to redeploy on
  resume)

What's blocked while paused:

- The `Bulk Chaitanya generator` and `Pending Chaitanya review` panels
  in `/gallery` are hidden via `{false && ...}` flags in `gallery.tsx`.
- No traffic hits `bulk-generate-chaitanya-art` from the UI.

To resume:

1. Confirm every row in `chaitanya_chapters` has `ocr_status = 'ready'`
   and `chaitanya_chapter_scenes` has a corresponding row.
2. In `gallery.tsx`, flip both `{false && ...}` guards in the two
   Chaitanya UI panels back to `{ccBulkStatus && ...}` /
   `{pendingChaitanya.length > 0 && ...}`.
3. Uncomment the two paused `useEffect`s for `fetchPendingChaitanya` and
   `refreshCcBulkStatus`.
4. Hit "Generate 1 sample" → review → "Bulk-generate N" as you did for
   Bhagavatam.

The placeholder page at `/chaitanya` shows the chapter manifest with a
"Queued" badge per row and explains the pipeline so visitors understand
what's coming.
