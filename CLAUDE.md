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

## Прочее

- Источник правды дизайна — `apps/claudeDesign/`; редизайн на моках: `apps/client`
  (публичный портал) + `apps/web` (админка).
- `apps/*_old`, `apps/claudeDesign`, `apps/design_handoff_avino` — только на диске,
  в GitHub не пушим (см. `.gitignore`).
