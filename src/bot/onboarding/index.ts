import { InlineKeyboardMarkup } from 'telegraf/types';
import { OnboardingMessageType } from '../state/index.js';

/**
 * Generate callback data for onboarding buttons
 * Format: onboarding_{messageType}_{timestamp}_{random}
 */
export function generateCallbackData(messageType: OnboardingMessageType): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `onboarding_${messageType}_${timestamp}_${random}`;
}

/**
 * Parse callback data
 * Returns parsed data or null if invalid
 */
export function parseCallbackData(callbackData: string): {
  messageType: OnboardingMessageType;
  timestamp: number;
} | null {
  const match = callbackData.match(/^onboarding_(\d+)_(\d+)_(\d+)$/);

  if (!match) {
    return null;
  }

  const messageType = parseInt(match[1], 10) as OnboardingMessageType;
  const timestamp = parseInt(match[2], 10);

  if (messageType < 1 || messageType > 5) {
    return null;
  }

  return { messageType, timestamp };
}

/**
 * Onboarding messages configuration
 */
export const ONBOARDING_MESSAGES = {
  1: {
    text: 'Привет! Это первое сообщение.',
    buttonText: 'Привет! Продолжай 1'
  },
  2: {
    text: 'Бывает ли такое.. Перегруз, завалы',
    buttonText: 'Знакомо! Продолжай 2'
  },
  3: {
    text: 'А ты знаешь.. Много информации',
    buttonText: 'Очень много! Продолжай 3'
  },
  4: {
    text: 'Сила не в знании.. Действие',
    buttonText: 'Действие, как? Продолжай 4'
  },
  5: {
    text: 'Мы будем делать.. Действие',
    buttonText: 'Давай попробуем!'
  }
} as const;

/**
 * Get message text by type
 */
export function getMessageText(messageType: OnboardingMessageType): string {
  return ONBOARDING_MESSAGES[messageType].text;
}

/**
 * Get button text by type
 */
export function getButtonText(messageType: OnboardingMessageType): string {
  return ONBOARDING_MESSAGES[messageType].buttonText;
}

/**
 * Create inline keyboard for onboarding message
 */
export function createOnboardingKeyboard(messageType: OnboardingMessageType): InlineKeyboardMarkup {
  const callbackData = generateCallbackData(messageType);
  const buttonText = getButtonText(messageType);

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
 * Get complete onboarding message (text + keyboard)
 */
export function getOnboardingMessage(messageType: OnboardingMessageType): {
  text: string;
  keyboard: InlineKeyboardMarkup;
} {
  return {
    text: getMessageText(messageType),
    keyboard: createOnboardingKeyboard(messageType)
  };
}