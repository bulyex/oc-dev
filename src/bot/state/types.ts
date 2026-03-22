// FSM States
export enum UserFSMState {
  STATE_HELLO = 'STATE_HELLO',           // Первые 5 приветственных сообщений
  STATE_DECISION = 'STATE_DECISION',     // Принятие решения (2 сообщения)
  STATE_ONBOARDING = 'STATE_ONBOARDING', // Основной онбординг (Vision, Goals, Plan)
}

// Onboarding substates (within STATE_ONBOARDING)
export enum OnboardingSubstate {
  VISION = 'VISION',   // Формирование Vision
  GOALS = 'GOALS',     // Future: Постановка целей
  PLAN = 'PLAN',       // Future: 12-недельный план
  TIME = 'TIME',       // Future: Предпочтения по времени
}

// Message types for HELLO state
export type HelloMessageType = 1 | 2 | 3 | 4 | 5;

// Message types for DECISION state
export type DecisionMessageType = 1 | 2;

// Legacy type alias (for backward compatibility)
export type OnboardingMessageType = HelloMessageType;

// Chat message for AI context
export interface ChatMessageHistory {
  role: 'user' | 'assistant';
  content: string;
}

// User state interface (расширенная версия)
export interface UserState {
  // FSM
  fsmState?: UserFSMState;
  
  // STATE_HELLO
  helloMessage?: HelloMessageType;
  
  // STATE_DECISION
  decisionMessage?: DecisionMessageType;
  
  // STATE_ONBOARDING
  onboardingSubstate?: OnboardingSubstate;
  vision?: string;                              // Принятый Vision
  visionMessageCount?: number;                  // Счётчик сообщений (без лимита)
  visionChatHistory?: ChatMessageHistory[];     // История диалога с AI
  draftProposed?: boolean;                     // Агент предложил черновик, "Готово!" доступна
  exampleShown?: boolean;                       // Пользователю показан пример, "Готово!" заблокирована пока не напишет своё
  
  // STATE_ONBOARDING GOALS substate
  goalsChatHistory?: ChatMessageHistory[];      // История диалога Goals-агента
  goalsFinalized?: boolean;                     // Цели финализированы (нажата "Принять")
  
  // STATE_ONBOARDING PLAN substate
  planChatHistory?: ChatMessageHistory[];       // История диалога Plan-агента
  planFinalized?: boolean;                      // План финализирован (нажата "Принять план")
  
  // Common
  lastMessageId?: number;
  lastTimestamp: number;
  
  // Legacy field (deprecated, for migration compatibility)
  lastMessageType?: HelloMessageType;
}

// Default TTL in milliseconds (24 hours)
export const BUTTON_TTL_MS = 24 * 60 * 60 * 1000;

// Default TTL in seconds for Redis (24 hours)
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
