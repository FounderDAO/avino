# Avino — инструкции проекта

## GitHub-авторизация

GitHub-операции (push, PR, gh) идут **по HTTPS**; креды отдаёт `gh`
(`credential.helper = gh auth git-credential`). **Токен-файл `~/.gh_token`
больше не используем.**

Если `gh auth status` показывает «not logged in» или невалидный токен —
авторизуйся интерактивно (device-flow в браузере):

```bash
gh auth login -h github.com -w
gh auth setup-git   # чтобы git брал креды у gh по HTTPS
```

- `origin` использует HTTPS (`https://github.com/FounderDAO/avino.git`); креды отдаёт gh.

## Доступ к prod-серверу (SSH)

Прод — Hetzner AX42, `api.avino.uz` → `157.180.96.205`. Вход по ключу
`~/.ssh/avino_prod.pem` (парольный вход отключён hardening'ом).

```bash
ssh -i ~/.ssh/avino_prod.pem root@157.180.96.205
# логи API (OTP/SMS):
ssh -i ~/.ssh/avino_prod.pem root@157.180.96.205 \
  'cd /opt/avino && docker compose logs api | grep -iE "eskiz|otp|sms" | tail'
```

`.env` прода лежит на сервере как `/opt/avino/.env`.

## Прочее

- Источник правды дизайна — `apps/claudeDesign/`; редизайн на моках: `apps/client`
  (публичный портал) + `apps/web` (админка).
- `apps/*_old`, `apps/claudeDesign`, `apps/design_handoff_avino` — только на диске,
  в GitHub не пушим (см. `.gitignore`).
