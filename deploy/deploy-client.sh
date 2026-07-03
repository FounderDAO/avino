#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Avino — пересборка ТОЛЬКО публичного портала (client) на staging/prod VPS.
#
# Когда нужно: изменения затронули лишь apps/client — незачем гонять весь стек
# (api/web/postgres/redis). Скрипт подтягивает код, пересобирает образ client и
# перезапускает ТОЛЬКО его (--no-deps), не трогая остальные сервисы.
#
# Не зависит от gh/GitHub CLI — только git + docker compose.
#
# Запуск на сервере из любого каталога (скрипт сам перейдёт в корень репо):
#   ./deploy/deploy-client.sh                 # git pull main + rebuild client
#   ./deploy/deploy-client.sh --no-pull       # без git pull (текущее дерево)
#   ./deploy/deploy-client.sh --ref my-branch # выкатить конкретный тег/ветку/коммит
#
# Что делает:
#   1) (опц.) git fetch + переключение/pull до нужного ref;
#   2) проверяет .env и переменные, из которых client печёт NEXT_PUBLIC_* бандл;
#   3) docker compose build client + up -d --no-deps client;
#   4) печатает статус контейнера client.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Корень репозитория = родитель каталога этого скрипта.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Тот же набор overlay-файлов и профиль, что и в deploy-staging.sh —
# чтобы build-args образа client совпадали со staging-сборкой.
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml --profile app)

DO_PULL=1
REF=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull) DO_PULL=0; shift ;;
    --ref)     REF="${2:?--ref требует значение}"; shift 2 ;;
    -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. .env и переменные, влияющие на сборку client ──────────────────────────
[[ -f .env ]] || die ".env не найден. Скопируйте .env.example → .env и заполните (см. deploy/prod.env.example)."

# client печёт NEXT_PUBLIC_API_BASE_URL из DOMAIN_API и NEXT_PUBLIC_SITE_URL из DOMAIN_CLIENT.
REQUIRED=(DOMAIN_API DOMAIN_CLIENT)
missing=()
for var in "${REQUIRED[@]}"; do
  val="$(grep -E "^${var}=" .env | tail -1 | cut -d= -f2- || true)"
  [[ -n "$val" && "$val" != "__CHANGE_ME__" ]] || missing+=("$var")
done
[[ ${#missing[@]} -eq 0 ]] || die "В .env не заданы обязательные переменные: ${missing[*]}"

# ── 2. Обновление кода ───────────────────────────────────────────────────────
if [[ $DO_PULL -eq 1 ]]; then
  log "Обновляю код из origin${REF:+ (ref: $REF)}"
  git fetch --prune origin
  if [[ -n "$REF" ]]; then
    git checkout "$REF"
    git pull --ff-only origin "$REF" 2>/dev/null || true
  else
    git pull --ff-only
  fi
fi

# ── 3. Пересборка и перезапуск ТОЛЬКО client ─────────────────────────────────
log "Пересобираю образ client (NEXT_PUBLIC_* печётся на этапе сборки)"
"${COMPOSE[@]}" build client

log "Перезапускаю только client (--no-deps, остальные сервисы не трогаю)"
"${COMPOSE[@]}" up -d --no-deps client

# ── 4. Итог ──────────────────────────────────────────────────────────────────
log "Готово. Статус client:"
"${COMPOSE[@]}" ps client
echo
log "Проверьте: https://$(grep -E '^DOMAIN_CLIENT=' .env | cut -d= -f2-)"
