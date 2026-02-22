# Moderator Cafe Products Editor

React-панель для редактирования продуктов кафе-кондитерской.

## Запуск

```bash
npm install
npm run dev
```

По умолчанию API берется из `http://127.0.0.1:8000`.

Если нужен другой адрес Laravel-бэкенда, создайте `.env`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://ibembkohihvrhrgefequ.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_SUPABASE_BUCKET=cafe
```

## Что умеет

- Загружает продукты из `GET /api/products`
- Фильтрует по категории и поиску
- Редактирует все ключевые поля продукта
- Загружает фото в Supabase Storage (`cafe/product{id}/filename`)
- Сохраняет изменения в `/api/products/{id}` (`PUT`, с fallback на `PATCH`)
