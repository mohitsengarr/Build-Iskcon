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
- [ ] OCR pipeline cloned and run per chapter.
- [ ] Scene extraction edge function deployed.
- [ ] Image generation pipelines wired up.
- [ ] Reader UI built.
- [ ] Gallery + Bhaktigram integration.

The placeholder page at `/chaitanya` shows the chapter manifest with a
"Queued" badge per row and explains the pipeline so visitors understand
what's coming.
