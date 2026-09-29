# CLAUDE.md — Party Sheet

Полная спецификация — `SPEC.md`. Прочитай её целиком перед первой задачей и перечитывай нужный раздел перед каждой вехой.

## Порядок работы
- Вехи M0–M10 из `SPEC.md` §17 — строго по порядку. Веха закрыта, когда выполнены все её критерии приёмки и проходят `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- После каждой вехи: коммит(ы) и запись в `PROGRESS.md` (сделано / отложено / известные проблемы).
- Спорная трактовка правил → самый распространённый вариант RAW 2014, комментарий `// RULES-NOTE:` и строка в `docs/rules-decisions.md`.

## Жёсткие правила
- Вся логика D&D — только в `packages/rules-engine` (чистые функции, без I/O, React и Node-API).
- Не выдумывай механику. Нет данных — `text`-эффект и ручной переключатель, а не «примерное» число.
- Изменения игрового состояния персонажа — только командами `applyCommand` (§8.10); build — только с `expectedVersion`.
- Каждая tRPC-процедура вызывает гард прав (§5.3). Проверка прав в UI — не замена серверной.
- Никакого `eval`, `new Function`, `dangerouslySetInnerHTML` с внешним HTML.
- Строки интерфейса — только через `apps/web/src/i18n/ru.ts`.
- Ключи контента (`<pack>/<kind>/<slug>`) после первого импорта не меняются (`key-map.json`).

## Команды
- `pnpm dev` — приложение; `docker compose -f docker/docker-compose.dev.yml up -d db` — БД для разработки.
- `pnpm test` / `pnpm test:e2e` / `pnpm lint` / `pnpm typecheck`.
- `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`.
- Импорт: `pnpm import:srd`, `pnpm import:dndsu <crawl|parse|build|diff>`, `pnpm content:validate`, `pnpm content:coverage`, `pnpm content:load`.

## Импорт dnd.su
- Сначала сохрани реальные страницы-образцы в `packages/importer/fixtures/` и пиши парсеры по ним (§7.3), со снапшот-тестами.
- Запросы: по одному, пауза ~1,5 с, cookie-jar; при цикле редиректов — Playwright.
- Сырой HTML — в `packages/importer/cache/` (в `.gitignore`); сгенерированные JSON-пакеты коммитятся.
