#!/bin/sh
# Резервная копия (SPEC §16.2): pg_dump | gzip в /backups; с флагом --uploads — ещё архив загрузок.
# Старше BACKUP_RETENTION_DAYS дней удаляются (последняя копия каждого вида остаётся всегда).
set -eu

DEST=/backups
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

tmp="$DEST/.db-$STAMP.sql.gz.part"
pg_dump --no-owner --no-privileges --clean --if-exists | gzip -9 > "$tmp"
gzip -t "$tmp"
mv "$tmp" "$DEST/db-$STAMP.sql.gz"
echo "[backup] $(date -Iseconds) БД: $DEST/db-$STAMP.sql.gz ($(du -h "$DEST/db-$STAMP.sql.gz" | cut -f1))"

if [ "${1:-}" = "--uploads" ]; then
  tmp="$DEST/.uploads-$STAMP.tar.gz.part"
  tar -czf "$tmp" -C /uploads .
  mv "$tmp" "$DEST/uploads-$STAMP.tar.gz"
  echo "[backup] $(date -Iseconds) загрузки: $DEST/uploads-$STAMP.tar.gz ($(du -h "$DEST/uploads-$STAMP.tar.gz" | cut -f1))"
fi

prune() {
  newest="$(ls -1t "$DEST"/$1 2>/dev/null | head -n 1 || true)"
  find "$DEST" -maxdepth 1 -type f -name "$1" -mtime +"$RETENTION" | while read -r f; do
    if [ "$f" != "$newest" ]; then
      rm -f "$f"
      echo "[backup] удалена старая копия $f"
    fi
  done
}
prune 'db-*.sql.gz'
prune 'uploads-*.tar.gz'
