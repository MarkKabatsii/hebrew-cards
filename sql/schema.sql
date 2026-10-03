-- Нова база з нуля. Supabase: SQL Editor -> New query -> Run

create table public.words (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deck text not null,            -- категорія: Загальновживані слова, Електрика, Юриспруденція, Інше
  section text,                  -- розділ (лише для «Загальновживані слова»): Займенники, Дієслова ...
  he text not null,              -- слово івритом
  tr text not null,              -- транскрипція
  ua text not null,              -- переклад
  needs_review boolean not null default false,  -- слово з помилкою в квізі
  created_at timestamptz not null default now()
);

-- Одне й те саме слово не додається двічі в той самий розділ
create unique index words_unique on public.words (user_id, deck, coalesce(section, ''), he);

alter table public.words enable row level security;

create policy "own words" on public.words
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.words to authenticated;
