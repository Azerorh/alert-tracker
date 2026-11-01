# Тривога.Карта

Публічна українська карта повітряних загроз у реальному часі: БпЛА, ракети, балістика, КАБ.

## Стек

- Vite + React + TypeScript
- MapLibre GL JS (OpenFreeMap dark)
- BFF (Hono) на `:8787` — кеш REST, `/api/status`, проксі MAPA/NEPTUN
- Дані: [NEPTUN](https://neptun.in.ua/) WebSocket / REST + [MAPA](https://mapa.ua/) для уточнення треків
- Межі районів/областей: локальні GeoJSON у `public/geo/` (upstream без CORS)
- Окуповані + сіра зона (статус невідомий): зріз з [DeepStateMap](https://deepstatemap.live/) (`public/geo/occupied.geojson`)

## GitHub Pages

Сайт: https://azerorh.github.io/alert-tracker/

Деплой автоматичний з `main` (Actions → Deploy GitHub Pages). Без BFF: NEPTUN/MAPA йдуть з браузера напряму.

## Запуск

```bash
npm install
npm run dev
```

Піднімає фронт (http://localhost:5173/) і BFF (http://127.0.0.1:8787/). Vite проксує `/api/*` на BFF.

Окремо:

```bash
npm run web      # лише Vite
npm run server   # лише BFF
```

Збірка:

```bash
npm run build
npm run preview
```

Опційно: `VITE_API_BASE=https://your-bff.example` для продакшену. Kill-switch треків на BFF: `HIDE_TRACKS=1`.

Фоновий Web Push: Worker `https://alert-tracker-push.azerorh.workers.dev` (див. `workers/push/`). Збірка Pages підставляє `VITE_PUSH_API_BASE`.

## Що вміє v1

- Live-мітки кожного об’єкта з dead-reckoning між оновленнями
- Траєкторії (MAPA + NEPTUN), фільтри типів, детальна картка по кліку
- Підсвітка офіційних зон тривоги
- Темно-червона підсвітка окупованої території (DeepState)
- «Моє місце» та режим «Біля мене» (радіус 80 км)
- Статус джерел (BFF / NEPTUN / MAPA) у шапці
- Дисклеймер + атрибуція NEPTUN / MAPA / DeepStateMap
- Web Push по обраних областях (Cloudflare Worker) — фон на телефоні; на iPhone спочатку «Додати на домашній екран»

Оновити шар окупації:

```bash
npm run refresh:occupied
```

## Важливо

Це інформаційний агрегатор, **не** офіційна система оповіщення. Орієнтуйтесь на застосунок «Повітряна тривога» та вказівки влади.
