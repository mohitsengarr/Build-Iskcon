-- The Gita reader has always posted its bookmarks to gita_bookmarks, but the
-- table was never created: every save 404'd into an empty catch, so the button
-- did nothing. Mirrors bhagavatam_bookmarks, including the unique
-- (reader_id, page_number) index that makes the reader's
-- Prefer: resolution=merge-duplicates upsert replace one page's bookmark
-- instead of stacking duplicates.
create table if not exists public.gita_bookmarks (
  id uuid primary key default gen_random_uuid(),
  reader_id text not null,
  reader_name text,
  page_number integer not null,
  chapter_number integer,
  chapter_title text,
  label text,
  line_anchor text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_gita_bookmarks_reader on public.gita_bookmarks (reader_id);
create unique index if not exists idx_gita_bookmarks_reader_page on public.gita_bookmarks (reader_id, page_number);

alter table public.gita_bookmarks enable row level security;

-- Same access as the Bhagavatam and Chaitanya bookmark tables: the reader is a
-- self-chosen reader_id with no auth behind it, so the anon key reads and writes.
create policy "Allow public read" on public.gita_bookmarks for select using (true);
create policy "Allow public insert" on public.gita_bookmarks for insert with check (true);
create policy "Allow public update" on public.gita_bookmarks for update using (true);
create policy "Allow public delete" on public.gita_bookmarks for delete using (true);
