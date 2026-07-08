# Гайд для мобильного разработчика — интеграция партии 06.07.2026

Обновлено: 06.07.2026 · Backend PR [#359](https://github.com/FounderDAO/avino/pull/359)

Что закрыто и как это подключить со стороны Flutter-приложения. База: все роуты
через `/api/v1/...`, авторизация — `Authorization: Bearer <access_token>` (кроме
публичного поиска).

> ⚠️ Новые эндпоинты (`points`, `avatar`, новый контракт `rooms`) становятся
> доступны на API **после мержа #359 и деплоя на сервер**. До деплоя — код готов,
> но сервер отвечает по-старому. Дадим сигнал, когда выкатим.

---

## Сводка

| # | Что | Где правка | Действие мобилки |
|---|-----|-----------|------------------|
| 6 | Фильтр комнат — мультивыбор | ✅ backend | Слать список `rooms`; чип «5+» в тот же список |
| 2 | Полигон в живом поиске | ✅ backend | Слать `points` в `/search` и `/search/bounds` |
| 5 | Загрузка аватара | ✅ backend | Новый multipart-эндпоинт |
| 1 | Кластеры карты | ✅ уже было | Использовать `/search/clusters` |
| 4 | FX ценового фильтра | 🔧 мобилка | Слать `currency` вместе с `price_min/max` |
| 0 | Google/Apple/FCM | ⚙️ наш сервер | Ничего — ждать env |
| 3 | Бокс «весь мир» | ✅ уже починено | Проверить на свежем деплое |

---

## 1. Фильтр комнат `rooms` (пункт 6)

### Контракт
`rooms` — **повторяющийся** query-параметр (список), семантика **OR/IN**:

```
GET /api/v1/search?rooms=2&rooms=3&rooms=5
```

- значения `0..4` — **точное** совпадение (`0` = студия, `4` = ровно 4 комнаты);
- значение `5` — **«5 и более»** (`rooms >= 5`) → это ваш чип «5+»;
- пример выше = «2-комнатные ИЛИ 3-комнатные ИЛИ 5+»;
- одиночное значение тоже работает: `rooms=1`.

### ⚠️ BREAKING — обязательно учесть
Раньше `rooms=4` означало «4 и более» и подтягивал 4/5/6. **Теперь `rooms=4` — это
ровно 4.** Если где-то в UI нужен именно смысл «4 и более» — используйте отдельный
параметр `rooms_min=4` (он не менялся). Чип «5+» теперь выражается через `rooms=5`
в общем списке, а не через `rooms_min`.

### Flutter / Dio
`Dio ListFormat.multi` даёт ровно нужный формат `rooms=1&rooms=2`:

```dart
final resp = await dio.get(
  '/api/v1/search',
  queryParameters: {
    'rooms': selectedRooms, // напр. [2, 3, 5]
    // ...остальные фильтры
  },
  options: Options(listFormat: ListFormat.multi),
);
```

Работает во всех поисковых эндпоинтах: `/search`, `/search/bounds`,
`/search/radius`, `/search/polygon`, и в матчере сохранённых поисков
(`filters_json.filters.rooms` — храните там список).

---

## 2. Полигон в живом поиске — `points` (пункт 2)

Теперь `/search` и `/search/bounds` принимают нарисованную территорию **на сервере**
— локально фильтровать точки больше не нужно (при большом числе объявлений локальный
результат был неполным).

### Контракт
```
GET /api/v1/search?points=41.30,69.27;41.30,69.29;41.32,69.29;41.32,69.27&<фильтры>
GET /api/v1/search/bounds?sw_lat=..&sw_lng=..&ne_lat=..&ne_lng=..&points=..&<фильтры>
```

- `points` — строка вершин кольца `lat,lng;lat,lng;...`, **минимум 3 вершины**;
- пересечение с контуром (`ST_Within`) применяется **поверх** всех остальных
  фильтров (и bbox — в `/search/bounds`);
- невалидная строка (< 3 вершин, нечисловые/вне диапазона координаты) → `400
  VALIDATION_ERROR`;
- формат идентичен уже существующему `/search/polygon`.

### Flutter / Dio
```dart
String encodeRing(List<LatLng> ring) =>
    ring.map((p) => '${p.latitude},${p.longitude}').join(';');

final resp = await dio.get('/api/v1/search/bounds', queryParameters: {
  'sw_lat': sw.latitude, 'sw_lng': sw.longitude,
  'ne_lat': ne.latitude, 'ne_lng': ne.longitude,
  'points': encodeRing(drawnPolygon), // ≥3 точки
  'rooms': selectedRooms,
}, options: Options(listFormat: ListFormat.multi));
```

Когда территория нарисована — шлите `points`; когда нет — просто не передавайте
параметр.

---

## 3. Загрузка аватара профиля (пункт 5)

Появились два эндпоинта (Auth: **Bearer**). Модель — как у медиа объявлений:
файл кладётся в наше хранилище, ссылка подписывается при чтении.

### Эндпоинты
```
POST   /api/v1/users/me/avatar    multipart/form-data, поле file
       → 201 { "avatar_url": "https://..." }
DELETE /api/v1/users/me/avatar    → 204   (сброс на заглушку/фото провайдера)
```

- поле формы — **`file`**;
- допустимые типы — `image/jpeg`, `image/png`, `image/webp`; лимит **10 MiB**;
- ошибки: `400 VALIDATION_ERROR` (нет файла), `415 UNSUPPORTED_MEDIA_TYPE`,
  `413 FILE_TOO_LARGE`.

### Что происходит с `avatar_url` после загрузки
После `POST` **само собой** начинает отдаваться подписанная ссылка в:
- `GET /api/v1/users/me` → `profile.avatar_url`
- `GET /api/v1/auth/me` → `profile.avatar_url`
- `GET /api/v1/chat/threads` → `counterparty.avatar_url`

Ссылка подписывается заново на каждое чтение (не протухает). Загруженный аватар
**приоритетнее** фото OAuth-провайдера (Google/Apple): `DELETE` вернёт `avatar_url`
к фото провайдера или `null`. Ваш `Image.network(...) + fallback-инициал` менять не
нужно — просто перестанет приходить `null` у тех, кто загрузил фото.

### Flutter / Dio
```dart
Future<String> uploadAvatar(File image) async {
  final form = FormData.fromMap({
    'file': await MultipartFile.fromFile(
      image.path,
      contentType: MediaType('image', 'jpeg'), // или png/webp
    ),
  });
  final resp = await dio.post('/api/v1/users/me/avatar', data: form);
  return resp.data['avatar_url'] as String;
}

Future<void> removeAvatar() =>
    dio.delete('/api/v1/users/me/avatar');
```

---

## 4. Валюта в ценовом фильтре — `currency` (пункт 4)

FX-конверсия ценового фильтра **уже работает на сервере**, но включается **только
если вы передаёте `currency`**. Без него сервер сравнивает сырые числа без учёта
валюты объявления → пустые/неверные результаты (это и был симптом).

**Фикс на вашей стороне:** всегда слать `currency` вместе с диапазоном:

```dart
final resp = await dio.get('/api/v1/search', queryParameters: {
  'price_min': '30000000',
  'price_max': '80000000',
  'currency': userCurrency, // 'UZS' | 'USD' — валюта, в которой юзер ввёл диапазон
});
```

Сервер приведёт цену каждого объявления к `currency` по курсу ЦБУ и сравнит
корректно.

---

## 5. Кластеры карты (пункт 1) — эндпоинт уже есть

Для широких зумов («вся страна») используйте агрегирующий эндпоинт вместо
пагинации `/search/bounds`.

### Контракт
```
GET /api/v1/search/clusters?sw_lat&sw_lng&ne_lat&ne_lng&zoom&<фильтры §9>
→ {
    "data": [
      { "latitude": 41.31, "longitude": 69.28, "count": 123,
        "min_price": 45000, "avg_price": 78000 }
    ],
    "currency": "USD"
  }
```

- `zoom` — **обязательный** (0..22, web-mercator); задаёт шаг кластерной сетки;
- наследует bbox (`sw_*`/`ne_*`) и **все** фильтры из `/search` (включая `rooms`,
  `points`, `price_min/max` + `currency`);
- `min_price`/`avg_price` — в валюте `currency` ответа (по курсу ЦБУ).

### Рекомендуемая логика клиента
- широкий зум → рисуйте кластерные кружки с `count` из `/search/clusters`;
- когда в боксе < ~200 объектов → переключайтесь на обычные ценовые пины через
  `/search/bounds`.

### Flutter / Dio
```dart
final resp = await dio.get('/api/v1/search/clusters', queryParameters: {
  'sw_lat': sw.latitude, 'sw_lng': sw.longitude,
  'ne_lat': ne.latitude, 'ne_lng': ne.longitude,
  'zoom': mapZoom.round(),
  'rooms': selectedRooms,
}, options: Options(listFormat: ListFormat.multi));
final cells = (resp.data['data'] as List);
```

---

## 6. Соц-вход и FCM (пункт 0) — на нашей стороне

Код сервера уже принимает несколько audience (Google) и bundle ID (Apple), а также
готов к регистрации устройств и доставке push. `401 "Invalid Google token"` /
`503 AUTH_PROVIDER_UNAVAILABLE` — это **отсутствующие env-переменные**, которые
выставит наш Team Lead:
- `GOOGLE_CLIENT_ID` = ваши 3 audience через запятую (web + iOS + запас);
- `APPLE_CLIENT_ID=uz.avino.app`;
- Firebase service-account (`FIREBASE_*`) для FCM.

**Со стороны мобилки менять ничего не нужно** — после выставления env вход и push
заработают. `POST /notifications/devices` (регистрация устройства) уже работает
живьём.

---

## 7. Бокс «весь мир» пусто (пункт 3)

Исправлено ранее (уже в `main`), есть регресс-тест на `-85/-180/85/180`. Ваш репорт,
вероятно, был со старого деплоя — перепроверьте на свежем; если повторится, пришлите
точный запрос и `request-id`.

---

## Чек-лист подключения (мобилка)

- [ ] `rooms` → слать список (`ListFormat.multi`); чип «5+» = `rooms=5`; заменить
      прежнее «4+» на `rooms_min=4`, где оно нужно
- [ ] `points` → слать при нарисованной территории в `/search` и `/search/bounds`;
      убрать локальную фильтрацию точек
- [ ] Аватар → `POST/DELETE /users/me/avatar` (поле `file`); показывать
      `avatar_url` из `/users/me` и `/chat/threads` как есть
- [ ] Ценовой фильтр → всегда добавлять `currency`
- [ ] Кластеры → `/search/clusters` на широких зумах, переключение на пины < ~200
- [ ] Соц-вход/FCM → без изменений, ждать env-сигнала от нас
