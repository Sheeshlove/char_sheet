# PROGRESS

Журнал выполнения вех из `SPEC.md` §17.

## M0. Каркас — готово

**Сделано**
- Монорепозиторий pnpm workspaces + Turborepo: `apps/web`, `packages/{rules-engine,content-schema,content-data,importer}`.
- Next.js 16 (App Router), React 19, Tailwind CSS 4, компоненты в стиле shadcn/ui на `radix-ui` (написаны вручную в `apps/web/src/components/ui`), тёмная тема по умолчанию (`next-themes`), шрифт Inter (кириллица) через `next/font`.
- tRPC v11 + TanStack Query (`@trpc/tanstack-react-query`), superjson, проверка `Origin` для POST (CSRF).
- Drizzle ORM + drizzle-kit: полная схема БД из §4 (23 таблицы) и первая миграция `apps/web/drizzle/0000_init.sql`.
- `docker/docker-compose.dev.yml` (PostgreSQL 16 + тестовая БД для e2e).
- ESLint (flat config, typescript-eslint) + Prettier; правила: запрет `eval`/`new Function`/`dangerouslySetInnerHTML`, запрет импорта React/Node-API/apps в движке правил.
- Vitest в каждом пакете, Playwright (e2e против `next start` и отдельной БД `party_sheet_test`).
- GitHub Actions: lint, typecheck, test, e2e.
- Заголовки безопасности и CSP без `unsafe-eval` в продакшене.

**Отложено**
- —

**Известные проблемы**
- `next start` предупреждает об `output: 'standalone'`; для e2e это не мешает, в Docker используется `server.js`.

## M1. Аккаунты и админка — готово

**Сделано**
- Таблицы §4.1; сессии по паттерну Lucia: токен 32 байта в cookie `ps_session` (httpOnly, SameSite=Lax, Secure при https), в БД — sha256; срок 30 дней, продление в tRPC-запросах, когда осталось < 15 дней.
- Пароли — Argon2id (`@node-rs/argon2`), минимум 10 символов.
- Регистрация только по инвайту (атомарное «занятие» кода в транзакции); самый первый пользователь при пустой таблице `users` регистрируется без кода и становится админом; также `pnpm admin:bootstrap` из `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- Вход по email или username, ограничение 10 неудач за 15 минут на IP+логин (11-я попытка — `TOO_MANY_REQUESTS`).
- Выход, смена пароля (завершает остальные сессии), список и завершение активных сессий, профиль, выбор темы.
- Админка `/admin`: создание/отзыв инвайтов со сроком и заметкой, копирование ссылки `/register?invite=CODE`, список пользователей, назначение админов, одноразовая ссылка сброса пароля на 24 часа (`/reset/:token`).
- Проверка Origin для всех POST в `/api/trpc`.
- Тесты: юнит (лимитер, инвайты, cookie/токены, Origin), e2e `e2e/auth.spec.ts`.

**Отложено**
- Аватар пользователя (поле есть в схеме, загрузка файлов — вместе с портретами в M7).

**Известные проблемы**
- —

## M2. Кампании и права — готово

**Сделано**
- Таблицы §4.2; `CampaignSettings` — zod-схема со значениями по умолчанию в `@ps/content-schema` (общая для сервера и движка правил).
- Роутер `campaigns`: list, get, create, update, updateSettings, archive, invites.create/list/revoke/preview, join, leave, members.list/setRole/remove.
- Страницы: `/campaigns` (список, создание), `/campaigns/:id` (обзор, участники, роли, ссылки-приглашения), `/campaigns/:id/settings` (форма `CampaignSettings`), `/join/:code` (с возвратом после входа через `?next=`).
- Гарды §5.3: чистая матрица прав `server/auth/access.ts` + серверные обёртки `server/auth/guards.ts` (`requireUser`, `requireCampaignRole`, `canViewCharacter`, `canEditCharacter`, `canViewNote`, `canEditNote`). Параметризованные тесты по всем строкам таблицы 5.3 (`access.test.ts`, 97 случаев).
- Со-мастер: права мастера, кроме архивации кампании и смены ролей. При исключении участника его персонажи отвязываются от кампании.
- e2e `e2e/campaigns.spec.ts`.

**Отложено**
- Персонажи и квесты на обзоре кампании — вехи M7/M8.

**Известные проблемы**
- —

## M3. Движок правил — готово

**Сделано**
- `@ps/content-schema`: zod-схемы (строгие) и типы: базовые перечисления (§6.1), DSL эффектов и предикатов (§6.3–6.4), данные сущностей по видам (§6.2), `CharacterBuild` / `CharacterState` / `StateCommand` (§8.2, §8.10).
- `@ps/rules-engine`: публичный API §8.1 — `compute`, `pendingChoices`, `validateBuild`, `levelUpOptions`, `applyLevelUp`, `undoLastLevel`, `applyCommand`, `summarize`, `evalExpr`, `ContentIndex`.
- Вычислитель выражений: `jsep` + собственный интерпретатор с белым списком узлов и функций (`floor`, `ceil`, `min`, `max`, `abs`, `col`, `toggle`, `has`); ошибка — 0 и предупреждение.
- Стадии §8.4 отдельными модулями `pipeline/`: источники и выборы (`collect.ts`), характеристики и БМ, владения, спасброски/навыки/пассивы/инициатива, КД, скорость/размер/чувства/нагрузка, хиты, атаки, заклинательство, ресурсы/переключатели/умения, переопределения, проверки.
- Таблицы 2014 (§8.12): опыт, БМ, ячейки, магия договора, покупка очков, стандартный набор, состояния и истощение (§8.11).
- Команды §8.10 (урон с сопротивлениями, смерть, лечение, временные хиты, спасброски от смерти, ячейки, ресурсы, переключатели со стоимостью, состояния, концентрация, короткий/долгий отдых, новый день, опыт, монеты, инвентарь, подготовка).
- Рукописный мини-набор контента (`test/fixtures/mini-*.ts`, экспорт `content-mini.ts`): 12 классов + изобретатель с таблицами 1–20, 8 подклассов, 5 рас, 3 предыстории, 3 черты, снаряжение, 37 заклинаний.
- Эталоны 01–24 (`test/golden/NN-*.input.json`, `.expected.json`, `.md` с арифметикой) — все проходят; всего 298 тестов движка.
- Покрытие движка: ~96% строк (порог 90% включён в `pnpm test`). Бенчмарк: воин 13 / волшебник 7 — ~1 мс на `compute` (лимит 10 мс).
- Движок не импортирует React, Node-API и `apps/` (ESLint `no-restricted-imports` + `types: []` в `tsconfig.json` движка).

**Расширения схемы (сверх SPEC, обратно совместимые)**
- `SpellData.selfEffects` — эффекты на заклинателя (переключатель `spell:<key>`, «Доспехи мага», «Щит»).
- `ClassSpellcasting.startLevel`, `GearData.toolGroup`/`contents`, `MagicItemData.weightLb`, `ConditionData.implies`, вид `feature` для отдельных умений (боевые стили).
- `InventoryItem.baseKey` — базовый предмет для магических предметов «любое оружие/доспех».
- Команды `set_xp`, `add_currency`, `set_charges`; флаг `magical` у урона (немагический Д/К/Р).
- В `ComputedSheet` добавлены `identity`, `choices` (все выборы с вариантами), `status`, списки заклинаний по классам.

**Отложено**
- Эталоны на реальных пакетах — в M6 (через `test/fixtures/key-aliases.json`).

**Известные проблемы**
- Мини-набор оформлен как TypeScript-модули (`content-mini.ts`) вместо одного JSON: так компактнее описывать таблицы классов.

## Замечания по окружению

- Сетевая политика среды разработки блокирует `dnd.su` (403 на CONNECT). Импорт dnd.su (M5) требует реальных страниц-образцов, поэтому парсеры dnd.su не пишутся до открытия доступа.
