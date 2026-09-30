#!/bin/sh
# Подготовка (миграции → первый администратор → content:load), затем сервер Next.js.
set -e
node /app/prestart.cjs
exec "$@"
