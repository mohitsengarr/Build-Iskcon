-- One bookmark per reader per page, as bhagavatam_bookmarks already has. The
-- readers post with Prefer: resolution=merge-duplicates and an on_conflict of
-- (reader_id, page_number); without this index Chaitanya would stack a new row
-- every time the same page was bookmarked. No duplicates existed to block it.
create unique index if not exists idx_chaitanya_bookmarks_reader_page
  on public.chaitanya_bookmarks (reader_id, page_number);

create index if not exists idx_chaitanya_bookmarks_reader
  on public.chaitanya_bookmarks (reader_id);
