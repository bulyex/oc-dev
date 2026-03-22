/**
 * Goals Module
 *
 * Handles Goals phase in STATE_ONBOARDING:
 * - Generates 1-3 SMART goals from Vision
 * - AI-assisted goal refinement dialog
 * - "Принять" button on every message
 * - Saves goals to DB, transitions to Plan
 */

import type { InlineKeyboardMarkup } from 'telegraf/types';
import { sendChatCompletion } from '../ai/client.js';
import { isAIAvailable } from '../ai/config.js';
import { GOALS_SYSTEM_PROMPT } from './prompts/goals.js';
import { addGoalsChatMessage, getGoalsState } from '../state/index.js';
import { getUserVision } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

/**
 * Fallback response when AI is not available
 */
export const GOALS_FALLBACK_RESPONSE = `На основе твоего видения предлагаю цели на 3 месяца:

• Цель 1: [AI недоступен — сформулируй цели самостоятельно]
• Цель 2: [AI недоступен]

Напиши, если хочешь что-то поправить.`;

/**
 * Create Goals keyboard with "Принять" button
 */
export function createGoalsKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: '✅ Принять', callback_data: 'goals_accept' }]],
  };
}

/**
 * Generate first Goals message from Vision
 *
 * @param userId - Telegram user ID
 * @param telegramId - Telegram ID as string
 * @returns First message and generation status
 */
export async function generateGoalsFirstMessage(
  userId: number,
  telegramId: string
): Promise<{ firstMessage: string; initialGoalsGenerated: boolean }> {
  const vision = await getUserVision(telegramId);
  if (!vision) {
    return {
      firstMessage: 'Не удалось загрузить видение. Попробуй /start заново.',
      initialGoalsGenerated: false,
    };
  }

  // Check if AI is available
  if (!isAIAvailable()) {
    logger.warn('AI not available for goals generation', { userId });
    await addGoalsChatMessage(userId, 'user', `Вот моё видение:\n\n${vision}`);
    await addGoalsChatMessage(userId, 'assistant', GOALS_FALLBACK_RESPONSE);
    return {
      firstMessage: `На основе твоего видения я предлагаю тебе следующие цели на 3 месяца. Напиши, если хочешь что-то поправить.\n\n${GOALS_FALLBACK_RESPONSE}`,
      initialGoalsGenerated: true,
    };
  }

  const messages = [
    { role: 'system' as const, content: GOALS_SYSTEM_PROMPT },
    { role: 'user' as const, content: `Вот моё видение:\n\n${vision}` },
  ];

  const aiResponse = await sendChatCompletion(messages);

  if (!aiResponse) {
    await addGoalsChatMessage(userId, 'user', `Вот моё видение:\n\n${vision}`);
    await addGoalsChatMessage(userId, 'assistant', GOALS_FALLBACK_RESPONSE);
    return {
      firstMessage: `На основе твоего видения я предлагаю тебе следующие цели на 3 месяца. Напиши, если хочешь что-то поправить.\n\n${GOALS_FALLBACK_RESPONSE}`,
      initialGoalsGenerated: true,
    };
  }

  // Save to chat history
  await addGoalsChatMessage(userId, 'user', `Вот моё видение:\n\n${vision}`);
  await addGoalsChatMessage(userId, 'assistant', aiResponse);

  const firstMessage = `На основе твоего видения я предлагаю тебе следующие цели на 3 месяца. Напиши, если хочешь что-то поправить.\n\n${aiResponse}`;

  logger.info('Goals initial message generated', {
    userId,
    visionLength: vision.length,
    responseLength: aiResponse.length,
  });

  return { firstMessage, initialGoalsGenerated: true };
}

/**
 * Process user's Goals message
 *
 * @param userId - Telegram user ID
 * @param userMessage - User's message text
 * @returns AI response
 */
export async function processGoalsMessage(
  userId: number,
  userMessage: string
): Promise<{ response: string }> {
  const goalsState = await getGoalsState(userId);
  const chatHistory = goalsState?.chatHistory || [];

  if (!isAIAvailable()) {
    logger.warn('AI not available for goals processing', { userId });
    await addGoalsChatMessage(userId, 'user', userMessage);
    await addGoalsChatMessage(userId, 'assistant', GOALS_FALLBACK_RESPONSE);
    return { response: GOALS_FALLBACK_RESPONSE };
  }

  const messages = [
    { role: 'system' as const, content: GOALS_SYSTEM_PROMPT },
    ...chatHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const aiResponse = await sendChatCompletion(messages);

  if (!aiResponse) {
    await addGoalsChatMessage(userId, 'user', userMessage);
    await addGoalsChatMessage(userId, 'assistant', GOALS_FALLBACK_RESPONSE);
    return { response: GOALS_FALLBACK_RESPONSE };
  }

  await addGoalsChatMessage(userId, 'user', userMessage);
  await addGoalsChatMessage(userId, 'assistant', aiResponse);

  logger.info('Goals message processed', {
    userId,
    userMessageLength: userMessage.length,
    responseLength: aiResponse.length,
  });

  return { response: aiResponse };
}

/**
 * Extract final Goals from chat history (last assistant message)
 */
export function extractFinalGoals(
  chatHistory: { role: 'user' | 'assistant'; content: string }[]
): string | null {
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === 'assistant') {
      return chatHistory[i].content;
    }
  }
  return null;
}
