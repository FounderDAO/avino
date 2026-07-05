#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Avino — авторасчёт лимитов ресурсов под размер хоста (PG-first).
#
# Детектит RAM и vCPU сервера и печатает `export VAR=...` в STDOUT — чтобы
# deploy.sh мог сделать:  source <(deploy/compute-limits.sh)
# и docker compose подхватил значения в ${VAR:-default}. Человекочитаемая
# сводка идёт в STDERR (видна в логах деплоя, но не попадает в eval).
#
# Идея распределения: приоритет — PostgreSQL. Быстрая БД = горячая выборка в
# RAM. Поэтому сначала отдаём память Postgres (shared_buffers ~25% +
# effective_cache_size ~65% как подсказка планировщику про OS page cache), а
# Node-сервисам (mem_limit) — доли поверх, с гарантированным резервом на ОС.
# «Раздуть Node и задушить БД» формула не может.
#
# ⚠ shared-vCPU: на облачных VPS `nproc` показывает больше, чем реально доступно
#   под нагрузкой — поэтому CPU-потолки консервативны (сумма < nproc).
#
# Переопределение вручную: если переменная уже задана в окружении, скрипт её НЕ
# трогает (export перед деплоем имеет приоритет над авторасчётом).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

detect_ram_gb() {
  if [[ -r /proc/meminfo ]]; then
    local kb; kb=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
    echo $(( (kb + 512 * 1024) / (1024 * 1024) ))            # kB → GB, округление
  elif command -v sysctl >/dev/null && sysctl -n hw.memsize >/dev/null 2>&1; then
    local b; b=$(sysctl -n hw.memsize)                        # macOS (локальный тест)
    echo $(( (b + 512 * 1024 * 1024) / (1024 * 1024 * 1024) ))
  else
    echo 0
  fi
}

detect_cpu() {
  if command -v nproc >/dev/null; then nproc
  elif command -v sysctl >/dev/null && sysctl -n hw.ncpu >/dev/null 2>&1; then sysctl -n hw.ncpu
  else echo 1; fi
}

clamp() { local v=$1 lo=$2 hi=$3; (( v < lo )) && v=$lo; (( v > hi )) && v=$hi; echo "$v"; }
pct()   { echo $(( ($1 * $2 + 50) / 100 )); }                 # round($1 * $2%)

RAM=$(detect_ram_gb)
CPU=$(detect_cpu)

if (( RAM <= 0 )); then
  echo "⚠ compute-limits: не удалось определить RAM хоста — оставляю дефолты compose (расчёт на 24 GB)." >&2
  exit 0                                                      # ничего не печатаем → работают ${VAR:-default}
fi

# Внутренние переменные — lowercase, чтобы не коллидировать с UPPERCASE-именами
# экспортируемых env-переменных (emit через ${!name} проверяет ровно их).
# ── PostgreSQL (приоритет) ───────────────────────────────────────────────────
pg_shared=$(clamp "$(pct "$RAM" 25)" 1 16)                    # реально выделяется; выше 16 GB — диминишинг
pg_effective=$(pct "$RAM" 65)                                 # подсказка планировщику (не выделение)
pg_maint=512; (( RAM >= 48 )) && pg_maint=1024

# ── Node-потолки (mem_limit = cap против OOM) ─────────────────────────────────
client_mem=$(clamp "$(pct "$RAM" 18)" 2 10)                   # публичный SSR-портал — самый прожорливый
api_mem=$(clamp "$(pct "$RAM" 8)" 2 4)
web_mem=768m; (( RAM >= 48 )) && web_mem=1g

cpu_hi=$(( CPU > 1 ? CPU - 1 : 1 ))
client_cpus=$(clamp "$(pct "$CPU" 40)" 2 "$cpu_hi")
api_cpus=$(clamp "$(pct "$CPU" 25)" 2 "$cpu_hi")
web_cpus=$(clamp "$(pct "$CPU" 15)" 1 2)

# ── Вывод (export → STDOUT; уже заданные в env не трогаем) ────────────────────
emit() {
  local name=$1 value=$2
  if [[ -n "${!name:-}" ]]; then
    printf '# %s уже задан в окружении (%s) — не переопределяю\n' "$name" "${!name}" >&2
  else
    printf 'export %s=%s\n' "$name" "$value"
  fi
}

emit PG_SHARED_BUFFERS       "${pg_shared}GB"
emit PG_EFFECTIVE_CACHE      "${pg_effective}GB"
emit PG_MAINTENANCE_WORK_MEM "${pg_maint}MB"
emit CLIENT_MEM_LIMIT        "${client_mem}g"
emit API_MEM_LIMIT           "${api_mem}g"
emit WEB_MEM_LIMIT           "${web_mem}"
emit CLIENT_CPUS             "${client_cpus}.0"
emit API_CPUS                "${api_cpus}.0"
emit WEB_CPUS                "${web_cpus}.0"

# ── Сводка в STDERR ──────────────────────────────────────────────────────────
{
  printf '\033[1;34m▸ Авторасчёт ресурсов: хост %s GB RAM / %s vCPU\033[0m\n' "$RAM" "$CPU"
  printf '  PostgreSQL : shared_buffers=%sGB, effective_cache_size=%sGB, maintenance_work_mem=%sMB\n' \
    "$pg_shared" "$pg_effective" "$pg_maint"
  printf '  client     : mem=%sg  cpus=%s.0\n' "$client_mem" "$client_cpus"
  printf '  api        : mem=%sg  cpus=%s.0\n' "$api_mem" "$api_cpus"
  printf '  web        : mem=%s cpus=%s.0\n' "$web_mem" "$web_cpus"
  printf '  postgres/redis/caddy — без mem_limit (БД свободно бёрстит на гео-запросах)\n'
} >&2
