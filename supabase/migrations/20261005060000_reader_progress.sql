-- Where a reader got to in a book, kept against their reader id so the place
-- follows them to another device. The reader's own device also keeps it in
-- localStorage; this is the copy that travels, and the reader is offered it
-- rather than being moved automatically (an earlier auto-resume fought with
-- the scroll position, which is why the readers stopped doing it).
create table if not exists public.reader_progress (
  reader_id text not null,
  book text not null,
  page_number integer not null,
  line_anchor text,
  percent integer,
  updated_at timestamptz not null default now(),
  primary key (reader_id, book)
);

create index if not exists idx_reader_progress_reader on public.reader_progress (reader_id);

alter table public.reader_progress enable row level security;

-- Same access as the bookmark tables: the reader is a self-chosen id with no
-- sign-in behind it, so the anon key reads and writes.
create policy "Allow public read" on public.reader_progress for select using (true);
create policy "Allow public insert" on public.reader_progress for insert with check (true);
create policy "Allow public update" on public.reader_progress for update using (true);
create policy "Allow public delete" on public.reader_progress for delete using (true);
