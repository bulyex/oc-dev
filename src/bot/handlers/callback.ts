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
  transitionOnboardingToActive,
  setLastDecisionMessage,
  initOnboardingVision,
  initOnboardingGoals,
  getGoalsState,
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
import {
  generateGoalsFirstMessage,
  createGoalsKeyboard,
  extractFinalGoals,
} from '../onboarding/goals.js';
import {
  generatePlanFirstMessage,
  createPlanKeyboard,
  extractFinalPlan,
} from '../onboarding/plan.js';
import { generateMiniDailyPlan } from '../ai/mini_daily_plan.js';
import { initOnboardingPlan, getPlanState } from '../state/index.js';
import { saveUserVision, saveUserGoals, saveUserPlan, getUserVision, getUserGoals, getUserByTelegramId, createCycle, createGoals, updateCyclePlan, getActiveCycleForUser, createFirstWeek, getActiveWeekForUser, createWeekActions, getOrCreateTodayDay, updateDayDailyPlan } from '../../database/client.js';
import { sendChatCompletion } from '../ai/client.js';
import { VISION_SYSTEM_PROMPT } from '../onboarding/prompts/vision.js';

// Debounce to prevent rapid sequential button presses (500ms)
const debounceMap = new Map<number, number>();
const DEBOUNCE_MS = 500;
const DEBOUNCE_TTL_MS = DEBOUNCE_MS * 10; // 5 seconds TTL

/**
 * Clean up stale debounce entries (lazy cleanup on each access)
 */
function cleanupDebounceMap(): void {
  const now = Date.now();
  for (const [userId, timestamp] of debounceMap) {
    if (now - timestamp > DEBOUNCE_TTL_MS) {
      debounceMap.delete(userId);
    }
  }
}

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
      
      // Lazy cleanup of stale entries
      cleanupDebounceMap();

      // Route by callback prefix
      if (callbackData.startsWith('onboarding_')) {
        await handleOnboardingCallback(ctx, userId, callbackData);
      } else if (callbackData.startsWith('decision_')) {
        await handleDecisionCallback(ctx, userId, callbackData);
      } else if (callbackData.startsWith('vision_')) {
        await handleVisionCallback(ctx, userId, callbackData);
      } else if (callbackData.startsWith('goals_')) {
        await handleGoalsCallback(ctx, userId, callbackData);
      } else if (callbackData.startsWith('plan_')) {
        await handlePlanCallback(ctx, userId, callbackData);
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
  // Handle transition to Goals phase
  if (callbackData === 'onboarding_goals_1') {
    await ctx.answerCbQuery(); // Answer immediately before slow AI call
    await ctx.replyWithChatAction('typing'); // task_11: typing indicator
    const telegramId = String(userId);
    await initOnboardingGoals(userId);
    const { firstMessage, initialGoalsGenerated } = await generateGoalsFirstMessage(userId, telegramId);
    await ctx.reply(firstMessage, { reply_markup: createGoalsKeyboard() });
    logger.info('Transitioned to ONBOARDING Goals state', { userId, initialGoalsGenerated });
    return;
  }

  // Handle transition to Plan phase
  if (callbackData === 'onboarding_plan_1') {
    await ctx.answerCbQuery(); // Answer immediately before slow AI call
    await ctx.replyWithChatAction('typing'); // task_11: typing indicator
    const telegramId = String(userId);
    await initOnboardingPlan(userId);
    const { firstMessage, initialPlanGenerated } = await generatePlanFirstMessage(userId, telegramId);
    const trimmed = firstMessage.length > 4000 ? firstMessage.slice(0, 4000) + '\n\n... (план обрезан — напиши, и я продолжу)' : firstMessage;
    await ctx.reply(trimmed, { reply_markup: createPlanKeyboard() });
    logger.info('Transitioned to ONBOARDING Plan state', { userId, initialPlanGenerated });
    return;
  }

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
    // task_11: переход сразу к Vision (одно сообщение вместо двух)
    await transitionDecisionToOnboarding(userId);
    await initOnboardingVision(userId);
    await ctx.reply(VISION_WELCOME_MESSAGE, {
      reply_markup: createVisionKeyboard({ showDone: false })
    });
    await ctx.answerCbQuery();
    logger.info('Decision completed, transitioned to ONBOARDING Vision state', { userId });
  } else {
    // Legacy fallback
    await transitionDecisionToOnboarding(userId);
    await initOnboardingVision(userId);
    await ctx.reply(VISION_WELCOME_MESSAGE, {
      reply_markup: createVisionKeyboard({ showDone: false })
    });
    await ctx.answerCbQuery();
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
    await ctx.answerCbQuery(); // Answer immediately before slow AI call
    await addVisionChatMessage(userId, 'user', 'Покажи, пожалуйста, пример видения для вдохновения.');
    
    const visionState = await getVisionState(userId);
    const chatHistory = visionState?.chatHistory || [];
    const messages = [
      { role: 'system' as const, content: VISION_SYSTEM_PROMPT },
      ...chatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];
    
    const aiResponse = await sendChatCompletion(messages) || VISION_FALLBACK_RESPONSE;
    if (aiResponse !== VISION_FALLBACK_RESPONSE) {
      await setExampleShown(userId, true);
    }
    await addVisionChatMessage(userId, 'assistant', aiResponse);
    
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

/**
 * Handle Goals phase callbacks (STATE_ONBOARDING GOALS substate)
 *
 * Handles:
 * - goals_accept: Save goals to database and transition to Plan
 */
async function handleGoalsCallback(
  ctx: Context,
  userId: number,
  callbackData: string
): Promise<void> {
  const state = await getState(userId);
  if (state?.onboardingSubstate !== OnboardingSubstate.GOALS) {
    await ctx.answerCbQuery('Кнопка устарела, начните с /start');
    return;
  }

  if (callbackData === 'goals_accept') {
    const goalsState = await getGoalsState(userId);
    const chatHistory = goalsState?.chatHistory || [];
    const goalsText = extractFinalGoals(chatHistory);

    if (!goalsText) {
      await ctx.answerCbQuery('Не могу сохранить: цели не найдены.');
      return;
    }

    const telegramId = String(userId);
    await saveUserGoals(telegramId, goalsText);
    
    // Task 13: Create Cycle + Goal[] records
    const user = await getUserByTelegramId(telegramId);
    if (user && user.vision) {
      const cycle = await createCycle(user.id, user.vision, goalsText);
      if (cycle) {
        await createGoals(cycle.id, goalsText);
        logger.info('Cycle and Goals created in database', { userId, cycleId: cycle.id });
      } else {
        logger.error('Failed to create Cycle in database', { userId });
      }
    } else {
      logger.warn('Cannot create Cycle: user or vision not found', { userId, hasUser: !!user, hasVision: !!user?.vision });
    }
    
    await ctx.answerCbQuery('Цели сохранены!');
    await ctx.reply(
      'Отлично! Твои цели зафиксированы. Это твой фокус на ближайшие 12 недель.\n\nСледующий шаг: Plan.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: 'Продолжить →', callback_data: 'onboarding_plan_1' }]]
        }
      }
    );
    logger.info('Goals saved, transitioning to Plan', { userId });
    return;
  }
}

/**
 * Parse Mini Daily Plan output into action texts
 * Simple parsing: split by newlines, strip bullet markers, take first 3
 */
function parseMiniDailyPlan(planText: string): Array<{ actionText: string; order: number }> {
  const lines = planText.split('\n');
  const actions: Array<{ actionText: string; order: number }> = [];

  for (const line of lines) {
    if (actions.length >= 3) break;

    // Strip bullet markers and whitespace
    const cleaned = line
      .replace(/^[•\-\*]\s*/, '')
      .replace(/^\d+\.\s*/, '')
      .trim();

    if (cleaned.length > 0) {
      actions.push({ actionText: cleaned, order: actions.length + 1 });
    }
  }

  return actions;
}

/**
 * Handle Plan phase callbacks (STATE_ONBOARDING PLAN substate)
 *
 * Handles:
 * - plan_accept: Save plan to database, transition to STATE_ACTIVE, generate mini daily plan
 */
async function handlePlanCallback(
  ctx: Context,
  userId: number,
  callbackData: string
): Promise<void> {
  const state = await getState(userId);
  if (state?.onboardingSubstate !== OnboardingSubstate.PLAN) {
    await ctx.answerCbQuery('Кнопка устарела, начните с /start');
    return;
  }

  if (callbackData === 'plan_accept') {
    const planState = await getPlanState(userId);
    const chatHistory = planState?.chatHistory || [];
    const planText = extractFinalPlan(chatHistory);

    if (!planText) {
      await ctx.answerCbQuery('Не могу сохранить: план не найден.');
      return;
    }

    const telegramId = String(userId);

    // Save plan to database
    await saveUserPlan(telegramId, planText);

    // Task 13: Update Cycle.planText and create Week + Day[] × 7
    const user = await getUserByTelegramId(telegramId);
    if (user) {
      const cycle = await getActiveCycleForUser(user.id);
      if (cycle) {
        await updateCyclePlan(cycle.id, planText);
        await createFirstWeek(cycle.id);
        logger.info('Cycle planText updated and first week created', { userId, cycleId: cycle.id });
      } else {
        logger.warn('No active cycle found for plan_accept', { userId });
      }
    }

    // Transition to STATE_ACTIVE
    await transitionOnboardingToActive(userId);

    // Load vision and goals for mini daily plan
    const vision = await getUserVision(telegramId);
    const goals = await getUserGoals(telegramId);

    // Generate mini daily plan
    let dailyPlan: string;
    if (vision && goals && planText) {
      dailyPlan = await generateMiniDailyPlan(vision, goals, planText);
    } else {
      dailyPlan = '• Выполнить первое действие из плана\n• Продвинуться к ближайшей цели\n• Подвести итоги дня вечером';
    }

    // Task 14: Create WeekAction[] records and save dailyPlan to Day
    const weekUser = await getUserByTelegramId(telegramId);
    if (weekUser) {
      const activeWeek = await getActiveWeekForUser(weekUser.id);
      if (activeWeek) {
        // Parse daily plan into actions
        const parsedActions = parseMiniDailyPlan(dailyPlan);

        if (parsedActions.length > 0) {
          // Create WeekAction[] records
          await createWeekActions(activeWeek.id, parsedActions);
          logger.info('WeekActions created from Mini Daily Plan', {
            userId,
            weekId: activeWeek.id,
            actionCount: parsedActions.length,
          });
        }

        // Get or create today's Day
        const todayDay = await getOrCreateTodayDay(activeWeek.id);
        if (todayDay) {
          // Save dailyPlan to Day.dailyPlanText
          await updateDayDailyPlan(todayDay.id, dailyPlan);
          logger.info('Day dailyPlanText saved', { userId, dayId: todayDay.id });
        }
      }
    }

    // Acknowledge callback (may fail if query is stale — that's OK, reply goes through)
    await ctx.answerCbQuery('План сохранён!').catch(() => {});
    await ctx.reply(
      `Начинаем работу!\nТвой минимум на сегодня:\n${dailyPlan}\n\nПиши мне о своих результатах, будем фиксировать прогресс.\nУдачи, всё получится!`
    );
    logger.info('Plan saved, transitioned to ACTIVE state', { userId });
    return;
  }
}
