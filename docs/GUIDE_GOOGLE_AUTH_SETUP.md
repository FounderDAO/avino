# GUIDE — Подключение Google Sign-In

Как и где получить креды для входа через Google на публичном портале Avino
(`apps/client`) и где их прописать. Это runbook для деплоя — код уже написан и
зашит под флаг, фича включается **только** наличием Client ID.

---

## 0. Что именно нужно (TL;DR)

Avino использует **Google Identity Services (GIS)** — официальную кнопку
«Sign in with Google» с верификацией по **ID-token**. Это важно, потому что
определяет, что́ нужно получить:

| Нужно | Не нужно |
|-------|----------|
| **OAuth 2.0 Client ID** (тип «Web application») | ❌ Client **Secret** |
| Список **Authorized JavaScript origins** | ❌ Authorized redirect URIs |
| OAuth consent screen (минимальный) | ❌ Верификация приложения в Google |

**Почему без секрета.** Бэкенд верифицирует токен офлайн через
`google-auth-library` (`OAuth2Client.verifyIdToken`, проверка подписи / `aud` /
`iss` / `exp`). Секрет в этом потоке не участвует. Google при создании Web-клиента
всё равно выдаст и Secret — его просто игнорируем.

**Один и тот же Client ID** прописывается в двух местах:

- бэкенд `apps/api` → `GOOGLE_CLIENT_ID`
- фронтенд `apps/client` → `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Бэкенд использует его как `audience` при проверке токена. Если значения на фронте
и бэке **разойдутся → 401** на каждом входе.

Формат Client ID: `1234567890-abcdef....apps.googleusercontent.com`.

> 📱 **Если есть мобильные приложения (Android / iOS)** — одного Web-клиента
> мало: для нативных приложений Google требует **отдельные** OAuth Client ID
> (Android — по package + SHA-1, iOS — по bundle ID), а бэкенд должен принимать
> **несколько** audience. Это отдельный раздел — см. **§5**. Если мобилок пока
> нет, разделы 1–4 самодостаточны для веб-портала.

---

## 1. Создать проект в Google Cloud Console

1. Зайти на <https://console.cloud.google.com/> под рабочим Google-аккаунтом.
2. Вверху — селектор проектов → **New Project**.
   - Name: `Avino` (любое).
   - Organization / Location — по своему аккаунту, можно «No organization».
3. **Create**, дождаться создания, выбрать проект в селекторе.

> Биллинг подключать **не нужно** — Sign-In с дефолтными скоупами бесплатен.

---

## 2. Настроить OAuth consent screen

Меню: **APIs & Services → OAuth consent screen** (новый UI: **Google Auth
Platform → Branding / Audience**).

1. **User Type / Audience: External** → Create.
2. **App information**:
   - App name: `Avino` (это имя увидит пользователь в окне согласия).
   - User support email: рабочий email (напр. `support@avino.uz`).
   - App logo — опционально.
3. **Authorized domains**: добавить корневой домен прода — `avino.uz`.
4. **Developer contact information**: email команды.
5. **Scopes**: ничего добавлять не нужно. GIS-вход запрашивает только
   `openid`, `email`, `profile` — это **несенситивные** скоупы, отдельное
   подтверждение Google не требуется.
6. Сохранить.

### Publishing status — обязательно «In production»

В разделе **Audience / Publishing status**:

- Пока приложение в статусе **Testing**, войти смогут **только** добавленные
  «Test users» (до 100 шт.) — для прод-портала это не годится.
- Жмём **Publish app → Confirm**. Статус станет **In production**.
- Поскольку скоупы несенситивные, **проверка/ревью Google не требуется** —
  публикация мгновенная, баннер «verification required» не появляется.

---

## 3. Создать OAuth 2.0 Client ID (тип Web application)

Меню: **APIs & Services → Credentials → Create Credentials → OAuth client ID**.

1. **Application type: Web application**.
2. **Name**: `Avino Web` (внутреннее, пользователь не видит).
3. **Authorized JavaScript origins** — здесь главное. Это домены, где
   рендерится кнопка GIS. Добавить **каждое** окружение:

   | Окружение | Origin |
   |-----------|--------|
   | Локальная разработка | `http://localhost:3001` |
   | Staging | `https://staging.avino.uz` *(реальный домен стенда)* |
   | Production | `https://avino.uz` |
   | Production (www) | `https://www.avino.uz` *(если www используется)* |

   Правила для origin (частые ошибки):
   - только **схема + хост + порт**, **без** пути и **без** завершающего `/`;
   - продакшн/стейдж — обязательно **`https://`**;
   - **нельзя голый IP** (`http://75.119.159.168` Google не примет) — стенду
     нужен реальный DNS-домен (см. TODO по A-записям стенда);
   - `localhost` можно по `http`, порт обязателен → `http://localhost:3001`
     (клиент Avino поднимается на `3001`).

4. **Authorized redirect URIs** — **оставить пустым**. Поток GIS отдаёт
   `credential` (ID-token) через popup/postMessage в callback, redirect не
   используется.
5. **Create**.
6. В модалке скопировать **Client ID** (`...apps.googleusercontent.com`).
   **Client Secret игнорируем.**

> Origins/редиректы можно править у уже созданного клиента в любой момент;
> изменения подхватываются за несколько минут (иногда до ~1 ч кэша GIS).

---

## 4. Куда вставить Client ID

### 4.1. Бэкенд — `apps/api`

В `.env` (на сервере — серверный `.env`, локально — `apps/api/.env`):

```env
GOOGLE_CLIENT_ID=1234567890-abcdef....apps.googleusercontent.com
```

- Переменная читается в рантайме (`apps/api/src/config/configuration.ts` →
  `google.clientId`). Если пусто → `POST /auth/google` отвечает
  `503 AUTH_PROVIDER_UNAVAILABLE`, кнопка ничего не залогинит.
- После правки `.env` — **пересоздать** api-контейнер (а не `restart`), чтобы
  подхватился env:
  ```bash
  docker compose -f docker-compose.staging.yml up -d --force-recreate api
  ```

### 4.2. Фронтенд — `apps/client`

В `.env.local`:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=1234567890-abcdef....apps.googleusercontent.com
```

- Если пусто → компонент `GoogleSignInButton` просто **не рендерится**
  (`return null`), ошибок нет.

> ⚠️ **ГЛАВНАЯ ГОЧА деплоя.** `NEXT_PUBLIC_*` у Next.js **впекается в бандл на
> этапе `build`**, а не читается в рантайме. На стенде/проде клиент — это
> «запечённый» Docker-образ, поэтому **поменять переменную = пересобрать образ
> `avino-client`**. Просто перезапустить контейнер недостаточно. Значение должно
> присутствовать в окружении именно во время `docker build` / `next build`.

---

## 5. Мобильные клиенты (Android & iOS)

Мобильное приложение — **отдельный репозиторий** (потребляет
`openapi.internal.json`), в этом монорепо его кода нет. Поэтому здесь —
**только часть про Google Cloud Console и бэкенд**; обвязку SDK
(`google_sign_in` / Credential Manager / GoogleSignIn) настраивают в репо
мобилки.

### 5.1. Какие OAuth-клиенты создать

В **том же проекте** Google Cloud (Credentials → Create Credentials → OAuth
client ID) добавить помимо Web-клиента:

| Тип клиента | Что спросит Google | Где взять |
|-------------|--------------------|-----------|
| **Web application** (уже создан, §3) | JavaScript origins | используется как `serverClientId` в мобилке |
| **Android** | Package name + **SHA-1** сертификата подписи | из проекта мобилки + keystore (см. ниже) |
| **iOS** | **Bundle ID** | из проекта мобилки (Xcode / `ios/Runner`) |

**Android — SHA-1 fingerprint:**
```bash
# debug-сборка (локальная разработка)
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android | grep SHA1

# release — из вашего release-keystore (свой alias/пароль)
keytool -list -v -keystore /путь/release.keystore -alias <alias> | grep SHA1
```

> ⚠️ **Гоча Play App Signing.** Если приложение в Google Play раздаётся через
> **Play App Signing**, в проде валиден SHA-1 **пересозданного Google
> сертификата**, а не вашего upload-key. Его берут в **Play Console → Setup →
> App integrity → App signing key certificate** и тоже добавляют в Android-клиент.
> Без него вход на сборках из Play даёт ошибку. Нужны **оба** SHA-1: upload + Play.

**iOS — Bundle ID:** например `uz.avino.app` (точное значение — из
`ios/Runner` мобильного проекта). На стороне мобилки также пропишут reversed
client ID в `Info.plist` (URL scheme) — это их задача, не Cloud Console.

### 5.2. Главный подвох — `audience` (aud) и какой Client ID куда

Бэкенд проверяет `aud` ID-токена. На разных платформах `aud` **разный**:

| Откуда токен | Значение `aud` в ID-token |
|--------------|---------------------------|
| Веб (GIS) | **Web** client ID |
| Android (Credential Manager, `serverClientId = Web`) | **Web** client ID |
| iOS (GoogleSignIn) | **iOS** client ID приложения |

Вывод: **минимум два** разных значения `aud` (Web + iOS) могут прилетать на один
эндпоинт `/auth/google`. Правила:

1. В мобилке (и Android, и iOS) задать **`serverClientId` = Web client ID** — это
   просит у Google backend-верифицируемый ID-token. Для Android этого достаточно,
   чтобы `aud` стал Web-клиентом.
2. Для **iOS** `aud` всё равно остаётся iOS-клиентом → бэкенд **обязан** принимать
   и его как валидный audience.

### 5.3. Что поменять на бэкенде (требуется для iOS)

**Сейчас Google-бэкенд принимает только ОДИН audience** и для iOS-токена вернёт
`401`:

```ts
// apps/api/src/auth/google-auth.service.ts:145 (текущее)
audience: clientId,           // одна строка
```

Apple-сервис в этом же проекте **уже** умеет несколько audience через CSV —
надо повторить тот же паттерн для Google:

```ts
// apps/api/src/auth/apple-auth.service.ts:145 (образец)
audience: clientIds,          // массив

// apps/api/src/config/configuration.ts — appleConfig читает CSV:
clientIds: (process.env.APPLE_CLIENT_ID ?? '').split(',').map(s => s.trim()).filter(Boolean),
```

**План правки (мини-фича, отдельный PR):**

1. `configuration.ts` → `googleConfig` отдаёт `clientIds` (массив, CSV-парс как
   у `appleConfig`) вместо одиночного `clientId`.
2. `google-auth.service.ts` → 503-гейт по `clientIds.length === 0`; в
   `verifyIdToken` передавать `audience: clientIds`.
3. `env.validation.ts` / `.env.example` — `GOOGLE_CLIENT_ID` остаётся, но теперь
   это **CSV допустимых audience**.

После этого `.env` бэкенда:

```env
# CSV: Web client ID (веб+Android) , iOS client ID
GOOGLE_CLIENT_ID=111-web....apps.googleusercontent.com,222-ios....apps.googleusercontent.com
```

> Android-клиент в `aud` обычно **не появляется** (его роль — авторизовать
> приложение по SHA-1; токен идёт с `serverClientId`=Web). Поэтому в CSV его
> добавлять не обязательно, но и не вредно.

### 5.4. Итого — чек-лист для мобилок

- [ ] Android OAuth client: package + SHA-1 (debug, release, **Play App Signing**).
- [ ] iOS OAuth client: bundle ID.
- [ ] В мобильном SDK `serverClientId` = **Web** client ID.
- [ ] Бэкенд переведён на **CSV audience** (Web + iOS), `.env` обновлён,
      `up -d --force-recreate api`.
- [ ] Мобильная обвязка (`Info.plist` URL scheme, `google-services.json` /
      `GoogleService-Info.plist`) — в репозитории мобильного приложения.

---

## 6. Проверка

1. Открыть портал (локально <http://localhost:3001>, или прод-домен).
2. В модалке входа должна появиться кнопка **«Continue with Google»**
   (если её нет — пустой `NEXT_PUBLIC_GOOGLE_CLIENT_ID` или origin не совпал,
   см. троблшутинг).
3. Войти Google-аккаунтом → должна создаться/привязаться сессия, прийти
   admin-алерт в Telegram (если настроен).
4. Бэкенд-сторона руками:
   ```bash
   # пустой/битый токен → 401 (значит провайдер сконфигурён и проверяет)
   curl -s -X POST https://avino.uz/api/v1/auth/google \
     -H 'Content-Type: application/json' \
     -d '{"id_token":"bad"}'
   ```
   - `401 UNAUTHORIZED` (Invalid Google token) → Client ID **задан**, верификация
     работает. ✅
   - `503 AUTH_PROVIDER_UNAVAILABLE` → `GOOGLE_CLIENT_ID` на бэке **пуст**. ❌

---

## 7. Troubleshooting

| Симптом | Причина | Фикс |
|---------|---------|------|
| Кнопки Google нет на странице | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` пуст в **сборке** клиента | Прописать перед `build` и **пересобрать** образ клиента |
| Веб/Android входят, **iOS** всегда `401 Invalid Google token` | `aud` iOS-токена = iOS client ID, а бэк принимает только Web | Перевести бэк на CSV-audience (§5.3), добавить iOS client ID |
| Кнопка есть, в консоли `idpiframe_initialization_failed` / `origin is not allowed` | Текущий origin не в **Authorized JavaScript origins** | Добавить точный origin (схема+хост+порт, без `/`) в OAuth-клиент |
| Вход всегда `401 Invalid Google token` | Client ID на фронте ≠ Client ID на бэке (audience mismatch) | Поставить **один и тот же** ID в обоих `.env` |
| `503 AUTH_PROVIDER_UNAVAILABLE` | `GOOGLE_CLIENT_ID` пуст на бэке | Прописать в api `.env` + `up -d --force-recreate api` |
| `409 ACCOUNT_LINK_REQUIRED` | На этот email уже есть аккаунт, а Google вернул `email_verified=false` | Ожидаемое поведение (hardening H-2): войти прежним методом и прилинковать Google |
| Войти может только узкий круг, остальные — ошибка доступа | Consent screen в статусе **Testing** | **Publish app** → статус «In production» |
| Origin с голым IP не сохраняется | Google запрещает IP как origin | Поднять DNS-домен для стенда, использовать его |

---

## 8. Связанные файлы (для справки)

- `apps/api/src/auth/google-auth.service.ts` — офлайн-верификация ID-token,
  account-linking (H-2), выпуск сессии.
- `apps/api/src/auth/dto/google-login.dto.ts` — тело `POST /api/v1/auth/google`
  = `{ id_token }`.
- `apps/api/src/config/configuration.ts` — `google.clientId`
  (← `GOOGLE_CLIENT_ID`).
- `apps/api/.env.example` — строка `GOOGLE_CLIENT_ID=`.
- `apps/client/src/components/layout/GoogleSignInButton.tsx` — загрузка
  GIS-скрипта, рендер кнопки, отправка `credential` на `/auth/google`.
- `apps/client/.env.local` — `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

> Связанная фича — «Sign in with Apple» настраивается аналогично, но через
> `APPLE_CLIENT_ID` (Service ID, CSV допустимых audience), без секрета.
