#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Avino — резервное копирование PostgreSQL (PostGIS) из docker-compose.
#
# Делает сжатый дамп БД в custom-формате (`pg_dump -Fc`), ротирует старые копии
# и (опционально) выгружает дамп в off-site S3/R2. Дамп в custom-формате удобнее
# plain-SQL: позволяет выборочный `pg_restore` и хранится уже сжатым.
#
# Запуск на сервере из любого каталога:
#   ./deploy/backup.sh                 # один дамп + ротация
#   ./deploy/backup.sh --no-rotate     # дамп без удаления старых
#   ./deploy/backup.sh --list          # показать имеющиеся копии и выйти
#   ./deploy/backup.sh -h              # справка
#
# Восстановление (DROP+CREATE объектов из дампа в работающую БД):
#   docker exec -i avino-postgres pg_restore -U avino -d avino --clean --if-exists \
#       < backups/avino-YYYYmmdd-HHMMSS.dump
#
# Переменные окружения (переопределяют дефолты; креды берутся из .env):
#   BACKUP_DIR             каталог для дампов            (def: <repo>/backups)
#   BACKUP_RETENTION_DAYS  хранить копии N суток         (def: 7)
#   BACKUP_PG_CONTAINER    имя контейнера postgres       (def: avino-postgres)
#   BACKUP_S3_BUCKET       вкл. off-site выгрузку в бакет (напр. avino-backups)
#   BACKUP_S3_PREFIX       префикс/папка в бакете         (def: db)
#   S3_ENDPOINT            endpoint S3/R2 (из .env)       — для off-site выгрузки
#   AWS_*                  креды для aws cli (или S3_ACCESS_KEY_ID/S3_SECRET_*)
#
# Расписание (ежечасно) — добавить в crontab пользователя на сервере:
#   crontab -e
#   0 * * * * /path/to/avino/deploy/backup.sh >> /var/log/avino-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Корень репозитория = родитель каталога этого скрипта.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log()  { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Конфиг (env переопределяет дефолты) ──────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
PG_CONTAINER="${BACKUP_PG_CONTAINER:-avino-postgres}"

DO_ROTATE=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-rotate) DO_ROTATE=0; shift ;;
    --list)      ls -lh "$BACKUP_DIR"/avino-*.dump 2>/dev/null || echo "(копий нет)"; exit 0 ;;
    -h|--help)   grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Неизвестный аргумент: $1" ;;
  esac
done

# ── Креды БД из .env (с дефолтами docker-compose) ────────────────────────────
env_val() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }
PGUSER="$(env_val POSTGRES_USER)";     PGUSER="${PGUSER:-avino}"
PGDB="$(env_val POSTGRES_DB)";         PGDB="${PGDB:-avino}"
PGPASSWORD="$(env_val POSTGRES_PASSWORD)"

# ── Preflight ────────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker не найден в PATH."
docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER" \
  || die "Контейнер '$PG_CONTAINER' не запущен. Подними стек: ./deploy/deploy.sh"

mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/avino-$TS.dump"

# ── Дамп ─────────────────────────────────────────────────────────────────────
# Пишем во временный .partial, проверяем и только потом переименовываем — иначе
# при обрыве в backups/ останется битый «дамп», который примут за валидный.
log "Дамп БД '$PGDB' из контейнера '$PG_CONTAINER' → $OUT"
if ! docker exec -e PGPASSWORD="$PGPASSWORD" "$PG_CONTAINER" \
      pg_dump -U "$PGUSER" -d "$PGDB" -Fc --no-owner --no-privileges \
      > "$OUT.partial"; then
  rm -f "$OUT.partial"
  die "pg_dump завершился с ошибкой — дамп не создан."
fi

# Sanity-check: непустой файл + валидный заголовок custom-формата ('PGDMP').
[[ -s "$OUT.partial" ]] || { rm -f "$OUT.partial"; die "Дамп пустой."; }
head -c 5 "$OUT.partial" | grep -q 'PGDMP' \
  || { rm -f "$OUT.partial"; die "Дамп без сигнатуры PGDMP — повреждён."; }
mv "$OUT.partial" "$OUT"
log "Готово: $(du -h "$OUT" | cut -f1) — $OUT"

# ── Ротация по сроку хранения ────────────────────────────────────────────────
if [[ $DO_ROTATE -eq 1 ]]; then
  log "Ротация: удаляю дампы старше $RETENTION_DAYS сут."
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'avino-*.dump' \
    -mtime +"$RETENTION_DAYS" -print -delete || true
fi

# ── (Опц.) off-site выгрузка в S3/R2 ─────────────────────────────────────────
# КРИТИЧНО для реального бэкапа: копия на том же VPS бесполезна при гибели диска.
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  if command -v aws >/dev/null 2>&1; then
    PREFIX="${BACKUP_S3_PREFIX:-db}"
    ENDPOINT="$(env_val S3_ENDPOINT)"; ENDPOINT="${S3_ENDPOINT:-$ENDPOINT}"
    # aws cli читает AWS_ACCESS_KEY_ID/SECRET; подставим из S3_* при отсутствии.
    export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-$(env_val S3_ACCESS_KEY_ID)}"
    export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-$(env_val S3_SECRET_ACCESS_KEY)}"
    log "Выгружаю в s3://$BACKUP_S3_BUCKET/$PREFIX/"
    aws s3 cp "$OUT" "s3://$BACKUP_S3_BUCKET/$PREFIX/$(basename "$OUT")" \
      ${ENDPOINT:+--endpoint-url "$ENDPOINT"} \
      || warn "off-site выгрузка не удалась (локальная копия сохранена)."
  else
    warn "BACKUP_S3_BUCKET задан, но aws cli не найден — off-site выгрузка пропущена."
  fi
fi

log "Backup завершён."
