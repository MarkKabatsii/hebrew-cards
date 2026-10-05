-- Інтервальне повторення.
-- Виконайте один раз після migrate_v2.sql.

alter table public.words
  add column if not exists review_level integer not null default 0;

alter table public.words
  add column if not exists due_at timestamptz not null default now();

alter table public.words
  add column if not exists last_reviewed_at timestamptz;

alter table public.words
  add column if not exists correct_streak integer not null default 0;

alter table public.words
  add column if not exists lapses integer not null default 0;

create index if not exists words_due
  on public.words (user_id, due_at);