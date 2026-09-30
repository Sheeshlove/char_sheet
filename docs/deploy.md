# Развёртывание на VPS

Стек (SPEC §16.2) — четыре контейнера из `docker-compose.yml` в корне репозитория:

| Сервис | Что делает |
| --- | --- |
| `db` | PostgreSQL 16, данные в томе `pgdata`, порт наружу не открыт |
| `web` | Next.js (standalone). При каждом старте: миграции → первый администратор (если пользователей нет) → `content:load` (только пакеты с новой версией) → сервер. Загрузки — том `uploads` |
| `caddy` | Порты 80/443, автоматический HTTPS для `DOMAIN`, HSTS и заголовки безопасности, прокси на `web:3000` |
| `backup` | Ежедневно в 03:30 `pg_dump \| gzip` в том `backups`, по воскресеньям ещё архив `uploads`; хранение `BACKUP_RETENTION_DAYS` дней |

## Требования

- VPS с 1 vCPU и 2 ГБ памяти (сборка образа Next.js занимает ~1,5 ГБ; при 1 ГБ добавьте swap).
- Linux с Docker Engine 24+ и плагином Compose v2 (`docker compose version`).
- Домен, A/AAAA-запись которого указывает на сервер. Открытые порты 80 и 443 (TCP) и 443/UDP для HTTP/3.
- Исходящий доступ в интернет при сборке образа: пакеты npm и шрифт Inter (Google Fonts) скачиваются на этапе `docker compose build`.

## Первый запуск

```sh
git clone <адрес репозитория> party-sheet && cd party-sheet
cp .env.example .env
```

Заполните `.env`:

- `DOMAIN` — домен сайта, например `party.example.com`;
- `POSTGRES_PASSWORD` — длинный случайный пароль (`openssl rand -hex 24`);
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (не короче 10 символов) — учётная запись первого администратора. Используются, только пока в БД нет ни одного пользователя. Если оставить пустыми, первый зарегистрировавшийся на сайте станет администратором — делайте так, только если регистрируетесь сразу после запуска;
- по желанию `TZ` (часовой пояс для расписания копий), `BACKUP_RETENTION_DAYS`, `LOG_LEVEL`.

Запуск:

```sh
docker compose up -d --build
docker compose logs -f web      # ждём «content:load» и «Ready»
```

Через минуту сайт открывается по `https://DOMAIN`: Caddy сам получит сертификат Let's Encrypt. Войдите под `ADMIN_EMAIL` / `ADMIN_PASSWORD`, смените пароль в профиле, затем удалите `ADMIN_PASSWORD` из `.env` — он больше не нужен.

Проверка:

```sh
docker compose ps               # все сервисы running, web — healthy
curl -I https://DOMAIN/api/health
```

## Обновление

```sh
git pull
docker compose up -d --build
```

Миграции и новые версии пакетов контента применяются автоматически при старте `web`. Перед крупным обновлением сделайте внеплановую копию (см. ниже).

## Резервные копии

Копии лежат в томе `backups`:

```sh
docker compose exec backup ls -lh /backups
```

- `db-ГГГГММДД-ЧЧММСС.sql.gz` — дамп БД, каждый день в `BACKUP_TIME` (03:30 по `TZ`);
- `uploads-ГГГГММДД-ЧЧММСС.tar.gz` — портреты и изображения заметок, раз в неделю (`UPLOADS_BACKUP_WEEKDAY`, по умолчанию воскресенье).

Копии старше `BACKUP_RETENTION_DAYS` дней удаляются; последняя копия каждого вида остаётся всегда.

Внеплановая копия (БД и загрузки):

```sh
docker compose exec backup sh /scripts/backup.sh --uploads
```

Том `backups` лежит на том же диске, что и данные. Регулярно забирайте копии на другую машину, например:

```sh
docker compose cp backup:/backups ./backups-$(date +%F)
```

Восстановление — [docs/restore.md](restore.md).

## Логи и диагностика

- `docker compose logs web` — JSON-логи (pino). Пароли, токены, cookie и тексты заметок в лог не пишутся. Уровень — `LOG_LEVEL` (`info`, `warn`, `debug`).
- `docker compose logs caddy` — выпуск сертификатов и доступ.
- `docker compose logs backup` — результаты резервного копирования.
- Пакеты контента в репозитории обновились: `docker compose up -d --build` (загрузятся только изменившиеся пакеты); принудительно — «Перезагрузить из файлов» в разделе контента админки.

## Проверка без домена

Для пробного запуска на своей машине задайте `DOMAIN=localhost`: Caddy выпустит сертификат своим внутренним CA (браузер предупредит о недоверенном сертификате), сайт — `https://localhost`.
