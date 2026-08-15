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

# ── Telegram-уведомления о деплое (best-effort) ──────────────────────────────
# Токен/чат берём из .env (TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID). Если их
# нет или Telegram недоступен — тихо пропускаем: уведомление не должно ронять
# деплой. Без parse_mode — спецсимволы в коммите не ломают отправку.
env_val() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }

tg_notify() {
  local token chat
  token="$(env_val TELEGRAM_BOT_TOKEN)"
  chat="$(env_val TELEGRAM_ADMIN_CHAT_ID)"
  [[ -n "$token" && -n "$chat" ]] || return 0
  curl -fsS --max-time 10 "https://api.telegram.org/bot${token}/sendMessage" \
    -d chat_id="$chat" --data-urlencode "text=$1" >/dev/null 2>&1 || true
}

# Fail-уведомление через EXIT-trap: ловит и die (exit 1), и любой сбой под
# set -e. Шлём только если старт уже анонсировали (иначе pre-flight-ошибки .env,
# когда токена ещё нет, не порождают «FAILED» без «начался»).
DEPLOY_START_SENT=0
on_exit() {
  local rc=$?
  if [[ $rc -ne 0 && $DEPLOY_START_SENT -eq 1 ]]; then
    tg_notify "❌ Avino: деплой FAILED (rc=$rc) — host $(hostname)"
  fi
  exit $rc
}
trap on_exit EXIT

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

# .env валиден — анонсируем старт (с этого момента активен fail-trap).
DEPLOY_START_SENT=1
tg_notify "🚀 Avino: деплой начался — host $(hostname), ref ${REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')}"

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

# ── 4.5 Сид юр-документов (идемпотентно, best-effort) ─────────────────────────
# legal_documents должны существовать как v1 PUBLISHED, иначе /admin/legal пуст,
# а API /legal/* отдаёт 404 (публичные страницы живут на вшитом фолбэке). Сид
# сам пропускает kind, если строка уже есть → реально заливает лишь на пустой
# БД. Не критичен для аптайма → на его сбое деплой не роняем.
log "Сид юр-документов (legal_documents)"
deploy/legalSeed.sh \
  || printf '\033[1;33m⚠ seed-legal: пропущен/ошибка — проверь /admin/legal вручную\033[0m\n'

# ── 4.7 Ограничение кэша сборки ──────────────────────────────────────────────
# BuildKit убирает кэш сам, но дефолтный потолок считается от размера диска: на
# проде это ~326 ГиБ, а уборка включается лишь когда свободного останется меньше
# ~82 ГиБ. К этому моменту кэш уже занимал 85 ГБ против 5.6 ГБ полезного
# содержимого (образы + тома) — то есть защита срабатывает слишком поздно.
#
# Через prune, а не через builder.gc в /etc/docker/daemon.json: секция builder
# не поддерживает live-reload, а Live Restore выключен — применение требовало бы
# рестарта демона, то есть простоя контейнеров при каждом деплое.
#
# Место выбрано после health-check намеренно: провалившийся деплой сохраняет кэш
# целиком (быстрый откат), а слои только что собранных образов чистку переживают
# — срезается лишь старое. Кэш растёт только при сборке, а сборка бывает только
# здесь, поэтому очистка сразу после неё и работает как настоящий предел.
#
# best-effort: сбой очистки не должен ронять уже успешный деплой.
# ADR-0159.
log "Ограничиваю кэш сборки до ${BUILD_CACHE_MAX_SPACE:-20GB}"
docker builder prune --force --max-used-space "${BUILD_CACHE_MAX_SPACE:-20GB}" \
  || printf '\033[1;33m⚠ очистка кэша сборки не удалась — деплой не затронут\033[0m\n'

# ── 5. Итог ──────────────────────────────────────────────────────────────────
log "Готово. Текущий статус:"
"${COMPOSE[@]}" ps
echo
log "Открыто наружу (через Caddy): https://$(grep -E '^DOMAIN_CLIENT=' .env | cut -d= -f2-) | https://$(grep -E '^DOMAIN_ADMIN=' .env | cut -d= -f2-) | https://$(grep -E '^DOMAIN_API=' .env | cut -d= -f2-)"

tg_notify "✅ Avino: деплой успешно завершён — host $(hostname), $(git rev-parse --short HEAD 2>/dev/null || echo '?') $(git log -1 --pretty=%s 2>/dev/null || true)"
