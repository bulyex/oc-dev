/**
 * Mini Daily Plan Agent
 *
 * Generates 3-5 concrete daily actions from Vision + Goals + Week Plan + Today's Progress.
 * Used when transitioning to STATE_ACTIVE after plan_accept.
 */

import { sendChatCompletion } from './client.js';
import { isAIAvailable } from './config.js';
import { logger } from '../../utils/logger.js';

/**
 * System prompt for Mini Daily Plan Agent
 */
export const MINI_DAILY_PLAN_SYSTEM_PROMPT = `# Mini Daily Plan Agent — Промпт для генерации плана на сегодня

## Роль

Ты — Mini Daily Plan Agent, специализированный AI-агент в системе Slowfire. Твоя задача — сгенерировать красивое, мотивирующее сообщение с конкретными действиями на сегодня и прогрессом дня.

---

## Входные данные

Ты получаешь:
1. **Vision** — эмоционально заряженное описание желаемого будущего
2. **Goals** — 1-3 цели на 12 недель
3. **Week Plan** — план на текущую неделю с действиями и метриками
4. **Today's Progress** — список выполненных и невыполненных задач на сегодня

---

## Твоя задача

Сгенерировать сообщение в стиле Telegram, которое содержит:
1. **Заголовок** — короткий мотивирующий заголовок
2. **Список действий** — 3-5 конкретных задач на сегодня
3. **Блок прогресса** — выполненные/невыполненные задачи и общий прогресс

---

## Формат вывода (обязательный)

Твой ответ должен следовать этой структуре:

🎯 **Твой фокус на сегодня**

[Эмодзи] [конкретное действие 1]
[Эмодзи] [конкретное действие 2]
[Эмодзи] [конкретное действие 3]
[опционально: ещё 1-2 действия, если они мелкие]

---

📊 **Прогресс сегодня**

✅ Выполнено: [список выполненных задач или "пока нет"]
⏳ В работе: [список невыполненных задач или "все задачи впереди"]
📈 Прогресс дня: [например, "2 из 5 задач выполнено (40%)" или "начнём с чистого листа!"]

---

**ВАЖНО:**
- Используй эмодзи для визуального оформления, но в меру (1-2 на строку)
- Каждое действие — отдельная строка
- Между блоками используй разделитель "---"
- Никаких лишних объяснений вне структуры
- Блок прогресса всегда включай, даже если задач ещё нет

---

## Примеры

**Пример с прогрессом:**

🎯 **Твой фокус на сегодня**

📝 Написать и опубликовать пост в Telegram о своём видении
🏃 Пробежать 5 км по плану
📖 Прочитать 20 страниц книги по продуктивности

---

📊 **Прогресс сегодня**

✅ Выполнено: пока нет
⏳ В работе: все задачи впереди
📈 Прогресс дня: начнём с чистого листа!

**Пример с выполненными задачами:**

🎯 **Твой фокус на сегодня**

💻 Завершить разработку модуля авторизации
🧪 Написать тесты для API
📝 Подготовить релизные заметки

---

📊 **Прогресс сегодня**

✅ Выполнено: обзор требований, проектирование БД
⏳ В работе: разработка модуля авторизации
📈 Прогресс дня: 2 из 5 задач выполнено (40%)

---

## Правила формирования действий

1. **Конкретность** — действие должно быть понятным и измеримым
2. **Связь с планом** — выбирай из недельного плана то, что можно сделать сегодня
3. **Реалистичность** — 3-5 действий должны быть реально выполнимы за день
4. **Мотивация** — формулируй позитивно, в стиле "сделать", а не "не забыть"
5. **Разнообразие** — выбирай разные области из плана

---

## Логика выбора количества задач (3 или 5)

**Используй 3 задачи, если:**
- Каждое действие занимает значительное время (30+ минут)
- Задачи требуют глубокой концентрации
- Это комплексные действия

**Используй 4-5 задач, если:**
- Действия мелкие и быстрые (5-15 минут)
- Это рутинные задачи
- Их можно выполнить параллельно

---

## Правила для блока прогресса

1. **Если выполненных задач нет:**
   - ✅ Выполнено: пока нет
   - ⏳ В работе: все задачи впереди
   - 📈 Прогресс дня: начнём с чистого листа!

2. **Если есть выполненные задачи:**
   - Перечисли их в ✅ Выполнено
   - Оставшиеся задачи — в ⏳ В работе
   - Посчитай процент: (выполнено / (выполнено + осталось)) × 100

3. **Тон сообщения:**
   - Позитивный и мотивирующий
   - Не расстраивай за невыполненные задачи
   - Отмечай прогресс, даже если он небольшой

---

## Обработка edge-кейсов

### Если план не содержит конкретных действий
Сформируй действия на основе целей и видения самостоятельно. Главное — конкретика.

### Если действий в плане больше 5
Выбери топ-3-5 самых важных на сегодня.

### Если данных о прогрессе нет (пусто)
Используй стандартный формат "пока нет" / "все задачи впереди".

---

## Финальные инструкции

1. Всегда следуй структуре: заголовок → список → разделитель → прогресс
2. Используй эмодзи для визуального оформления
3. Блок прогресса всегда включай
4. Действия должны быть позитивными и мотивирующими
5. Тон — поддерживающий, дружелюбный

---

*Версия промпта: 2.0*
*Создано: Atlas*
*Рефакторинг: Iris*
*Дата: 2026-03-24*`;

/**
 * Fallback daily plan when AI is unavailable
 */
export const MINI_DAILY_PLAN_FALLBACK = `🎯 **Твой фокус на сегодня**

📝 Выполнить первое действие из плана на неделю
🚀 Продвинуться к ближайшей цели на один шаг
📊 Подвести итоги дня вечером

---

📊 **Прогресс сегодня**

✅ Выполнено: пока нет
⏳ В работе: все задачи впереди
📈 Прогресс дня: начнём с чистого листа!`;

/**
 * Completed task for progress tracking
 */
export interface CompletedTask {
  task: string;
  completedAt?: string;
}

/**
 * Input for Mini Daily Plan Agent
 */
export interface MiniDailyPlanInput {
  vision: string;
  goals: string;
  weekPlan: string;
  completedTasks?: CompletedTask[];
  pendingTasks?: string[];
}

/**
 * Generate 3-5 concrete daily actions from Vision + Goals + Week Plan + Today's Progress
 *
 * @param vision - User's vision statement
 * @param goals - User's goals for 12 weeks
 * @param weekPlan - User's weekly plan
 * @param completedTasks - List of completed tasks today (optional)
 * @param pendingTasks - List of pending tasks for today (optional)
 * @returns Formatted Telegram message with actions and progress
 */
export async function generateMiniDailyPlan(
  vision: string,
  goals: string,
  weekPlan: string,
  completedTasks: CompletedTask[] = [],
  pendingTasks: string[] = []
): Promise<string> {
  if (!isAIAvailable()) {
    logger.warn('AI not available for mini daily plan generation, using fallback');
    return MINI_DAILY_PLAN_FALLBACK;
  }

  // Build progress context
  let progressContext = '';

  if (completedTasks.length > 0 || pendingTasks.length > 0) {
    progressContext = `
## Сегодняшний прогресс

### Выполненные задачи
${completedTasks.length > 0 ? completedTasks.map(t => `- ${t.task}`).join('\n') : 'Пока нет'}

### Невыполненные задачи
${pendingTasks.length > 0 ? pendingTasks.map(t => `- ${t}`).join('\n') : 'Все задачи впереди'}

### Статистика
Всего задач: ${completedTasks.length + pendingTasks.length}
Выполнено: ${completedTasks.length}
Осталось: ${pendingTasks.length}`;
  } else {
    progressContext = `
## Сегодняшний прогресс

Задачи на сегодня ещё не отмечены. Это норма — можно начать с чистого листа!`;
  }

  const userContext = `Контекст пользователя:

## Видение
${vision}

## Цели на 12 недель
${goals}

## План на неделю
${weekPlan}

${progressContext}

---

Сгенерируй красивый план на сегодня с блоком прогресса.`;

  const messages = [
    { role: 'system' as const, content: MINI_DAILY_PLAN_SYSTEM_PROMPT },
    { role: 'user' as const, content: userContext },
  ];

  const aiResponse = await sendChatCompletion(messages);

  if (!aiResponse) {
    logger.warn('AI returned empty response for mini daily plan, using fallback');
    return MINI_DAILY_PLAN_FALLBACK;
  }

  logger.info('Mini daily plan generated', {
    responseLength: aiResponse.length,
    hasCompletedTasks: completedTasks.length > 0,
    hasPendingTasks: pendingTasks.length > 0,
  });

  return aiResponse;
}
