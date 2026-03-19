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
} from '../state/index.js';
import { UserFSMState } from '../state/types.js';
import {
  parseCallbackData,
  getOnboardingMessage
} from '../onboarding/index.js';
import {
  parseDecisionCallbackData,
  getDecisionMessage
} from '../decision/index.js';
import { VISION_WELCOME_MESSAGE } from '../onboarding/vision.js';

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
        // Vision timeout buttons (stubs for future implementation)
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
    await ctx.reply(VISION_WELCOME_MESSAGE);
    
    await ctx.answerCbQuery();
    
    logger.info('Transitioned to ONBOARDING state', { userId });
  }
}

/**
 * Handle Vision timeout callbacks (stubs for next task)
 */
async function handleVisionCallback(
  ctx: Context,
  userId: number,
  callbackData: string
): Promise<void> {
  logger.info('Vision callback received (stub)', { userId, callbackData });
  await ctx.answerCbQuery('Эта функция будет доступна в следующей версии');
}
