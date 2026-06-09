# Avino — инструкции проекта

## GitHub-авторизация

Для любых операций с GitHub (push, PR, gh) **используй токен из `~/.gh_token`**.
Если `gh auth status` показывает «not logged in» — авторизуйся токеном:

```bash
gh auth login --with-token < ~/.gh_token
gh auth setup-git   # чтобы git брал креды у gh по HTTPS
```

- Значение токена **никогда не печатать** в вывод/логи (читать только редиректом из файла).
- `origin` использует HTTPS (`https://github.com/FounderDAO/avino.git`); креды отдаёт gh.

## Прочее

- Источник правды дизайна — `apps/claudeDesign/`; редизайн на моках: `apps/client`
  (публичный портал) + `apps/web` (админка).
- `apps/*_old`, `apps/claudeDesign`, `apps/design_handoff_avino` — только на диске,
  в GitHub не пушим (см. `.gitignore`).
