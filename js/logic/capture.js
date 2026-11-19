// Quick capture: turns a typed or dictated note into proposed tasks,
// follow-ups and protected time — using fixed, published rules only.
//
// Principles (enforced by tests in tests/capture.test.js):
//  - One statement → at most one proposed item. Nothing is invented.
//  - A date, time, life area or importance is set only when the user's own
//    words (or their saved day-part settings) support it. Every value carries
//    the words it came from.
//  - Vague phrases ("next week", "soon") never become dates.
//  - A question is asked only when ambiguity would change a deadline, a
//    time-sensitive commitment or a boundary. Each answer is a tap.
//  - When a statement cannot be interpreted confidently, the item keeps the
//    user's exact wording.
//
// Pure functions: no browser APIs, no clock (today is passed in), no network.

import { CAPTURE } from './config.js';
import { addDays, formatDate, isISODate, minutesToTime, weekday } from './dates.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const PARTS = ['morning', 'afternoon', 'evening'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const titleWeekday = (wd) => cap(WEEKDAYS[wd]);

/** Soonest given weekday after today (or including today when includeToday). */
export function nextWeekday(today, wd, includeToday = false) {
  const diff = (wd - weekday(today) + 7) % 7;
  return addDays(today, diff === 0 && !includeToday ? 7 : diff);
}

function dayPart(settings, part) {
  const dp = (settings && settings.dayParts) || CAPTURE.defaultDayParts;
  return dp[part] || CAPTURE.defaultDayParts[part];
}

// ---------------------------------------------------------------------------
// 1. Splitting a note into statements
// ---------------------------------------------------------------------------

// A new statement starts after a separator only if it begins with one of these.
const ACTION_START = new RegExp(String.raw`^(?:(?:and|then|also|plus)\s+)?(?:i\s+(?:also\s+|still\s+|really\s+)?|i'm\s+|i am\s+|i've\s+|i'll\s+|i'd\s+|we\s+)?`
  + String.raw`(?:need|needs|have|has|got|gotta|must|should|want|wants|would|like|remind|remember|don't|do not|make sure|follow|check|call|email|e-mail|text|message|submit|finish|pay|book|schedule|meet|protect|block|keep|reserve|plan|buy|pick|send|prepare|review|write|study|read|clean|register|renew|return|apply|ask|tell|start|get|go|visit|cancel|fix|order|file|update|draft|research|confirm|reply|respond|chase|hear|touch|no work)\b`, 'i');

const ABBREVIATION_END = /\b(?:[ap]\.m|dr|mr|mrs|ms|prof|st|vs|etc|jr|sr|no)\.$/i;

/** Splits a note into statements, keeping each statement's exact wording. */
export function splitStatements(text) {
  const src = String(text || '');
  const sentences = [];
  let start = 0;
  const re = /[.!?;]+(?=\s|$)|\n+/g;
  let m;
  while ((m = re.exec(src))) {
    const end = m.index + m[0].length;
    if (m[0][0] === '.' && ABBREVIATION_END.test(src.slice(start, end).trimEnd())) continue;
    sentences.push(src.slice(start, end));
    start = end;
  }
  sentences.push(src.slice(start));

  const out = [];
  for (const sentence of sentences) {
    const s = sentence.trim().replace(/[.!?;]+$/, '').trim();
    if (!s) continue;
    const sep = /\s*,\s*(?:(?:and|then|also|plus)\s+)?|\s+(?:and|then|also|plus)\s+/gi;
    let last = 0;
    let match;
    while ((match = sep.exec(s))) {
      const right = s.slice(match.index + match[0].length);
      if (ACTION_START.test(right)) {
        const piece = s.slice(last, match.index).trim();
        if (piece) out.push(piece);
        last = match.index + match[0].length;
      }
    }
    const tail = s.slice(last).trim();
    if (tail) out.push(tail);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Finding dates, times and durations (with the exact words they came from)
// ---------------------------------------------------------------------------

function parseClock(h, m, ap) {
  let hour = Number(h);
  const minute = Number(m || 0);
  if (hour > 23 || minute > 59) return null;
  const suffix = ap ? ap.replace(/\./g, '').toLowerCase() : '';
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    hour %= 12;
    if (suffix === 'pm') hour += 12;
    return { exact: hour * 60 + minute };
  }
  // 24-hour form (13:00–23:59, or a leading zero like 09:30) is exact.
  if (hour >= 13 || (m !== undefined && String(h).length === 2 && String(h)[0] === '0') || hour === 0) {
    return { exact: hour * 60 + minute };
  }
  return { ambiguous: { hour, minute } }; // 1–12 with no am/pm
}

function findTokens(text, today) {
  const lower = text.toLowerCase();
  const taken = new Array(text.length).fill(false);
  const tokens = [];
  const free = (a, b) => { for (let i = a; i < b; i += 1) if (taken[i]) return false; return true; };
  const take = (a, b) => { for (let i = a; i < b; i += 1) taken[i] = true; };
  const scan = (re, handler) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(lower))) {
      const a = m.index;
      const b = a + m[0].length;
      if (!m[0] || !free(a, b)) continue;
      const tok = handler(m, a, b);
      if (tok) {
        tokens.push({ start: a, end: b, words: text.slice(a, b), ...tok });
        take(a, b);
      }
    }
  };
  const wdNames = WEEKDAYS.join('|');
  const partRe = '(morning|afternoon|evening|night)s?';

  // Recurring patterns
  scan(new RegExp(String.raw`\b(?:every\s+(?:single\s+)?day|daily)\b`, 'g'), () => ({ type: 'date', days: ALL_DAYS, rule: 'every day' }));
  scan(/\b(?:every\s+weekday|weekdays|on\s+weekdays)\b/g, () => ({ type: 'date', days: [1, 2, 3, 4, 5], rule: 'every weekday' }));
  scan(/\b(?:every\s+weekend|weekends|on\s+weekends)\b/g, () => ({ type: 'date', days: [0, 6], rule: 'every weekend' }));
  scan(new RegExp(String.raw`\b(?:every\s+(${wdNames})|(?:on\s+)?(${wdNames})s)(?:\s+${partRe})?\b`, 'g'), (m) => {
    const wd = WEEKDAYS.indexOf(m[1] || m[2]);
    return { type: 'date', days: [wd], part: m[3] === 'night' ? 'evening' : m[3], rule: `every ${titleWeekday(wd)}` };
  });
  scan(new RegExp(String.raw`\b(?:every\s+${partRe.replace('s?', '')}|(morning|afternoon|evening|night)s)\b`, 'g'), (m) => {
    const p = m[1] || m[2];
    return { type: 'date', days: ALL_DAYS, part: p === 'night' ? 'evening' : p, rule: `every ${p}` };
  });

  // Relative days
  scan(/\b(?:the\s+)?day after tomorrow\b/g, () => ({ type: 'date', date: addDays(today, 2), rule: 'the day after tomorrow' }));
  scan(new RegExp(String.raw`\btomorrow(?:\s+${partRe})?\b`, 'g'), (m) => ({
    type: 'date', date: addDays(today, 1), part: m[1] === 'night' ? 'evening' : m[1], rule: 'tomorrow',
  }));
  scan(/\b(?:tonight|this\s+(morning|afternoon|evening))\b/g, (m) => ({
    type: 'date', date: today, part: m[1] || 'evening', rule: m[1] ? `this ${m[1]}` : 'tonight',
  }));
  scan(/\btoday\b/g, () => ({ type: 'date', date: today, rule: 'today' }));
  scan(/\bin\s+(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?)\b/g, (m) => {
    const n = NUMBER_WORDS[m[1]] ?? Number(m[1]);
    const days = m[2].startsWith('week') ? n * 7 : n;
    return { type: 'date', date: addDays(today, days), rule: `in ${days} day${days === 1 ? '' : 's'}` };
  });

  // Weekends (one-time)
  scan(/\b(this|next)?\s*weekend\b/g, (m) => {
    const wd = weekday(today);
    const sat = wd === 0 ? addDays(today, -1) : nextWeekday(today, 6, true);
    const thisWeekend = wd === 0 ? [today] : [sat, addDays(sat, 1)];
    if (m[1] === 'next') {
      if (wd === 6 || wd === 0) return { type: 'date', dates: [addDays(sat, 7), addDays(sat, 8)], rule: 'next weekend' };
      return {
        type: 'date', dates: null, rule: 'next weekend',
        choices: [
          { label: `This coming weekend (${formatDate(sat, 'month')}–${formatDate(addDays(sat, 1), 'month')})`, dates: [sat, addDays(sat, 1)] },
          { label: `The weekend after (${formatDate(addDays(sat, 7), 'month')}–${formatDate(addDays(sat, 8), 'month')})`, dates: [addDays(sat, 7), addDays(sat, 8)] },
        ],
      };
    }
    return { type: 'date', dates: thisWeekend, rule: 'this weekend' };
  });

  // Weekday names (one-time)
  scan(new RegExp(String.raw`\b(?:(this|next|on|coming)\s+)?(${wdNames})(?:\s+${partRe})?\b`, 'g'), (m) => {
    const wd = WEEKDAYS.indexOf(m[2]);
    const part = m[3] === 'night' ? 'evening' : m[3];
    const name = titleWeekday(wd);
    const soonest = nextWeekday(today, wd, false);
    if (m[1] === 'this') {
      return { type: 'date', date: nextWeekday(today, wd, true), part, rule: `this ${name} (the soonest ${name}, including today)` };
    }
    if (m[1] === 'next') {
      // Unambiguous when the soonest one already falls in next week (Mon–Sun).
      const daysToSunday = (7 - weekday(today)) % 7;
      if ((wd - weekday(today) + 7) % 7 > daysToSunday || wd === weekday(today)) {
        const date = wd === weekday(today) ? addDays(today, 7) : soonest;
        return { type: 'date', date, part, rule: `next ${name}` };
      }
      return {
        type: 'date', date: null, part, rule: `next ${name}`,
        choices: [
          { label: `This ${name}, ${formatDate(soonest, 'month')}`, date: soonest },
          { label: `${name} the week after, ${formatDate(addDays(soonest, 7), 'month')}`, date: addDays(soonest, 7) },
        ],
      };
    }
    if (wd === weekday(today)) {
      return {
        type: 'date', date: null, part, rule: name,
        choices: [
          { label: `Today, ${formatDate(today, 'month')}`, date: today },
          { label: `Next ${name}, ${formatDate(addDays(today, 7), 'month')}`, date: addDays(today, 7) },
        ],
      };
    }
    return { type: 'date', date: soonest, part, rule: `${name} (the next ${name} after today)` };
  });

  // Calendar dates
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
  const resolveMonthDay = (mo, d, y) => {
    let year = y ? Number(y.length === 2 ? `20${y}` : y) : Number(today.slice(0, 4));
    let iso = isoOf(year, mo, d);
    if (!isISODate(iso)) return null;
    if (!y && iso < today) {
      year += 1;
      iso = isoOf(year, mo, d);
      if (!isISODate(iso)) return null;
    }
    return iso;
  };
  scan(new RegExp(String.raw`\b(${monthNames})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b`, 'g'), (m) => {
    const date = resolveMonthDay(MONTHS[m[1]], Number(m[2]), m[3]);
    return date ? { type: 'date', date, rule: `${m[1]} ${m[2]}${m[3] ? '' : ' (the next one on or after today)'}` } : null;
  });
  scan(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${monthNames})(?:,?\s+(\d{4}))?\b`, 'g'), (m) => {
    const date = resolveMonthDay(MONTHS[m[2]], Number(m[1]), m[3]);
    return date ? { type: 'date', date, rule: `${m[1]} ${m[2]}` } : null;
  });
  scan(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/g, (m) => {
    const date = resolveMonthDay(Number(m[1]), Number(m[2]), m[3]);
    return date ? { type: 'date', date, rule: `${m[0]} (month/day)` } : null;
  });
  scan(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/g, (m) => {
    const d = Number(m[1]);
    const [y, mo] = today.split('-').map(Number);
    let iso = isoOf(y, mo, d);
    if (!isISODate(iso) || iso < today) iso = mo === 12 ? isoOf(y + 1, 1, d) : isoOf(y, mo + 1, d);
    return isISODate(iso) ? { type: 'date', date: iso, rule: `the ${m[1]}${m[0].slice(-2)} (next one on or after today)` } : null;
  });

  // Vague phrases — recorded so they are never turned into a date.
  scan(/\b(?:next\s+week|this\s+week|next\s+month|this\s+month|end\s+of\s+(?:the\s+)?(?:week|month|year)|soon|later|sometime|at some point)\b/g,
    () => ({ type: 'vague' }));

  // Times
  const ap = String.raw`(a\.?m\.?|p\.?m\.?)`;
  scan(new RegExp(String.raw`\b(from\s+|between\s+)?(\d{1,2})(?::(\d{2}))?\s*${ap}?\s*(-|–|to|until|till|and)\s*(\d{1,2})(?::(\d{2}))?\s*${ap}?(?=\W|$)`, 'g'), (m0) => {
    // Drop the connector group so the indexes below stay readable.
    const m = [m0[0], m0[1], m0[2], m0[3], m0[4], m0[6], m0[7], m0[8]];
    const connector = m0[5];
    // "and" only counts with "between"; bare "6 to 8" counts (its am/pm may be asked).
    const hasSignal = m[1] || m[4] || m[7] || m[3] !== undefined || m[6] !== undefined || connector !== 'and';
    if (!hasSignal) return null;
    let firstAp = m[4];
    const secondAp = m[7];
    if (!firstAp && secondAp) {
      // "6 to 8 pm" → both pm, unless that would put the start after the end ("11 to 1 pm").
      const h1 = Number(m[2]) % 12;
      const h2 = Number(m[5]) % 12;
      const sp = secondAp.replace(/\./g, '').toLowerCase();
      firstAp = sp === 'pm' && h1 > h2 ? 'am' : sp;
    }
    const a = parseClock(m[2], m[3], firstAp);
    const b = parseClock(m[5], m[6], secondAp);
    if (!a || !b) return null;
    return { type: 'range', a, b };
  });
  scan(new RegExp(String.raw`\b(after|before|until|till|from|at|by|around)?\s*(\d{1,2})(?::(\d{2}))?\s*${ap}(?=\W|$)`, 'g'), (m) => {
    const t = parseClock(m[2], m[3], m[4]);
    return t ? { type: 'time', ...t, cue: m[1] || null } : null;
  });
  scan(/\b(after|before|until|till|from|at|by|around)?\s*([01]?\d|2[0-3]):([0-5]\d)\b/g, (m) => {
    const t = parseClock(m[2], m[3], null);
    return t ? { type: 'time', ...t, cue: m[1] || null } : null;
  });
  scan(/\b(after|before|until|till|from|at|by|around)\s+(\d{1,2})(?:\s*o'?clock)?\b(?![:/\d%]|\s*(?:st|nd|rd|th|am|pm|a\.m|p\.m|days?|weeks?|hours?|minutes?|mins?|hrs?))/g, (m) => {
    const t = parseClock(m[2], undefined, null);
    return t ? { type: 'time', ...t, cue: m[1] } : null;
  });
  scan(/\b(at\s+)?(noon|midday)\b/g, () => ({ type: 'time', exact: 12 * 60, cue: 'at' }));

  // Standalone time-of-day words ("protect the evening on Friday")
  scan(/\b(?:in\s+the\s+|the\s+)?(morning|afternoon|evening)\b/g, (m) => ({ type: 'part', part: m[1] }));

  // Durations ("for 2 hours")
  scan(/\bfor\s+(\d{1,3}|an?|one|two|three|four|five|six|seven|eight|half\s+an?)\s+(hours?|hrs?|minutes?|mins?)\b/g, (m) => {
    const isHalf = m[1].startsWith('half');
    const n = isHalf ? 0.5 : (NUMBER_WORDS[m[1]] ?? Number(m[1]));
    const minutes = Math.round(m[2].startsWith('h') ? n * 60 : n);
    return minutes > 0 ? { type: 'duration', minutes } : null;
  });
  scan(/\bfor\s+half\s+an\s+hour\b/g, () => ({ type: 'duration', minutes: 30 }));

  return tokens.sort((x, y) => x.start - y.start);
}

// ---------------------------------------------------------------------------
// 3. Interpreting one statement
// ---------------------------------------------------------------------------

const PROTECT_RE = /\b(protect(?:ed|ing)?|block(?:ed)?\s+(?:off|out)|keep\b.{0,40}\bfree|free\s+from\s+work|no\s+work|off[- ]limits|do\s+not\s+schedule|don't\s+schedule|no\s+meetings)\b/i;
const FOLLOW_RE = /\b(follow(?:ing)?[- ]?up|check(?:ing)?\s+in\s+with|check\s+back|hear\s+back|waiting\s+(?:on|for)|chase|get\s+back\s+to|touch\s+base)\b/i;
const DUE_CUE_RE = /\b(?:due|by|before|deadline(?:\s+is)?|submit(?:ted)?(?:\s+by)?|turn(?:ed)?\s+in|hand(?:ed)?\s+in)\s+(?:on\s+)?(?:the\s+)?$/i;

const FILLER = [
  /^(?:and|then|also|plus|so|oh|um|uh|okay|ok|well)\b[\s,]*/i,
  /^(?:remind\s+me\s+to|remember\s+to|don't\s+forget\s+to|do\s+not\s+forget\s+to|make\s+sure\s+(?:i\s+|to\s+)?)\s*/i,
  /^(?:i\s+(?:also\s+|still\s+|really\s+)?|we\s+)?(?:need(?:s)?\s+to|have\s+to|have\s+got\s+to|got\s+to|gotta|must|should|want\s+to|would\s+like\s+to|am\s+going\s+to|will)\s+/i,
  /^(?:i've\s+got\s+to|i'd\s+like\s+to|i'm\s+going\s+to|i'll|i\s+will)\s+/i,
  /^(?:i\s+(?:also\s+)?(?:have|'ve\s+got|have\s+got)|i've\s+got|there's|there\s+is)\s+(?:(?:a|an|the|my|some)\s+)?/i,
  /^(?:i\s+)?(?:want|would\s+like|'d\s+like)\s+(?:(?:my|the)\s+)?/i,
];

function stripFiller(s) {
  let out = s.trim();
  for (let changed = true; changed;) {
    changed = false;
    for (const re of FILLER) {
      const next = out.replace(re, '');
      if (next !== out) { out = next.trim(); changed = true; }
    }
  }
  return out;
}

function removeSpans(text, spans) {
  let out = text;
  for (const s of [...spans].sort((a, b) => b.start - a.start)) {
    let a = s.start;
    // Also remove a connecting word right before the removed phrase.
    const before = out.slice(0, a);
    const cue = /\b(?:due|by|on|at|for|from|before|after|until|till|around|between|in|this|next|every)\s+$/i.exec(before);
    if (cue) a = cue.index;
    out = out.slice(0, a) + out.slice(s.end);
  }
  return out;
}

function tidyTitle(s) {
  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '')
    .replace(/\b(?:and|or|but)$/i, '')
    .trim();
}

function suggestArea(lower) {
  const matches = [];
  for (const [area, words] of Object.entries(CAPTURE.areaWords)) {
    const hit = words.find((w) => new RegExp(String.raw`\b${w.replace(/\s+/g, '\\s+')}\b`, 'i').test(lower));
    if (hit) matches.push({ area, word: hit });
  }
  if (matches.length === 1) return { domain: matches[0].area, word: matches[0].word };
  if (matches.length > 1) return { domain: null, ambiguous: matches };
  return { domain: null };
}

function suggestImportance(lower) {
  for (const group of CAPTURE.importanceWords) {
    const hit = group.words.find((w) => new RegExp(String.raw`\b${w.replace(/\s+/g, '\\s+')}\b`, 'i').test(lower));
    if (hit) return { level: group.level, word: hit };
  }
  return { level: CAPTURE.defaultImportance, word: null };
}

let idCounter = 0;
const draftId = () => `c${(idCounter += 1)}`;

function asWritten(original, reason) {
  return {
    id: draftId(), kind: 'task', original, confidence: 'as-written', title: original.trim(),
    domain: null, importance: CAPTURE.defaultImportance, dueDate: null, scheduledDate: null, startTime: null,
    estimateMinutes: null, isFollowUp: false, followUpDate: null, block: null,
    evidence: [{ words: original.trim(), meaning: `Kept exactly as you said it: ${reason}` }], questions: [],
  };
}

/** Time-of-day words the user said settle AM/PM: morning → AM; afternoon/evening/tonight → PM. */
function resolveWithPart(ambiguous, part) {
  if (!ambiguous || !part) return null;
  const h = ambiguous.hour % 12;
  return (part === 'morning' ? h : h + 12) * 60 + ambiguous.minute;
}

function ampmQuestion(id, prompt, makeSet, ambiguous) {
  const { hour, minute } = ambiguous;
  const label = `${hour}${minute ? `:${pad(minute)}` : ''}`;
  return {
    id, prompt: `${prompt} ${label} — morning or afternoon/evening?`,
    options: [
      { label: `${label} AM`, set: makeSet((hour % 12) * 60 + minute) },
      { label: `${label} PM`, set: makeSet(((hour % 12) + 12) * 60 + minute) },
    ],
    answer: null,
  };
}

/** Interprets one statement. Returns a proposed item (never more than one). */
export function interpretStatement(original, { today, settings } = {}) {
  const text = original.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const tokens = findTokens(text, today);
  const evidence = [];
  const questions = [];

  const dates = tokens.filter((t) => t.type === 'date');
  const ranges = tokens.filter((t) => t.type === 'range');
  const times = tokens.filter((t) => t.type === 'time');
  const parts = tokens.filter((t) => t.type === 'part');
  const durations = tokens.filter((t) => t.type === 'duration');
  const vague = tokens.filter((t) => t.type === 'vague');

  const isProtect = PROTECT_RE.test(text);
  const isFollow = !isProtect && FOLLOW_RE.test(text);

  // Too many dates in one statement to assign safely → keep as said.
  // A date is a deadline when "due"/"by"/… comes right before it — also across a
  // time in between ("by 5pm Monday", "due at 9 on Friday").
  const isDue = (d) => {
    const before = text.slice(Math.max(0, d.start - 40), d.start);
    const withoutTime = before.replace(/(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\s*(?:on\s+)?$/i, '');
    return DUE_CUE_RE.test(before) || (withoutTime !== before && DUE_CUE_RE.test(withoutTime));
  };
  const dueDates = dates.filter(isDue);
  const plainDates = dates.filter((d) => !dueDates.includes(d));
  if (dueDates.length > 1 || plainDates.length > 1 || times.length + ranges.length > 1) {
    return asWritten(text, 'it mentions several dates or times, so LuxeLifeOS did not guess which is which.');
  }

  vague.forEach((v) => evidence.push({ words: v.words, meaning: 'Not a specific date, so no date was set.' }));

  // ----- Protected time -----------------------------------------------------
  if (isProtect) {
    const d = dates[0];
    const block = { label: '', date: null, dates: null, days: [], start: null, end: null };
    const fmtRange = (s, e) => `${minutesToTime(s)}–${e >= 1439 ? '23:59' : minutesToTime(e)}`;

    if (d && d.days) {
      block.days = d.days;
      evidence.push({ words: d.words, meaning: `Repeats: ${d.rule}.` });
    } else if (d && d.dates) {
      block.dates = d.dates;
      evidence.push({ words: d.words, meaning: `${d.dates.map((x) => formatDate(x)).join(' and ')} (one time).` });
    } else if (d && d.date) {
      block.date = d.date;
      evidence.push({ words: d.words, meaning: `${formatDate(d.date)} — this one time only (${d.rule}).` });
    } else if (d && d.choices) {
      questions.push({
        id: 'q-date', prompt: `Which ${d.words.replace(/^(next|this|on|by)\s+/i, '')}?`,
        options: d.choices.map((c) => ({ label: c.label, set: c.dates ? { 'block.dates': c.dates } : { 'block.date': c.date } })),
        answer: null,
      });
      evidence.push({ words: d.words, meaning: 'More than one possible date — please choose.' });
    }

    // Time span
    const part = (d && d.part) || (parts[0] && parts[0].part);
    const r = ranges[0];
    const t = times[0];
    if (r) {
      if (r.a.exact !== undefined && r.b.exact !== undefined) {
        block.start = r.a.exact; block.end = r.b.exact;
        evidence.push({ words: r.words, meaning: fmtRange(block.start, block.end) });
      } else if (part && (r.a.exact !== undefined || resolveWithPart(r.a.ambiguous, part) !== null)) {
        block.start = r.a.exact !== undefined ? r.a.exact : resolveWithPart(r.a.ambiguous, part);
        block.end = r.b.exact !== undefined ? r.b.exact : resolveWithPart(r.b.ambiguous, part);
        evidence.push({ words: r.words, meaning: `${fmtRange(block.start, block.end)} ("${part}" tells AM or PM).` });
      } else {
        const a = r.a.ambiguous || { hour: Math.floor(r.a.exact / 60), minute: r.a.exact % 60 };
        const b = r.b.ambiguous || { hour: Math.floor(r.b.exact / 60), minute: r.b.exact % 60 };
        questions.push({
          id: 'q-ampm', prompt: `${r.words.trim()} — morning or afternoon/evening?`,
          options: [
            { label: 'AM', set: { 'block.start': (a.hour % 12) * 60 + a.minute, 'block.end': (b.hour % 12) * 60 + b.minute } },
            { label: 'PM', set: { 'block.start': ((a.hour % 12) + 12) * 60 + a.minute, 'block.end': ((b.hour % 12) + 12) * 60 + b.minute } },
          ],
          answer: null,
        });
      }
    } else if (t && (t.cue === 'after' || t.cue === 'from' || t.cue === 'before' || t.cue === 'until' || t.cue === 'till')) {
      const after = t.cue === 'after' || t.cue === 'from';
      const make = (mins) => (after ? { 'block.start': mins, 'block.end': 1439 } : { 'block.start': 0, 'block.end': mins });
      if (t.exact !== undefined) {
        Object.assign(block, after ? { start: t.exact, end: 1439 } : { start: 0, end: t.exact });
        evidence.push({ words: t.words, meaning: fmtRange(block.start, block.end) });
      } else if (resolveWithPart(t.ambiguous, part) !== null) {
        const mins = resolveWithPart(t.ambiguous, part);
        Object.assign(block, after ? { start: mins, end: 1439 } : { start: 0, end: mins });
        evidence.push({ words: t.words, meaning: `${fmtRange(block.start, block.end)} ("${part}" tells AM or PM).` });
      } else {
        questions.push(ampmQuestion('q-ampm', 'Protect', make, t.ambiguous));
      }
    } else if (t) {
      return asWritten(text, 'a single time was given without a start and end, so the protected period is unclear.');
    } else if (part) {
      const span = dayPart(settings, part);
      block.start = Number(span.start.slice(0, 2)) * 60 + Number(span.start.slice(3));
      block.end = Number(span.end.slice(0, 2)) * 60 + Number(span.end.slice(3));
      evidence.push({ words: part, meaning: `${span.start}–${span.end} ("${part}" in your settings).` });
    } else {
      const options = PARTS.map((p) => {
        const span = dayPart(settings, p);
        const toMin = (x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3));
        return { label: `${cap(p)} ${span.start}–${span.end}`, set: { 'block.start': toMin(span.start), 'block.end': toMin(span.end) } };
      });
      options.push({ label: 'All day', set: { 'block.start': 0, 'block.end': 1439 } });
      questions.push({ id: 'q-part', prompt: 'Which part of the day should be protected?', options, answer: null });
    }

    if (!d) {
      questions.push({
        id: 'q-days', prompt: 'Which days?',
        options: [
          { label: `Today only (${formatDate(today, 'month')})`, set: { 'block.date': today } },
          { label: 'Every day', set: { 'block.days': ALL_DAYS } },
          { label: 'Weekdays', set: { 'block.days': [1, 2, 3, 4, 5] } },
          { label: 'Weekends', set: { 'block.days': [0, 6] } },
        ],
        answer: null,
      });
    }

    // Label: purpose words if any ("for family"), otherwise the time words as said.
    const rest = tidyTitle(stripFiller(removeSpans(text, tokens)).replace(PROTECT_RE, ''));
    const purpose = /\bfor\s+(?!(?:me|myself|work)\b)([a-z][a-z\s']{1,40})$/i.exec(rest);
    const spoken = [d && d.words, r && r.words, t && t.words, !d?.part && parts[0] && parts[0].words]
      .filter(Boolean).map((w) => w.trim().replace(/^(?:on|at|from|in|the)\s+/i, '')).join(' ');
    block.label = cap(tidyTitle(purpose ? `${purpose[1]} time` : spoken)) || 'Protected time';

    return {
      id: draftId(), kind: 'protect', original: text, confidence: 'parsed', title: block.label,
      domain: null, importance: null, dueDate: null, scheduledDate: null, startTime: null, estimateMinutes: null,
      isFollowUp: false, followUpDate: null, block, evidence, questions,
    };
  }

  // ----- Tasks and follow-ups -------------------------------------------------
  const item = {
    id: draftId(), kind: isFollow ? 'followup' : 'task', original: text, confidence: 'parsed', title: '',
    domain: null, importance: CAPTURE.defaultImportance, dueDate: null, scheduledDate: null, startTime: null,
    estimateMinutes: null, isFollowUp: isFollow, followUpDate: null, block: null, evidence, questions,
  };

  // Vague words stay in the title (the user's wording is preserved).
  const consumed = [];
  const due = dueDates[0];
  const plain = plainDates[0];
  const assignDate = (tok, field, label) => {
    consumed.push(tok);
    if (tok.days) {
      // Recurring tasks are not supported yet: keep the words in the title instead.
      consumed.pop();
      evidence.push({ words: tok.words, meaning: 'Repeating tasks are not supported yet, so these words stay in the title.' });
      return;
    }
    if (tok.dates) {
      consumed.pop();
      evidence.push({ words: tok.words, meaning: 'A weekend is not one specific day, so no date was set.' });
      return;
    }
    if (tok.date) {
      item[field] = tok.date;
      evidence.push({ words: tok.words, meaning: `${label} ${formatDate(tok.date)} (${tok.rule}).` });
    } else if (tok.choices) {
      questions.push({
        id: `q-${field}`, prompt: `${label} which ${tok.words.replace(/^(next|this|on|by)\s+/i, '')}?`,
        options: tok.choices.map((c) => ({ label: c.label, set: { [field]: c.date } })),
        answer: null,
      });
      evidence.push({ words: tok.words, meaning: 'More than one possible date — please choose.' });
    }
  };
  if (due) assignDate(due, 'dueDate', 'Due');
  if (plain) assignDate(plain, isFollow ? 'followUpDate' : 'scheduledDate', isFollow ? 'Follow up' : 'Planned for');

  // Time of day for a task: needs a day it happens on.
  const t = times[0];
  if (t) {
    const dayField = isFollow ? 'followUpDate' : 'scheduledDate';
    const hasDay = Boolean(item[dayField]) || questions.some((q) => q.id === `q-${dayField}`);
    if (!hasDay && item.dueDate) {
      // "Submit by 5pm Monday": a deadline time. LuxeLifeOS tracks deadline dates only,
      // so the time words stay in the title instead of being dropped.
      evidence.push({ words: t.words, meaning: 'Deadline times are not tracked separately, so this stays in the title.' });
    } else {
      consumed.push(t);
      const taskPart = (plain && plain.part) || (parts[0] && parts[0].part);
      if (t.exact !== undefined) {
        item.startTime = minutesToTime(t.exact);
        evidence.push({ words: t.words, meaning: `At ${item.startTime}.` });
      } else if (resolveWithPart(t.ambiguous, taskPart) !== null) {
        item.startTime = minutesToTime(resolveWithPart(t.ambiguous, taskPart));
        evidence.push({ words: t.words, meaning: `At ${item.startTime} ("${taskPart}" tells AM or PM).` });
      } else {
        questions.push(ampmQuestion('q-ampm', 'At', (mins) => ({ startTime: minutesToTime(mins) }), t.ambiguous));
      }
      if (!hasDay) {
        questions.push({
          id: `q-${dayField}`, prompt: 'Which day?',
          options: [
            { label: `Today (${formatDate(today, 'month')})`, set: { [dayField]: today } },
            { label: `Tomorrow (${formatDate(addDays(today, 1), 'month')})`, set: { [dayField]: addDays(today, 1) } },
          ],
          answer: null,
        });
      }
    }
  }
  if (durations[0]) {
    item.estimateMinutes = durations[0].minutes;
    consumed.push(durations[0]);
    evidence.push({ words: durations[0].words, meaning: `About ${durations[0].minutes} min.` });
  }
  if (ranges[0]) {
    evidence.push({ words: ranges[0].words, meaning: 'Time ranges are used for protected time only, so this stays in the title.' });
  }
  if ((parts[0] || (plain && plain.part)) && !item.startTime) {
    const words = parts[0] ? parts[0].words : plain.part;
    evidence.push({ words, meaning: 'Time-of-day words alone do not set a task time, so no time was set.' });
  }

  // Title from the remaining words.
  const remaining = tidyTitle(stripFiller(removeSpans(text, consumed)));
  item.title = cap(remaining) || text;
  if (!remaining) item.confidence = 'as-written';

  // Area and importance — only from the user's own words.
  const area = suggestArea(lower);
  item.domain = area.domain;
  if (area.domain) {
    evidence.push({ words: area.word, meaning: `Area: ${cap(area.domain === 'growth' ? 'personal growth' : area.domain)} (listed word).` });
  } else if (area.ambiguous) {
    evidence.push({ words: area.ambiguous.map((m) => m.word).join(', '), meaning: 'Words point to different areas, so it was left uncategorized.' });
  }
  const imp = suggestImportance(lower);
  item.importance = imp.level;
  if (imp.word) evidence.push({ words: imp.word, meaning: `Importance ${imp.level} of 5.` });

  return item;
}

/** Full note → proposed items. */
export function parseCapture(text, ctx) {
  return splitStatements(text).map((s) => interpretStatement(s, ctx)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 4. Answers, validation and conversion to saved records
// ---------------------------------------------------------------------------

function setPath(obj, path, value) {
  if (path.startsWith('block.')) {
    obj.block = { ...obj.block, [path.slice(6)]: value };
    if (path === 'block.date') obj.block.dates = null;
    if (path === 'block.dates') obj.block.date = null;
  } else {
    obj[path] = value;
  }
}

/** Applies the chosen option of a question. Returns a new item. */
export function answerQuestion(item, questionId, optionIndex) {
  const next = { ...item, block: item.block ? { ...item.block } : null };
  next.questions = item.questions.map((q) => {
    if (q.id !== questionId) return q;
    const opt = q.options[optionIndex];
    if (opt) Object.entries(opt.set).forEach(([k, v]) => setPath(next, k, v));
    return { ...q, answer: optionIndex };
  });
  return next;
}

export const openQuestions = (item) => item.questions.filter((q) => q.answer === null);

/** True when the item has everything it needs to be saved. */
export function isReady(item) {
  if (openQuestions(item).length) return false;
  if (!item.title || !item.title.trim()) return false;
  if (item.kind === 'protect') {
    const b = item.block;
    const hasWhen = b && (b.date || (b.dates && b.dates.length) || (b.days && b.days.length));
    return Boolean(hasWhen && Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);
  }
  return true;
}

/** Converts reviewed items into records to save. Pure: ids/time are passed in. */
export function toRecords(items, { makeId, now }) {
  const tasks = [];
  const blocks = [];
  for (const item of items) {
    if (item.kind === 'protect') {
      const b = item.block;
      const base = { label: item.title.trim().slice(0, 80), start: minutesToTime(b.start), end: minutesToTime(Math.min(b.end, 1439)) };
      if (b.days && b.days.length && !b.date && !(b.dates && b.dates.length)) {
        blocks.push({ id: makeId('pb'), ...base, days: [...b.days].sort(), date: null });
      } else {
        for (const date of b.dates && b.dates.length ? b.dates : [b.date]) {
          blocks.push({ id: makeId('pb'), ...base, days: [], date });
        }
      }
    } else {
      tasks.push({
        id: makeId('t'),
        title: item.title.trim().slice(0, 200),
        notes: `From your note: “${item.original}”`.slice(0, 2000),
        domain: item.domain || null,
        importance: item.importance || CAPTURE.defaultImportance,
        dueDate: item.dueDate || null,
        // A follow-up with a time is planned on its follow-up day (so boundaries can check it).
        scheduledDate: item.scheduledDate || (item.kind === 'followup' && item.startTime ? item.followUpDate || null : null),
        startTime: item.startTime || null,
        estimateMinutes: item.estimateMinutes || null,
        goalId: null,
        isFollowUp: item.kind === 'followup',
        followUpDate: item.kind === 'followup' ? item.followUpDate || null : null,
        status: 'open',
        createdAt: now,
        completedAt: null,
        overrides: [],
        source: null,
      });
    }
  }
  return { tasks, blocks };
}
