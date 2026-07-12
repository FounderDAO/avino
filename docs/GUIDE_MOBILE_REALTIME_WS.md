# Гайд для мобильного разработчика — Realtime WebSocket `/rt`

Обновлено: 12.07.2026 · Backend PR [#378](https://github.com/FounderDAO/avino/pull/378) (в main) · ADR-0138 · Контракт: `docs/API.md` §20

Мгновенная доставка обновлений чата, уведомлений и заявок на просмотр (tour
requests) без поллинга. Сервер **не шлёт данные** — только сигнал «этот раздел
устарел», данные приложение перезапрашивает через существующие REST-эндпоинты.

> ⚠️ WebSocket — канал **только для foreground** (приложение открыто). Для
> фона/закрытого приложения остаётся FCM push (`POST /api/v1/notifications/devices`).
> WS не заменяет FCM и не требует отказа от него.

---

## Сводка

| Параметр | Значение |
|----------|----------|
| Протокол | socket.io v4 (Engine.IO 4) — НЕ «голый» WebSocket |
| URL | хост API + namespace `/rt` (например `https://api.example.uz/rt`) |
| Путь engine.io | стандартный `/socket.io/` (не менять) |
| Транспорт | `websocket` only (long-polling не использовать) |
| Аутентификация | access JWT в `handshake.auth.token` (тот же токен, что для REST) |
| Событие → клиент | `invalidate` c payload `{ type, id? }` |
| События → сервер | нет (канал односторонний) |
| Комната | сервер сам джойнит сокет в `user:<id>` — клиенту делать ничего не надо |

Dart-пакет: [`socket_io_client`](https://pub.dev/packages/socket_io_client) `^2.x`
(v2 совместим с серверным socket.io v4; v1 — НЕ подойдёт).

---

## 1. Подключение

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket connectRealtime(String apiHost, String accessToken) {
  final socket = IO.io(
    '$apiHost/rt', // namespace /rt на том же хосте, что REST
    IO.OptionBuilder()
        .setTransports(['websocket'])   // без long-polling
        .setAuth({'token': accessToken}) // access JWT, без префикса "Bearer"
        .build(),
  );
  return socket;
}
```

Требования:

- **Токен без `Bearer `** — в `auth` кладётся «голый» JWT.
- Невалидный/протухший токен → сервер молча дисконнектит соединение сразу после
  connect. Это штатный сигнал «обнови токен» (см. §3).
- socket.io сам переподключается с экспоненциальным backoff — свой retry-цикл
  писать не нужно.

## 2. Событие `invalidate`

Единственное событие. Payload:

```json
{ "type": "thread" | "thread_list" | "notification" | "tour", "id"?: "<uuid>" }
```

Реакция — перезапросить соответствующий REST-эндпоинт:

| `type` | Что устарело | Что перезапросить |
|--------|--------------|-------------------|
| `thread` (`id` = threadId) | Лента конкретного диалога | `GET /api/v1/chat/threads/{id}/messages` |
| `thread_list` | Список диалогов (порядок/unread) | `GET /api/v1/chat/threads` |
| `notification` | Лента уведомлений и бейдж | `GET /api/v1/notifications` |
| `tour` | Заявки на просмотр (обе стороны) | `GET /api/v1/tour-requests/incoming` + `GET /api/v1/tour-requests/outgoing` |

```dart
socket.on('invalidate', (data) {
  final type = data['type'] as String;
  final id = data['id'] as String?;
  switch (type) {
    case 'thread':        refetchThreadMessages(id!);
    case 'thread_list':   refetchThreads();
    case 'notification':  refetchNotifications();
    case 'tour':          refetchTours(); // incoming + outgoing
  }
});
```

Замечания:

- Сигналы приходят **только получателю** события (вам написали, вам подали
  заявку, ваш тур подтвердили). Свои собственные действия приложение и так
  отражает по ответу своего же POST/PATCH.
- Payload дедуплицировать не нужно, но частые сигналы по одному `type` можно
  дебаунсить (например, 300 мс) — сервер может прислать несколько подряд.

## 3. Жизненный цикл

```dart
socket.onConnect((_) {
  // gap-fill: за время разрыва события потеряны безвозвратно —
  // перезапросить ВСЕ три подсистемы разом.
  refetchThreads();
  refetchNotifications();
  refetchTours();
});

socket.onDisconnect((_) {
  // Штатно: сеть моргнула ИЛИ токен протух и сервер нас выкинул.
  // socket.io сам попробует reconnect со старым auth. Если access-токен
  // уже протух — обновите его и переподключитесь вручную (ниже).
});
```

**Ротация access-токена.** `auth` фиксируется на момент handshake, поэтому после
refresh токена соединение надо пересоздать:

```dart
void onTokenRefreshed(String newToken) {
  socket
    ..clearListeners()
    ..disconnect()
    ..dispose();
  socket = connectRealtime(apiHost, newToken); // + повторно навесить обработчики
}
```

Практичный паттерн: при `onDisconnect`, если ближайший REST-запрос вернул 401 и
прошёл refresh — пересоздать сокет с новым токеном.

**Фон/форграунд (рекомендация):** при уходе в фон — `disconnect()` (не держим
idle-соединение, фон покрывает FCM); при возврате — реконнект, `onConnect`
сам сделает gap-fill.

**Логаут:** `disconnect()` + `dispose()`.

## 4. Чего в канале НЕТ (осознанно)

- Данных сущностей (сообщение, тур) — только сигнал; источник истины — REST.
- Presence/«онлайн», typing-индикаторов, read-receipts.
- Событий для собственных действий отправителя.
- Замены FCM: устройство всё так же регистрируется в
  `POST /api/v1/notifications/devices`.

Канал версионируется payload'ом: новые `type` могут добавляться — неизвестные
значения игнорировать, не падать.

## 5. Чек-лист интеграции

- [ ] `socket_io_client: ^2.x` в pubspec (v1 несовместим).
- [ ] URL = хост API + `/rt`, транспорт `websocket`, токен в `auth.token`.
- [ ] Обработчик `invalidate` → маппинг из §2.
- [ ] `onConnect` → gap-fill всех трёх подсистем.
- [ ] Пересоздание сокета после refresh access-токена.
- [ ] `disconnect` при уходе в фон, реконнект при возврате.
- [ ] Неизвестный `type` в payload — игнорируется.

## 6. Как проверить руками

1. Залогиниться в приложении (user A) и на портале в браузере (user B).
2. B пишет A сообщение в чат по объявлению → у A мгновенно (< 1 с) приходит
   `invalidate {type:'thread'...}` + `{type:'thread_list'}` + `{type:'notification'}`.
3. B подаёт заявку на просмотр объявления A → у A приходит `{type:'tour'}` +
   `{type:'notification'}`.
4. Убить сеть на минуту, снова включить → socket.io реконнектится, `onConnect`
   перезапрашивает всё — пропущенное появляется.

Отладка: в логах сервера соединения не логируются; смотреть handshake можно
любым socket.io-клиентом (`auth.token` обязателен, иначе мгновенный disconnect).
