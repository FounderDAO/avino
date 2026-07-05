#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Avino — установка Docker Engine + Compose plugin (официальный apt-репозиторий).
#
# Проверено на Ubuntu 24.04 (noble); codename берётся из /etc/os-release, поэтому
# работает и на 22.04 (jammy) и др. Ставит свежий Docker Engine + плагин Compose
# v2 (нужен ≥ 2.24 для тега `!reset` в docker-compose.prod.yml).
#
# Запуск на сервере:
#   sudo bash deploy/install-docker.sh
#   # или под root:  bash deploy/install-docker.sh
#
# Идемпотентно: повторный запуск безопасен (apt не переустанавливает имеющееся,
# репозиторий/ключ перезаписываются теми же значениями).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# root → без sudo; иначе через sudo (проверяем, что sudo доступен).
if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  command -v sudo >/dev/null || { echo "Нужны root-права или установленный sudo." >&2; exit 1; }
  SUDO="sudo"
fi

log() { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }

# 1. Снести возможные старые/конфликтующие пакеты (не падать, если их нет).
log "Удаляю конфликтующие пакеты (если есть)"
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
  $SUDO apt-get remove -y "$pkg" 2>/dev/null || true
done

# 2. Зависимости + GPG-ключ Docker.
log "Ставлю зависимости и GPG-ключ Docker"
$SUDO apt-get update
$SUDO apt-get install -y ca-certificates curl
$SUDO install -m 0755 -d /etc/apt/keyrings
$SUDO curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
$SUDO chmod a+r /etc/apt/keyrings/docker.asc

# 3. Подключить apt-репозиторий Docker (codename определяется автоматически).
log "Подключаю apt-репозиторий Docker"
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | \
  $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null
$SUDO apt-get update

# 4. Установить Engine + CLI + containerd + buildx + Compose-плагин.
log "Устанавливаю Docker Engine + Compose plugin"
$SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 5. Включить и запустить демон.
log "Включаю и запускаю docker"
$SUDO systemctl enable --now docker

# 5b. Ротация логов контейнеров (json-file, 20m × 5 файлов) — без неё логи растут
#     неограниченно и забивают диск. Пишем daemon.json только если файла нет;
#     существующий с log-driver не трогаем (не затирать чужие настройки).
#     Применяется к контейнерам, созданным ПОСЛЕ рестарта демона; уже запущенные
#     нужно пересоздать (следующий деплой это делает).
if [[ ! -f /etc/docker/daemon.json ]]; then
  log "Настраиваю ротацию docker-логов (/etc/docker/daemon.json)"
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "20m", "max-file": "5" }\n}\n' | $SUDO tee /etc/docker/daemon.json > /dev/null
  $SUDO systemctl restart docker
elif ! grep -q '"log-driver"' /etc/docker/daemon.json; then
  echo "⚠ /etc/docker/daemon.json уже существует, но не задаёт log-driver — добавьте ротацию логов вручную (max-size/max-file)." >&2
else
  log "Ротация docker-логов уже настроена — пропускаю"
fi

# 6. (опционально) запускать docker без sudo — добавить юзера в группу docker.
#    Нужен ПЕРЕЛОГин (или `newgrp docker`), чтобы группа применилась.
TARGET_USER="${SUDO_USER:-$USER}"
if [[ -n "$SUDO" && "$TARGET_USER" != "root" ]]; then
  log "Добавляю $TARGET_USER в группу docker (нужен перелогин/newgrp docker)"
  $SUDO usermod -aG docker "$TARGET_USER" || true
fi

# 7. Проверка.
log "Версии:"
docker --version
docker compose version   # ожидается >= 2.24
log "Готово. Дымовой тест: ${SUDO:+$SUDO }docker run --rm hello-world"
log "Опционально для прода (firewall + SSH): ${SUDO:+$SUDO }bash deploy/harden-server.sh"
