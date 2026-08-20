/**
 * Canonical India Standard Time (IST / Asia/Kolkata) Date & Time Utilities
 * Strictly uses Intl.DateTimeFormat with timeZone: 'Asia/Kolkata' to prevent
 * timezone conversion bugs between server/container (UTC) and local India time.
 */

export interface IndiaTimeParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;// 0-59
  second: number;// 0-59
  dateStr: string; // "YYYY-MM-DD"
  time12Str: string; // "hh:mm AM/PM"
  is18OrLater: boolean; // true if IST hour >= 18 (6:00 PM IST or later)
  isEndOfDayOrLater: boolean; // true if IST hour === 23 && minute >= 59 (11:59 PM IST or later)
}

/**
 * Extracts exact calendar and clock components in Asia/Kolkata (IST) timezone.
 */
export const getIndiaTimeParts = (inputDate: Date = new Date()): IndiaTimeParts => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(inputDate);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const year = parseInt(partMap['year'] || '2026', 10);
  const month = parseInt(partMap['month'] || '1', 10);
  const day = parseInt(partMap['day'] || '1', 10);
  const rawHour = parseInt(partMap['hour'] || '0', 10);
  const hour = rawHour === 24 ? 0 : rawHour; // Normalize 24:00 to 00:00
  const minute = parseInt(partMap['minute'] || '0', 10);
  const second = parseInt(partMap['second'] || '0', 10);

  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const dateStr = `${year}-${monthStr}-${dayStr}`;

  // Format 12-hour string (e.g., "06:00 PM")
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const time12Str = `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateStr,
    time12Str,
    is18OrLater: hour >= 18, // 6:00 PM IST or later
    isEndOfDayOrLater: hour === 23 && minute >= 59 // 11:59 PM IST or later
  };
};

/**
 * Returns current business date string formatted as "YYYY-MM-DD" in Asia/Kolkata.
 */
export const getIndiaDateStr = (inputDate: Date = new Date()): string => {
  return getIndiaTimeParts(inputDate).dateStr;
};

/**
 * Returns 12-hour formatted time string in Asia/Kolkata (e.g. "06:00 PM").
 */
export const getIndiaFormattedTimeStr = (inputDate: Date = new Date()): string => {
  return getIndiaTimeParts(inputDate).time12Str;
};

/**
 * Checks whether current Asia/Kolkata time is at or after 11:59 PM (23:59 IST).
 */
export const isIndiaBusinessDayEnded = (inputDate: Date = new Date()): boolean => {
  return getIndiaTimeParts(inputDate).isEndOfDayOrLater;
};
