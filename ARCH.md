# ARCH.md — Slowfire Telegram Bot (`slowfire-bot`)

## 1. OVERVIEW

**Назначение:** Telegram-бот (фаза прототипа) для онбординга пользователя (приветствие → решение → Vision / Goals / 12-недельный план), сохранения прогресса в БД и ежедневного трекинга действий в активном режиме с помощью LLM.

**Стек:** TypeScript (ESM), Node.js ≥24, **Telegraf** 4.x, **Prisma** 5 + **SQLite** (`better-sqlite3` + adapter), **ioredis** (опционально) или in-memory для сессии/FSM, **Winston**, **Luxon**, **Zod**. Внешние сервисы: **Telegram Bot API** (long polling через Telegraf), **OpenAI-compatible HTTP API** (`LLM_BASE_URL` / `LLM_API_KEY`, по умолчанию routerai.ru).

**Точка входа:** `src/index.ts` — создаёт `Telegraf`, вызывает `setupBotHandlers`, инициализирует state manager и Prisma, затем `bot.launch()`. Сборка: `npm run build` → `dist/index.js`; запуск: `npm start` или `npm run dev` (`tsx watch src/index.ts`).

---

## 2. MODULE MAP


| Путь                  | Назначение                                                            | Ключевые файлы                                                                     | Внешние зависимости                                               |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/`                | Корень приложения                                                     | `index.ts`                                                                         | `telegraf`, `config`, `bot`, `database/client`, `bot/state`       |
| `src/config/`         | Валидация env (токен бота, БД, Redis, логи)                           | `index.ts`                                                                         | `dotenv`, `zod`                                                   |
| `src/utils/`          | Логирование и время                                                   | `logger.ts`, `datetime.ts`                                                         | `winston`, `luxon`                                                |
| `src/database/`       | Prisma singleton, graceful connect/disconnect, реэкспорт репозиториев | `client.ts`, `repositories/*.repository.ts`                                        | `@prisma/client`, Prisma schema                                   |
| `src/bot/`            | Регистрация хендлеров Telegraf                                        | `index.ts`                                                                         | все подпакеты `handlers`, `state`, `onboarding`, `decision`, `ai` |
| `src/bot/handlers/`   | Команды и апдейты                                                     | `start.ts`, `callback.ts`, `text.ts`, `nonText.ts`                                 | `telegraf`, state, onboarding, decision, DB, AI                   |
| `src/bot/state/`      | FSM и черновики онбординга в Redis или памяти                         | `index.ts`, `types.ts`, `redis.ts`, `memory.ts`, `manager.ts`                      | `ioredis` (Redis), синхронизация FSM в БД через `fsm.repository`  |
| `src/bot/onboarding/` | Тексты HELLO, логика Vision/Goals/Plan                                | `index.ts`, `vision.ts`, `goals.ts`, `plan.ts`, `prompts/*.ts`                     | `ai/client`, `state`                                              |
| `src/bot/decision/`   | Экран «решение» (одно сообщение + inline-кнопка)                      | `index.ts`                                                                         | `telegraf/types`                                                  |
| `src/bot/ai/`         | HTTP chat completions, агенты                                         | `client.ts`, `config.ts`, `execution_tracker.ts`, `mini_daily_plan.ts`, `types.ts` | `fetch` к LLM API                                                 |
| `prisma/`             | Схема и миграции SQLite                                               | `schema.prisma`, `migrations/`                                                     | —                                                                 |
|                       |                                                                       |                                                                                    |                                                                   |


---

## 3. DATA FLOW

Основной путь **входящего сообщения пользователя**:

```
Telegram → Telegraf (polling) → глобальный try/catch middleware (src/bot/index.ts)
  → по типу апдейта:
     • command → handlers/start.ts (/start, /reset, /status)
     • callback_query → handlers/callback.ts (префиксы onboarding_, decision_, vision_, goals_, plan_)
     • text → handlers/text.ts (маршрут по UserFSMState и OnboardingSubstate)
     • прочие message → handlers/nonText.ts (повтор последнего HELLO-сообщения)
  → при необходимости: StateManager (Redis | memory) — get/set FSM
  → при необходимости: getPrismaClientAsync / репозитории — чтение/запись User, Cycle, Week, Day, WeekAction, ActionCompletion
  → при необходимости: sendChatCompletion (LLM) — Vision/Goals/Plan, Mini Daily Plan, Execution Tracker
  → ctx.reply / answerCbQuery → Telegram
```

Упрощённо: **Telegraf → handler → (Redis state) → (Prisma) → (LLM) → ответ пользователю**.

---

## 4. KEY ENTITIES

Данные из `prisma/schema.prisma` (SQLite):


| Сущность           | Назначение                      | Ключевые поля                                                              |
| ------------------ | ------------------------------- | -------------------------------------------------------------------------- |
| `User`             | Пользователь Telegram           | `telegramId`, `fsmState`, `vision`, legacy `goals`/`plan`                  |
| `Cycle`            | 12-недельный цикл               | `userId`, `visionText`, `goalsText`, `planText`, `currentWeek`, `status`   |
| `Goal`             | Цель внутри цикла               | `cycleId`, `order`, `description`, `metric`, `targetValue`, `status`       |
| `Week`             | Неделя цикла                    | `cycleId`, `weekNumber`, `focus`, `rhythm`, `planText`, `score`, `status`  |
| `WeekAction`       | Действие в неделе               | `weekId`, `order`, `description`, `when`, `metric`                         |
| `Day`              | День недели (календарный)       | `weekId`, `dayNumber`, `date`, `dailyPlanText`, `checkinText`, `completed` |
| `ActionCompletion` | Факт выполнения действия в день | `actionId`, `dayId`, `status`, `note`                                      |


Программные типы FSM: `UserFSMState`, `OnboardingSubstate`, `UserState` — в `src/bot/state/types.ts`.

---

## 5. AGENT ARCHITECTURE

Все агенты — это вызовы **одного** HTTP API (`sendChatCompletion`) с разными системными промптами и постобработкой ответа.


| Компонент         | Файл                                                 | Зона ответственности                                                                         |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Vision-диалог     | `src/bot/onboarding/vision.ts` + `prompts/vision.ts` | Сбор Vision в STATE_ONBOARDING / VISION                                                      |
| Goals-диалог      | `goals.ts` + `prompts/goals.ts`                      | Цели SMART                                                                                   |
| Plan-диалог       | `plan.ts` + `prompts/plan.ts`                        | 12-недельный план                                                                            |
| Mini Daily Plan   | `src/bot/ai/mini_daily_plan.ts`                      | Текст плана на день при переходе в ACTIVE (и связанные сценарии в callback)                  |
| Execution Tracker | `src/bot/ai/execution_tracker.ts`                    | В STATE_ACTIVE: JSON-ответ — какие `WeekAction` отмечены выполненными по тексту пользователя |


Взаимодействие: хендлеры и `callback.ts` вызывают модули онбординга/AI; состояние диалога хранится в **Redis/memory** (`UserState`), персистентность целей/недель/дней — в **Prisma**.

---

## 6. EXTERNAL INTEGRATIONS

**Telegram Bot API**

- Подключение: `new Telegraf(config.telegramBotToken)` в `src/index.ts`, long polling `bot.launch()`.
- Хендлеры: `src/bot/index.ts` регистрирует порядок — `start` → `callback` → `text` → `nonText`.
- Команды: `/start`, `/reset`, `/status` в `src/bot/handlers/start.ts`.
- Callback: `src/bot/handlers/callback.ts` — маршрутизация по префиксам строки `callback_data`.

**БД**

- Тип: SQLite (URL из `DATABASE_URL`). ORM: Prisma. Клиент: `src/database/client.ts` (`getPrismaClientAsync`, при отсутствии URL — degraded mode без БД).
- Операции разнесены по `src/database/repositories/*.repository.ts` (user, cycle, week, goals, action, execution, fsm).

**LLM (OpenAI-compatible)**

- Конфиг: `src/bot/ai/config.ts` — `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`.
- Клиент: `src/bot/ai/client.ts` — `POST .../chat/completions`.

**Redis**

- Опционально `REDIS_URL`; при ошибке подключения — `InMemoryStateManager` (`src/bot/state/index.ts`).

**Docker**

- `docker-compose.yml`: сервисы `bot` и `redis`, том `./data` для SQLite.

---

## 7. KNOWN COMPLEXITY ZONES

- `**src/bot/handlers/callback.ts`** — большой файл, много импортов (state, onboarding, decision, DB, AI, debounce). Меняется при любом новом шаге онбординга или кнопках.
- `**src/bot/state/index.ts`** — монолит FSM + legacy-экспорты (`setLastMessage` и т.д.); высокая связность с хендлерами.
- `**src/database/client.ts**` — единая точка входа в Prisma и barrel-реэкспорт репозиториев; изменения схемы трогают репозитории и места вызова.
- **Технический долг (по коду):** legacy поля в `User` и `UserState`; комментарии о deprecated API в state; смешение строковых статусов/FSM в БД и enum в коде.

---

## 8. CHANGE GUIDE


| Задача                                                   | Файлы для изменения                                                                                                                                                              | Файлы не трогать (если не нужно явно)                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Добавить новую команду бота                              | `src/bot/handlers/start.ts` или новый модуль в `src/bot/handlers/` + регистрация в `src/bot/index.ts`                                                                            | `prisma/schema.prisma` (если команда не требует данных)             |
| Изменить логику агента (ответы LLM)                      | `src/bot/ai/execution_tracker.ts` или `mini_daily_plan.ts`; промпты Vision/Goals/Plan — `src/bot/onboarding/prompts/*.ts` и соответствующие `vision.ts` / `goals.ts` / `plan.ts` | `src/bot/handlers/nonText.ts`                                       |
| Добавить поле в БД                                       | `prisma/schema.prisma`, новая миграция в `prisma/migrations/`, затем репозиторий в `src/database/repositories/`, при необходимости вызовы из `src/database/client.ts`            | `src/config/index.ts` (если поле не из env)                         |
| Изменить онбординг (тексты HELLO, кнопки, порядок шагов) | `src/bot/onboarding/index.ts` (`ONBOARDING_MESSAGES`), `src/bot/handlers/callback.ts` (ветки `onboarding_`*, переходы), `src/bot/state/types.ts` при новых подсостояниях         | `src/bot/ai/config.ts`                                              |
| Изменить экран «решение» (DECISION)                      | `src/bot/decision/index.ts`, колбэки в `src/bot/handlers/callback.ts` (`handleDecisionCallback`)                                                                                 | Репозитории `week` / `action`, если не меняется переход в онбординг |
| Правила FSM / что хранится в сессии                      | `src/bot/state/types.ts`, `src/bot/state/index.ts`                                                                                                                               | —                                                                   |
| Трекинг выполнения дневных действий                      | `src/bot/handlers/text.ts` (ветка `STATE_ACTIVE`), `src/bot/ai/execution_tracker.ts`, `src/database/repositories/action.repository.ts`, `execution.repository.ts`                | `src/bot/onboarding/`                                               |


---

*Документ сгенерирован по состоянию кода репозитория; пути относительно корня проекта (`oc-dev/`).*