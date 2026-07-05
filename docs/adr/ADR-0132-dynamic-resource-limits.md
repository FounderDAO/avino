# ADR-0132 — Авторасчёт лимитов ресурсов под размер хоста (PG-first)

## Status

Accepted

## Date

2026-07-05

## Context

В #340 (ADR отсутствовал, DevOps-аудит #10) на Node-сервисы прод-overlay'я
навесили статические `mem_limit`/`cpus`: api 1g/2, web 768m/1, client 2g/2.
Значения брались «на глаз» — на тот момент документа сайзинга не было.

Сверка с бюджетом памяти для 24 GB-бокса показала, что лимиты **занижены** и
несогласованы:

- `client` (публичный SSR-портал, самый нагруженный и памяти-ёмкий) — 2 GB при
  ориентире 3–4 GB. `mem_limit` — жёсткий cap: под живым трафиком Next.js уходит
  за 2 GB → **OOM-kill контейнера** и рестарты (502 у пользователей).
- `api` — 1 GB при ориентире 1.5–2 GB.
- PostgreSQL работал на дефолтном `shared_buffers` (~128 MB): горячая выборка
  (объявления, гео-индексы) читалась с диска вместо RAM.

Прод-сервер будет ≥ 24 GB / 8 vCPU (возможно больше). Статические числа под один
размер придётся править руками при смене бокса, а «отдать Node максимум» — прямой
путь задушить БД, которая под нагрузкой и есть узкое место.

## Decision

**Динамический авторасчёт под фактические RAM/vCPU хоста, с приоритетом БД.**

1. **`deploy/compute-limits.sh`** — детектит RAM (`/proc/meminfo`, fallback
   `sysctl` для macOS) и vCPU (`nproc`), печатает `export VAR=...` в stdout
   (сводку — в stderr). Формула:

   | Параметр | Правило |
   |----------|---------|
   | `shared_buffers` | 25% RAM, потолок 16 GB (реальное выделение) |
   | `effective_cache_size` | 65% RAM (подсказка планировщику про OS page cache) |
   | `maintenance_work_mem` | 512 MB, 1 GB при RAM ≥ 48 |
   | client `mem_limit` | 18% RAM, диапазон 2–10 GB |
   | api `mem_limit` | 8% RAM, диапазон 2–4 GB |
   | web `mem_limit` | 768 MB, 1 GB при RAM ≥ 48 |
   | client/api/web `cpus` | 40% / 25% / 15% vCPU (потолок `nproc-1`; консервативно из-за shared-vCPU) |

   Ориентиры на типовых боксах:

   | RAM | shared_buffers | eff_cache | client | api | web |
   |-----|----------------|-----------|--------|-----|-----|
   | 16 GB | 4 GB | 10 GB | 3g | 2g | 768m |
   | 24 GB | 6 GB | 16 GB | 4g | 2g | 768m |
   | 32 GB | 8 GB | 21 GB | 6g | 3g | 768m |
   | 48 GB | 12 GB | 31 GB | 9g | 4g | 1g |
   | 64 GB | 16 GB | 42 GB | 10g | 4g | 1g |

   Node-доли всегда оставляют БД её память + резерв ОС → «раздуть Node и задушить
   PG» формула не может.

2. **`docker-compose.prod.yml`** — лимиты параметризованы через
   `${CLIENT_MEM_LIMIT:-4g}` и т.п.; `postgres` получает
   `command: postgres -c shared_buffers=${PG_SHARED_BUFFERS:-6GB} -c
   effective_cache_size=${PG_EFFECTIVE_CACHE:-16GB} -c
   maintenance_work_mem=${PG_MAINTENANCE_WORK_MEM:-512MB}`. Дефолты в `${VAR:-...}`
   рассчитаны на 24 GB / 8 vCPU — стек едет разумно и без запуска скрипта.

3. **`deploy/deploy.sh`** — перед `up` делает `source <(deploy/compute-limits.sh)`;
   экспортированные переменные наследует `docker compose` и подставляет в overlay.

4. **Ручное переопределение**: если переменная уже задана в окружении/`.env`,
   `compute-limits.sh` её не трогает (env > авторасчёт). Шаблон — в
   `prod.env.example` (закомментированный блок).

## Consequences

Positive:
- Лимиты и PG-тюнинг масштабируются под любой бокс без правки compose.
- `client` больше не зажат в 2 GB → нет OOM-рестартов под трафиком.
- PostgreSQL держит горячую выборку в RAM → быстрые гео-запросы (главная цель).
- Значения печатаются в лог деплоя (прозрачно, не «магия»).
- Дефолты сохраняют работоспособность при ручном `up` и на staging.

Negative / trade-offs:
- staging и prod разного размера получат разные лимиты (осознанно; воспроизводимость
  при необходимости — через явные значения в `.env`).
- `nproc` на shared-vCPU завышает реально доступный CPU — потому CPU-потолки взяты
  консервативно, но всё же приблизительны.
- `shared_buffers` 25% — компромисс для **смешанного** бокса (PG + 3 Node): выше
  процент рискует вытеснить OS page cache и Node; при выделенном под БД сервере
  его можно поднять вручную через env.

## Related files

- deploy/compute-limits.sh
- docker-compose.prod.yml
- deploy/deploy.sh
- deploy/prod.env.example
- deploy/README.md

## Related task

- DevOps-аудит #10 (лимиты ресурсов) — пересмотр значений + динамический расчёт
