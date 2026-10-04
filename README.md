# Party Sheet

Листы персонажей D&D 5e (2014) для закрытой группы: кампании, панель мастера, заметки, броски, homebrew. Контент — SRD 5.1 на русском (импорт dnd.su готовится). Полная спецификация — [SPEC.md](SPEC.md), ход работ — [PROGRESS.md](PROGRESS.md).

## Разработка

Нужны Node.js 22.12+, pnpm 10 и Docker (для БД).

```sh
pnpm install
docker compose -f docker/docker-compose.dev.yml up -d db
pnpm db:migrate && pnpm content:load && pnpm db:seed   # демо-кампания; логины и пароли выводит db:seed
pnpm dev                                                 # http://localhost:3000
```

Проверки: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` (Playwright, база `party_sheet_test`).

## Устройство

- `apps/web` — Next.js (App Router), tRPC, Drizzle/PostgreSQL, TipTap, service worker (serwist).
- `packages/rules-engine` — вся механика D&D: расчёт листа, команды состояния, повышение уровня, броски.
- `packages/content-schema` — схемы контента и персонажа (zod), `packages/content-data` — JSON-пакеты контента, `packages/importer` — импорт SRD и dnd.su.

## Деплой

`cp .env.example .env`, заполнить, `docker compose up -d --build` — сайт по HTTPS на `DOMAIN` (Caddy), ежедневные резервные копии. Подробно — [docs/deploy.md](docs/deploy.md), восстановление — [docs/restore.md](docs/restore.md).
