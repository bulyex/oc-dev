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
    text: `Скажи честно. 😏

У тебя бывает такое: день прошёл, ты вроде был занят, много читал, что-то изучал… А вечером ощущение странное — как будто устал, но ничего по-настоящему важного не сдвинулось.

Лента, статьи, подкасты, видео. Мы живем в эпоху, когда знания доступны в один клик. Новая система планирования, подход к фокусу. Новый способ «взять себя в руки».

В моменте это ощущается продуктивно. Мозг доволен — ты же развиваешься.

Просто интересно, узнаёшь себя?`,
    buttonText: 'Знакомое ощущение.'
  },
  2: {
    text: `Иногда мы путаем «узнал» с «сделал». 🤔

Прочитал про стратегию — кажется, будто уже стал стратегичнее. 
Посмотрел разбор чужого успеха — будто прикоснулся к результату.
Это полезное занятие. Мозг любит новизну. Когда мы узнаем что-то новое, кажется, что мы уже стали лучше.

Это не глупость и не слабость. Это очень человеческая история.

Вопрос только один: а изменения где?`,
    buttonText: 'И в чем проблема ?'
  },
  3: {
    text: `Замечал, как приятно составлять списки? 🗒️

План на месяц. Цели на год. Новая жизнь с понедельника.

В момент планирования чувствуешь контроль. Почти как будто уже движешься. Это иллюзия работы. Вы потратили энергию, но результат во внешнем мире не изменился. Проект не сдвинулся, навык не отработан.

Движение начинается не в заметках. И нет, у тебя не лень. 
Иногда просто нет чёткой точки приложения усилий.`,
    buttonText: 'Хотелось бы начать движение'
  },
  4: {
    text: `Представь: если бы на ближайшие 12 недель была всего одна приоритетная линия.

Не десять целей. Не бесконечное самоулучшение. 
А один вектор. 

Как думаешь, стало бы проще отличать «движусь» от «изучаю движение»?`,
    buttonText: 'Возможно'
  },
  5: {
    text: `Этот бот - твой личный AI Ментор, и это не про новые знания.

Он скорее про эксперименты с действием. 
Маленькие, регулярные, проверяемые.

Без героизма и рывков.
Главный наш с тобой фокус — это движение к изменениям!

Хочешь посмотреть на свои следующие 12 недель чуть иначе?`,
    buttonText: 'Давай начнем!'
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