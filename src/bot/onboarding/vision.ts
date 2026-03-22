/**
 * Vision Module
 * 
 * Handles Vision phase in STATE_ONBOARDING:
 * - Welcome message with detailed explanation
 * - AI-assisted Vision formulation (no message limit)
 * - Two permanent buttons: "Начать заново", "Дай пример"
 * - "Готово!" button appears after draft is proposed
 * - Graceful degradation without API key
 */

import type { InlineKeyboardMarkup } from 'telegraf/types';
import { sendChatCompletion } from '../ai/client.js';
import { isAIAvailable } from '../ai/config.js';
import { VISION_SYSTEM_PROMPT } from './prompts/vision.js';
import {
  incrementVisionMessageCount,
  addVisionChatMessage,
  getVisionState,
  setDraftProposed,
} from '../state/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Welcome message for Vision phase (detailed)
 */
export const VISION_WELCOME_MESSAGE = `В этой работе мы будем опираться на понятие «видение».

Видение — это чёткое, конкретное описание того, кем вы становитесь и как выглядит ваша жизнь через ближайшие 3–6 месяцев. Оно должно быть достаточно детальным, чтобы вы могли «увидеть» этот результат и соотнести с ним свои ежедневные действия.

Хорошее видение отвечает на главный вопрос: "ради чего вы действуете прямо сейчас?". Оно задаёт направление, помогает принимать решения и отсеивать лишнее.

Как ты видишь свое идеальное состояние через 3 месяца? 
Если трудно, напиши, я помогу.`;

/**
 * Fallback response when AI is not available
 */
export const VISION_FALLBACK_RESPONSE = `Спасибо! Я пока не могу проверить твой Vision (технические работы), но мы сохранили его. Продолжим позже.`;

/**
 * Keyboard options
 */
export interface VisionKeyboardOptions {
  showDone: boolean;
}

/**
 * Create Vision keyboard with optional "Готово!" button
 */
export function createVisionKeyboard(options: VisionKeyboardOptions): InlineKeyboardMarkup {
  const buttons: Array<{ text: string; callback_data: string }> = [
    { text: '🔄 Начать заново', callback_data: 'vision_reset' },
    { text: '📝 Дай пример', callback_data: 'vision_example' },
  ];
  if (options.showDone) {
    buttons.push({ text: '✅ Готово!', callback_data: 'vision_done' });
  }
  return { inline_keyboard: [buttons] };
}

/**
 * Determine if AI response contains a Vision draft proposal
 */
function isDraftProposed(aiResponse: string): boolean {
  const draftKeywords = [
    'вот черновик',
    'вот пример черновика',
    'вот вариант',
    'вот примерный черновик',
    'вот твой черновик',
    'вот что получается',
    'вот как может выглядеть',
    'предлагаю такой вариант',
  ];
  const lowerResponse = aiResponse.toLowerCase();
  return draftKeywords.some(keyword => lowerResponse.includes(keyword));
}

/**
 * Extract final Vision from chat history (last assistant message with draft)
 */
function extractFinalVision(chatHistory: { role: 'user' | 'assistant'; content: string }[]): string | null {
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const msg = chatHistory[i];
    if (msg.role === 'assistant' && isDraftProposed(msg.content)) {
      return msg.content;
    }
  }
  return chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].content : null;
}

/**
 * Process user's Vision message (no message limit)
 * 
 * @param userId - Telegram user ID
 * @param userMessage - User's message text
 * @returns Response, acceptance status, and draftProposed flag
 */
export async function processVisionMessage(
  userId: number,
  userMessage: string
): Promise<{
  response: string;
  isAccepted: boolean;
  draftProposed: boolean;
}> {
  // Get current state
  const visionState = await getVisionState(userId);
  const chatHistory = visionState?.chatHistory || [];
  
  // Check if AI is available
  if (!isAIAvailable()) {
    logger.warn('AI not available, using fallback', { userId, hasKey: !!process.env.LLM_API_KEY });
    await addVisionChatMessage(userId, 'user', userMessage);
    await addVisionChatMessage(userId, 'assistant', VISION_FALLBACK_RESPONSE);
    return {
      response: VISION_FALLBACK_RESPONSE,
      isAccepted: false,
      draftProposed: visionState?.draftProposed || false,
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
    await addVisionChatMessage(userId, 'assistant', VISION_FALLBACK_RESPONSE);
    return {
      response: VISION_FALLBACK_RESPONSE,
      isAccepted: false,
      draftProposed: visionState?.draftProposed || false,
    };
  }
  
  // Save chat history
  await addVisionChatMessage(userId, 'user', userMessage);
  await addVisionChatMessage(userId, 'assistant', aiResponse);
  await incrementVisionMessageCount(userId);
  
  // Check if draft was proposed
  const draftProposed = isDraftProposed(aiResponse);
  if (draftProposed) {
    await setDraftProposed(userId, true);
  }
  
  // No acceptance check anymore - user must explicitly click "Готово!"
  return {
    response: aiResponse,
    isAccepted: false,
    draftProposed,
  };
}

// Re-export extractFinalVision for use in callback handler
export { extractFinalVision };
