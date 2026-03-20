# Slowfire Bot — 12-Week Coaching Telegram Bot

**Версия:** 0.1.0 (Alpha)  
**Репозиторий:** [github.com/bulyex/oc-dev](https://github.com/bulyex/oc-dev)  
**Основной канал:** Telegram

---

## Что это за продукт

Slowfire — это Telegram-бот для индивидуального коучинга по методике **12 недель в году**. Пользователь проходит структурированный онбординг, формулирует своё Vision (видение на 12 недель), ставит цели и получает систему напоминаний и отчётности.

Продукт находится в стадии **активной разработки** (Alpha). Базовый онбординг и Vision-фаза реализованы, остальные фазы — в разработке.

---

## Как это работает: FSM (Finite State Machine)

Бот построен на конечном автомате с тремя основными состояниями:

```
┌─────────────────┐
│  STATE_HELLO    │  5 приветственных сообщений с кнопками
│  (старт)        │  → переход по нажатию кнопок
└────────┬────────┘
         │ кнопка "Давай попробуем!"
         ▼
┌─────────────────┐
│ STATE_DECISION  │  2 сообщения с описанием методики и условий
│                 │  → кнопка "Начинаем..."
└────────┬────────┘
         │ кнопка "Начинаем..."
         ▼
┌─────────────────┐
│STATE_ONBOARDING │  Основной онбординг (подфазы)
│  ┌───────────┐  │
│  │  VISION   │  │  Пользователь формулирует видение (с AI-помощью)
│  ├───────────┤  │
│  │  GOALS    │  │  [будущая фаза] Постановка 3 целей
│  ├───────────┤  │
│  │   PLAN    │  │  [будущая фаза] 12-недельный план
│  ├───────────┤  │
│  │   TIME    │  │  [будущая фаза] Предпочтения по времени
│  └───────────┘  │
└─────────────────┘
```

**Механика переходов:**
- Каждое сообщение содержит inline-кнопку
- Callback-data кнопки валидируется по timestamp (TTL 24ч) и текущему FSM state
- Debouncing 500ms предотвращает дубли при быстрых нажатиях
- Повторное нажатие старой кнопки после перехода — отклоняется

---

## Архитектура: из чего состоит продукт

### Стек технологий

| Компонент | Технология | Назначение |
|-----------|-----------|------------|
| Runtime | Node.js 24+ | Серверная платформа |
| Язык | TypeScript 5+ | Типобезопасная разработка |
| Telegram API | Telegraf 4+ | Фреймворк для Telegram-бота |
| База данных | Prisma + SQLite | Хранение пользователей (upsert) |
| State | Redis 7 (ioredis) + in-memory fallback | Persistence FSM state между рестартами |
| AI | OpenAI-compatible API (routerai.ru) | Валидация Vision в реальном времени |
| Логирование | Winston | Структурные логи (error/warn/info/debug) |
| Валидация | Zod | Валидация конфигурации и AI-ответов |
| Container | Docker + Docker Compose | Деплой и оркестрация |

### Структура кода

```
src/
├── index.ts                  — Точка входа: инициализация, graceful shutdown
├── config/
│   └── index.ts             — Zod-схема, валидация .env
├── bot/
│   ├── index.ts             — Регистрация всех handlers, global error middleware
│   ├── state/
│   │   ├── types.ts         — UserFSMState, OnboardingSubstate, UserState
│   │   ├── manager.ts       — StateManager interface
│   │   ├── memory.ts        — InMemoryStateManager (fallback)
│   │   ├── redis.ts         — RedisStateManager (primary, TTL 24ч)
│   │   └── index.ts         — Factory: initializeStateManager(), getStateManager()
│   ├── onboarding/
│   │   ├── index.ts         — ONBOARDING_MESSAGES (5 HELLO-сообщений)
│   │   ├── vision.ts        — VISION_WELCOME_MESSAGE, processVisionMessage()
│   │   └── prompts/
│   │       └── vision.ts    — VISION_SYSTEM_PROMPT, isVisionAccepted()
│   ├── decision/
│   │   └── index.ts         — DECISION_MESSAGES, callback generation/parsing
│   ├── ai/
│   │   ├── types.ts         — ChatMessage, ChatCompletionResponse
│   │   ├── config.ts        — getAIConfig(), isAIAvailable()
│   │   ├── client.ts        — sendChatCompletion() → OpenAI-compatible API
│   │   └── index.ts         — Экспорты модуля
│   └── handlers/
│       ├── start.ts         — /start → reset state → STATE_HELLO
│       ├── text.ts          — Эхо/повтор, роутинг по FSM state и substate
│       ├── nonText.ts       — Обработка фото/стикеров
│       └── callback.ts      — handleOnboardingCallback / handleDecisionCallback
├── database/
│   └── client.ts            — Prisma client, upsert user, degraded mode
└── utils/
    └── logger.ts            — Winston logger (console + transport)
```

### Модель данных (Prisma/SQLite)

```prisma
model User {
  id                   String   @default(uuid())   // внутренний UUID
  telegramId           String   @id                // Telegram user ID
  firstName            String?
  lastName             String?
  username             String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  currentState        String   @default("init")
  subscriptionStatus  String   @default("trial")
}
```

> **Примечание:** FSM state (helloMessage, decisionMessage, vision, etc.) хранится **в Redis** (или in-memory), а не в SQLite. В планах — миграция state в PostgreSQL для полной персистентности.

### Environment variables

```bash
TELEGRAM_BOT_TOKEN=          # Обязательно: токен от @BotFather
DATABASE_URL=file:./data/dev.db   # SQLite (опционально)
REDIS_URL=redis://localhost:6379  # Опционально, fallback → in-memory
LOG_LEVEL=info              # error|warn|info|debug

# AI (опционально — без ключа работает в fallback-режиме)
LLM_API_KEY=
LLM_BASE_URL=https://routerai.ru/api/v1
LLM_MODEL=openai/gpt-5-nano
```

---

## Режимы работы

### Normal mode (Redis + SQLite)
```
Бот запущен → Инициализация StateManager → Подключение к Redis
State пишется в Redis с TTL 24ч
Пользователи upsertятся в SQLite
```

### Degraded mode (fallback)
```
Redis недоступен → InMemoryStateManager
SQLite недоступен → warn-лог, бот продолжает работу
AI API недоступен → fallback-ответ без валидации Vision
```

---

## Запуск и деплой

### Локальная разработка

```bash
npm install
cp .env.example .env
# Заполнить TELEGRAM_BOT_TOKEN

npm run prisma:generate   # Генерация Prisma client
npm run prisma:migrate     # Миграция БД (первый запуск)

npm run dev                # Dev: tsx watch (hot reload)
```

### Docker Compose (полный стек)

```bash
cp .env.example .env
# Заполнить TELEGRAM_BOT_TOKEN

docker-compose up -d       # bot + redis
docker-compose logs -f     # Просмотр логов
docker-compose down        # Остановка
```

### Production (Docker, только бот)

```bash
docker build -t slowfire-bot:latest .
docker run -d \
  --name slowfire-bot \
  --env TELEGRAM_BOT_TOKEN=your_token \
  --env REDIS_URL=redis://redis:6379 \
  --env DATABASE_URL=file:./data/prod.db \
  slowfire-bot:latest
```

---

## Что уже реализовано (Task 2–6)

| Задача | Статус | Описание |
|--------|--------|----------|
| Task 2: Onboarding FSM | ✅ | Интерактивные кнопки, 5 HELLO-сообщений, callback handling |
| Task 3: Redis State | ✅ | Redis-backed state с fallback, TTL 24ч, graceful shutdown |
| Task 4: FSM Refactoring | ✅ | STATE_HELLO, STATE_DECISION, STATE_ONBOARDING + DECISION messages |
| Task 5: Vision Phase | ✅ | AI-валидация Vision, лимит 5 сообщений, fallback mode |
| Task 6: Hello Texts | ✅ | Финальные тексты onboarding-сообщений от фаундера |

---

## Что в разработке / планах

### Ближайшие (Phase 1)
- **Goals Phase** — пользователь ставит 3 цели (AI-генерация из Vision)
- **PostgreSQL** — миграция с SQLite на PostgreSQL для production
- **Redis AUTH** — защита Redis паролем
- **Health endpoint** — `/health` для мониторинга

### Среднесрочные (Phase 2)
- **Plan Phase** — еженедельные задачи из Goals
- **Time Phase** — настройка времени напоминаний
- **Reminder System** — Redis/Bull для scheduling напоминаний
- **Подписки и оплата** — Telegram Payments / Stripe

### Долгосрочные
- **OEQ Group Matching** — механизм объединения пользователей в группы
- **13-я неделя** — отдых/рестарт между циклами
- **PostgreSQL User Registry** — полная персистентность state в БД

---

## Метрики и качество

| Метрика | Значение |
|---------|----------|
| TypeScript | ✅ 0 errors, strict mode |
| Unit/E2E тесты | ✅ 10/10 FSM-тестов проходят |
| Docker | ✅ Multi-stage build, non-root user, Alpine |
| Graceful shutdown | ✅ SIGINT/SIGTERM, корректное отключение Redis/DB |
| Fallback coverage | ✅ БД, Redis, AI — все имеют graceful degradation |

---

##已知ные ограничения (Tech Debt)

| Проблема | Влияние | План |
|----------|---------|------|
| In-memory fallback не очищает TTL | State живёт бесконечно без Redis | Добавить setInterval cleanup |
| E2E тесты (старые) несовместимы | Тесты падают из-за async API | Адаптировать в Phase 1 |
| Redis без AUTH | Безопасность в dev only | Redis AUTH в Phase 1 |
| Single Redis instance (SPOF) | Нет HA в production | Redis Sentinel/Cluster позже |
| Нет CI/CD | Ручной деплой | GitHub Actions в Phase 1 |

---

*Документ обновлён: 2026-03-20. Для вопросов по архитектуре — см. src/bot/state/types.ts и task-отчёты в /dev_todo.*
