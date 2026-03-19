// Message types for onboarding flow
export type OnboardingMessageType = 1 | 2 | 3 | 4 | 5;

// User state interface
export interface UserState {
  lastMessageType: OnboardingMessageType;
  lastMessageId?: number;
  lastTimestamp: number;
}

// Default TTL in milliseconds (24 hours)
export const BUTTON_TTL_MS = 24 * 60 * 60 * 1000;

// Default TTL in seconds for Redis (24 hours)
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
