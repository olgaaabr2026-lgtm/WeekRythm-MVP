# Ритм Недели — Vite

Vite/React-версия планировщика без Babel-in-browser и vendor-скриптов.

## Запуск

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
npm run preview
```

## Структура

- `src/clay-helpers.js` — константы, даты, расчёты, фильтры, палитра.
- `src/clay-modals.jsx` — модальные окна и базовые UI-компоненты.
- `src/variant-clay.jsx` — основной React-компонент приложения.
- `src/use-viewport.js` — адаптивный хук.
- `src/animations.css`, `src/responsive.css`, `src/base.css` — стили.
