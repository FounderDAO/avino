# GUIDE_TRANSLATE_MAIN — перевод объявлений (Yandex/Google Translate)

Runbook: где взять ключ перевода, куда положить, как проверить. Чтобы не искать
данные заново. Связано: ADR-0091 (перевод под контролем модератора), ADR-0024/005/012.

> ⚠️ **Секреты не коммитим.** Сам API-ключ хранится только в gitignored корневом
> `.env` (и в консоли провайдера). В этом файле — только не-секретные id и шаги.

---

## 1. Что нужно приложению (3 переменные)

Бэкенд (`apps/api`) читает РОВНО эти имена (см. `apps/api/src/config/configuration.ts` → `translateConfig`):

| Переменная | Назначение | Пример / значение |
|---|---|---|
| `TRANSLATE_PROVIDER` | `yandex` (дефолт) или `google` | `yandex` |
| `TRANSLATE_API_KEY` | секрет API-ключа провайдера | `<секрет, ~40 символов>` |
| `TRANSLATE_FOLDER_ID` | **только для Yandex** — id папки сервисного аккаунта | `b1gcih32jec1oi73o80d` |

> ❌ Имена `YANDEX_TRANSLATE_*` код **НЕ читает**. Если в `.env` есть такой блок —
> это «мёртвые» переменные (см. §6 cleanup).

---

## 2. Где взять (Yandex Cloud — основной провайдер)

Эндпоинт в коде захардкожен: `https://translate.api.cloud.yandex.net` — это
**российская** инсталляция Yandex Cloud.

### Шаги (≈5 минут)
1. Зайти в **российскую** консоль: **`https://console.yandex.cloud`**
   ⚠️ **НЕ** `kz.console.yandex.cloud` (казахстанская инсталляция — там сервиса
   Translate нет вообще, см. §5).
2. **Привязать платёжный аккаунт** (без него Translate отвечает ошибкой). Обычно
   есть пробный грант — объёмы у нас копеечные.
3. Папка (folder) → **Сервисные аккаунты** → **Создать сервисный аккаунт**
   (у нас он называется `avino`).
4. Назначить ему роль **`ai.translate.user`** (на эту папку).
5. У сервисного аккаунта → **Создать новый ключ → API-ключ**
   (именно **API-ключ**, *не* «авторизованный ключ» и *не* «статический ключ
   доступа»). Scope при запросе — **Translate** (`yc.ai.translate.execute`).
   **Скопировать секрет сразу — он показывается один раз.**
6. **`TRANSLATE_FOLDER_ID`** = id **той папки, где лежит сервисный аккаунт**
   (из URL: `console.yandex.cloud/folders/<ВОТ_ЭТОТ_ID>/...`).
   ⚠️ Это НЕ обязательно та папка, что открыта в браузере. Если id не совпадает,
   Yandex вернёт `400` и **подскажет правильный id прямо в тексте ошибки**:
   `does not match with service account folder ID 'b1g...'` → берём этот.

### Текущие рабочие (dev) значения — для справки
- Folder id: **`b1gcih32jec1oi73o80d`**
- Сервисный аккаунт `avino`, ключ id `aje9g5etnds5fp66kp1f` (это id ключа, **не** секрет)
- Scope: `yc.ai.translate.execute`
- Сам секрет: в gitignored корневом `.env` (строка `TRANSLATE_API_KEY=`). Потерян —
  создать новый API-ключ в том же сервисном аккаунте, старый отозвать.

---

## 3. Куда положить

### Локально (dev)
1. Открыть **корневой `.env`** (gitignored, в репозиторий не уезжает) и заполнить:
   ```dotenv
   TRANSLATE_PROVIDER=yandex
   TRANSLATE_API_KEY=<секрет API-ключа>
   TRANSLATE_FOLDER_ID=b1gcih32jec1oi73o80d
   ```
2. `api` получает `.env` целиком через `env_file` в `docker-compose.yml` (без
   allowlist) — менять compose не нужно. **Пересоздать контейнер**, чтобы он
   перечитал env (образ пересобирать НЕ нужно — env читается при старте):
   ```bash
   docker compose --profile app up -d --force-recreate --no-deps api
   ```

### Прод
Те же 3 переменные задать в deploy-env сервера / `docker-compose.prod.yml`
(или в секретах CI/CD). Без них провайдер мягко деградирует (см. §5).

---

## 4. Проверка, что работает

### A. Быстрая проба провайдера (изнутри контейнера, секрет в вывод не идёт)
```bash
docker exec avino-api node -e '
const key=process.env.TRANSLATE_API_KEY, folder=process.env.TRANSLATE_FOLDER_ID;
fetch("https://translate.api.cloud.yandex.net/translate/v2/translate",{
  method:"POST",
  headers:{"Content-Type":"application/json","Authorization":"Api-Key "+key},
  body:JSON.stringify({sourceLanguageCode:"ru",targetLanguageCode:"en",
    texts:["Светлая 2-комнатная квартира"], ...(folder?{folderId:folder}:{})})
}).then(async r=>console.log(r.status, await r.text()));
'
```
Ожидаем `200` + `{"translations":[{"text":"Bright 2-room apartment"}]}`.
`400 does not match with service account folder ID` → поправить `TRANSLATE_FOLDER_ID`.
`401/403` → ключ из другой инсталляции/неверный.

### B. Реальный путь модератора (как в проде, ADR-0091)
1. Логин админа (`admin@avino.uz`) по OTP — dev-код печатается в логах:
   `docker logs avino-api | grep "Ваш код для входа"`.
2. На NEW-листинге: `APPROVE` без переводов → **422** (гейт).
3. `POST /api/v1/admin/listings/:id/translations/generate` → **200** + EN/UZ.
4. `APPROVE` → **200 ACTIVE**.
В UI админки (`apps/web`): страница `/admin/listings/:id` → панель «Переводы» →
кнопка «Сгенерировать переводы».

---

## 5. Гочи (всё, на чём спотыкались)

- **KZ ≠ RU.** `kz.console.yandex.cloud` (казахстанская инсталляция) **не имеет**
  Translate (в `https://api.yandexcloud.kz/endpoints` из AI только `ai-stt-v3`).
  Нужна российская `console.yandex.cloud`. KZ и RU — разные облака с разной
  авторизацией; ключ из KZ на RU-эндпоинте не работает. Создавать всё заново в RU.
- **Folder = папка сервис-аккаунта**, не любая из URL (см. §2.6).
- **Имена env**: только `TRANSLATE_*`, не `YANDEX_TRANSLATE_*`.
- **Нет ключа → мягкая деградация**: провайдер возвращает исходный текст КАК ЕСТЬ
  (копия, не перевод), пайплайн зелёный. На проде ключ обязателен, иначе «другие
  языки» = копия оригинала (`apps/api/src/translations/providers/yandex.provider.ts`).
- **Контейнер не видит новый ключ** до `--force-recreate` (env читается при старте).

---

## 6. Альтернатива: Google Cloud Translation

Если Yandex неудобен (напр. RU-биллинг из UZ):
1. `console.cloud.google.com` → проект → привязать биллинг → включить
   **Cloud Translation API**.
2. APIs & Services → Credentials → **Create credentials → API key** → скопировать.
3. В `.env`: `TRANSLATE_PROVIDER=google`, `TRANSLATE_API_KEY=<ключ>`.
   `TRANSLATE_FOLDER_ID` **не нужен** (только Yandex).
Код провайдера уже есть (`apps/api/src/translations/providers/google.provider.ts`),
менять ничего не надо.

---

## 7. Cleanup .env (одноразово)

В dev-`.env` остался лишний блок, который код игнорирует — удалить во избежание
путаницы (правильные значения уже в строках `TRANSLATE_*`):
```dotenv
# УДАЛИТЬ — код это не читает:
YANDEX_TRANSLATE_ENABLED=...
YANDEX_TRANSLATE_ID=...
YANDEX_TRANSLATE_SECRET_KEY=...
YANDEX_TRANSLATE_FOLDER_ID=...   # тут вообще неверный folder (bpfmv...)
YANDEX_TRANSLATE_API_KEY=...
```

---

## 8. Как фича это использует (кратко)

Перевод — шаг **модерации** (ADR-0091): модератор на странице карточки жмёт
«Сгенерировать переводы» (синхронно Yandex), правит руками при необходимости, и
опубликовать (`APPROVE`) можно только когда переводы есть на все языки (UZ/RU/EN).
Старая авто-очередь `translation_queue` удалена. Подробности —
`docs/adr/ADR-0091-moderator-translation-review.md`.
