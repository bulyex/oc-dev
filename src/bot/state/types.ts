// FSM States
export enum UserFSMState {
  STATE_HELLO = 'STATE_HELLO',           // Первые 5 приветственных сообщений
  STATE_DECISION = 'STATE_DECISION',     // Принятие решения (2 сообщения)
  STATE_ONBOARDING = 'STATE_ONBOARDING', // Основной онбординг (Vision, Goals, Plan)
}

// Message types for HELLO state
export type HelloMessageType = 1 | 2 | 3 | 4 | 5;

// Message types for DECISION state
export type DecisionMessageType = 1 | 2;

// Legacy type alias (for backward compatibility)
export type OnboardingMessageType = HelloMessageType;

// User state interface (расширенная версия)
export interface UserState {
  fsmState?: UserFSMState;                    // Текущий FSM state
  helloMessage?: HelloMessageType;            // Текущее сообщение в STATE_HELLO
  decisionMessage?: DecisionMessageType;      // Текущее сообщение в STATE_DECISION
  lastMessageId?: number;
  lastTimestamp: number;
  
  // Legacy field (deprecated, for migration compatibility)
  lastMessageType?: HelloMessageType;
}

// Default TTL in milliseconds (24 hours)
export const BUTTON_TTL_MS = 24 * 60 * 60 * 1000;

// Default TTL in seconds for Redis (24 hours)
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
