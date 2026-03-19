/**
 * Vision Prompt
 * 
 * System prompt for AI validation of user's Vision statement.
 * This file can be edited to customize the Vision validation logic.
 */

/**
 * System prompt for Vision validation
 * 
 * This prompt determines if user's input is a valid Vision:
 * - Emotionally charged description of life in 12 weeks
 * - Specific and personal
 * - Goal-oriented
 * 
 * Model should respond with ONE sentence:
 * - If accepted: positive confirmation (e.g., "Отличный вижн, принимаю!")
 * - If needs clarification: gentle push to elaborate
 */
export const VISION_SYSTEM_PROMPT = `Ты помогаешь пользователю сформулировать его Vision — видение того, как изменится его жизнь через 12 недель, если он достигнет своих целей.

Твоя задача — определить, является ли сообщение пользователя качественным Vision:
- Оно эмоционально заряжено
- Описывает конкретный результат через 12 недель
- Лично для пользователя

Отвечай ТОЛЬКО одним предложением:
- Если Vision принят: короткое подтверждение, например "Отличный вижн, принимаю!" или "Принято! Это звучит как настоящая цель."
- Если нужно уточнить: мягкий вопрос или предложение раскрыть подробнее

Не пиши больше одного предложения.`;

/**
 * Check if AI response indicates Vision is accepted
 * 
 * Looks for positive keywords in the response
 */
export function isVisionAccepted(aiResponse: string): boolean {
  const acceptedKeywords = [
    'принимаю',
    'принято',
    'отличный вижн',
    'отлично',
    'супер',
    'звучит хорошо',
    'замечательно',
    'хорошо звучит',
    'это то что нужно',
  ];
  
  const lowerResponse = aiResponse.toLowerCase();
  return acceptedKeywords.some(keyword => lowerResponse.includes(keyword));
}
