# Slowfire Bot - Phase 0

Базовый эхо-бот прототип для Slowfire.

## Технологии

- Node.js 24+
- TypeScript 5+
- Telegraf 4+
- Prisma + SQLite
- Zod (валидация конфига)
- Winston (логирование)

## Структура проекта

```
src/
├── bot/
│   ├── handlers/
│   │   ├── start.ts      - /start команда
│   │   ├── text.ts       - эхо текстовых сообщений
│   │   └── nonText.ts    - обработка non-text (фото, стикеры и т.д.)
│   └── index.ts          - регистрация хендлеров
├── database/
│   └── client.ts         - Prisma клиент, upsert user, degraded mode
├── config/
│   └── index.ts          - конфигурация с Zod валидацией
├── utils/
│   └── logger.ts         - Winston логгер
└── index.ts              - точка входа, graceful shutdown
```

## Установка и запуск

### Локальная разработка

```bash
# Установить зависимости
npm install

# Настроить .env (скопировать из .env.example)
cp .env.example .env
# Редактировать .env: TELEGRAM_BOT_TOKEN=your_token

# Сгенерировать Prisma клиент
npm run prisma:generate

# Запустить миграции (если нужна БД)
npm run prisma:migrate

# Запустить в dev режиме
npm run dev
```

### Production (Docker)

```bash
# Собрать образ
docker build -t slowfire-bot:latest .

# Запустить контейнер
docker run -d \
  --name slowfire-bot \
  --env TELEGRAM_BOT_TOKEN=your_token \
  --env DATABASE_URL=file:./prod.db \
  -v slowfire-data:/app/prisma \
  slowfire-bot:latest
```

## Функционал (Phase 0)

✅ `/start` - приветствие и сохранение пользователя в БД
✅ Текстовые сообщения - эхо
✅ Non-text сообщения - "Пожалуйста, отправьте текстовое сообщение"
✅ Degraded mode - работает без БД с warn логами
✅ Graceful shutdown - корректная остановка по SIGINT/SIGTERM
✅ Docker prod-ready - Alpine, non-root user

## Acceptance Criteria

- [x] Бот запускается (/start: приветствие; text: эхо; non-text: "Отправьте текст")
- [x] Сохраняет user в SQLite (upsert по telegramId)
- [x] Degraded mode: работает без DB (лог warn)
- [x] Структура проекта по tech_stack.md (src/bot, database, utils; tsconfig, .env.example)
- [x] Docker prod-ready (alpine, non-root user)
- [x] Graceful shutdown (SIGINT/TERM)