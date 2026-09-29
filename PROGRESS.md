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

## Замечания по окружению

- Сетевая политика среды разработки блокирует `dnd.su` (403 на CONNECT). Импорт dnd.su (M5) требует реальных страниц-образцов, поэтому парсеры dnd.su не пишутся до открытия доступа.
