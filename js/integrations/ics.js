// On-device calendar file (.ics / iCalendar, RFC 5545) import.
// The file is read in the browser and never uploaded anywhere.
//
// Supported:
//  - Single and all-day events, DTEND or DURATION
//  - Times in UTC ("Z", converted to this device's time zone) or local/TZID
//    times (used as written, which is correct when the calendar and the device
//    share a time zone)
//  - Recurring events: DAILY, WEEKLY, MONTHLY and YEARLY with INTERVAL, COUNT,
//    UNTIL, BYDAY (including "2TU" / "-1FR" style), BYMONTHDAY, BYMONTH, WKST
//  - EXDATE (skipped occurrences) and RECURRENCE-ID (moved/edited occurrences)
//  - STATUS:CANCELLED is skipped; TRANSP:TRANSPARENT or Outlook "Free" is not busy
// Only the title, time and location are kept. Descriptions, attendees and
// notes are discarded for privacy and storage reasons.

import { INTEGRATIONS } from '../logic/config.js';
import {
  addDays, fromDayNumber, localISODate, minutesToTime, timeToMinutes, toDayNumber, weekday,
} from '../logic/dates.js';
import { normalizeEvent } from './contract.js';

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAY_CODES = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function unfoldLines(text) {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

export function parseContentLine(line) {
  let inQuotes = false;
  let i = 0;
  for (; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ':' && !inQuotes) break;
  }
  const [name, ...rawParams] = line.slice(0, i).split(';');
  const params = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

export function unescapeText(v) {
  return v.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? ' ' : c)).trim();
}

/** Returns { calendarName, events: [{ get(name), all(name) }] } */
export function parseICS(text) {
  if (typeof text !== 'string' || !/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error('This file is not a calendar (.ics) file.');
  }
  const stack = [];
  const events = [];
  let current = null;
  let calendarName = '';
  for (const line of unfoldLines(text)) {
    if (!line.trim()) continue;
    const prop = parseContentLine(line);
    if (prop.name === 'BEGIN') {
      const kind = prop.value.trim().toUpperCase();
      stack.push(kind);
      if (kind === 'VEVENT') current = [];
      continue;
    }
    if (prop.name === 'END') {
      const kind = stack.pop();
      if (kind === 'VEVENT' && current) {
        const props = current;
        events.push({
          get: (n) => props.find((p) => p.name === n),
          all: (n) => props.filter((p) => p.name === n),
        });
        current = null;
      }
      continue;
    }
    const top = stack[stack.length - 1];
    if (top === 'VEVENT' && current) current.push(prop);
    else if (top === 'VCALENDAR' && prop.name === 'X-WR-CALNAME') calendarName = unescapeText(prop.value);
  }
  return { calendarName, events };
}

/** DATE or DATE-TIME value → { date, time, allDay } in local time, or null. */
export function parseDateTime(value, params = {}) {
  const v = (value || '').trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || params.VALUE === 'DATE') {
    m = m || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null, allDay: true };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  if (m[7]) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
    return { date: localISODate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, allDay: false };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}`, allDay: false };
}

/** ISO 8601 duration → minutes (P1D = 1440, PT1H30M = 90). */
export function parseDuration(value) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec((value || '').trim());
  if (!m) return null;
  const mins = (+(m[2] || 0)) * 10080 + (+(m[3] || 0)) * 1440 + (+(m[4] || 0)) * 60 + (+(m[5] || 0));
  return m[1] === '-' ? -mins : mins;
}

export function parseRRule(value) {
  const rule = {};
  for (const part of (value || '').split(';')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined) rule[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  return rule;
}

const SUPPORTED_KEYS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST']);

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Builds a test function day-number → boolean for a recurrence rule, or null if unsupported. */
export function recurrenceMatcher(rule, startDate) {
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.FREQ)) return null;
  if (Object.keys(rule).some((k) => !SUPPORTED_KEYS.has(k))) return null;
  const interval = Math.max(1, parseInt(rule.INTERVAL || '1', 10) || 1);
  const startDay = toDayNumber(startDate);
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const wkst = WEEKDAY_CODES[rule.WKST] ?? 1;

  const byDay = rule.BYDAY ? rule.BYDAY.split(',').map((t) => {
    const mm = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(t.trim());
    return mm ? { n: mm[1] ? parseInt(mm[1], 10) : 0, wd: WEEKDAY_CODES[mm[2]] } : null;
  }) : null;
  if (byDay && byDay.some((b) => b === null)) return null;
  if (byDay && ['DAILY', 'WEEKLY'].includes(rule.FREQ) && byDay.some((b) => b.n !== 0)) return null;
  const byMonthDay = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null;
  if (byMonthDay && byMonthDay.some((n) => !Number.isInteger(n) || n === 0)) return null;
  const byMonth = rule.BYMONTH ? rule.BYMONTH.split(',').map(Number) : null;

  const weekStart = (day) => day - ((weekday(fromDayNumber(day)) - wkst + 7) % 7);

  const monthDayMatch = (y, m, d) => (byMonthDay || [sd]).some((n) => (n > 0 ? n === d : daysInMonth(y, m) + n + 1 === d));
  const weekdayInMonthMatch = (y, m, d, wd) => byDay.some((b) => {
    if (b.wd !== wd) return false;
    if (b.n === 0) return true;
    const nth = Math.ceil(d / 7);
    const fromEnd = -Math.ceil((daysInMonth(y, m) - d + 1) / 7);
    return b.n === nth || b.n === fromEnd;
  });

  return (day) => {
    if (day < startDay) return false;
    const date = fromDayNumber(day);
    const wd = weekday(date);
    const [y, m, d] = date.split('-').map(Number);
    switch (rule.FREQ) {
      case 'DAILY':
        return (day - startDay) % interval === 0 && (!byDay || byDay.some((b) => b.wd === wd));
      case 'WEEKLY': {
        const weeks = (weekStart(day) - weekStart(startDay)) / 7;
        return weeks % interval === 0 && (byDay ? byDay.some((b) => b.wd === wd) : wd === weekday(startDate));
      }
      case 'MONTHLY': {
        const months = (y * 12 + m) - (sy * 12 + sm);
        if (months % interval !== 0) return false;
        return byDay ? weekdayInMonthMatch(y, m, d, wd) : monthDayMatch(y, m, d);
      }
      case 'YEARLY': {
        if ((y - sy) % interval !== 0) return false;
        if (!(byMonth || [sm]).includes(m)) return false;
        return byDay ? weekdayInMonthMatch(y, m, d, wd) : monthDayMatch(y, m, d);
      }
      default:
        return false;
    }
  };
}

/** Small deterministic hash so re-importing the same file gives the same ids. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Converts an .ics file into CalendarEvent objects within a date window.
 * @returns {{ calendarName, events, stats: { found, imported, cancelled, outsideWindow, limitedRecurrence, truncated } }}
 */
export function eventsFromICS(text, { sourceId, category, today }) {
  const windowStart = addDays(today, -INTEGRATIONS.icsPastDays);
  const windowEnd = addDays(today, INTEGRATIONS.icsFutureDays);
  const ws = toDayNumber(windowStart);
  const we = toDayNumber(windowEnd);
  const { calendarName, events: raw } = parseICS(text);
  const stats = { found: raw.length, imported: 0, cancelled: 0, outsideWindow: 0, limitedRecurrence: 0, truncated: false };

  // Occurrences that were moved or edited (RECURRENCE-ID) replace the original date.
  const overridden = new Map();
  for (const ev of raw) {
    const rid = ev.get('RECURRENCE-ID');
    const uid = ev.get('UID')?.value || '';
    if (rid && uid) {
      const p = parseDateTime(rid.value, rid.params);
      if (p) {
        if (!overridden.has(uid)) overridden.set(uid, new Set());
        overridden.get(uid).add(p.date);
      }
    }
  }

  const out = [];
  const seen = new Set();
  for (const ev of raw) {
    if ((ev.get('STATUS')?.value || '').trim().toUpperCase() === 'CANCELLED') { stats.cancelled += 1; continue; }
    const dtstart = ev.get('DTSTART');
    const start = dtstart && parseDateTime(dtstart.value, dtstart.params);
    if (!start) continue;

    const uid = ev.get('UID')?.value || `${start.date}${start.time || ''}${ev.get('SUMMARY')?.value || ''}`;
    const title = unescapeText(ev.get('SUMMARY')?.value || '') || '(No title)';
    const location = unescapeText(ev.get('LOCATION')?.value || '');
    const transp = (ev.get('TRANSP')?.value || '').trim().toUpperCase();
    const busyStatus = (ev.get('X-MICROSOFT-CDO-BUSYSTATUS')?.value || '').trim().toUpperCase();
    const busy = transp !== 'TRANSPARENT' && busyStatus !== 'FREE';

    // Duration (minutes for timed events, days for all-day events).
    const dtend = ev.get('DTEND');
    const end = dtend && parseDateTime(dtend.value, dtend.params);
    const durProp = ev.get('DURATION');
    let duration;
    if (start.allDay) {
      if (end) duration = Math.max(1, toDayNumber(end.date) - toDayNumber(start.date));
      else if (durProp) duration = Math.max(1, Math.round((parseDuration(durProp.value) || 1440) / 1440));
      else duration = 1;
    } else if (end && !end.allDay) {
      duration = Math.max(0, (toDayNumber(end.date) * 1440 + timeToMinutes(end.time)) - (toDayNumber(start.date) * 1440 + timeToMinutes(start.time)));
    } else if (durProp) {
      duration = Math.max(0, parseDuration(durProp.value) || 0);
    } else {
      duration = 0;
    }

    // Which dates does it occur on?
    let dates = [];
    const rrule = ev.get('RRULE');
    const isOverride = Boolean(ev.get('RECURRENCE-ID'));
    if (rrule && !isOverride) {
      const rule = parseRRule(rrule.value);
      const matches = recurrenceMatcher(rule, start.date);
      if (!matches) {
        stats.limitedRecurrence += 1;
        dates = [start.date];
      } else {
        const excluded = new Set(overridden.get(uid) || []);
        for (const ex of ev.all('EXDATE')) {
          for (const v of ex.value.split(',')) {
            const p = parseDateTime(v, ex.params);
            if (p) excluded.add(p.date);
          }
        }
        let untilDay = Infinity;
        if (rule.UNTIL) {
          const u = parseDateTime(rule.UNTIL, {});
          if (u) untilDay = toDayNumber(u.date);
        }
        const count = rule.COUNT ? parseInt(rule.COUNT, 10) : 0;
        const startDay = toDayNumber(start.date);
        const last = Math.min(we, untilDay, startDay + 366 * 30);
        let n = 0;
        for (let day = count ? startDay : Math.max(startDay, ws); day <= last; day += 1) {
          if (!matches(day)) continue;
          n += 1;
          if (count && n > count) break;
          const date = fromDayNumber(day);
          if (day >= ws && !excluded.has(date)) dates.push(date);
        }
      }
    } else {
      dates = [start.date];
    }

    const inWindow = dates.filter((d) => {
      const day = toDayNumber(d);
      return day >= ws && day <= we;
    });
    if (!inWindow.length) { stats.outsideWindow += 1; continue; }

    for (const date of inWindow) {
      let id = `e_${hash(`${sourceId}|${uid}|${date}|${start.time || ''}`)}`;
      while (seen.has(id)) id += 'x';
      seen.add(id);
      let event;
      if (start.allDay) {
        event = { id, sourceId, title, location, busy, date, endDate: addDays(date, duration - 1), allDay: true, startTime: null, endTime: null };
      } else {
        const s = toDayNumber(date) * 1440 + timeToMinutes(start.time);
        const e = s + duration;
        event = {
          id, sourceId, title, location, busy, date, allDay: false,
          startTime: start.time, endDate: fromDayNumber(Math.floor(e / 1440)), endTime: minutesToTime(e % 1440),
        };
      }
      out.push(normalizeEvent(event, category));
    }
  }

  out.sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  if (out.length > INTEGRATIONS.maxEventsPerSource) {
    stats.truncated = true;
    out.length = INTEGRATIONS.maxEventsPerSource;
  }
  stats.imported = out.length;
  return { calendarName, events: out, windowStart, windowEnd, stats };
}
