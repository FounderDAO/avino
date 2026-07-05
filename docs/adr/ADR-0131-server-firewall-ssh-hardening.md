# ADR-0131 — Firewall (ufw) и SSH hardening прод-сервера

## Status

Accepted

## Date

2026-07-05

## Context

DevOps-аудит (DevOps.md, 2026-07-05, пункт #12) отметил, что периметр
прод-сервера не закрыт на уровне ОС:

- firewall (ufw) и SSH-hardening не входят ни в `install-docker.sh`, ни в
  серверные runbook'и — `deploy/README.md` лишь упоминает «открытые порты
  22/80/443», но не описывает, как их закрыть и отключить парольный вход;
- парольный SSH-вход остаётся включённым по умолчанию (вектор брутфорса);
- отдельная гоча: **docker публикует порты в обход ufw** — вписывает свои
  правила в iptables до цепочек ufw, поэтому `deny incoming` не защитит порты,
  опубликованные контейнером.

Прямой риск: если на сервере поднять базовый `docker-compose.yml` без
прод-overlay (в котором `ports: !reset` снимает публикацию), то
`postgres/redis/api/web/client` окажутся открыты в интернет, и ufw их не спасёт.

## Decision

1. **Отдельный opt-in скрипт `deploy/harden-server.sh`** (не вызывается из
   `install-docker.sh` автоматически — чтобы не отключить парольный вход
   неожиданно и не залочить оператора). Идемпотентный, стиль/преамбула как в
   `install-docker.sh` (`set -euo pipefail`, детект SUDO, `log`/`warn`).
   - **ufw**: ставит пакет при отсутствии; `allow 22/80/443/tcp` →
     `default deny incoming` / `allow outgoing` → `ufw --force enable`. Порядок
     важен: сначала разрешаем порты, только потом enable — иначе оборвётся
     текущая SSH-сессия.
   - **sshd (guarded, анти-локаут)**: отключение парольного входа выполняется
     **только если** в `authorized_keys` вызвавшего пользователя или root найден
     хотя бы один ключ; иначе шаг пропускается с предупреждением. Настройки
     пишутся в drop-in `/etc/ssh/sshd_config.d/99-avino-hardening.conf`
     (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`,
     `KbdInteractiveAuthentication no`), конфиг валидируется `sshd -t` перед
     `systemctl reload ssh`; при ошибке валидации drop-in удаляется, sshd не
     трогается.
2. **`deploy/install-docker.sh`** — в конце печатает подсказку о запуске
   `harden-server.sh` (без автозапуска).
3. **`deploy/README.md`** — раздел «Firewall и SSH hardening» с командами и
   **явной документацией гочи** про обход ufw docker-публикацией и правилом
   «на сервере всегда поднимать стек только с прод-overlay».

## Consequences

Positive:
- Периметр сервера закрывается одной командой; наружу остаются только SSH и
  Caddy (80/443).
- Парольный SSH-брутфорс отключается — при условии, что вход по ключу уже
  работает.
- Анти-локаут гард и `sshd -t` перед reload исключают потерю доступа к VPS.
- Гоча «docker в обход ufw» задокументирована явно, а не подразумевается.

Negative / trade-offs:
- Скрипт не запускается автоматически — оператор должен вызвать его осознанно
  (сознательный компромисс ради безопасности от локаута).
- Состояние самого VPS (ufw, sshd) из репозитория не видно — фактическое
  применение требует ручного прогона на сервере и проверки входа по ключу.
- ufw не является защитой для опубликованных docker-портов; безопасность здесь
  держится на дисциплине «только прод-overlay» (задокументировано, не
  форсируется технически).

## Related files

- deploy/harden-server.sh
- deploy/install-docker.sh
- deploy/README.md

## Related task

- DevOps-аудит #12 (Firewall/SSH runbook)
