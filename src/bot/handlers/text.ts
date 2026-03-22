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
        
        // Future: handle GOALS, PLAN, TIME substates
        logger.warn('Unknown onboarding substate', {
          userId,
          substate: state?.onboardingSubstate,
        });
        await ctx.reply('Произошла ошибка. Попробуйте /start снова.');
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
