# Sign in with Apple (вход по Apple ID / iCloud) — настройка

Как получить **Service ID** в Apple Developer и куда положить значения, чтобы
заработал вход через Apple на портале (`apps/client` + `apps/api`).

> Реализация: `POST /api/v1/auth/apple` верифицирует Apple ID-token **офлайн**
> (ADR-0097). Поэтому **приватный ключ Apple (.p8), Key ID и Team ID НЕ нужны** —
> их требует только серверный обмен `code`→токены, которого у нас нет. Достаточно
> **Service ID + домен + return URL**.

---

## 0. Предусловие

- Платное членство **Apple Developer Program** (~99 USD/год):
  https://developer.apple.com/programs/
- Домен портала на **HTTPS** (Apple не работает с `http://localhost`).

---

## 1. Создать App ID (один раз)

Sign in with Apple для веба требует «родительский» App ID, к которому привязывается
Service ID.

1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles**.
2. **Identifiers** → **+** → **App IDs** → **App** → Continue.
3. Заполнить:
   - **Description**: `Avino`
   - **Bundle ID**: Explicit, reverse-domain, напр. `uz.avino.app`
4. В списке **Capabilities** включить **Sign in with Apple** → Continue → Register.

---

## 2. Создать Service ID (это и есть `APPLE_CLIENT_ID`)

1. **Identifiers** → **+** → **Services IDs** → Continue.
2. Заполнить:
   - **Description**: `Avino Web`
   - **Identifier**: reverse-domain, напр. **`uz.avino.web`**
     ← это значение пойдёт в `APPLE_CLIENT_ID` и `NEXT_PUBLIC_APPLE_CLIENT_ID`.
3. Register.
4. Открыть созданный Service ID → включить галочку **Sign in with Apple** →
   **Configure**:
   - **Primary App ID**: выбрать App ID из шага 1 (`uz.avino.app`).
   - **Domains and Subdomains**: домен(ы) портала БЕЗ схемы, напр. `avino.uz`.
   - **Return URLs**: полный **HTTPS**-URL, напр.
     `https://avino.uz/auth/apple/callback`
     ← должен **точно** совпадать с `NEXT_PUBLIC_APPLE_REDIRECT_URI`
     (схема + хост + путь). Путь любой на проверенном домене.
   - Save → Continue → Save.

### 2.1 Подтвердить домен

Apple даст файл **`apple-developer-domain-association.txt`** (кнопка Download в
секции Domains). Разместить его так, чтобы он открывался по адресу:

```
https://<домен>/.well-known/apple-developer-domain-association.txt
```

Затем нажать **Verify** рядом с доменом в Apple-портале. Без верификации
popup-вход выдаёт `invalid_client`.

> Это статический файл. На портале достаточно отдавать его как статику из
> `.well-known/` (через reverse-proxy/Nginx или публичную папку фронта).

---

## 3. Куда положить значения (env)

Получив Service ID (`uz.avino.web`) и согласовав return URL, заполни переменные.

### Backend — `apps/api`

| Переменная | Значение | Зачем |
|---|---|---|
| `APPLE_CLIENT_ID` | `uz.avino.web` | Допустимые audience (`aud`) при верификации ID-token. Можно CSV: `uz.avino.web,uz.avino.app` (если позже появится нативное iOS-приложение). Пусто → `/auth/apple` отдаёт `503 AUTH_PROVIDER_UNAVAILABLE` |

Читается в рантайме (`configuration.ts` → `apple.clientIds`). После изменения —
**перезапустить** api-контейнер (rebuild не нужен, но образ должен содержать код
из PR #199).

### Frontend — `apps/client`

| Переменная | Значение | Зачем |
|---|---|---|
| `NEXT_PUBLIC_APPLE_CLIENT_ID` | `uz.avino.web` | Тот же Service ID, отдаётся в браузер для Apple JS SDK. Пусто → кнопка Apple скрыта |
| `NEXT_PUBLIC_APPLE_REDIRECT_URI` | `https://avino.uz/auth/apple/callback` | Должен точно совпадать с Return URL из шага 2 |

> ⚠️ **Next.js**: `NEXT_PUBLIC_*` вшиваются на этапе **сборки**. После их задания
> нужно **пересобрать** клиентский образ (`docker compose build client`), иначе
> кнопка не появится даже с верными значениями.

### Куда физически писать

- **Прод**: в deploy-env (например `.env` рядом с `docker-compose.yml` /
  секреты оркестратора). См. также `docs/ENV.md`.
- **Локально**: `apps/client/.env.local` (для `NEXT_PUBLIC_*`) и api-env
  (`APPLE_CLIENT_ID`). Файлы `.env*` в `.gitignore` — секреты в репозиторий не
  коммитим.

Пример (прод `.env`):

```dotenv
# Sign in with Apple
APPLE_CLIENT_ID=uz.avino.web
NEXT_PUBLIC_APPLE_CLIENT_ID=uz.avino.web
NEXT_PUBLIC_APPLE_REDIRECT_URI=https://avino.uz/auth/apple/callback
```

---

## 4. Проверка

1. Задать три переменные, пересобрать client, перезапустить api/client.
2. Открыть портал на HTTPS-домене → шапка **«Войти»** → в модалке появилась
   чёрная кнопка **«Войти через Apple»**.
3. Клик → popup Apple → вход по Apple ID → возвращается `id_token` → клиент шлёт
   `POST /api/v1/auth/apple` → сессия (access/refresh), модалка закрывается.

### Диагностика

| Симптом | Причина |
|---|---|
| Кнопки Apple нет | Не задан `NEXT_PUBLIC_APPLE_CLIENT_ID`/`NEXT_PUBLIC_APPLE_REDIRECT_URI` **или** client не пересобран после задания env |
| `503 AUTH_PROVIDER_UNAVAILABLE` от `/auth/apple` | Не задан `APPLE_CLIENT_ID` на api (или образ api без кода PR #199) |
| Popup `invalid_client` / ошибка домена | Service ID/домен/return URL не совпадают, или домен не верифицирован (шаг 2.1) |
| `401` от `/auth/apple` | `aud` токена ≠ `APPLE_CLIENT_ID`, либо `email_verified` ≠ true |

---

## 5. Заметки

- **Имя**: Apple отдаёт имя пользователя только при **первой** авторизации
  (клиент пробрасывает `first_name`/`last_name`); при повторных входах их нет — это
  нормально.
- **«Hide My Email»**: Apple может вернуть приватный relay-email
  (`...@privaterelay.appleid.com`) — он верифицирован и стабилен, привязка по нему
  работает. Trade-off: тот же человек через Gmail и через Apple-relay = два разных
  аккаунта (см. ADR-0097).
- **Локальная отладка без прода**: Apple требует HTTPS-домен из конфигурации
  Service ID — на `localhost` popup не сработает. Используй staging-домен или
  HTTPS-туннель, зарегистрированный как Return URL. Кнопка при этом **видна**
  локально (для визуальной проверки), но реальный вход проходит только на
  настроенном домене.
- **Multi-audience / будущее iOS-приложение**: `APPLE_CLIENT_ID` принимает список
  через запятую — добавь bundle ID нативного приложения без правок кода.

---

## Связанное

- ADR: `docs/adr/ADR-0097-sign-in-with-apple.md`
- API: `docs/API.md` → `POST /api/v1/auth/apple`
- Env: `docs/ENV.md` → `APPLE_CLIENT_ID`, `NEXT_PUBLIC_APPLE_*`
