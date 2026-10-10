# Навчальний маршрут: архітектура v2

## Огляд до реалізації (етап A)
Факти: HTML/CSS/classic JS, package.json/lockfile/збирача, AGENTS.md,
netlify.toml/_redirects і service worker не було. Node 22.16.0, npm 11.4.1.
42 наявні Node-тести пройшли до змін. Попередні локальні правки перевороту
картки та видалення кнопки збережено; маршруту раніше не було.

Vite збирає тільки learning.html; plugin копіює старі сторінки, JS, CSS та
два файли імпорту в dist без перетворень. React монтується лише в
#learning-root на окремій сторінці, завантажується при переході до розділу.
Навігація залишається у js/ui.js. Один db із js/store.js передається через
window.learningBridge; auth adapter має одну підписку з cleanup, login/logout
залишаються наявними. Supabase SDK використано як тип, другий client не створюється.

## Підтверджена локальна схема та межі
sql/schema.sql: words.id bigint identity, user_id uuid, he/tr/ua text,
created_at timestamptz, RLS власника. Міграції v2/v3 не міняють ці типи.
Це локальна схема, НЕ перевірка production. Схеми word_examples немає;
поля/approved select узято з наявного js/store.js. Production доступ не виконувався.
У нового RPC ID повертаються text із SQL, не JSON numbers. Небезпечні числові ID
відхиляються. Попередні розділи не мігруються й зберігають свою обробку ID.
psql/postgres/docker у PATH не знайдено; реального тестового Supabase не надано.

## План моделі й протоколу
Окремі таблиці lp_sessions, lp_session_words, lp_word_progress,
lp_receipts та lp_answer_variants. FK words ON DELETE CASCADE знищує snapshot
видаленого слова; RPC reconcile прибирає його з черги, не додає заміни.
Owner membership перевіряється RPC при старті, відновленні та кожній дії;
втрата доступу видаляє session material. Один advisory lock на owner серіалізує
старт/записи. Receipt перед revision; retry повторює команду, replay повертає
актуальний стан. Лічильники relational, queue/feedback versioned JSONB.
Definer RPC із fixed search_path, явним auth.uid і ownership; прямі клієнтські
записи заборонені, SELECT захищений RLS. Старі SRS-поля не змінюються.

Нормалізація на клієнті для особистого тренажера; сервер перевіряє обмежений
результат і переходи, не є системою іспиту. Review окремий bounded сеанс,
24 години за серверним часом, максимум дві спроби на слово/напрямок.
SQL та TS мають спільні сценарії для звіряння; моки не підтверджують SQL/RLS.

## Збірка та майбутня публікація
npm ci; npm run typecheck; npm test; npm run build; npm run preview.
Майбутній publish directory — dist; команду build треба задати в hosting.
Production push/deploy/SQL не виконуються. Повний порядок релізу/відкату —
learning-path-runbook.md після завершення етапу E.

## Фактичний результат етапів B–D
Domain: discriminated Session/Exercise, чистий reducer, явні seed/cycle,
Unicode fixtures. Черга сортується двома Park–Miller кроками для кожного ID
з seed/cycle та ротацією для уникнення повтору на межі циклів; SQL і TS звірені.
Application Controller має синхронний lock pending, epoch auth/unmount,
один незмінний command для retry, authoritative conflict і scoped cache examples.
UI використовує useSyncExternalStore та cleanup effect; answer DOM відсутній
до feedback, intro-картка без вкладених кнопок, form submit враховує composition.
SupabaseRepository перевіряє DTO runtime; 15-секундний AbortSignal не породжує
новий command. Supabase client перед execute перевіряє поточного user.

Створено netlify.toml для майбутньої збірки; production дій не було.
Встановлено локальний PGlite (PostgreSQL WASM) лише як devDependency,
тому SQL реально виконано локально. auth.uid/roles — тестові fixtures;
це НЕ Supabase/PostgREST/auth integration і НЕ незалежні конкурентні з’єднання.
Тестовий MemoryRepository не входить у production bundle.

Технічні джерела: [React incremental integration](https://react.dev/learn/add-react-to-an-existing-project),
[Vite build](https://vite.dev/guide/build),
[Supabase function security](https://supabase.com/docs/guides/database/functions).
