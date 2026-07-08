#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Avino — очистка удалённых веток, чьи PR смержены > N дней назад.
#
# Репозиторий определяется автоматически (`gh repo view`). gh должен быть
# авторизован (см. CLAUDE.md → токен из ~/.gh_token).
#
# Запуск из любого каталога:
#   ./deploy/branch_cleanup.sh --dry-run     # план без удаления (+ отчёт)
#   ./deploy/branch_cleanup.sh               # план + интерактивное подтверждение
#   ./deploy/branch_cleanup.sh --yes         # удалить без подтверждения (unattended/CI)
#   ./deploy/branch_cleanup.sh --days 45     # порог "старости" merged PR (def: 30)
#   ./deploy/branch_cleanup.sh --limit 400   # сколько merged PR забирать из gh (def: 200)
#   ./deploy/branch_cleanup.sh -h            # справка
#
# Защитные правила (НИКОГДА не трогаем):
#   - точные имена: main, master, develop
#   - префиксы:     release/, hotfix/, archive/
#   - ветка имеет ОТКРЫТЫЙ PR (включая draft)
#   - PR смержен менее --days дней назад
# Защита main здесь не про branch protection — удаляются только смерженные
# feature-ветки; сам main в список кандидатов попасть не может.
#
# Переменные окружения (переопределяют дефолты):
#   LOG_DIR   каталог для отчёта (def: docs/ops)
#
# Отчёт: <LOG_DIR>/branch_cleanup_<YYYY-MM-DD>.md
#
# Расписание (еженедельно, только отчёт — без удаления) — crontab на сервере:
#   0 9 * * 1 /path/to/avino/deploy/branch_cleanup.sh --dry-run >> /var/log/avino-branch-cleanup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Корень репозитория = родитель каталога этого скрипта.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log()  { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

DRY_RUN=0
ASSUME_YES=0
DAYS_AGO=30
LIMIT=200
LOG_DIR="${LOG_DIR:-docs/ops}"

usage() {
  cat <<'EOF'
Usage: deploy/branch_cleanup.sh [--dry-run] [--yes] [--days N] [--limit N]

  --dry-run      Не удалять — только показать план и записать отчёт.
  --yes          Удалить без интерактивного подтверждения (для unattended/CI).
  --days N       Порог "старости" merged PR в днях (default: 30).
  --limit N      Сколько merged PR забирать из gh (default: 200).
  -h, --help     Показать эту помощь.

Env:
  LOG_DIR        Куда писать отчёт (default: docs/ops).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --yes)     ASSUME_YES=1; shift ;;
    --days)    DAYS_AGO="$2"; shift 2 ;;
    --limit)   LIMIT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)         warn "Unknown arg: $1"; usage >&2; exit 2 ;;
  esac
done

command -v gh  >/dev/null || die "gh CLI не установлен"
command -v jq  >/dev/null || die "jq не установлен"
command -v git >/dev/null || die "git не установлен"

PROTECTED_EXACT=(main master develop)
PROTECTED_PREFIXES=(release/ hotfix/ archive/)

# Печатает причину защиты в stdout и rc=0, если ветка защищена.
is_protected() {
  local b="$1" p
  for p in "${PROTECTED_EXACT[@]}"; do
    if [[ "$b" == "$p" ]]; then echo "exact($p)"; return 0; fi
  done
  for p in "${PROTECTED_PREFIXES[@]}"; do
    if [[ "$b" == "${p}"* ]]; then echo "prefix($p)"; return 0; fi
  done
  return 1
}

# Портируемая дата (BSD/GNU) — cutoff в UTC.
if date -u -v-1d '+%Y-%m-%d' >/dev/null 2>&1; then
  CUTOFF=$(date -u -v-"${DAYS_AGO}"d '+%Y-%m-%dT%H:%M:%SZ')
else
  CUTOFF=$(date -u -d "${DAYS_AGO} days ago" '+%Y-%m-%dT%H:%M:%SZ')
fi
TODAY=$(date -u '+%Y-%m-%d')

REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')

log "Repo:    $REPO"
log "Cutoff:  $CUTOFF  (merged PR строго старше = кандидаты)"
log "Mode:    $([[ $DRY_RUN -eq 1 ]] && echo dry-run || echo live)"
echo

merged_json=$(gh pr list --state merged --limit "$LIMIT" --json headRefName,mergedAt,number,title)
open_branches=$(gh pr list --state open --limit "$LIMIT" --json headRefName --jq '.[].headRefName' | sort -u || true)
remote_refs=$(git ls-remote --heads origin | awk '{print $2}' | sed 's|refs/heads/||' | sort -u)

TO_DELETE=()  # branch\tmergedAt\tprNum\ttitle
SKIPPED=()    # branch\treason

while IFS=$'\t' read -r branch merged_at pr_num pr_title; do
  [[ -z "${branch:-}" ]] && continue

  if ! grep -qx -- "$branch" <<<"$remote_refs"; then
    SKIPPED+=("${branch}"$'\t'"уже удалена из remote (PR #${pr_num})")
    continue
  fi

  if reason=$(is_protected "$branch"); then
    SKIPPED+=("${branch}"$'\t'"защищена: ${reason}")
    continue
  fi

  if [[ -n "$open_branches" ]] && grep -qx -- "$branch" <<<"$open_branches"; then
    SKIPPED+=("${branch}"$'\t'"есть открытый PR (incl. draft)")
    continue
  fi

  if [[ "$merged_at" < "$CUTOFF" ]]; then
    TO_DELETE+=("${branch}"$'\t'"${merged_at}"$'\t'"#${pr_num}"$'\t'"${pr_title}")
  else
    SKIPPED+=("${branch}"$'\t'"смержена ${merged_at} — в пределах ${DAYS_AGO} дней")
  fi
done < <(echo "$merged_json" | jq -r '.[] | [.headRefName, .mergedAt, (.number|tostring), .title] | @tsv')

n_delete=${#TO_DELETE[@]}
n_skip=${#SKIPPED[@]}

echo "Кандидаты на удаление (${n_delete}):"
if [[ $n_delete -eq 0 ]]; then
  echo "  (нет)"
else
  for row in "${TO_DELETE[@]}"; do
    IFS=$'\t' read -r b m p t <<<"$row"
    printf "  %-50s  %s  %s  %s\n" "$b" "$m" "$p" "$t"
  done
fi
echo

echo "Пропущено (${n_skip}):"
if [[ $n_skip -gt 0 ]]; then
  for row in "${SKIPPED[@]}"; do
    IFS=$'\t' read -r b r <<<"$row"
    printf "  %-50s  %s\n" "$b" "$r"
  done
fi
echo

mkdir -p "$LOG_DIR"
REPORT="${LOG_DIR}/branch_cleanup_${TODAY}.md"
{
  echo "# Branch cleanup report — ${TODAY}"
  echo
  echo "**Repo:** \`${REPO}\`  "
  echo "**Cutoff:** \`${CUTOFF}\` (merged PR строго старше = кандидаты)  "
  echo "**Days threshold:** ${DAYS_AGO}  "
  echo "**Mode:** $([[ $DRY_RUN -eq 1 ]] && echo dry-run || echo live)  "
  echo
  echo "## Кандидаты (${n_delete})"
  echo
  if [[ $n_delete -eq 0 ]]; then
    echo "_(нет)_"
  else
    echo "| Branch | Merged at | PR | Title |"
    echo "|---|---|---|---|"
    for row in "${TO_DELETE[@]}"; do
      IFS=$'\t' read -r b m p t <<<"$row"
      t_esc=${t//|/\\|}   # экранируем pipe в title для markdown-таблицы
      echo "| \`${b}\` | ${m} | ${p} | ${t_esc} |"
    done
  fi
  echo
  echo "## Пропущено (${n_skip})"
  echo
  if [[ $n_skip -eq 0 ]]; then
    echo "_(нет)_"
  else
    echo "| Branch | Reason |"
    echo "|---|---|"
    for row in "${SKIPPED[@]}"; do
      IFS=$'\t' read -r b r <<<"$row"
      echo "| \`${b}\` | ${r} |"
    done
  fi
} > "$REPORT"

log "Отчёт: $REPORT"

if [[ $DRY_RUN -eq 1 ]]; then
  log "DRY-RUN — ничего не удалено."
  exit 0
fi

if [[ $n_delete -eq 0 ]]; then
  log "Удалять нечего."
  exit 0
fi

if [[ $ASSUME_YES -ne 1 ]]; then
  if [[ ! -t 0 ]]; then
    die "Нет TTY и не передан --yes. Отказ от удаления в unattended-режиме."
  fi
  echo
  read -r -p "Удалить ${n_delete} веток выше? Напишите 'yes' для подтверждения: " ans
  [[ "$ans" == "yes" ]] || die "Отменено."
fi

deleted=0
failed=0
for row in "${TO_DELETE[@]}"; do
  IFS=$'\t' read -r b _m _p _t <<<"$row"
  if gh api -X DELETE "repos/${REPO}/git/refs/heads/${b}" --silent 2>/dev/null; then
    log "удалена: $b"
    deleted=$((deleted+1))
  else
    warn "ОШИБКА:  $b"
    failed=$((failed+1))
  fi
done

echo
log "Готово: удалено=${deleted} ошибок=${failed}"
[[ $failed -eq 0 ]]
