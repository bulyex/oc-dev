/**
 * Plan Module
 *
 * Handles Plan phase in STATE_ONBOARDING:
 * - Generates 12-week plan from Vision and Goals
 * - AI-assisted plan refinement dialog (3-6 messages)
 * - "Принять план" button on every message
 * - Saves plan to DB, transitions to Time (placeholder)
 */

import type { InlineKeyboardMarkup } from 'telegraf/types';
import { sendChatCompletion } from '../ai/client.js';
import { isAIAvailable } from '../ai/config.js';
import { PLAN_SYSTEM_PROMPT } from './prompts/plan.js';
import { addPlanChatMessage, getPlanState } from '../state/index.js';
import { getUserVision, getUserGoals } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

/**
 * Fallback response when AI is not available
 */
export const PLAN_FALLBACK_RESPONSE = `На основе твоего видения и целей предлагаю план на 12 недель:

## План на 12 недель

### Ежедневные действия
- [AI недоступен — сформулируйте действия самостоятельно]

### Регулярные действия
- [AI недоступен]

### Специфика по неделям
- Недели 1-2: Адаптация
- Неделя 6: Промежуточный обзор
- Недели 11-12: Финальный рывок

---

Напишите, если хотите что-то поправить.`;

/**
 * Create Plan keyboard with "Принять план" button
 */
export function createPlanKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: '✅ Принять план', callback_data: 'plan_accept' }]],
  };
}

/**
 * Generate first Plan message from Vision and Goals
 *
 * @param userId - Telegram user ID
 * @param telegramId - Telegram ID as string
 * @returns First message and generation status
 */
export async function generatePlanFirstMessage(
  userId: number,
  telegramId: string
): Promise<{ firstMessage: string; initialPlanGenerated: boolean }> {
  const vision = await getUserVision(telegramId);
  const goals = await getUserGoals(telegramId);

  if (!vision || !goals) {
    return {
      firstMessage: 'Не удалось загрузить видение или цели. Попробуй /start заново.',
      initialPlanGenerated: false,
    };
  }

  // Build context JSON for Plan agent
  const goalsArray = goals
    .split('\n')
    .map(g => g.trim())
    .filter(g => g.length > 0);

  const contextJson = JSON.stringify({
    vision,
    goals: goalsArray,
    user_context: {
      timezone: 'UTC+3',
    },
  }, null, 2);

  const userContext = `Контекст пользователя:\n\`\`\`json\n${contextJson}\n\`\`\``;

  // Check if AI is available
  if (!isAIAvailable()) {
    logger.warn('AI not available for plan generation', { userId });
    await addPlanChatMessage(userId, 'user', userContext);
    await addPlanChatMessage(userId, 'assistant', PLAN_FALLBACK_RESPONSE);
    return {
      firstMessage: `На основе твоего видения и целей я предлагаю тебе следующий план действий на 3 месяца. Напиши, если хочешь что-то поправить.\n\n${PLAN_FALLBACK_RESPONSE}`,
      initialPlanGenerated: true,
    };
  }

  const messages = [
    { role: 'system' as const, content: PLAN_SYSTEM_PROMPT },
    { role: 'user' as const, content: userContext },
  ];

  const aiResponse = await sendChatCompletion(messages);

  if (!aiResponse) {
    await addPlanChatMessage(userId, 'user', userContext);
    await addPlanChatMessage(userId, 'assistant', PLAN_FALLBACK_RESPONSE);
    return {
      firstMessage: `На основе твоего видения и целей я предлагаю тебе следующий план действий на 3 месяца. Напиши, если хочешь что-то поправить.\n\n${PLAN_FALLBACK_RESPONSE}`,
      initialPlanGenerated: true,
    };
  }

  // Save to chat history
  await addPlanChatMessage(userId, 'user', userContext);
  await addPlanChatMessage(userId, 'assistant', aiResponse);

  const firstMessage = `На основе твоего видения и целей я предлагаю тебе следующий план действий на 3 месяца. Напиши, если хочешь что-то поправить.\n\n${aiResponse}`;

  logger.info('Plan initial message generated', {
    userId,
    visionLength: vision.length,
    goalsLength: goals.length,
    responseLength: aiResponse.length,
  });

  return { firstMessage, initialPlanGenerated: true };
}

/**
 * Process user's Plan message
 *
 * @param userId - Telegram user ID
 * @param userMessage - User's message text
 * @returns AI response
 */
export async function processPlanMessage(
  userId: number,
  userMessage: string
): Promise<{ response: string }> {
  const planState = await getPlanState(userId);
  const chatHistory = planState?.chatHistory || [];

  if (!isAIAvailable()) {
    logger.warn('AI not available for plan processing', { userId });
    await addPlanChatMessage(userId, 'user', userMessage);
    await addPlanChatMessage(userId, 'assistant', PLAN_FALLBACK_RESPONSE);
    return { response: PLAN_FALLBACK_RESPONSE };
  }

  const messages = [
    { role: 'system' as const, content: PLAN_SYSTEM_PROMPT },
    ...chatHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const aiResponse = await sendChatCompletion(messages);

  if (!aiResponse) {
    await addPlanChatMessage(userId, 'user', userMessage);
    await addPlanChatMessage(userId, 'assistant', PLAN_FALLBACK_RESPONSE);
    return { response: PLAN_FALLBACK_RESPONSE };
  }

  await addPlanChatMessage(userId, 'user', userMessage);
  await addPlanChatMessage(userId, 'assistant', aiResponse);

  logger.info('Plan message processed', {
    userId,
    userMessageLength: userMessage.length,
    responseLength: aiResponse.length,
  });

  return { response: aiResponse };
}

/**
 * Extract final Plan from chat history (last assistant message)
 */
export function extractFinalPlan(
  chatHistory: { role: 'user' | 'assistant'; content: string }[]
): string | null {
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === 'assistant') {
      return chatHistory[i].content;
    }
  }
  return null;
}
