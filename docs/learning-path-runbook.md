# Запуск, перевірка та майбутній реліз

## Локально
Node 22.16+; npm. `npm ci`, `npm run dev`; відкрийте `/learning.html`.
Використовується чинний публічний конфіг `js/config.js` та один клієнт Supabase.
Не додавайте service_role. Для незалежних тестів не потрібен акаунт:
`npm test` запускає старі Node-тести, domain/application і PostgreSQL WASM.
`npm run typecheck`; `npm run build`; `npm run preview` для production assets.
`npm run test:browser` потребує Chrome (або CHROME_PATH), localhost і Node 22
з WebSocket. Спочатку зберіть dist. Тестовий HTTP транспорт та auth — fixtures,
без зовнішніх скриптів/конфігу/production. SQL-тести використовують PGlite
PostgreSQL зі схемою auth.users/auth.uid для тестових ролей, не live Supabase.

Vite classic-script warnings очікувані: js/config/store/ui навмисно залишені
classic і скопійовані plugin. React новий модуль; решта сайту — оригінальні файли.
Netlify config підготовлено локально: build `npm run build`, publish `dist`.
З root без Vite новий .tsx-модуль не працюватиме. React не завантажується на старих
сторінках. У dev/test StrictMode увімкнено, бізнес-записів на mount немає.
На цьому macOS binary esbuild >=0.25 не запустився; override 0.24.2 зафіксовано
у lockfile, перевірено typecheck/build/browser. Lint у репозиторії не було й не додано.

## Перед застосуванням міграції
`sql/migrate_learning_path_v1.sql` — нова, additive, ще не застосована на Supabase.
Локально виконана на чистому PostgreSQL WASM і з уже наявними words. На реальній
тестовій Supabase БД потрібно спершу звірити words(id bigint,user_id uuid,
he/ua/tr text,created_at timestamptz), auth/roles і word_examples. Її схеми в
репозиторії немає; optional lp_examples використовує лише поля старого select.
Не запускайте старі migrate_v2/schema на існуючій production-БД для цієї задачі.

Виконати міграцію тільки у тестовому середовищі; перевірити два акаунти,
anon, RLS SELECT кожної таблиці, заборону прямих записів прогресу й EXECUTE helper,
owner/word/session spoof, RPC із Supabase JS/PostgREST, перезапуск, timeout після
commit та дві справжні конкурентні транзакції/вкладки. При зміні вже застосованої
міграції створюйте наступну, не редагуйте виконану.
Відсутність міграції показує окрему помилку; production ніколи не переходить
автоматично на memory/localStorage. Memory repository імпортується тільки тестами.

## Наповнення answer variants
Таблиця lp_answer_variants: owner (default auth.uid()), word_id bigint,
direction he_to_uk або uk_to_he, answer непорожній, до 500 символів, до 50
варіантів на напрямок. Погоджений варіант можна записати авторизованим клієнтом:

```ts
await client.from('lp_answer_variants').insert({
  word_id: 'ID_ВЛАСНОГО_СЛОВА', direction: 'he_to_uk', answer: 'ПОГОДЖЕНИЙ_ТЕКСТ'
})
```

Це інструкція, не виконаний запис. Власник перевіряється RLS + membership trigger.
Новий рівень/повторення бере актуальні variants; активний snapshot не змінюється.
Без variants приймається нормалізоване основне he/ua. Коми/слеші не розбиваються.
70 матеріалів локального файлу позначено в learning-path-content-review.md;
позиції у файлі не є production word_id. Вхід обмежено 2000 символами, як і
придатне основне поле. Нікуд: U+0591–05BD,05BF,05C1–05C2,05C4–05C5,05C7;
maqaf→ASCII дефіс, geresh/поширені апострофи→ASCII ', gershayim→ASCII ".
Крапки й інша пунктуація зберігаються; фінальні форми й різні літери не зливаються.
Українська NFC, лише U+0301 прибрано, пробіли/регістр/апострофи нормалізовано;
й/ї, і/и, г/ґ, е/є розрізняються. Це рівність із даними, не мовний AI-іспит.

## Протокол і відновлення
lp_command приймає лише шість полів команди: operation_id, session_id,
expected_revision, exercise_id, action, payload. Payload містить kind/mode
для start або тільки result для answer; текст відповіді не зберігається.
Автор визначається auth.uid. Advisory lock owner → receipt → revision →
перевірка вправи/доступу → атомарний перехід і receipt. Replay повертає
поточний dashboard. Ідентичний operation_id з іншим fingerprint відхиляється.
Один pending command на клієнті; timeout 15 секунд, retry з тим самим ID.
При stale revision показується повідомлення іншої вкладки, приймається серверний
стан без додавання локальних балів. Після reload джерело істини — сервер;
незбережений текст і незарахований перегляд звороту втрачаються.
Receipt у v1 автоматично не видаляються (увесь строк допустимого повтору);
не містять сирих відповідей. Архівування можливе тільки разом із новим
протоколом, який визначить строк заборони старих retry.

FK words ON DELETE CASCADE видаляє snapshots, variants і прогрес слова.
Черга має ID до reconcile; кожне відновлення/команда перевіряє власність,
прибирає недоступний матеріал і пропускає його без заміни/балів. Порожній
сеанс — cancelled_empty. Історичні сеанси зберігаються, але видалений матеріал
не повертається; dashboard повертає активні й останні три сеанси.
Приклади не входять у snapshot. Batch fetch при відкритті/зміні складу сеансів,
reload і поверненні вкладки у foreground. Немає запиту на кожну вправу.
Відкликання під час безперервно відкритого сеансу стане видимим при наступному
refresh/відновленні; realtime-підписки не додано. RLS word_examples збережено:
lp_examples security invoker; відсутня таблиця/приклади — м’який fallback.

Review: приватний helper lp_review_interval задає 24 години серверного UTC.
Зміна інтервалу — окрема міграція. Максимум дві спроби на напрямок (20 на 5 слів).
any_error зберігає також виправлену помилку. last_practiced_at оновлюється після
Далі з останнього feedback слова в обох напрямках; нові завершення не додаються.
Старі SRS due_at/review_level/streak не зачіпаються.

## Майбутній release checklist — не виконаний
1. Перевірити реальне тестове середовище й усі not run у acceptance report.
2. Зробити backup та підтвердити можливість відновлення БД.
3. Застосувати нову міграцію; виконати SQL/auth/RLS/RPC smoke двома акаунтами.
4. Зібрати й опублікувати frontend з dist; перевірити всі старі сторінки.
5. Smoke рівень, feedback/reload, retry/conflict, review, додавання/видалення слів.
6. Перевірити Safari/VoiceOver і справжню мобільну клавіатуру/IME.

Rollback frontend: попередня збірка або приховування нового пункту меню.
НЕ видаляти таблиці з прогресом. Additive об’єкти залишають старий frontend
працездатним. Старого service worker локально не знайдено; hosted caching
потрібно перевірити окремо. Production SQL/push/deploy цією задачею не виконані.
