# ADR-0127 — Ротация docker-логов и healthchecks web/client

## Status

Accepted

## Date

2026-07-05

## Context

DevOps-аудит (DevOps.md, 2026-07-05) выявил два P0-пробела инфраструктуры:

1. Ни в одном compose-файле и ни в одном серверном runbook'е не настроена
   ротация docker-логов. Дефолтный драйвер `json-file` пишет stdout всех
   сервисов без ограничения размера — на VPS со временем это гарантированно
   забивает диск (риск «слепого прода» из аудита).
2. Сервисы `web` и `client` не имели healthcheck ни в Dockerfile, ни в compose
   (у `api`, `postgres`, `redis` healthchecks были). Повисший Next.js-процесс
   оставался «работающим» для Docker и внешних наблюдателей.

## Decision

1. **Ротация логов — двумя слоями:**
   - `docker-compose.prod.yml` получает YAML-anchor `x-logging` (`json-file`,
     `max-size: 20m`, `max-file: 5`), который вешается на все сервисы overlay
     (postgres, redis, migrate, api, web, client, caddy). Staging наследует
     prod-overlay, поэтому покрыт автоматически. Dev-окружения не трогаем.
   - `deploy/install-docker.sh` дополнен идемпотентным шагом: если
     `/etc/docker/daemon.json` отсутствует — записывает его с той же ротацией и
     рестартует демон; существующий файл с `log-driver` не перезаписывается.
2. **Healthchecks web/client** добавлены в базовый `docker-compose.yml` по
   образцу api: `node -e "fetch(...)"` на корень приложения (3000/3001),
   `interval: 30s`, `start_period: 20s` на прогрев Next.js.

## Consequences

Positive:
- Диск VPS защищён от переполнения логами (максимум ~100 MB на сервис).
- Повисшие web/client видны как `unhealthy` в `docker ps` и могут
  использоваться внешним мониторингом/оркестрацией.
- Ротация работает даже на серверах, где `daemon.json` никогда не настраивался.

Negative / trade-offs:
- Логи старше 5×20 MB на сервис теряются — до внедрения централизованного
  сбора (Loki/ELK, P2-бэклог аудита) это осознанный компромисс.
- `daemon.json` применяется только к контейнерам, созданным после рестарта
  демона; действующие контейнеры подхватят настройку при ближайшем пересоздании
  (следующий деплой).
- Healthcheck web/client дёргает SSR-рендер корня раз в 30 секунд —
  пренебрежимая нагрузка.

## Related files

- docker-compose.yml
- docker-compose.prod.yml
- deploy/install-docker.sh

## Related task

- TASK-229
