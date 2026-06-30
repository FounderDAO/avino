#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Avino — пере-сев КАТАЛОГА на ТЕСТ-СТЕНДЕ (staging): purge → seed-all.
#
# Обёртка над двумя скриптами, чтобы не копировать docker compose-команды руками:
#   1) apps/api/prisma/purge-listings.cjs — сносит ВЕСЬ каталог (listings + каскад:
#      переводы, медиа, промо, модерация, избранное, чаты, жалобы, туры).
#      НЕ трогает пользователей, app_settings, РЕГИОНЫ/РАЙОНЫ, сохранённые поиски.
#   2) apps/api/prisma/seed-all.cjs — наполняет каталог по всем 14 регионам со
#      всеми полями Фазы 2 (bathrooms/parking/lotArea/amenities), фото грузятся в R2.
#
# Регионы/районы создаются МИГРАЦИЯМИ и здесь НЕ пересоздаются — seed-all от них
# зависит. Если таблица regions пуста, сначала прогоните ./deploy/deploy-staging.sh
# (он накатывает миграции сервисом `migrate`).
#
# Запуск на сервере из корня репозитория:
#   ./deploy/reseed-staging.sh                 # dry-run purge → спросит → purge → seed (4/20)
#   ./deploy/reseed-staging.sh -y              # без интерактивного подтверждения
#   ./deploy/reseed-staging.sh --purge-r2      # дополнительно снести файлы фото в R2
#   ./deploy/reseed-staging.sh --per-region 6 --tashkent 30
#   ./deploy/reseed-staging.sh --skip-purge    # только seed (каталог уже пуст)
#   ./deploy/reseed-staging.sh --dry-run       # только показать, что удалится, и выйти
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Корень репозитория = родитель каталога этого скрипта.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Канонический стек стенда — те же overlay'и, что в deploy/deploy-staging.sh.
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml --profile app)

PER_REGION=4
TASHKENT=20
PURGE_R2=0
ASSUME_YES=0
SKIP_PURGE=0
DRY_RUN_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --per-region) PER_REGION="${2:?--per-region требует число}"; shift 2 ;;
    --tashkent)   TASHKENT="${2:?--tashkent требует число}"; shift 2 ;;
    --purge-r2)   PURGE_R2=1; shift ;;
    -y|--yes)     ASSUME_YES=1; shift ;;
    --skip-purge) SKIP_PURGE=1; shift ;;
    --dry-run)    DRY_RUN_ONLY=1; shift ;;
    -h|--help)    grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. Предусловия ───────────────────────────────────────────────────────────
[[ -f .env ]] || die ".env не найден в $REPO_ROOT. Это точно корень репо на стенде?"

status="$("${COMPOSE[@]}" ps api --format '{{.State}}' 2>/dev/null || true)"
[[ "$status" == "running" ]] || die "Контейнер api не запущен (state: '${status:-нет}'). Сначала: ./deploy/deploy-staging.sh"

# ── 2. Dry-run очистки (всегда показываем, что уйдёт) ─────────────────────────
if [[ $SKIP_PURGE -eq 0 ]]; then
  log "Dry-run очистки каталога (ничего не удаляю):"
  "${COMPOSE[@]}" exec -T api node < apps/api/prisma/purge-listings.cjs

  if [[ $DRY_RUN_ONLY -eq 1 ]]; then
    log "--dry-run: остановился после предпросмотра."
    exit 0
  fi

  # ── 3. Подтверждение ───────────────────────────────────────────────────────
  if [[ $ASSUME_YES -eq 0 ]]; then
    extra=""
    [[ $PURGE_R2 -eq 1 ]] && extra=" + файлы фото в R2"
    printf '\033[1;33mУдалить ВЕСЬ каталог%s и засеять заново? [y/N] \033[0m' "$extra"
    read -r answer
    [[ "$answer" =~ ^[yYдД]$ ]] || die "Отменено пользователем."
  fi

  # ── 4. Реальная очистка ──────────────────────────────────────────────────--
  log "Чищу каталог${PURGE_R2:+ (+R2)}…"
  purge_env=(-e CONFIRM_PURGE=yes)
  [[ $PURGE_R2 -eq 1 ]] && purge_env+=(-e PURGE_R2=yes)
  "${COMPOSE[@]}" exec -T "${purge_env[@]}" api node < apps/api/prisma/purge-listings.cjs
else
  warn "--skip-purge: очистку пропускаю, только сею."
fi

# ── 5. Seed-all ──────────────────────────────────────────────────────────────
log "Сею каталог: per_region=$PER_REGION, tashkent=$TASHKENT (фото → R2, нужен интернет)…"
"${COMPOSE[@]}" exec -T \
  -e "SEED_PER_REGION=$PER_REGION" -e "SEED_TASHKENT=$TASHKENT" \
  api node < apps/api/prisma/seed-all.cjs

# ── 6. Итог ──────────────────────────────────────────────────────────────────
log "Готово. Проверь публичный портал:"
echo "    https://$(grep -E '^DOMAIN_CLIENT=' .env | tail -1 | cut -d= -f2-)/search"
echo "    (карточки по разным регионам, фото из R2, гистограмма цен, Zillow-фильтры)"
