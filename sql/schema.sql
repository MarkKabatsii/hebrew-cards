-- Нова база з нуля.
-- Supabase: SQL Editor -> New query -> Run

create table public.words (
  id bigint generated always as identity primary key,

  user_id uuid not null
    default auth.uid()
    references auth.users(id)
    on delete cascade,

  deck text not null,

  section text,

  he text not null,

  tr text not null,

  ua text not null,

  needs_review boolean not null default false,

  review_level integer not null default 0,

  due_at timestamptz not null default now(),

  last_reviewed_at timestamptz,

  correct_streak integer not null default 0,

  lapses integer not null default 0,

  created_at timestamptz not null default now()
);

create unique index words_unique
  on public.words (
    user_id,
    deck,
    coalesce(section, ''),
    he
  );

create index words_due
  on public.words (
    user_id,
    due_at
  );

alter table public.words
  enable row level security;

create policy "own words"
  on public.words
  for all
  to authenticated
  using (
    user_id = (select auth.uid())
  )
  with check (
    user_id = (select auth.uid())
  );

grant select, insert, update, delete
  on public.words
  to authenticated;