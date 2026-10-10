# Приймання «Навчального маршруту» v2

Дата: 10.10.2026. Результат: **локальна реалізація, очікує інтеграційної перевірки Supabase**.
Production SQL, push і deploy не виконано. Попередню роботу перевороту карток
збережено. AGENTS.md не знайдено; файл v2 прочитано повністю. Наявного модуля
маршруту до цієї задачі не було, тож переписування попередньої реалізації не було.

## Етапи A–E

| Етап | Доставлено | Перевірка перед наступним етапом |
| --- | --- | --- |
| A | Окремий React root, Vite, strict TS, один чинний Supabase client/auth adapter, nav | Typecheck/build; збереження старих файлів у dist; 42 baseline-тести й старий браузерний тест. Live login не перевірявся |
| B | Типи/переходи, стабільні snapshots, seeded черги, нормалізація, test repository | 6 domain-тестів: справжні пороги, помилки, aliases, 0–5 слів, видалення, bounded review |
| C | Нова additive міграція, RLS/grants, atomic RPC/receipts, repository, retry/conflict | PostgreSQL WASM: чиста/наявна схема, TS/SQL parity, receipts, ownership, deletion, RLS. Controller/memory також перевірені. Live Supabase і незалежні конкурентні транзакції — not run |
| D | Home/continue, режими, знайомство, form/feedback, приклади, summary review, focus/labels | Production Chrome journey 25+15+15, replay/reload, review20, viewport/overflow, StrictMode development; auth/transport fixtures |
| E | Архітектура, runbook, content-review, цей звіт, майбутній Netlify build config | 42 старі +21 нова перевірка, typecheck/build, два браузерні прогони, diff check. Відкриті інтеграційні пункти перелічено нижче |

## Сценарії A01–A18

`passed` означає тільки зазначене в колонці «Фактично перевірено».
Це не твердження про hosted Supabase, production чи фізичні пристрої.
`not run` — немає повного доказу потрібного сценарію; локальні часткові докази
зазначено окремо. У фінальному коді немає невиправлених failed-тестів.

| ID | Статус локального сценарію | Фактично перевірено | Неперевірене |
| --- | --- | --- | --- |
| A01 | passed | Domain, реальний локальний PostgreSQL і Chrome: 5 слів, 25 intro, 15 HE→UK,15 UK→HE; останній feedback ще active, completed тільки після next; старий SRS незмінний | Той самий шлях через hosted Supabase |
| A02 | passed | Domain/SQL інтенсивний:50+50+50; пороги записані в session та використовуються з неї; mode/threshold snapshots не змінюються поточним вибором наступного режиму | Повний intensive браузерний шлях; оновлення deployed defaults у майбутній версії |
| A03 | passed | Domain/SQL: incorrect/revealed0, бали не обнуляються; Chrome:empty submit без запиту, непорожній composition submit блокується, review «Не знаю» | Фізична IME/мобільна клавіатура |
| A04 | passed | Domain/SQL повтор команди; Controller synchronous pending lock; Chrome подвійний submit і подвійний native Enter зараховують одну дію | Реальні touch-пристрої |
| A05 | passed | SQL і test repository відновлюють feedback; Chrome reload question очищає текст, reload feedback не додає бала | Реальний session restore Supabase auth |
| A06 | passed | SQL receipt перед revision, replay актуального стану; memory commit+throw; HTTP fixture повертає NETWORK після commit, Chrome retry тієї самої команди без дубля | Реальна втрата response PostgREST/timeout після commit у Supabase |
| A07 | passed | PostgreSQL stale revision повертає conflict; Controller бере актуальні дані й повідомляє про іншу вкладку, не зливає бали | Дві live вкладки на hosted БД |
| A08 | not run | Memory Promise.all starts; PostgreSQL повторні start повертають один active й однакові ID; unique index/advisory lock реалізовані | Справжні одночасні запити двох незалежних PostgreSQL транзакцій/вкладок: PGlite має одне з’єднання |
| A09 | passed | SQL: нове слово не входить в active; snapshot не змінюється після редагування; наступний review читає оновлений he; додані слова враховуються в метриках/наступному рівні | Live dictionary editing у двох вкладках |
| A10 | passed | Domain/SQL: 1/all deletion, cancelled_empty без completion, наступний рівень доступний; FK прибирає snapshot; ownership loss видаляє material, після повернення доступу старий active snapshot не відновлюється | Зміни доступу через реальний Supabase/admin |
| A11 | passed | Domain1–4 повних цикли,0 немає session; SQL новий рівень з1 словом; UI порожній state і disabled start | Браузерні повні проходи кожного1–4 через Supabase |
| A12 | passed | Controller delayed response і account epoch; Chrome auth switch прибирає старий session/data; перевірка owner перед execute | Реальне перемикання Supabase token під час запиту |
| A13 | passed (локальний PostgreSQL) | Реальні GRANT/RLS/ролі: чужий session, word, owner, anon, direct writes/helper EXECUTE відхилені; auth.uid fixture | Supabase JWT/PostgREST/production policies. Це не UI-only/mock перевірка SQL, але auth схему для локального PostgreSQL створено тестом |
| A14 | passed | Fixture Unicode: нікуд/наголос, NFC й/ї, різні літери, кінцеві форми, maqaf/geresh/gershayim/крапки, точні aliases, не includes | Лінгвістична правильність production aliases |
| A15 | passed | Domain/SQL20 incorrect; Chrome20 «Не знаю»; completed review, any_error retained, список складних слів, completed-word count не збільшується, practice після двох напрямків | Real Supabase review/серверні clock policies |
| A16 | passed | Validation/SQL/Chrome0/1/2, draft і чужі відхилені; revoke+reload не відновлює приклади зі snapshot; збій прикладів не блокує | Реальна схема/RLS word_examples; realtime revocation без refresh не реалізовано |
| A17 | passed | Dev StrictMode:subscribe2/unsubscribe1/live1 після mount;0 після unmount; remount1; бізнес-записів на mount немає; Controller ігнорує старі відповіді | Тривалий heap profiling/інші браузери |
| A18 | passed (локальна production-збірка) | Typecheck/build, byte-for-byte старі files; Chrome старі login/logout/cards/quiz/import/decks/nav з fixtures; old examples test із dist;42 старі unit-тести імпорту/SRS | Справжній Supabase login/signup/import writes, hosted кеш/Netlify deploy; signup/browser manual content не перевірено |

## Фактичні команди та результати

- `node --test tests/progress.test.cjs tests/import.test.cjs` до змін:42/42.
- `npm run typecheck`: passed, strict/noUncheckedIndexedAccess/noUnused.
- `npm run build`: passed. Classic-script warnings config/store/ui очікувані,
  ці файли скопійовані у dist й виконуються один раз у старому порядку.
- `npm test`:42/42 старі +21/21 нові (6 domain,7 application/repository,8 SQL).
- Додатково після перевірки signed-bigint runtime validator:
  `node --import tsx --test tests/learning-repository.test.ts`:7/7.
- `node --import tsx --test tests/learning-sql.test.ts`:8/8,
  включно з доповненими ownership loss та fresh review snapshot.
- `node --import tsx tests/learning.browser.cjs`:passed на фінальному dist.
  Повний normal journey, question/feedback reload, double Enter/submit,
  composition,0/1/2 приклади,revocation,soft failure,retry,account switch,
  review20,старі сторінки/login/logout fixtures,StrictMode mount/unmount.
- `TEST_SITE_ROOT=dist node tests/examples.browser.cjs`:passed;
  Chrome320/390/768×0/1/2, disclosure,focus/inert,AX tree,fallback,quiz.
- `git diff --check`:passed. Усі старі pages/js/css/index файли перевірено
  на однаковість із dist. MemoryRepository/PGlite не входять у production JS.
- Lint:not run — наявного lint конфігу/команди не було, новий стек не додано.

Браузерні тести створюють screenshots/report.json у тимчасовій папці й
друкують її шлях. Скриншоти normal/320 long-content переглянуті візуально.
Viewport320/390/768/1280, довгі тексти й reduced-motion перевірені;
це desktop Chrome, не реальна мобільна клавіатура/VoiceOver.

Production assets: новий JS приблизно245.27 kB (gzip76.99 kB), CSS5.95 kB
(gzip1.85 kB), HTML0.76 kB. Legacy/Supabase CDN не включено до цієї цифри.
Виміряний normal journey з **двома reload**:3 lp_dashboard +86 lp_command
+3 lp_examples =92 RPC. Без reload — розрахунково88 RPC:1 dashboard,
1 start+25 intro_next+30 answer+30 next,1 examples. Це не 88 виміряних запитів
реального Supabase; auth refresh/CDN/static запити не рахувалися.
Приклади не запитуються на кожну вправу. Метрики не завантажують прикладів словника.

## Відомі межі та наступні дії

Потрібен незалежний тестовий Supabase. Звірити його схему, застосувати нову
міграцію, прогнати JWT/RLS/RPC, concurrency A08 і транспортні A06/A07/A12.
Схеми word_examples у repo немає; перевірена тестова таблиця з полями старого
клієнтського select, не заявлена як актуальна hosted схема.
Старий examples.test.cjs та попередні content validators відсутні — їхні
історичні claims у старих документах не повторюємо як факти цього запуску.

70 локальних матеріалів потребують редакторського погодження коротких aliases;
їх не вигадано й production-контент не змінено. Нормалізація не оцінює довільні
синоніми. Приклади відкликаються при refresh/reload/foreground, без realtime.
Дані завжди серверні; offline write queue і fallback storage не додано.

Подальший порядок релізу, backup, smoke та безпечний rollback —
[learning-path-runbook.md](learning-path-runbook.md).

Фінальний browser report: `/var/folders/wp/_4mg_2gd4xdgwksf4_4_9cbm0000gn/T/hebrew-learning-browser-nipCtR/report.json`; screenshots поруч.
Попередні green-прогони: learning-browser-G9Zanh (double native Enter/IME),
examples-browser-yf4aQv (legacy dist). Тимчасові артефакти не комітяться.
