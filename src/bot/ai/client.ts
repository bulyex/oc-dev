/**
 * AI Client
 * 
 * Sends chat completion requests to OpenAI-compatible API
 * Handles errors gracefully and returns null on failure
 */

import { getAIConfig, isAIAvailable } from './config.js';
import type { ChatMessage, ChatCompletionResponse } from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * Send chat completion request to OpenAI-compatible API
 * 
 * @param messages - Array of chat messages (system, user, assistant)
 * @returns AI response content or null if unavailable/failed
 */
export async function sendChatCompletion(
  messages: ChatMessage[]
): Promise<string | null> {
  if (!isAIAvailable()) {
    logger.warn('AI API key not configured, using fallback');
    return null;
  }

  const config = getAIConfig();

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      logger.error('AI API error', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = await response.json() as ChatCompletionResponse;
    const content = data.choices[0]?.message?.content;
    
    if (content) {
      return content;
    }
    
    // Reasoning models may return content as null with text in reasoning field
    const reasoning = (data as any).choices[0]?.message?.reasoning;
    if (reasoning) {
      logger.warn('AI returned reasoning instead of content, extracting summary');
      // Take last non-empty line or last sentence as the actual response
      const lines = reasoning.split('\n').filter((l: string) => l.trim().length > 0);
      const lastLine = lines[lines.length - 1]?.trim();
      return lastLine || reasoning.slice(0, 200);
    }
    
    logger.warn('AI returned empty content', { data: JSON.stringify(data).slice(0, 500) });
    return null;

  } catch (error) {
    logger.error('AI API request failed', { error });
    return null;
  }
}
