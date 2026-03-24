import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';
import {
  getLastHelloMessage,
  getLastDecisionMessage,
  setLastHelloMessage,
  setLastDecisionMessage,
  getFSMState,
  getState,
  setExampleShown,
} from '../state/index.js';
import { UserFSMState, OnboardingSubstate } from '../state/types.js';
import { getOnboardingMessage } from '../onboarding/index.js';
import { getDecisionMessage } from '../decision/index.js';
import {
  processVisionMessage,
  createVisionKeyboard,
} from '../onboarding/vision.js';
import {
  processGoalsMessage,
  createGoalsKeyboard,
} from '../onboarding/goals.js';
import {
  processPlanMessage,
  createPlanKeyboard,
} from '../onboarding/plan.js';
// Task 14: Execution Tracker imports
import {
  getTodayActionsWithCompletions,
  getTodayStatus,
  markActionDone,
} from '../../database/client.js';
import {
  trackExecutionWithFallback,
  formatCompletionAck,
  OFF_TOPIC_RESPONSE,
  NO_TASKS_RESPONSE,
  LOW_CONFIDENCE_RESPONSE,
} from '../ai/execution_tracker.js';

export function registerTextHandler(bot: Telegraf<Context>) {
  bot.on('text', async (ctx) => {
    try {
      const text = ctx.message?.text;
      const userId = ctx.from?.id || 0;

      if (!text) {
        return;
      }

      // Check if this is a command (should be handled by other handlers)
      if (text.startsWith('/')) {
        return;
      }

      // Get FSM state
      const fsmState = await getFSMState(userId);

      // Handle STATE_ONBOARDING
      if (fsmState === UserFSMState.STATE_ONBOARDING) {
        const state = await getState(userId);
        
        // Route by onboarding substate
        if (state?.onboardingSubstate === OnboardingSubstate.VISION) {
          await ctx.replyWithChatAction('typing'); // task_11: typing indicator
          const result = await processVisionMessage(userId, ctx.message.text);
          
          // ShowDone = draftProposed && !exampleShown
          const showDone = result.draftProposed && !state.exampleShown;
          const keyboard = createVisionKeyboard({ showDone });
          
          await ctx.reply(result.response, { reply_markup: keyboard });
          
          // After user response, reset exampleShown (they wrote their own)
          if (state.exampleShown) {
            await setExampleShown(userId, false);
          }
          
          logger.info('Vision message processed', {
            userId,
            isAccepted: result.isAccepted,
            draftProposed: result.draftProposed,
            showDone,
          });
          return;
        }
        
        // Handle GOALS substate
        if (state?.onboardingSubstate === OnboardingSubstate.GOALS) {
          await ctx.replyWithChatAction('typing'); // task_11: typing indicator
          const result = await processGoalsMessage(userId, ctx.message.text);
          await ctx.reply(result.response, { reply_markup: createGoalsKeyboard() });
          logger.info('Goals message processed', { userId });
          return;
        }
        
        // Handle PLAN substate
        if (state?.onboardingSubstate === OnboardingSubstate.PLAN) {
          await ctx.replyWithChatAction('typing'); // task_11: typing indicator
          const result = await processPlanMessage(userId, ctx.message.text);
          const trimmed = result.response.length > 4000 ? result.response.slice(0, 4000) + '\n\n... (ответ обрезан — напиши, и я продолжу)' : result.response;
          await ctx.reply(trimmed, { reply_markup: createPlanKeyboard() });
          logger.info('Plan message processed', { userId });
          return;
        }
        
        // Future: handle PLAN, TIME substates
        logger.warn('Unknown onboarding substate', {
          userId,
          substate: state?.onboardingSubstate,
        });
        await ctx.reply('Произошла ошибка. Попробуйте /start снова.');
        return;
      }

      // Task 14: Handle STATE_ACTIVE - Execution Tracker
      if (fsmState === UserFSMState.STATE_ACTIVE) {
        await ctx.replyWithChatAction('typing');

        const telegramId = String(userId);

        // Get today's actions with completion status
        const todayActions = await getTodayActionsWithCompletions(telegramId);

        if (!todayActions) {
          // Database error
          await ctx.reply('Произошла ошибка при получении задач. Попробуйте позже.');
          return;
        }

        // Check pending actions
        const pendingActions = todayActions.filter((a) => a.status === 'pending');

        if (pendingActions.length === 0) {
          // No pending actions - all done or no plan yet
          await ctx.reply(NO_TASKS_RESPONSE);
          return;
        }

        // Call Execution Tracker Agent
        const result = await trackExecutionWithFallback(ctx.message.text, todayActions);

        // Check confidence threshold
        if (result.confidence < 0.6) {
          // Low confidence - ask for clarification
          await ctx.reply(LOW_CONFIDENCE_RESPONSE);
          return;
        }

        if (result.type === 'done' && result.matchedActionIds.length > 0) {
          // Mark all matched actions as done
          const status = await getTodayStatus(telegramId);

          if (status && status.dayId) {
            for (const actionId of result.matchedActionIds) {
              await markActionDone(status.dayId, actionId, result.note || undefined);
            }
          }

          // Get updated status
          const updatedStatus = await getTodayStatus(telegramId);

          if (updatedStatus) {
            // Format and send response
            const response = formatCompletionAck(result.matchedActionIds.length, updatedStatus);
            await ctx.reply(response);
            logger.info('Actions marked as done', {
              userId,
              actionIds: result.matchedActionIds,
              remaining: updatedStatus.pending.length,
            });
          } else {
            await ctx.reply('Отлично! Действие зафиксировано.');
          }
        } else {
          // Off-topic
          await ctx.reply(OFF_TOPIC_RESPONSE);
          logger.debug('Execution tracker off-topic', { userId, message: ctx.message.text.slice(0, 50) });
        }
        return;
      }

      // Handle STATE_DECISION
      if (fsmState === UserFSMState.STATE_DECISION) {
        // Repeat last DECISION message
        const lastDecision = await getLastDecisionMessage(userId);
        if (lastDecision) {
          const message = getDecisionMessage(lastDecision.decisionMessage);
          const sentMessage = await ctx.reply(message.text, { reply_markup: message.keyboard });
          await setLastDecisionMessage(userId, lastDecision.decisionMessage, sentMessage.message_id);
          
          logger.info('Last DECISION message repeated', {
            userId,
            messageType: lastDecision.decisionMessage,
            messageId: sentMessage.message_id,
          });
          return;
        }
      }

      // STATE_HELLO or legacy state - repeat last onboarding message
      const lastHello = await getLastHelloMessage(userId);

      if (!lastHello || !lastHello.helloMessage) {
        logger.info('Text message received but no onboarding state - suggesting /start', {
          userId
        });
        await ctx.reply('Начните онбординг с команды /start');
        return;
      }

      // Repeat last onboarding message
      const onboardingMessage = getOnboardingMessage(lastHello.helloMessage);

      const sentMessage = await ctx.reply(onboardingMessage.text, {
        reply_markup: onboardingMessage.keyboard
      });

      // Update state with new message ID
      await setLastHelloMessage(userId, lastHello.helloMessage, sentMessage.message_id);

      logger.info('Last onboarding message repeated', {
        userId,
        messageType: lastHello.helloMessage,
        messageId: sentMessage.message_id
      });
    } catch (error) {
      logger.error('Error in text handler:', error);
      try {
        await ctx.reply('Произошла ошибка. Попробуйте /start снова.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  });
}
