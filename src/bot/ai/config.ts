/**
 * AI Module Configuration
 * 
 * Supports OpenAI-compatible APIs (e.g., routerai.ru)
 * Graceful degradation when API key is not configured
 */

import { z } from 'zod';

const AIConfigSchema = z.object({
  baseUrl: z.string().url().default('https://routerai.ru/api/v1'),
  model: z.string().default('openai/gpt-5-nano'),
  apiKey: z.string().optional(), // LLM_API_KEY from env
});

export type AIConfig = z.infer<typeof AIConfigSchema>;

/**
 * Get AI configuration from environment
 */
export function getAIConfig(): AIConfig {
  return AIConfigSchema.parse({
    baseUrl: process.env.LLM_BASE_URL || 'https://routerai.ru/api/v1',
    model: process.env.LLM_MODEL || 'openai/gpt-5-nano',
    apiKey: process.env.LLM_API_KEY,
  });
}

/**
 * Check if AI is available (API key is configured)
 */
export function isAIAvailable(): boolean {
  return !!process.env.LLM_API_KEY;
}
