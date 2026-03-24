/**
 * Execution Tracker Agent
 *
 * Analyzes user messages in STATE_ACTIVE to detect action completions.
 * Returns structured result with matched action IDs.
 */

import { sendChatCompletion } from './client.js';
import { isAIAvailable } from './config.js';
import { logger } from '../../utils/logger.js';
import type { TodayAction } from '../../database/client.js';

/**
 * System prompt for Execution Tracker Agent
 */
export const EXECUTION_TRACKER_SYSTEM_PROMPT = `Ты — Execution Tracker Agent. Анализируешь сообщение пользователя и определяешь:

1. относится ли оно к выполнению ДНЕВНЫХ ДЕЙСТВИЙ (action_texts)
2. какие конкретно действия выполнены (одно или несколько)

Сегодняшние действия пользователя:
{actions}

Правила:
- Если пользователь говорит о завершении действия(й) из списка → type: "done", matchedActionIds: массив id выполненных действий
- Если пользователь сообщает о выполнении НЕСКОЛЬКИХ действий → включи ВСЕ распознанные в matchedActionIds
- Если сообщение явно НЕ о результатах (болтовня, вопросы, эмоции, оффтоп) → type: "off_topic"
- При сомнении → type: "off_topic" (лучше промолчать, чем ложно зачесть)
- Сопоставляй по смыслу, а не по точному совпаданию слов. "Написал пост" = "Написать пост для Telegram"

Формат ответа — ТОЛЬКО JSON, без markdown-обёрток:
{"type":"done"|"off_topic","matchedActionIds":["id1","id2"] или [],"note":"комментарий или null","confidence":0.0-1.0}`;

/**
 * Result from Execution Tracker Agent
 */
export interface ExecutionTrackerResult {
  type: 'done' | 'off_topic';
  matchedActionIds: string[];
  note: string | null;
  confidence: number;
}

/**
 * Analyze user message to detect completed actions
 *
 * @param message - User's message text
 * @param actions - List of today's actions with their IDs
 * @returns ExecutionTrackerResult or null if AI unavailable
 */
export async function trackExecution(
  message: string,
  actions: TodayAction[]
): Promise<ExecutionTrackerResult | null> {
  if (!isAIAvailable()) {
    logger.warn('AI not available for execution tracking');
    return null;
  }

  // Filter only pending actions
  const pendingActions = actions.filter((a) => a.status === 'pending');

  if (pendingActions.length === 0) {
    // No pending actions - nothing to track
    return {
      type: 'off_topic',
      matchedActionIds: [],
      note: null,
      confidence: 1.0,
    };
  }

  // Build action list for prompt
  const actionList = pendingActions
    .map((a) => `- [${a.actionId}]: ${a.actionText}`)
    .join('\n');

  const systemPrompt = EXECUTION_TRACKER_SYSTEM_PROMPT.replace('{actions}', actionList);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: message },
  ];

  try {
    const aiResponse = await sendChatCompletion(messages);

    if (!aiResponse) {
      logger.warn('AI returned empty response for execution tracking');
      return null;
    }

    // Parse JSON response
    const parsed = parseExecutionTrackerResult(aiResponse, pendingActions);

    if (!parsed) {
      logger.warn('Failed to parse execution tracker response', { response: aiResponse.slice(0, 200) });
      return null;
    }

    logger.info('Execution tracker result', {
      type: parsed.type,
      matchedCount: parsed.matchedActionIds.length,
      confidence: parsed.confidence,
    });

    return parsed;
  } catch (error) {
    logger.error('Execution tracker AI request failed', { error });
    return null;
  }
}

/**
 * Parse AI response into ExecutionTrackerResult
 * Validates matchedActionIds exist in pending actions
 */
function parseExecutionTrackerResult(
  response: string,
  pendingActions: TodayAction[]
): ExecutionTrackerResult | null {
  try {
    // Remove markdown code blocks if present
    let cleaned = response.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    // Validate type
    if (parsed.type !== 'done' && parsed.type !== 'off_topic') {
      return null;
    }

    // Validate matchedActionIds
    const validIds = new Set(pendingActions.map((a) => a.actionId));
    const matchedActionIds: string[] = [];

    if (Array.isArray(parsed.matchedActionIds)) {
      for (const id of parsed.matchedActionIds) {
        if (typeof id === 'string' && validIds.has(id)) {
          matchedActionIds.push(id);
        }
      }
    }

    // If type is 'done', there must be at least one matched action
    if (parsed.type === 'done' && matchedActionIds.length === 0) {
      // No valid matches - treat as off_topic
      return {
        type: 'off_topic',
        matchedActionIds: [],
        note: null,
        confidence: 0.5,
      };
    }

    return {
      type: parsed.type,
      matchedActionIds,
      note: typeof parsed.note === 'string' ? parsed.note : null,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch (error) {
    logger.error('Failed to parse execution tracker JSON', { error, response: response.slice(0, 100) });
    return null;
  }
}

/**
 * Track execution with graceful fallback
 * Returns off_topic result when AI is unavailable
 */
export async function trackExecutionWithFallback(
  message: string,
  actions: TodayAction[]
): Promise<ExecutionTrackerResult> {
  try {
    const result = await trackExecution(message, actions);
    if (result) {
      return result;
    }
  } catch (error) {
    logger.warn('Execution Tracker AI unavailable, using fallback', { error });
  }

  // Fallback: off_topic with zero confidence
  return {
    type: 'off_topic',
    matchedActionIds: [],
    note: null,
    confidence: 0,
  };
}

// ============================================================
// Response Formatting
// ============================================================

import type { TodayStatus } from '../../database/client.js';

/**
 * Off-topic response message
 */
export const OFF_TOPIC_RESPONSE = 'Жду отчёт по сегодняшним задачам! Расскажи, что успел сделать.';

/**
 * All tasks completed response
 */
export const ALL_DONE_RESPONSE = 'Все задачи на сегодня выполнены! Отличная работа. Завтра продолжим 🌿';

/**
 * No tasks for today response
 */
export const NO_TASKS_RESPONSE = 'На сегодня задачи уже выполнены. Завтра будут новые! 🌿';

/**
 * Low confidence response
 */
export const LOW_CONFIDENCE_RESPONSE = 'Не совсем понял. Расскажи, что успел сделать по сегодняшним задачам.';

/**
 * Format status update message
 */
export function formatStatusUpdate(status: TodayStatus): string {
  const { done, total, pending } = status;

  if (pending.length === 0) {
    return ALL_DONE_RESPONSE;
  }

  // Single remaining action
  if (pending.length === 1) {
    return `✅ Выполнено ${done} из ${total}. Осталось: ${pending[0].actionText}`;
  }

  // Multiple remaining actions
  const pendingList = pending.map((a) => `• ${a.actionText}`).join('\n');
  return `✅ Выполнено ${done} из ${total}. Осталось:\n${pendingList}`;
}

/**
 * Format completion acknowledgment for multiple actions
 */
export function formatCompletionAck(matchedCount: number, status: TodayStatus): string {
  if (status.pending.length === 0) {
    return ALL_DONE_RESPONSE;
  }

  const suffix = matchedCount > 1 ? 'ы' : '';
  const statusUpdate = formatStatusUpdate(status);

  return `Отлично! Зафиксировал выполненн${suffix === 'ы' ? 'ые' : 'ое'} действие. ${statusUpdate}`;
}
