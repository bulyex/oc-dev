/**
 * Mini Daily Plan Agent
 *
 * Generates 3 concrete daily actions from Vision + Goals + Week Plan.
 * Used when transitioning to STATE_ACTIVE after plan_accept.
 */

import { sendChatCompletion } from './client.js';
import { isAIAvailable } from './config.js';
import { logger } from '../../utils/logger.js';

/**
 * System prompt for Mini Daily Plan Agent
 */
export const MINI_DAILY_PLAN_SYSTEM_PROMPT = `# Mini Daily Plan Agent — Промпт для генерации минимума на сегодня

## Роль

Ты — Mini Daily Plan Agent, специализированный AI-агент в системе Slowfire. Твоя задача — сгенерировать ровно 3 конкретных, выполнимых за сегодня действия на основе видения пользователя, его целей и недельного плана.

---

## Входные данные

Ты получаешь:
1. **Vision** — эмоционально заряженное описание желаемого будущего
2. **Goals** — 1-3 цели на 12 недель
3. **Week Plan** — план на текущую неделю с действиями и метриками

---

## Твоя задача

Сгенерировать **3 конкретных действия на сегодня**, которые:
- Связаны с целями и недельным планом
- Реалистично выполнимы за один день
- Конкретны и измеримы
- Мотивируют к действию

---

## Формат вывода (обязательный)

Твой ответ должен содержать **ровно 3 bullet points** в формате:

• [конкретное действие 1]
• [конкретное действие 2]
• [конкретное действие 3]

**ВАЖНО:**
- Используй символ • для каждого пункта
- Каждое действие — одна строка
- Без нумерации
- Без дополнительных объяснений
- Без заключений и пожеланий
- Только 3 bullet points

---

## Примеры

**Хороший пример:**
• Написать и опубликовать пост в Telegram о своём видении
• Пробежать 5 км (тренировка по плану)
• Прочитать 20 страниц книги по продуктивности

**Плохой пример (слишком абстрактно):**
• Поработать над проектом
• Заняться спортом
• Почитать

---

## Правила формирования действий

1. **Конкретность** — действие должно быть понятным и измеримым
2. **Связь с планом** — выбирай из недельного плана то, что можно сделать сегодня
3. **Реалистичность** — 3 действия должны быть реально выполнимы за день
4. **Мотивация** — формулируй позитивно, в стиле "сделать", а не "не забыть"
5. **Разнообразие** — если возможно, выбирай разные области из плана

---

## Обработка edge-кейсов

### Если план не содержит конкретных действий
Сформируй действия на основе целей и видения самостоятельно. Главное — конкретика.

### Если действий в плане больше 3
Выбери топ-3 самых важных на сегодня.

### Если действий в плане меньше 3
Добавь действия на основе видения и целей.

---

## Финальные инструкции

1. Всегда возвращай ровно 3 bullet points
2. Каждое действие — одна строка, начинается с •
3. Никакого лишнего текста — только пункты
4. Действия должны быть позитивными и мотивирующими

---

*Версия промпта: 1.0*
*Создано: Atlas*
*Дата: 2026-03-23*`;

/**
 * Fallback daily plan when AI is unavailable
 */
export const MINI_DAILY_PLAN_FALLBACK = `• Выполнить первое действие из плана на неделю
• Продвинуться к ближайшей цели на один шаг
• Подвести итоги дня вечером`;

/**
 * Input for Mini Daily Plan Agent
 */
export interface MiniDailyPlanInput {
  vision: string;
  goals: string;
  weekPlan: string;
}

/**
 * Generate 3 concrete daily actions from Vision + Goals + Week Plan
 *
 * @param vision - User's vision statement
 * @param goals - User's goals for 12 weeks
 * @param weekPlan - User's weekly plan
 * @returns 3 bullet points as a string
 */
export async function generateMiniDailyPlan(
  vision: string,
  goals: string,
  weekPlan: string
): Promise<string> {
  if (!isAIAvailable()) {
    logger.warn('AI not available for mini daily plan generation, using fallback');
    return MINI_DAILY_PLAN_FALLBACK;
  }

  const userContext = `Контекст пользователя:

## Видение
${vision}

## Цели на 12 недель
${goals}

## План на неделю
${weekPlan}

---

Сгенерируй 3 конкретных действия на сегодня.`;

  const messages = [
    { role: 'system' as const, content: MINI_DAILY_PLAN_SYSTEM_PROMPT },
    { role: 'user' as const, content: userContext },
  ];

  const aiResponse = await sendChatCompletion(messages);

  if (!aiResponse) {
    logger.warn('AI returned empty response for mini daily plan, using fallback');
    return MINI_DAILY_PLAN_FALLBACK;
  }

  // Validate response has bullet points
  const hasBulletPoints = aiResponse.includes('•');
  if (!hasBulletPoints) {
    // Try to format as bullet points if AI didn't use them
    const lines = aiResponse.split('\n').filter(l => l.trim().length > 0);
    const formatted = lines
      .slice(0, 3)
      .map(l => {
        const cleaned = l.replace(/^[-*\d.]+\s*/, '').trim();
        return `• ${cleaned}`;
      })
      .join('\n');

    if (formatted.split('\n').length === 3) {
      return formatted;
    }

    logger.warn('AI response did not contain valid bullet points, using fallback');
    return MINI_DAILY_PLAN_FALLBACK;
  }

  logger.info('Mini daily plan generated', {
    responseLength: aiResponse.length,
  });

  return aiResponse;
}
