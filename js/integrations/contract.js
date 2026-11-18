// Integration contract.
//
// Every calendar source produces the same CalendarEvent shape. Today the only
// source is a calendar file (.ics) imported on the device. A future release can
// add read-only Microsoft Outlook accounts (see ROADMAP.md) by writing a new
// adapter that returns these same objects. The priority, boundary and review
// rules only ever see CalendarEvent objects, so they will not need to change.
//
// @typedef {Object} CalendarSource
// @property {string} id
// @property {'ics'|'outlook'} type        where the events came from
// @property {string} label                user-facing name, e.g. "Work calendar"
// @property {'professional'|'personal'} category  professional events count as work
// @property {string|null} accountId       future: which authorized Outlook account
// @property {string} importedAt           local ISO date-time of the last import/sync
// @property {string|null} rangeStart      first date covered by the snapshot
// @property {string|null} rangeEnd        last date covered by the snapshot
//
// @typedef {Object} CalendarEvent         one occurrence (recurring events are expanded)
// @property {string} id
// @property {string} sourceId
// @property {string} title
// @property {string} date                 YYYY-MM-DD (local)
// @property {string|null} startTime       HH:MM, null when all-day
// @property {string} endDate              YYYY-MM-DD, last day the event touches
// @property {string|null} endTime         HH:MM, null when all-day
// @property {boolean} allDay
// @property {boolean} busy                false for "free"/transparent events
// @property {'professional'|'personal'} category  copied from the source
// @property {string} location
// @property {string[]} overrides          conflict codes the user acknowledged

import { isISODate, timeToMinutes } from '../logic/dates.js';

export const SOURCE_TYPES = Object.freeze({
  ics: Object.freeze({ label: 'Calendar file (.ics)', readOnly: true, live: false, available: true }),
  outlook: Object.freeze({ label: 'Microsoft Outlook account', readOnly: true, live: true, available: false }),
});

export const CATEGORIES = Object.freeze(['professional', 'personal']);

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const time = (v) => (Number.isNaN(timeToMinutes(v)) ? null : v);

export function normalizeSource(s) {
  if (!s || typeof s !== 'object' || !str(s.id) || !SOURCE_TYPES[s.type]) return null;
  return {
    id: str(s.id, 60),
    type: s.type,
    label: str(s.label, 80) || SOURCE_TYPES[s.type].label,
    category: CATEGORIES.includes(s.category) ? s.category : 'professional',
    accountId: str(s.accountId, 120) || null,
    importedAt: str(s.importedAt, 30),
    rangeStart: isISODate(s.rangeStart) ? s.rangeStart : null,
    rangeEnd: isISODate(s.rangeEnd) ? s.rangeEnd : null,
  };
}

export function normalizeEvent(e, category) {
  if (!e || typeof e !== 'object' || !str(e.id) || !str(e.sourceId) || !isISODate(e.date)) return null;
  const allDay = Boolean(e.allDay) || !time(e.startTime);
  return {
    id: str(e.id, 60),
    sourceId: str(e.sourceId, 60),
    title: str(e.title) || '(No title)',
    date: e.date,
    startTime: allDay ? null : e.startTime,
    endDate: isISODate(e.endDate) && e.endDate >= e.date ? e.endDate : e.date,
    endTime: allDay ? null : time(e.endTime) || e.startTime,
    allDay,
    busy: e.busy !== false,
    category: CATEGORIES.includes(category) ? category : (CATEGORIES.includes(e.category) ? e.category : 'professional'),
    location: str(e.location, 120),
    overrides: Array.isArray(e.overrides) ? [...new Set(e.overrides.filter((c) => typeof c === 'string'))] : [],
  };
}

/** Where a task came from. Null for tasks typed by hand; future: a flagged Outlook email. */
export function normalizeTaskSource(s) {
  if (!s || typeof s !== 'object' || !SOURCE_TYPES[s.type]) return null;
  return { type: s.type, ref: str(s.ref, 200), label: str(s.label, 120) };
}
