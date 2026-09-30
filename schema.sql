-- Виконайте в Supabase: SQL Editor -> New query -> Run

create table public.words (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  deck text not null,
  he text not null,
  tr text not null,
  ua text not null,
  created_at timestamptz not null default now()
);

-- Кожен користувач бачить і змінює лише свої слова
alter table public.words enable row level security;

create policy "own words" on public.words
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Доступ для Data API (потрібен, якщо вимкнено "Automatically expose new tables")
grant select, insert, update, delete on public.words to authenticated;
