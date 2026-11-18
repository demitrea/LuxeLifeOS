// Date helpers. Dates are stored as local "YYYY-MM-DD" strings and converted
// to whole day numbers through UTC, so daylight-saving changes and time zones
// can never shift a calculation by a day.

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export function toDayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** True only for a real calendar date written as YYYY-MM-DD. */
export function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return fromDayNumber(toDayNumber(value)) === value;
}

export function addDays(iso, days) {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from, to) {
  return toDayNumber(to) - toDayNumber(from);
}

/** 0 = Sunday … 6 = Saturday (same numbering as JavaScript). */
export function weekday(iso) {
  return new Date(toDayNumber(iso) * DAY_MS).getUTCDay();
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso) {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

export function localISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localISODateTime(date = new Date()) {
  return `${localISODate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** "HH:MM" → minutes after midnight, or NaN if invalid. */
export function timeToMinutes(hhmm) {
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return NaN;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return NaN;
  return h * 60 + m;
}

export function minutesToTime(total) {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** 90 → "1 h 30 min". */
export function formatMinutes(total) {
  const m = Math.max(0, Math.round(total || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h} h ${r} min`;
  if (h) return `${h} h`;
  return `${r} min`;
}

/** 330 → "5.5". */
export function formatHours(total) {
  return String(Math.round(((total || 0) / 60) * 10) / 10);
}

/** Human label for a number of days from today. */
export function relativeDayLabel(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days < 0) return `${-days} days ago`;
  return `in ${days} days`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-11-19" → "Thu, Nov 19" (short) or "Thursday, November 19" (long). */
export function formatDate(iso, style = 'short') {
  if (!isISODate(iso)) return '';
  const [, m, d] = iso.split('-').map(Number);
  const wd = weekday(iso);
  if (style === 'long') return `${WEEKDAYS[wd]}, ${MONTHS[m - 1]} ${d}`;
  if (style === 'month') return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
  return `${WEEKDAYS[wd].slice(0, 3)}, ${MONTHS[m - 1].slice(0, 3)} ${d}`;
}
