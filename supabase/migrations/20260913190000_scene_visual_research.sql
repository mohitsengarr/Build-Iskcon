-- Scene visual research: a cache of web-verified visual facts per scene, plus
-- editor-approved canon that always outranks the web.
--
-- SECURITY: this Supabase project is shared with the CRM and AutoGig and has
-- leaked tables before when RLS was forgotten. Both tables get RLS in THIS
-- migration with NO policies, so only the service role (edge functions) can
-- read or write them. Grants to anon/authenticated are revoked as well.
--
-- Idempotent: safe to run more than once.

create table if not exists public.scene_visual_research (
  research_key     text primary key,
  book             text not null,
  scope            text not null check (scope in ('scene', 'chapter', 'reader', 'inline')),
  entities         text[] not null default '{}',
  facts            jsonb not null default '[]',
  sources          jsonb not null default '[]',
  status           text not null check (status in ('ok', 'empty', 'failed')),
  research_version int not null default 1,
  hit_count        int not null default 0,
  created_at       timestamptz not null default now(),
  refreshed_at     timestamptz not null default now(),
  expires_at       timestamptz not null
);

create table if not exists public.scene_visual_canon (
  id                bigserial primary key,
  subject           text not null,
  attribute         text not null,
  prompt_text       text not null,
  -- The row applies when a trigger matches (see "Trigger grammar" below).
  triggers          text[] not null,
  -- If non-empty, at least one of these must ALSO match the scene.
  context_triggers  text[] not null default '{}',
  -- Any match suppresses the row.
  negative_triggers text[] not null default '{}',
  book              text null, -- null = all books
  source            text not null,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- For a table created by an earlier draft of this migration.
alter table public.scene_visual_canon add column if not exists context_triggers text[] not null default '{}';
alter table public.scene_visual_canon add column if not exists negative_triggers text[] not null default '{}';

alter table public.scene_visual_research enable row level security;
alter table public.scene_visual_canon enable row level security;

revoke all on table public.scene_visual_research from anon, authenticated;
revoke all on table public.scene_visual_canon from anon, authenticated;
revoke all on sequence public.scene_visual_canon_id_seq from anon, authenticated;

create index if not exists scene_visual_research_expires_at_idx
  on public.scene_visual_research (expires_at);
create index if not exists scene_visual_canon_active_idx
  on public.scene_visual_canon (active);

-- Seed: the Kurukshetra chariot iconography hardcoded in generate-gita-chapter-art
-- (CANONICAL ICONOGRAPHY block + the four-horses restatement).
--
-- Trigger grammar (see _shared/sceneResearchCore.ts). Matching is on whole
-- words, case-insensitive, diacritics folded, plural s/es allowed:
--   triggers           'arjuna+chariot'  every '+'-joined word must appear
--                      '!surya'          inline negative, same as negative_triggers
--   context_triggers   if non-empty, at least one entry ('+' groups allowed) must
--                      ALSO appear
--   negative_triggers  any entry appearing suppresses the row
--
-- Rows 1-4 describe ARJUNA'S chariot with KRISHNA DRIVING, which is only true at
-- Kurukshetra and in the Gita. Measured on every scene in
-- bhagavatam_chapter_scenes (1559) and chaitanya_chapter_scenes (264), using
-- title + setting + summary + image_prompt + characters:
--   before (arjuna+chariot etc. with no context): rows 1/3/4 fired on 8 scenes,
--     row 2 on 10; only g7 s3 (Arjuna pursues Ashvatthama, Krishna driving) was
--     right. Wrong: g10 s0, g10 s2 (Hastinapura departure), g15 s2 (Khandava),
--     g189 s3 (Abhimanyu), g272 s2, g276 s1 (Indraprastha), g287 s1 (Subhadra's
--     abduction at the Ratha Yatra), g290 s3 (Krishna's own chariot), g353 s4
--     (after Krishna's departure).
--   after: rows 1-4 fire on g7 s3 only; 0 Chaitanya scenes. All 18 stored
--     generate-gita-chapter-art prompts still match rows 1-4.
-- 'charioteer' is context because two Gita chapter-3 briefs name no Kurukshetra.
-- Negatives: other chariots (Surya's, Jagannatha's Rathayatra cart, Krishna's
-- own at Dvaraka with Daruka and Garuda), Kartavirya Arjuna (who shares the
-- name), the solar-eclipse pilgrimage to Kurukshetra (SB 10.82), Abhimanyu's
-- chariot, and Sri Chaitanya scenes in every spelling found in the data.
--
-- Row 5 (Krishna's appearance) is wrong for Sri Chaitanya Mahaprabhu, so it is
-- suppressed by every spelling of his names found in chaitanya_chapter_scenes
-- (chaitanya, mahaprabhu, nimai, gauranga, gauranja, gaura, gaurhari,
-- vishvambhara) plus caitanya and the other common forms. Measured: 95 -> 94
-- Bhagavatam scenes (g287 s1, the Ratha Yatra festival, drops out); 0 Chaitanya
-- scenes before and after.
insert into public.scene_visual_canon
  (subject, attribute, prompt_text, triggers, context_triggers, negative_triggers, book, source)
select v.subject, v.attribute, v.prompt_text, v.triggers, v.context_triggers, v.negative_triggers, null, v.source
from (
  values
    (1, 'Arjuna''s chariot', 'horses',
     'Arjuna''s chariot is drawn by exactly four white horses, no more and no fewer',
     array['arjuna+chariot', 'arjun+chariot', 'partha+chariot', 'dhananjaya+chariot', 'kiriti+chariot'],
     array['kurukshetra', 'kuruksetra', 'dharmakshetra', 'dharmaksetra', 'gita', 'bhagavad', 'charioteer',
           'hanuman', 'ashvatthama', 'ashwatthama', 'asvatthama', 'aswatthama'],
     array['rathayatra', 'ratha yatra', 'jagannatha', 'jagannath', 'surya', 'garuda', 'dvaraka', 'dwaraka',
           'dwarka', 'dvarka', 'daruka', 'kartavirya', 'sahasrarjuna', 'sahasrabahu', 'eclipse', 'abhimanyu',
           'chaitanya', 'caitanya', 'mahaprabhu', 'gauranga', 'gauranja', 'gaura', 'gaurahari', 'gaurhari',
           'gaurasundara', 'gaurachandra', 'nimai', 'vishvambhara', 'visvambhara', 'sachinandana', 'sacinandana'],
     'editor: Bhagavad-gita iconography (migrated from generate-gita-chapter-art)'),
    (2, 'Arjuna''s chariot', 'banner',
     'a banner bearing Hanuman flies above Arjuna''s chariot',
     array['arjuna+chariot', 'arjun+chariot', 'partha+chariot', 'dhananjaya+chariot', 'kiriti+chariot',
           'arjuna+banner', 'arjuna+flag', 'partha+banner', 'partha+flag'],
     array['kurukshetra', 'kuruksetra', 'dharmakshetra', 'dharmaksetra', 'gita', 'bhagavad', 'charioteer',
           'hanuman', 'ashvatthama', 'ashwatthama', 'asvatthama', 'aswatthama'],
     array['rathayatra', 'ratha yatra', 'jagannatha', 'jagannath', 'surya', 'garuda', 'dvaraka', 'dwaraka',
           'dwarka', 'dvarka', 'daruka', 'kartavirya', 'sahasrarjuna', 'sahasrabahu', 'eclipse', 'abhimanyu',
           'chaitanya', 'caitanya', 'mahaprabhu', 'gauranga', 'gauranja', 'gaura', 'gaurahari', 'gaurhari',
           'gaurasundara', 'gaurachandra', 'nimai', 'vishvambhara', 'visvambhara', 'sachinandana', 'sacinandana'],
     'editor: Bhagavad-gita iconography (migrated from generate-gita-chapter-art)'),
    (3, 'Arjuna''s chariot', 'charioteer',
     'Krishna stands at the front of the chariot holding the reins as charioteer',
     array['arjuna+chariot', 'arjun+chariot', 'partha+chariot', 'dhananjaya+chariot', 'kiriti+chariot',
           'arjuna+rein', 'partha+rein'],
     array['kurukshetra', 'kuruksetra', 'dharmakshetra', 'dharmaksetra', 'gita', 'bhagavad', 'charioteer',
           'hanuman', 'ashvatthama', 'ashwatthama', 'asvatthama', 'aswatthama'],
     array['rathayatra', 'ratha yatra', 'jagannatha', 'jagannath', 'surya', 'garuda', 'dvaraka', 'dwaraka',
           'dwarka', 'dvarka', 'daruka', 'kartavirya', 'sahasrarjuna', 'sahasrabahu', 'eclipse', 'abhimanyu',
           'chaitanya', 'caitanya', 'mahaprabhu', 'gauranga', 'gauranja', 'gaura', 'gaurahari', 'gaurhari',
           'gaurasundara', 'gaurachandra', 'nimai', 'vishvambhara', 'visvambhara', 'sachinandana', 'sacinandana'],
     'editor: Bhagavad-gita iconography (migrated from generate-gita-chapter-art)'),
    (4, 'Arjuna', 'position and bow',
     'Arjuna stands behind Krishna in the chariot holding the Gandiva bow',
     array['arjuna+chariot', 'arjun+chariot', 'partha+chariot', 'dhananjaya+chariot', 'kiriti+chariot',
           'gandiva+chariot'],
     array['kurukshetra', 'kuruksetra', 'dharmakshetra', 'dharmaksetra', 'gita', 'bhagavad', 'charioteer',
           'hanuman', 'ashvatthama', 'ashwatthama', 'asvatthama', 'aswatthama'],
     array['rathayatra', 'ratha yatra', 'jagannatha', 'jagannath', 'surya', 'garuda', 'dvaraka', 'dwaraka',
           'dwarka', 'dvarka', 'daruka', 'kartavirya', 'sahasrarjuna', 'sahasrabahu', 'eclipse', 'abhimanyu',
           'chaitanya', 'caitanya', 'mahaprabhu', 'gauranga', 'gauranja', 'gaura', 'gaurahari', 'gaurhari',
           'gaurasundara', 'gaurachandra', 'nimai', 'vishvambhara', 'visvambhara', 'sachinandana', 'sacinandana'],
     'editor: Bhagavad-gita iconography (migrated from generate-gita-chapter-art)'),
    (5, 'Krishna', 'appearance',
     'Krishna has blue skin, a peacock feather in his crown and yellow silk pitambara',
     array['krishna+arjuna', 'krishna+kurukshetra', 'krishna+chariot', 'krishna+gandiva'],
     array[]::text[],
     array['rathayatra', 'ratha yatra', 'jagannatha', 'jagannath',
           'chaitanya', 'caitanya', 'mahaprabhu', 'gauranga', 'gauranja', 'gaura', 'gaurahari', 'gaurhari',
           'gaurasundara', 'gaurachandra', 'nimai', 'vishvambhara', 'visvambhara', 'sachinandana', 'sacinandana'],
     'editor: Bhagavad-gita iconography (migrated from generate-gita-chapter-art)')
) as v(ord, subject, attribute, prompt_text, triggers, context_triggers, negative_triggers, source)
where not exists (
  select 1
  from public.scene_visual_canon c
  where lower(c.subject) = lower(v.subject)
    and lower(c.attribute) = lower(v.attribute)
    and c.book is null
)
order by v.ord;
