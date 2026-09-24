-- Where a correction made in the Gita reader is stored, so it survives a reload
-- and reaches every reader. Mirrors bhagavatam_page_edits: the page number is the
-- key, which is what the toolbar's Prefer: resolution=merge-duplicates upsert
-- merges on.
create table if not exists public.gita_page_edits (
  page_number integer primary key,
  text text,
  text_en text,
  edited_by text,
  edited_at timestamptz not null default now(),
  applied_to_git boolean not null default false
);

-- Pending corrections are read back when they are folded into the repo's text.
create index if not exists idx_gita_page_edits_pending
  on public.gita_page_edits (applied_to_git) where (applied_to_git = false);

alter table public.gita_page_edits enable row level security;

-- Same access as the other two books' edit tables: the reader has no sign-in, so
-- the anon key reads and writes.
create policy "Allow public read" on public.gita_page_edits for select using (true);
create policy "Allow public insert" on public.gita_page_edits for insert with check (true);
create policy "Allow public update" on public.gita_page_edits for update using (true);
create policy "Allow public delete" on public.gita_page_edits for delete using (true);
