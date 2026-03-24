import { DateTime } from 'luxon';

/**
 * Moscow timezone constant
 */
export const MOSCOW_TIMEZONE = 'Europe/Moscow';

/**
 * Get current datetime in Moscow timezone
 */
export function getMoscowNow(): DateTime {
  return DateTime.now().setZone(MOSCOW_TIMEZONE);
}

/**
 * Get start of today in Moscow timezone as UTC Date
 */
export function getMoscowTodayStart(): Date {
  return getMoscowNow().startOf('day').toJSDate();
}

/**
 * Get end of today in Moscow timezone as UTC Date
 */
export function getMoscowTodayEnd(): Date {
  return getMoscowNow().endOf('day').toJSDate();
}

/**
 * Get current day of week in Moscow timezone (1-7, Monday=1)
 */
export function getMoscowDayOfWeek(): number {
  const weekday = getMoscowNow().weekday;
  return weekday; // Luxon: 1=Monday, 7=Sunday
}

/**
 * Get Moscow date for a specific day offset from today
 */
export function getMoscowDateForDayOffset(dayOffset: number): Date {
  return getMoscowNow()
    .plus({ days: dayOffset })
    .startOf('day')
    .toJSDate();
}

/**
 * Check if a date is today in Moscow timezone
 */
export function isMoscowToday(date: Date): boolean {
  const moscowDate = DateTime.fromJSDate(date).setZone(MOSCOW_TIMEZONE);
  const moscowNow = getMoscowNow();
  return moscowDate.hasSame(moscowNow, 'day');
}

/**
 * Get Moscow start of day for a given date
 */
export function getMoscowStartOfDay(date: Date): Date {
  return DateTime.fromJSDate(date)
    .setZone(MOSCOW_TIMEZONE)
    .startOf('day')
    .toJSDate();
}
