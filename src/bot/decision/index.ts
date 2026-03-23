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

  // task_11: только messageType 1 (одно сообщение вместо двух)
  if (messageType !== 1) {
    return null;
  }

  return { messageType, timestamp };
}

/**
 * Decision messages configuration
 * task_11: одно сообщение вместо двух
 */
export const DECISION_MESSAGES = {
  1: {
    text: `Что нам предстоит сделать:
Сформируем твое заряжающее видение!
Поставим четкие цели и план действий на ближайшие 3 месяца.

Моя роль: 
Помогать тебе 
Напоминать, что знание - не результат. Результат - действие!
Буду фиксировать твой прогресс
Корректировать план

Для старта, первая неделя - пробный период. 
Далее - ежемесячная подписка. 990 руб / мес`,
    buttonText: 'Действуем!'
  }
} as const;

/**
 * Get decision message text
 */
export function getDecisionMessageText(messageType: DecisionMessageType): string {
  return DECISION_MESSAGES[messageType as keyof typeof DECISION_MESSAGES]?.text ?? '';
}

/**
 * Get decision button text
 */
export function getDecisionButtonText(messageType: DecisionMessageType): string {
  return DECISION_MESSAGES[messageType as keyof typeof DECISION_MESSAGES]?.buttonText || 'Действуем!';
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
