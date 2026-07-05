#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Avino — базовый hardening прод-сервера: firewall (ufw) + SSH (password-auth).
#
# Запускать ВРУЧНУЮ на сервере ПОСЛЕ install-docker.sh и после того, как для
# входа настроен SSH-ключ:
#   sudo bash deploy/harden-server.sh
#   # или под root:  bash deploy/harden-server.sh
#
# Идемпотентно: повторный запуск безопасен (правила ufw переприменяются,
# drop-in sshd перезаписывается тем же содержимым).
#
# ⚠ Анти-локаут: отключение парольного входа выполняется ТОЛЬКО если найден
#   хотя бы один SSH-ключ в authorized_keys. Иначе шаг пропускается с warning —
#   чтобы не отрезать себе доступ к VPS.
#
# ⚠ Docker в обход ufw: docker публикует порты, вписывая собственные правила в
#   iptables ДО цепочек ufw. Поэтому на сервере нельзя поднимать базовый
#   docker-compose.yml без прод-overlay — только `-f docker-compose.yml
#   -f docker-compose.prod.yml` (в overlay `ports: !reset` закрывает периметр,
#   наружу смотрит только Caddy 80/443). ufw здесь НЕ подстрахует.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  command -v sudo >/dev/null || { echo "Нужны root-права или установленный sudo." >&2; exit 1; }
  SUDO="sudo"
fi

log() { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*" >&2; }

# ── 1. Firewall (ufw) ────────────────────────────────────────────────────────
# Порядок важен: сначала РАЗРЕШАЕМ 22/80/443, только потом deny incoming и
# enable — иначе `ufw enable` оборвёт текущую SSH-сессию.
if ! command -v ufw >/dev/null; then
  log "Ставлю ufw"
  $SUDO apt-get update
  $SUDO apt-get install -y ufw
fi

log "Разрешаю входящие 22/80/443 (SSH + Caddy HTTP/HTTPS)"
$SUDO ufw allow 22/tcp
$SUDO ufw allow 80/tcp
$SUDO ufw allow 443/tcp

log "Политики по умолчанию: deny incoming / allow outgoing"
$SUDO ufw default deny incoming
$SUDO ufw default allow outgoing

log "Включаю ufw"
$SUDO ufw --force enable
$SUDO ufw status verbose

# ── 2. SSH hardening (guarded) ───────────────────────────────────────────────
# Отключаем парольный вход только при наличии SSH-ключа, чтобы не залочиться.
has_ssh_key() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  # хотя бы одна непустая строка, не являющаяся комментарием
  $SUDO grep -qE '^[[:space:]]*[^#[:space:]]' "$f" 2>/dev/null
}

TARGET_USER="${SUDO_USER:-$USER}"
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"

KEY_FOUND=0
if [[ -n "$TARGET_HOME" ]] && has_ssh_key "$TARGET_HOME/.ssh/authorized_keys"; then
  KEY_FOUND=1
  log "SSH-ключ найден: $TARGET_USER"
fi
if has_ssh_key "/root/.ssh/authorized_keys"; then
  KEY_FOUND=1
  log "SSH-ключ найден: root"
fi

if [[ "$KEY_FOUND" -eq 0 ]]; then
  warn "SSH-ключей в authorized_keys не найдено — пропускаю отключение парольного входа."
  warn "Иначе вы рискуете потерять доступ к серверу. Заведите ключ (ssh-copy-id),"
  warn "проверьте вход по ключу и запустите скрипт повторно."
else
  DROPIN=/etc/ssh/sshd_config.d/99-avino-hardening.conf
  log "Отключаю парольный вход через drop-in $DROPIN"
  printf '%s\n' \
    '# Avino server hardening (deploy/harden-server.sh) — управляется скриптом.' \
    '# Откат: удалить этот файл и `systemctl reload ssh`.' \
    'PasswordAuthentication no' \
    'PermitRootLogin prohibit-password' \
    'KbdInteractiveAuthentication no' \
    | $SUDO tee "$DROPIN" > /dev/null

  log "Проверяю конфиг sshd (sshd -t)"
  if $SUDO sshd -t; then
    $SUDO systemctl reload ssh
    log "sshd перезагружен — парольный вход отключён."
  else
    warn "sshd -t сообщил об ошибке — удаляю drop-in, sshd НЕ трогаю."
    $SUDO rm -f "$DROPIN"
    exit 1
  fi
fi

log "Готово. Проверьте, что новый SSH-вход по ключу работает, ПРЕЖДЕ чем закрывать текущую сессию."
