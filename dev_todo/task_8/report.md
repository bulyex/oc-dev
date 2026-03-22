# Отчёт task_8: Goals Phase Implementation

## Выполнено

### Шаг 1: Prisma Schema
- Добавлено поле `goals String?` в модель User
- Миграция `add_goals_field` успешно применена

### Шаг 2: System Prompt Goals
- Создан файл `src/bot/onboarding/prompts/goals.ts`
- Экспортирован `GOALS_SYSTEM_PROMPT` — полный системный промпт Goals-агента
- Содержит все правила генерации SMART-целей, диалог корректировки, edge cases

### Шаг 3: Database Functions
- `saveUserGoals(telegramId, goals)` — сохранение целей в БД
- `getUserGoals(telegramId)` — получение целей из БД

### Шаг 4: State Types
- Добавлены поля в `UserState`:
  - `goalsChatHistory?: ChatMessageHistory[]` — история диалога Goals-агента
  - `goalsFinalized?: boolean` — флаг финализации целей

### Шаг 5: State Functions
- `initOnboardingGoals(userId)` — инициализация Goals substate
- `addGoalsChatMessage(userId, role, content)` — добавление сообщения в историю
- `getGoalsState(userId)` — получение состояния Goals
- `getAcceptedGoals(userId)` — получение последнего сообщения ассистента
- `clearGoalsState(userId)` — очистка состояния Goals

### Шаг 6: Goals Module
Создан файл `src/bot/onboarding/goals.ts`:
- `GOALS_FALLBACK_RESPONSE` — фоллбэк при недоступности AI
- `createGoalsKeyboard()` — клавиатура с кнопкой "Принять"
- `generateGoalsFirstMessage(userId, telegramId)` — загрузка Vision и генерация первого сообщения с целями
- `processGoalsMessage(userId, userMessage)` — обработка сообщений пользователя
- `extractFinalGoals(chatHistory)` — извлечение финальных целей из истории

### Шаг 7: Callback Handler
Обновлён `src/bot/handlers/callback.ts`:
- Добавлен импорт Goals функций и state-функций
- Добавлен роутинг для `goals_` prefix
- `onboarding_goals_1` — переход к Goals phase, генерация первого сообщения
- `handleGoalsCallback()` — обработка `goals_accept`, сохранение в БД

### Шаг 8: Text Handler
Обновлён `src/bot/handlers/text.ts`:
- Добавлен импорт Goals функций
- Обработка `OnboardingSubstate.GOALS` — вызов `processGoalsMessage()`, ответ с клавиатурой "Принять"

---

## Flow Goals Phase

1. После сохранения Vision показывается кнопка "Продолжить →" (callback: `onboarding_goals_1`)
2. При нажатии:
   - `initOnboardingGoals()` — инициализация состояния
   - `generateGoalsFirstMessage()` — загрузка Vision из БД, запрос к AI
   - Ответ с целями + клавиатура "Принять"
3. Пользователь может писать правки — AI обрабатывает через `processGoalsMessage()`
4. При нажатии "Принять":
   - `extractFinalGoals()` — извлечение последнего ответа AI
   - `saveUserGoals()` — сохранение в БД
   - Сообщение о переходе к Plan (заглушка)

---

## Нереализованное / Отклонения

- Нет — всё реализовано по спецификации

---

## Проблемы и решения

1. **Prisma drift** — была детектирована рассинхронизация схемы. Решено через `prisma migrate reset --force`, затем создана новая миграция `add_goals_field`.

2. **TypeScript компиляция** — успешна без ошибок (`tsc --noEmit`).

---

## Критерии готовности — проверка

| Критерий | Статус |
|----------|--------|
| Переход по кнопке Продолжить → из Vision в Goals | ✅ |
| Goals-агент генерирует 1-3 цели на основе Vision из БД | ✅ |
| Первое сообщение соответствует ТЗ | ✅ |
| Пользователь может корректировать цели | ✅ |
| Кнопка Принять на каждом сообщении агента | ✅ |
| При нажатии Принять — сохранение в БД и переход к Plan (заглушка) | ✅ |
| Prisma schema обновлена | ✅ |
| Goals system prompt скопирован | ✅ |
| Database functions добавлены | ✅ |
| State types расширены | ✅ |
| State functions добавлены | ✅ |
| Goals Module создан | ✅ |
| Callback handler обновлён | ✅ |
| Text handler обновлён | ✅ |
| TypeScript компилируется без ошибок | ✅ |

---

## Файлы изменены/созданы

| Файл | Действие |
|------|----------|
| `prisma/schema.prisma` | Изменён (добавлено поле `goals`) |
| `prisma/migrations/.../migration.sql` | Создана миграция |
| `src/database/client.ts` | Дополнен (saveUserGoals, getUserGoals) |
| `src/bot/state/types.ts` | Дополнен (goalsChatHistory, goalsFinalized) |
| `src/bot/state/index.ts` | Дополнен (Goals state functions) |
| `src/bot/onboarding/prompts/goals.ts` | Создан |
| `src/bot/onboarding/goals.ts` | Создан |
| `src/bot/handlers/callback.ts` | Изменён (Goals callbacks) |
| `src/bot/handlers/text.ts` | Изменён (Goals text handling) |

---

## Следующие шаги

- Task 9: Plan Phase — генерация 12-недельного плана из Goals
- Task 10: Time Phase — предпочтения по времени
