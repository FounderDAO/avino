#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Avino — прод-деплой на одном VPS (docker-compose + Caddy/TLS).
#
# Запуск на сервере из корня репозитория:
#   ./deploy/deploy.sh                 # git pull + сборка + up + health-check
#   ./deploy/deploy.sh --no-pull       # без git pull (деплой текущего дерева)
#   ./deploy/deploy.sh --ref v1.2.3    # выкатить конкретный тег/ветку/коммит
#
# Что делает:
#   1) (опц.) подтягивает код из origin до указанного ref;
#   2) проверяет наличие .env и обязательных переменных;
#   3) docker compose ... up -d --build (миграции прогоняет сервис `migrate`);
#   4) ждёт, пока api станет healthy, и печатает статус.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Корень репозитория = родитель каталога этого скрипта.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app)

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

# ── 1. .env и обязательные переменные ────────────────────────────────────────
[[ -f .env ]] || die ".env не найден. Скопируйте .env.example → .env и заполните (см. deploy/prod.env.example)."

REQUIRED=(DOMAIN_API DOMAIN_ADMIN DOMAIN_CLIENT ACME_EMAIL POSTGRES_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET)
missing=()
for var in "${REQUIRED[@]}"; do
  # Берём значение из .env (строка вида VAR=...), игнорируя комментарии.
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

# ── 2.5 Авторасчёт лимитов ресурсов под размер хоста (PG-first) ───────────────
# compute-limits.sh печатает `export VAR=...` (лимиты Node + PG-тюнинг) в stdout
# и сводку в stderr. Экспортированные переменные наследует `docker compose up`
# и подставляет в ${VAR:-default}. Если скрипта нет — работают дефолты compose.
if [[ -x deploy/compute-limits.sh ]]; then
  source <(deploy/compute-limits.sh)
fi

# ── 3. Сборка и запуск ───────────────────────────────────────────────────────
log "Собираю образы и поднимаю стек"
"${COMPOSE[@]}" up -d --build --remove-orphans

# ── 4. Ожидание готовности API ───────────────────────────────────────────────
log "Жду, пока api станет healthy"
for i in $(seq 1 30); do
  status="$("${COMPOSE[@]}" ps api --format '{{.Health}}' 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    log "api healthy"
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    "${COMPOSE[@]}" logs --tail=40 api migrate || true
    die "api не стал healthy за ~5 минут. Логи выше."
  fi
  sleep 10
done

# ── 5. Итог ──────────────────────────────────────────────────────────────────
log "Готово. Текущий статус:"
"${COMPOSE[@]}" ps
echo
log "Открыто наружу (через Caddy): https://$(grep -E '^DOMAIN_CLIENT=' .env | cut -d= -f2-) | https://$(grep -E '^DOMAIN_ADMIN=' .env | cut -d= -f2-) | https://$(grep -E '^DOMAIN_API=' .env | cut -d= -f2-)"
