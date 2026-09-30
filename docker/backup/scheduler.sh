#!/bin/sh
# Планировщик копий без cron: ежедневно в BACKUP_TIME (по умолчанию 03:30, часовой пояс TZ)
# копия БД; в день недели UPLOADS_BACKUP_WEEKDAY (1 = пн … 7 = вс) — ещё и архив загрузок.
set -eu

TIME="${BACKUP_TIME:-03:30}"
WEEKDAY="${UPLOADS_BACKUP_WEEKDAY:-7}"
echo "[backup] расписание: ежедневно в $TIME ($(date +%Z)), загрузки — день недели $WEEKDAY; хранение ${BACKUP_RETENTION_DAYS:-14} дн."

while true; do
  now="$(date +%s)"
  next="$(date -d "today $TIME" +%s)"
  if [ "$next" -le "$now" ]; then next="$(date -d "tomorrow $TIME" +%s)"; fi
  sleep "$((next - now))"
  if [ "$(date +%u)" = "$WEEKDAY" ]; then
    sh /scripts/backup.sh --uploads || echo "[backup] ОШИБКА резервного копирования" >&2
  else
    sh /scripts/backup.sh || echo "[backup] ОШИБКА резервного копирования" >&2
  fi
done
