/**
 * Vision Module
 * 
 * Handles Vision phase in STATE_ONBOARDING:
 * - Welcome message
 * - AI validation of user messages
 * - Message count limit (5)
 * - Graceful degradation without API key
 */

import type { InlineKeyboardMarkup } from 'telegraf/types';
import { sendChatCompletion } from '../ai/client.js';
import { isAIAvailable } from '../ai/config.js';
import { VISION_SYSTEM_PROMPT, isVisionAccepted } from './prompts/vision.js';
import {
  incrementVisionMessageCount,
  addVisionChatMessage,
  saveVision,
  getVisionState,
} from '../state/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Welcome message for Vision phase
 */
export const VISION_WELCOME_MESSAGE = `Тебе нужно прислать мне свой Vision — представь, как будет выглядеть твоя жизнь через 12 недель, если ты добьёшься своих целей. Опиши это своими словами.`;

/**
 * Fallback response when AI is not available
 */
export const VISION_FALLBACK_RESPONSE = `Спасибо! Я пока не могу проверить твой Vision (технические работы), но мы сохранили его. Продолжим позже.`;

/**
 * Timeout response (5 messages exceeded)
 */
export const VISION_TIMEOUT_MESSAGE = `Вижу, тебе сложно сформулировать вижн. Ничего страшного, это нормально!`;

/**
 * Keyboard for timeout scenario
 */
export function createVisionTimeoutKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: 'Почитать про вижн', callback_data: 'vision_read' }],
      [{ text: 'Попробовать ещё раз', callback_data: 'vision_retry' }],
      [{ text: 'Предложи свой вариант', callback_data: 'vision_suggest' }],
    ],
  };
}

/**
 * Process user's Vision message
 * 
 * @param userId - Telegram user ID
 * @param userMessage - User's message text
 * @returns Response, acceptance status, and whether to show timeout keyboard
 */
export async function processVisionMessage(
  userId: number,
  userMessage: string
): Promise<{
  response: string;
  isAccepted: boolean;
  showTimeoutKeyboard: boolean;
}> {
  // Get current state
  const visionState = await getVisionState(userId);
  const currentCount = visionState?.messageCount || 0;
  const chatHistory = visionState?.chatHistory || [];
  
  // Check if already exceeded limit (should not happen, but safety check)
  if (currentCount >= 5) {
    return {
      response: VISION_TIMEOUT_MESSAGE,
      isAccepted: false,
      showTimeoutKeyboard: true,
    };
  }
  
  // Increment message count
  const newCount = await incrementVisionMessageCount(userId);
  
  // Check if this is the 5th message (limit reached)
  if (newCount >= 5) {
    // Don't call AI, show timeout message
    logger.info('Vision timeout reached', { userId, messageCount: newCount });
    return {
      response: VISION_TIMEOUT_MESSAGE,
      isAccepted: false,
      showTimeoutKeyboard: true,
    };
  }
  
  // Check if AI is available
  if (!isAIAvailable()) {
    logger.warn('AI not available, using fallback', { userId, hasKey: !!process.env.LLM_API_KEY });
    // Graceful degradation
    await addVisionChatMessage(userId, 'user', userMessage);
    await addVisionChatMessage(userId, 'assistant', VISION_FALLBACK_RESPONSE);
    
    // In fallback mode, accept any message after 2nd attempt
    const isAccepted = newCount >= 2;
    if (isAccepted) {
      await saveVision(userId, userMessage);
      logger.info('Vision accepted (fallback mode)', { userId, messageCount: newCount });
    }
    
    return {
      response: VISION_FALLBACK_RESPONSE,
      isAccepted,
      showTimeoutKeyboard: false,
    };
  }
  
  // Build messages for AI
  const messages = [
    { role: 'system' as const, content: VISION_SYSTEM_PROMPT },
    ...chatHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];
  
  // Call AI
  const aiResponse = await sendChatCompletion(messages);
  
  if (!aiResponse) {
    // AI call failed, use fallback
    await addVisionChatMessage(userId, 'user', userMessage);
    
    return {
      response: VISION_FALLBACK_RESPONSE,
      isAccepted: false,
      showTimeoutKeyboard: false,
    };
  }
  
  // Save chat history
  await addVisionChatMessage(userId, 'user', userMessage);
  await addVisionChatMessage(userId, 'assistant', aiResponse);
  
  // Check if Vision is accepted
  const isAccepted = isVisionAccepted(aiResponse);
  
  if (isAccepted) {
    await saveVision(userId, userMessage);
    logger.info('Vision accepted', { userId, messageCount: newCount });
  }
  
  return {
    response: aiResponse,
    isAccepted,
    showTimeoutKeyboard: false,
  };
}
