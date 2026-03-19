import { InlineKeyboardMarkup } from 'telegraf/types';
import { DecisionMessageType } from '../state/types.js';

/**
 * Generate callback data for decision buttons
 * Format: decision_{messageType}_{timestamp}_{random}
 */
export function generateDecisionCallbackData(messageType: DecisionMessageType): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `decision_${messageType}_${timestamp}_${random}`;
}

/**
 * Parse decision callback data
 */
export function parseDecisionCallbackData(callbackData: string): {
  messageType: DecisionMessageType;
  timestamp: number;
} | null {
  const match = callbackData.match(/^decision_(\d+)_(\d+)_(\d+)$/);

  if (!match) {
    return null;
  }

  const messageType = parseInt(match[1], 10) as DecisionMessageType;
  const timestamp = parseInt(match[2], 10);

  if (messageType < 1 || messageType > 2) {
    return null;
  }

  return { messageType, timestamp };
}

/**
 * Decision messages configuration
 * Тексты уточняются отдельно — здесь placeholders
 */
export const DECISION_MESSAGES = {
  1: {
    text: 'Методика "12 недель в году" помогает сфокусироваться на главном. Каждые 12 недель — это как отдельный год для достижения ваших целей.\n\nМы разберём:\n• Ваше видение\n• Цели на 12 недель\n• План действий\n\nГотовы?',
    buttonText: 'Далее ...'
  },
  2: {
    text: 'Условия работы:\n\n• Я буду присылать напоминания и задания\n• Вы работаете над своими целями\n• В конце каждой недели — рефлексия\n\nЭто требует дисциплины, но результат того стоит.',
    buttonText: 'Начинаем ...'
  }
} as const;

/**
 * Get decision message text
 */
export function getDecisionMessageText(messageType: DecisionMessageType): string {
  return DECISION_MESSAGES[messageType].text;
}

/**
 * Get decision button text
 */
export function getDecisionButtonText(messageType: DecisionMessageType): string {
  return DECISION_MESSAGES[messageType].buttonText;
}

/**
 * Create inline keyboard for decision message
 */
export function createDecisionKeyboard(messageType: DecisionMessageType): InlineKeyboardMarkup {
  const callbackData = generateDecisionCallbackData(messageType);
  const buttonText = getDecisionButtonText(messageType);

  return {
    inline_keyboard: [[
      {
        text: buttonText,
        callback_data: callbackData
      }
    ]]
  };
}

/**
 * Get complete decision message
 */
export function getDecisionMessage(messageType: DecisionMessageType): {
  text: string;
  keyboard: InlineKeyboardMarkup;
} {
  return {
    text: getDecisionMessageText(messageType),
    keyboard: createDecisionKeyboard(messageType)
  };
}
