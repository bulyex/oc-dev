import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';
import {
  setLastHelloMessage,
  validateCallback,
  validateDecisionCallback,
  getNextMessageType,
  getFSMState,
  transitionHelloToDecision,
  transitionDecisionToOnboarding,
  setLastDecisionMessage,
  initOnboardingVision,
  getState,
  getVisionState,
  clearVisionState,
  setExampleShown,
  setDraftProposed,
  addVisionChatMessage,
  saveVision,
} from '../state/index.js';
import { UserFSMState, OnboardingSubstate } from '../state/types.js';
import {
  parseCallbackData,
  getOnboardingMessage
} from '../onboarding/index.js';
import {
  parseDecisionCallbackData,
  getDecisionMessage
} from '../decision/index.js';
import {
  VISION_WELCOME_MESSAGE,
  createVisionKeyboard,
  extractFinalVision,
  VISION_FALLBACK_RESPONSE,
} from '../onboarding/vision.js';
import { saveUserVision } from '../../database/client.js';
import { sendChatCompletion } from '../ai/client.js';
import { VISION_SYSTEM_PROMPT } from '../onboarding/prompts/vision.js';

// Debounce to prevent rapid sequential button presses (500ms)
const debounceMap = new Map<number, number>();
const DEBOUNCE_MS = 500;

export function registerCallbackHandler(bot: Telegraf<Context>) {
  bot.on('callback_query', async (ctx) => {
    try {
      const callbackQuery = ctx.callbackQuery;
      const userId = ctx.from?.id || 0;

      if (!callbackQuery || 'data' in callbackQuery === false) {
        await ctx.answerCbQuery('Неверный формат кнопки');
        return;
      }

      const callbackData = callbackQuery.data;
      if (!callbackData) {
        await ctx.answerCbQuery('Неверный формат кнопки');
        return;
      }

      // Check debounce (prevent rapid double-clicks)
      const lastCallbackTime = debounceMap.get(userId) || 0;
      const now = Date.now();
      if (now - lastCallbackTime < DEBOUNCE_MS) {
        logger.debug('Callback debounced', { userId });
        await ctx.answerCbQuery('Подождите немного...');
        return;
      }
      debounceMap.set(userId, now);

      // Route by callback prefix
      if (callbackData.startsWith('onboarding_')) {
        await handleOnboardingCallback(ctx, userId, callbackData);
      } else if (callbackData.startsWith('decision_')) {
        await handleDecisionCallback(ctx, userId, callbackData);
      } else if (callbackData.startsWith('vision_')) {
        await handleVisionCallback(ctx, userId, callbackData);
      } else {
        await ctx.answerCbQuery('Неизвестный тип кнопки');
      }
    } catch (error) {
      logger.error('Error in callback handler:', error);
      try {
        await ctx.answerCbQuery('Произошла ошибка');
        await ctx.reply('Произошла ошибка. Попробуйте /start снова.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  });
}

/**
 * Handle onboarding callbacks (STATE_HELLO)
 */
async function handleOnboardingCallback(
  ctx: Context,
  userId: number,
  callbackData: string
): Promise<void> {
  // Parse callback data
  const parsed = parseCallbackData(callbackData);
  if (!parsed) {
    logger.warn('Invalid onboarding callback data format', { userId, callbackData });
    await ctx.answerCbQuery('Неверный формат кнопки');
    await ctx.reply('Кнопка устарела, начните с /start');
    return;
  }

  // Validate callback (check if button is still valid)
  const isValid = await validateCallback(userId, parsed.messageType, parsed.timestamp);
  if (!isValid) {
    logger.warn('Onboarding callback validation failed', { userId, messageType: parsed.messageType });
    await ctx.answerCbQuery('Кнопка устарела');
    await ctx.reply('Кнопка устарела, начните с /start');
    return;
  }

  // Если это сообщение 5 — переход в STATE_DECISION
  if (parsed.messageType === 5) {
    await transitionHelloToDecision(userId);
    
    // Отправить первое сообщение DECISION
    const decisionMessage = getDecisionMessage(1);
    const sentMessage = await ctx.reply(decisionMessage.text, {
      reply_markup: decisionMessage.keyboard
    });
    
    // Сохранить state
    await setLastDecisionMessage(userId, 1, sentMessage.message_id);
    
    await ctx.answerCbQuery();
    
    logger.info('Transitioned to DECISION state', {
      userId,
      messageId: sentMessage.message_id
    });
    return;
  }

  // Get next message type
  const nextMessageType = getNextMessageType(parsed.messageType);
  if (!nextMessageType) {
    // Should not reach here (messageType 5 handled above)
    logger.warn('No next message type', { userId, messageType: parsed.messageType });
    await ctx.answerCbQuery('Это последняя кнопка');
    return;
  }

  // Get next onboarding message
  const nextMessage = getOnboardingMessage(nextMessageType);

  // Send next message
  const sentMessage = await ctx.reply(nextMessage.text, {
    reply_markup: nextMessage.keyboard
  });

  // Update state
  await setLastHelloMessage(userId, nextMessageType, sentMessage.message_id);

  // Answer callback to remove "clock" icon
  await ctx.answerCbQuery();

  logger.info('Onboarding step completed', {
    userId,
    fromMessageType: parsed.messageType,
    toMessageType: nextMessageType,
    messageId: sentMessage.message_id
  });
}

/**
 * Handle decision callbacks (STATE_DECISION)
 */
async function handleDecisionCallback(
  ctx: Context,
  userId: number,
  callbackData: string
): Promise<void> {
  const parsed = parseDecisionCallbackData(callbackData);
  if (!parsed) {
    logger.warn('Invalid decision callback data format', { userId, callbackData });
    await ctx.answerCbQuery('Неверный формат кнопки');
    await ctx.reply('Кнопка устарела, начните с /start');
    return;
  }
  
  // Validate FSM state
  const fsmState = await getFSMState(userId);
  if (fsmState !== UserFSMState.STATE_DECISION) {
    await ctx.answerCbQuery('Кнопка устарела');
    await ctx.reply('Кнопка устарела, начните с /start');
    return;
  }
  
  // Validate decision callback
  const isValid = await validateDecisionCallback(userId, parsed.messageType, parsed.timestamp);
  if (!isValid) {
    logger.warn('Decision callback validation failed', { userId, messageType: parsed.messageType });
    await ctx.answerCbQuery('Кнопка устарела');
    await ctx.reply('Кнопка устарела, начните с /start');
    return;
  }
  
  if (parsed.messageType === 1) {
    // Переход к сообщению 2
    const nextMessage = getDecisionMessage(2);
    const sentMessage = await ctx.reply(nextMessage.text, {
      reply_markup: nextMessage.keyboard
    });
    await setLastDecisionMessage(userId, 2, sentMessage.message_id);
    await ctx.answerCbQuery();
    
    logger.info('Decision step 1 completed', {
      userId,
      messageId: sentMessage.message_id
    });
    
  } else if (parsed.messageType === 2) {
    // Transition to STATE_ONBOARDING
    await transitionDecisionToOnboarding(userId);
    
    // Initialize Vision substate
    await initOnboardingVision(userId);
    
    // Send welcome message for Vision phase
    await ctx.reply(VISION_WELCOME_MESSAGE, {
      reply_markup: createVisionKeyboard({ showDone: false })
    });
    
    await ctx.answerCbQuery();
    
    logger.info('Transitioned to ONBOARDING Vision state', { userId });
  }
}

/**
 * Handle Vision phase callbacks (STATE_ONBOARDING VISION substate)
 * 
 * Handles:
 * - vision_reset: Clear chat history and show welcome message
 * - vision_example: Show AI-generated example vision
 * - vision_done: Save vision to database and transition to Goals
 */
async function handleVisionCallback(
  ctx: Context,
  userId: number,
  callbackData: string
): Promise<void> {
  const state = await getState(userId);
  if (state?.onboardingSubstate !== OnboardingSubstate.VISION) {
    await ctx.answerCbQuery('Кнопка устарела, начните с /start');
    return;
  }
  
  const telegramId = String(userId);
  
  if (callbackData === 'vision_reset') {
    // Clear vision state and show welcome message
    await clearVisionState(userId);
    await ctx.answerCbQuery();
    await ctx.reply(VISION_WELCOME_MESSAGE, {
      reply_markup: createVisionKeyboard({ showDone: false })
    });
    logger.info('Vision reset by user', { userId });
    return;
  }
  
  if (callbackData === 'vision_example') {
    // Show AI-generated example vision
    // exampleShown = true blocks "Готово!" until user writes their own
    await setExampleShown(userId, true);
    await addVisionChatMessage(userId, 'user', 'Покажи, пожалуйста, пример видения для вдохновения.');
    
    const visionState = await getVisionState(userId);
    const chatHistory = visionState?.chatHistory || [];
    const messages = [
      { role: 'system' as const, content: VISION_SYSTEM_PROMPT },
      ...chatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];
    
    const aiResponse = await sendChatCompletion(messages) || VISION_FALLBACK_RESPONSE;
    await addVisionChatMessage(userId, 'assistant', aiResponse);
    
    await ctx.answerCbQuery();
    await ctx.reply(aiResponse, {
      reply_markup: createVisionKeyboard({ showDone: false })
    });
    logger.info('Vision example shown', { userId });
    return;
  }
  
  if (callbackData === 'vision_done') {
    const visionState = await getVisionState(userId);
    
    // Check if example was shown - if so, don't allow saving example text
    if (visionState?.exampleShown) {
      await ctx.answerCbQuery('Сначала напишите своё видение, опираясь на пример. Я помогу оформить.');
      return;
    }
    
    // Check if draft was proposed
    if (!visionState?.draftProposed) {
      await ctx.answerCbQuery('Сначала нужно получить черновик видения от AI. Напишите что-нибудь о себе.');
      return;
    }
    
    const chatHistory = visionState?.chatHistory || [];
    const visionText = extractFinalVision(chatHistory);
    
    if (!visionText) {
      await ctx.answerCbQuery('Не могу сохранить: видение не найдено. Напишите что-нибудь о себе.');
      return;
    }
    
    // Save vision to database
    await saveUserVision(telegramId, visionText);
    await saveVision(userId, visionText);
    await setDraftProposed(userId, false);
    await setExampleShown(userId, false);
    
    await ctx.answerCbQuery('Видение сохранено!');
    await ctx.reply(
      'Отлично! Твоё видение сохранено. Это твой ориентир на ближайшие 12 недель.\n\nСледующий шаг: Goals.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: 'Продолжить →', callback_data: 'onboarding_goals_1' }]]
        }
      }
    );
    logger.info('Vision saved, transitioning to Goals', { userId });
    return;
  }
}
