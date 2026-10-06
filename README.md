# hebrew-cards

Картки для вивчення івриту: слово, транскрипція, переклад. Frontend: HTML/CSS/JS. База даних і вхід: Supabase. Хостинг: Netlify.

[Відкрити сайт](https://learnhebrewapp.netlify.app/pages/login.html)

## Структура

```text
index.html          екран карток (головна)
pages/              решта сторінок: quiz, decks, add, import, login
css/                base (спільне), cards, forms, decks
js/                 config (ключі), taxonomy (категорії), store (база), ui (меню, фільтри),
                    parser (розбір імпорту) і по одному файлу на сторінку
sql/                schema.sql (нова база), migrate_v2.sql і migrate_v3.sql (оновлення існуючої)
data/               приклади файлів для імпорту
```
