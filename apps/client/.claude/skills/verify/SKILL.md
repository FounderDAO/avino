---
name: verify
description: Как поднять и продрайвить apps/client (публичный портал Avino) для верификации изменений в браузере
---

# Верификация apps/client

## Запуск

```bash
# Порт 3001 (скрипт dev) часто занят Docker — поднимать на свободном:
pnpm --filter @avino/client exec next dev -p 3005
# Готовность: curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/ru → 200
```

## Драйв (headless Chrome)

Playwright в репо нет. Работает `puppeteer-core` + системный Chrome:

```js
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: '<scratchpad>/chrome-profile', // ОБЯЗАТЕЛЬНО: без него launch виснет
  timeout: 60000,
});
```

Ставить `puppeteer-core` в scratchpad (`npm i puppeteer-core`), не в репо.

## Маршруты и потоки

- `/ru` — главная (обычный широкий футер, страница скроллится).
- `/ru/map`, `/ru/search` — Zillow-сплит: страница НЕ должна скроллиться
  (`document.scrollingElement.scrollHeight === clientHeight`), скроллится только
  колонка списка (`overflow-y-auto`, футер `variant="panel"` внутри неё),
  кнопка «Нарисовать территорию» всегда видна.
- Мобайл: вьюпорт 390×844, плавающая кнопка-переключатель «Карта/Список».

## Gotchas

- Карта в dev показывает «Карта недоступна: не задан ключ Yandex Maps» —
  слой карты не проверить без ключа; раскладка/оверлеи проверяются.
- Высоты сплита: хедер = `--header-h` (68px) + 1px border; фильтр-бар /search =
  69px + вычитается в `calc(...-70px)`. При правке высот перемерить
  `scrollHeight - clientHeight` на обеих страницах.
- Первая загрузка страницы в dev компилируется долго (до ~30с) — ждать
  `networkidle2` + пауза 2–3с на гидрацию.
