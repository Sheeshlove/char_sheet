# Восстановление из резервной копии

Копии делает сервис `backup` (см. [deploy.md](deploy.md#резервные-копии)):

- `db-ГГГГММДД-ЧЧММСС.sql.gz` — полный дамп БД (`pg_dump --clean --if-exists --no-owner`): пользователи, кампании, персонажи, заметки, homebrew, служебная схема миграций;
- `uploads-ГГГГММДД-ЧЧММСС.tar.gz` — каталог загрузок (портреты, изображения заметок).

Процедура одна и та же для того же сервера (откат) и для нового (переезд, потеря диска). Команды выполняются в каталоге репозитория, где лежат `docker-compose.yml` и заполненный `.env`.

> Проверено 30.09.2026: стек поднят с нуля, созданы данные, копия сделана по расписанию, все тома удалены (`docker compose down -v`), затем по этой инструкции восстановлены БД и загрузки на чистых томах. Персонажи, пользователи, файлы и портреты на месте, вход старым паролем работает.

## 0. Подготовка

Положите нужные файлы в каталог `restore/` рядом с `docker-compose.yml`. С работающего сервера их можно забрать так:

```sh
docker compose cp backup:/backups ./restore
ls -lh restore/
```

Выберите дамп БД (обычно самый свежий) и ближайший к нему архив загрузок:

```sh
DB_DUMP=restore/db-20260930-143335.sql.gz
UPLOADS=restore/uploads-20260930-142800.tar.gz
gzip -t "$DB_DUMP" && gzip -t "$UPLOADS" && echo "архивы целы"
```

На новом сервере сначала выполните шаги «Первый запуск» из [deploy.md](deploy.md) до команды `docker compose up` (клонировать репозиторий, заполнить `.env`). `POSTGRES_PASSWORD` может отличаться от старого: дамп не привязан к владельцу.

## 1. Остановить приложение, поднять только БД

```sh
docker compose stop web caddy 2>/dev/null
docker compose up -d db
docker compose exec db pg_isready -U party -d party_sheet
```

## 2. Восстановить БД

База пересоздаётся пустой и заливается из дампа. **Текущее содержимое БД будет удалено.**

```sh
docker compose exec -T db dropdb -U party --if-exists party_sheet
docker compose exec -T db createdb -U party party_sheet
gunzip -c "$DB_DUMP" | docker compose exec -T db psql -U party -d party_sheet -v ON_ERROR_STOP=1 -q
```

Проверка — числа должны совпасть с ожидаемыми:

```sh
docker compose exec -T db psql -U party -d party_sheet -c \
  "select (select count(*) from users) users, (select count(*) from characters) characters, (select count(*) from notes) notes, (select count(*) from files) files"
```

## 3. Восстановить загрузки

Архив распаковывается в том `uploads` через одноразовый контейнер `web` (пользователь `node`). **Текущие файлы в томе будут удалены.**

```sh
docker compose run --rm --no-deps -v "$PWD/restore:/restore:ro" --entrypoint sh web -c \
  "find /data/uploads -mindepth 1 -delete && tar -xzf /restore/$(basename "$UPLOADS") -C /data/uploads && ls /data/uploads | wc -l"
```

Если архив загрузок старше дампа, портреты и картинки, загруженные между ними, будут отсутствовать: в интерфейсе на их месте появится заглушка, остальное работает.

## 4. Запустить сайт

```sh
docker compose up -d
docker compose logs -f web      # «миграции применены», «content:load», «Ready»
```

При старте `web` применяет недостающие миграции (если копия сделана более старой версией) и загружает пакеты контента, версия которых отличается от записанной в БД.

## 5. Проверить

- `https://DOMAIN` открывается, вход старым логином и паролем работает (сессии из копии тоже действуют);
- в «Персонажах» и кампаниях — ожидаемые данные, портреты показываются, PDF листа скачивается;
- `docker compose logs backup` — расписание запущено; через сутки появится новая копия.

Каталог `restore/` после проверки можно удалить (он не нужен приложению и не коммитится).
