-- Оновлення вже існуючої таблиці words до версії 2. Виконайте один раз.

alter table public.words add column if not exists section text;
alter table public.words add column if not exists needs_review boolean not null default false;

create unique index if not exists words_unique
  on public.words (user_id, deck, coalesce(section, ''), he);

-- Старі тестові слова зі старих колод видаляємо (за потреби прибрати цей рядок)
delete from public.words where deck in ('Привітання', 'Побут', 'Числа');
