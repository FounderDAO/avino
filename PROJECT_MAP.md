# avino — карта проекта

> Сверено со структурой файлов 15 сентября 2026 года. Runtime и внешние сервисы этой картой не проверялись.

## Назначение и границы

Репозиторий `avino` содержит 9931 доступных файлов. Ниже перечислены фактические точки входа и конфигурация, найденные в рабочей копии. Текущий статус следует из кода; README, планы и ADR описывают намерения и требуют отдельной проверки.

## Быстрый обзор

| Что искать | Где начать |
|---|---|
| Конфигурация или запуск | [README.md](README.md) |
| Конфигурация или запуск | [package.json](package.json) |
| Конфигурация или запуск | [docker-compose.yml](docker-compose.yml) |
| Конфигурация или запуск | [CLAUDE.md](CLAUDE.md) |
| Конфигурация или запуск | [deploy/README.md](deploy/README.md) |
| Конфигурация или запуск | [docs/README.md](docs/README.md) |
| Конфигурация или запуск | [docs/CLAUDE.md](docs/CLAUDE.md) |
| Конфигурация или запуск | [.claude/worktrees/feat+regions-client/README.md](.claude/worktrees/feat+regions-client/README.md) |
| Конфигурация или запуск | [.claude/worktrees/feat+regions-client/package.json](.claude/worktrees/feat+regions-client/package.json) |
| Конфигурация или запуск | [.claude/worktrees/feat+regions-client/docker-compose.yml](.claude/worktrees/feat+regions-client/docker-compose.yml) |
| Конфигурация или запуск | [.claude/worktrees/feat+regions-client/CLAUDE.md](.claude/worktrees/feat+regions-client/CLAUDE.md) |
| Конфигурация или запуск | [.claude/worktrees/price-history-api/README.md](.claude/worktrees/price-history-api/README.md) |

## Фактическая структура

| Путь | Роль |
|---|---|
| [docker-compose.staging.yml](docker-compose.staging.yml) | сборка или оркестрация контейнера |
| [README.md](README.md) | описание проекта и команды (не доказательство runtime-состояния) |
| [package.json](package.json) | манифест зависимостей и скриптов |
| [docker-compose.yml](docker-compose.yml) | сборка или оркестрация контейнера |
| [docker-compose.prod.yml](docker-compose.prod.yml) | сборка или оркестрация контейнера |
| [CLAUDE.md](CLAUDE.md) | локальные правила работы агентов |
| [pnpm-workspace.yaml](pnpm-workspace.yaml) | исходник или конфигурация; уточнить ответственность по содержимому |
| [deploy/README.md](deploy/README.md) | описание проекта и команды (не доказательство runtime-состояния) |
| [docs/GUIDE_TRANSLATE_MAIN.md](docs/GUIDE_TRANSLATE_MAIN.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/AvinoWebPlan.md](docs/AvinoWebPlan.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/GUIDE_SMS.md](docs/GUIDE_SMS.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/GUIDE_S3.md](docs/GUIDE_S3.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/PRD.md](docs/PRD.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/API.md](docs/API.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/ICLOUD_SETUP.md](docs/ICLOUD_SETUP.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/GUIDE_YANDEX_MAPS_PROD_SETUP.md](docs/GUIDE_YANDEX_MAPS_PROD_SETUP.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/GUIDE_YANDEX_SMTP_SETUP.md](docs/GUIDE_YANDEX_SMTP_SETUP.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/SERVER_TO_PROD.md](docs/SERVER_TO_PROD.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/EXAMPLE.md](docs/EXAMPLE.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/mortgage-calculator-web-spec.md](docs/mortgage-calculator-web-spec.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/ANSWERS_MOBILE_BACKEND.md](docs/ANSWERS_MOBILE_BACKEND.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/GUIDE_GOOGLE_AUTH_SETUP.md](docs/GUIDE_GOOGLE_AUTH_SETUP.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/PriceFilter.md](docs/PriceFilter.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/CHECKLIST_FIREBASE_PROD_ROLLOUT.md](docs/CHECKLIST_FIREBASE_PROD_ROLLOUT.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/api-documentation.md](docs/api-documentation.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/PROD.md](docs/PROD.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/SERVER_TO_DEPLOY.md](docs/SERVER_TO_DEPLOY.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/DONE.md](docs/DONE.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/GUIDE_RESEND_SMTP.md](docs/GUIDE_RESEND_SMTP.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/README.md](docs/README.md) | описание проекта и команды (не доказательство runtime-состояния) |
| [docs/ENV.md](docs/ENV.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/TASKS.md](docs/TASKS.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/LOG.md](docs/LOG.md) | исходник или конфигурация; уточнить ответственность по содержимому |
| [docs/ROADMAP.md](docs/ROADMAP.md) | исходник или конфигурация; уточнить ответственность по содержимому |

## Где менять и как проверять

1. Сначала найдите фактический entrypoint в манифесте или Dockerfile и проследите импорты до нужного модуля.
2. Для изменения поведения обновляйте ближайшие тесты; не считайте исторические отчёты доказательством текущего состояния.
3. Команды запуска и проверки берите только из манифестов, Makefile и CI; неизвестные команды здесь не придумываются.

## Ограничения и обслуживание

- Секреты, локальные окружения, зависимости и сгенерированные каталоги исключены из обзора.
- Карта намеренно не утверждает, что приложение запускается: для этого нужен отдельный runtime-check.
- Обновляйте карту при изменении entrypoint, манифестов, каталогов, схем или CI.

## Graphify

AST-граф Graphify 0.9.61: 6590 узлов и 16439 связей. Граф хранится локально в staging и не копируется в репозиторий. Для обновления: `graphify extract . --code-only --no-cluster --out /private/tmp/graphify-project-maps-20260915/avino`.
