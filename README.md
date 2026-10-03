# hebrew-cards

Картки для вивчення івриту: слово, транскрипція, переклад. Frontend: HTML/CSS/JS. База даних і вхід: Supabase. Хостинг: Netlify.

## Структура

```
index.html          екран карток (головна)
pages/              решта сторінок: quiz, decks, add, import, login
css/                base (спільне), cards, forms, decks
js/                 config (ключі), taxonomy (категорії), store (база), ui (меню, фільтри),
                    parser (розбір імпорту) і по одному файлу на сторінку
sql/                schema.sql (нова база), migrate_v2.sql (оновлення існуючої)
data/               приклади файлів для імпорту
```

## Налаштування

1. Виконати `sql/schema.sql` (або `sql/migrate_v2.sql`, якщо таблиця вже є) у Supabase SQL Editor.
2. У `js/config.js` вказати Project URL і publishable key.
3. Додати слова: сторінка «Додати» або «Імпорт списком».
