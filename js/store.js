// Local storage: one JSON document on this device. Nothing is ever sent anywhere.

import { DOMAINS, HORIZON_DAYS } from './logic/config.js';
import { addDays, isISODate, localISODateTime, timeToMinutes } from './logic/dates.js';
import { defaultTargetDate } from './logic/goals.js';
import { normalizeEvent, normalizeSource, normalizeTaskSource } from './integrations/contract.js';

export const STORAGE_KEY = 'luxelifeos.v1';
// v1: tasks, goals, settings. v2 adds calendar sources and events (v1 data loads unchanged).
export const SCHEMA_VERSION = 2;

const DOMAIN_IDS = new Set(DOMAINS.map((d) => d.id));
const CONFLICT_CODES = new Set(['CAPACITY_EXCEEDED', 'REST_DAY', 'OUTSIDE_HOURS', 'PROTECTED_TIME', 'DOUBLE_BOOKED']);

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultSettings() {
  return {
    workStart: '09:00',
    workEnd: '17:30',
    workDays: [1, 2, 3, 4, 5],
    maxDailyWorkMinutes: 480,
    protectRestDays: true,
    protectedBlocks: [],
  };
}

export function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, settings: defaultSettings(), tasks: [], goals: [], sources: [], events: [] };
}

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const date = (v) => (isISODate(v) ? v : null);
const time = (v) => (Number.isNaN(timeToMinutes(v)) ? null : v);
const days = (v) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : []);

function normalizeTask(t) {
  if (!t || typeof t !== 'object' || !str(t.id) || !str(t.title)) return null;
  const est = Number(t.estimateMinutes);
  const imp = Math.round(Number(t.importance));
  return {
    id: str(t.id, 60),
    title: str(t.title),
    notes: str(t.notes, 2000),
    domain: DOMAIN_IDS.has(t.domain) ? t.domain : 'growth',
    importance: Number.isFinite(imp) ? Math.min(5, Math.max(1, imp)) : 3,
    dueDate: date(t.dueDate),
    scheduledDate: date(t.scheduledDate),
    startTime: time(t.startTime),
    estimateMinutes: Number.isFinite(est) && est > 0 ? Math.round(est) : null,
    goalId: str(t.goalId, 60) || null,
    isFollowUp: Boolean(t.isFollowUp),
    followUpDate: date(t.followUpDate),
    status: t.status === 'done' ? 'done' : 'open',
    createdAt: str(t.createdAt, 30) || localISODateTime(),
    completedAt: t.status === 'done' ? str(t.completedAt, 30) || null : null,
    overrides: Array.isArray(t.overrides) ? [...new Set(t.overrides.filter((c) => CONFLICT_CODES.has(c)))] : [],
    source: normalizeTaskSource(t.source),
  };
}

function normalizeGoal(g) {
  if (!g || typeof g !== 'object' || !str(g.id) || !str(g.title)) return null;
  const horizon = HORIZON_DAYS[g.horizon] !== undefined ? g.horizon : '90d';
  const startDate = date(g.startDate) || localISODateTime().slice(0, 10);
  return {
    id: str(g.id, 60),
    title: str(g.title),
    domain: DOMAIN_IDS.has(g.domain) ? g.domain : 'growth',
    horizon,
    startDate,
    targetDate: date(g.targetDate) || defaultTargetDate(startDate, horizon),
    milestones: (Array.isArray(g.milestones) ? g.milestones : [])
      .filter((m) => m && str(m.title))
      .map((m) => ({ id: str(m.id, 60) || newId('m'), title: str(m.title), done: Boolean(m.done) })),
  };
}

function normalizeSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== 'object') return d;
  const cap = Number(s.maxDailyWorkMinutes);
  return {
    workStart: time(s.workStart) || d.workStart,
    workEnd: time(s.workEnd) || d.workEnd,
    workDays: Array.isArray(s.workDays) ? days(s.workDays) : d.workDays,
    maxDailyWorkMinutes: Number.isFinite(cap) && cap >= 0 ? Math.min(1440, Math.round(cap)) : d.maxDailyWorkMinutes,
    protectRestDays: s.protectRestDays === undefined ? d.protectRestDays : Boolean(s.protectRestDays),
    protectedBlocks: (Array.isArray(s.protectedBlocks) ? s.protectedBlocks : [])
      .filter((b) => b && str(b.label) && time(b.start) && time(b.end))
      .map((b) => ({ id: str(b.id, 60) || newId('pb'), label: str(b.label, 80), days: days(b.days), start: b.start, end: b.end })),
  };
}

/** Validates any parsed object and returns a clean, complete state. */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a LuxeLifeOS data file.');
  if (raw.schemaVersion !== undefined && raw.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This backup was made by a newer version of LuxeLifeOS.');
  }
  const goals = (Array.isArray(raw.goals) ? raw.goals : []).map(normalizeGoal).filter(Boolean);
  const goalIds = new Set(goals.map((g) => g.id));
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).map(normalizeTask).filter(Boolean)
    .map((t) => (t.goalId && !goalIds.has(t.goalId) ? { ...t, goalId: null } : t));
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).map(normalizeSource).filter(Boolean);
  const categoryOf = new Map(sources.map((src) => [src.id, src.category]));
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .filter((e) => e && categoryOf.has(e.sourceId))
    .map((e) => normalizeEvent(e, categoryOf.get(e.sourceId)))
    .filter(Boolean)
    .map((e) => ({ ...e, overrides: e.overrides.filter((c) => CONFLICT_CODES.has(c)) }));
  return { schemaVersion: SCHEMA_VERSION, settings: normalizeSettings(raw.settings), tasks, goals, sources, events };
}

function defaultStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

/** Returns { state, error }. Corrupt data is set aside, never silently overwritten. */
export function loadState(storage = defaultStorage()) {
  if (!storage) return { state: emptyState(), error: 'Storage is unavailable in this browser.' };
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { state: emptyState(), error: 'Storage is unavailable in this browser.' };
  }
  if (!raw) return { state: emptyState(), error: null };
  try {
    return { state: normalizeState(JSON.parse(raw)), error: null };
  } catch {
    try { storage.setItem(`${STORAGE_KEY}.corrupt`, raw); } catch { /* ignore */ }
    return { state: emptyState(), error: 'Saved data could not be read. A copy was set aside.' };
  }
}

export function saveState(state, storage = defaultStorage()) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'LuxeLifeOS', exportedAt: localISODateTime(), ...state }, null, 2);
}

export function importJSON(text) {
  return normalizeState(JSON.parse(text));
}

/** Fictional sample data, dated relative to `today`. Contains no real people or places. */
export function sampleState(today) {
  const d = (n) => addDays(today, n);
  const now = `${today}T08:00:00`;
  const goals = [
    {
      id: 'g_sample_cert', title: 'Complete a data analysis certificate', domain: 'education', horizon: '90d',
      startDate: d(-60), targetDate: d(30),
      milestones: [
        { id: 'm1', title: 'Finish module 1: spreadsheets', done: true },
        { id: 'm2', title: 'Finish module 2: statistics', done: false },
        { id: 'm3', title: 'Finish module 3: visualization', done: false },
        { id: 'm4', title: 'Submit capstone project', done: false },
      ],
    },
    {
      id: 'g_sample_5k', title: 'Run a 5K without stopping', domain: 'wellness', horizon: '60d',
      startDate: d(-20), targetDate: d(40),
      milestones: [
        { id: 'm5', title: 'Run 1 km continuously', done: true },
        { id: 'm6', title: 'Run 3 km continuously', done: false },
        { id: 'm7', title: 'Run 5 km continuously', done: false },
      ],
    },
    {
      id: 'g_sample_fund', title: 'Build a three-month emergency fund', domain: 'finances', horizon: '12mo',
      startDate: d(-90), targetDate: d(275),
      milestones: [
        { id: 'm8', title: 'Set up automatic monthly transfer', done: true },
        { id: 'm9', title: 'Reach one month of expenses', done: false },
        { id: 'm10', title: 'Reach two months of expenses', done: false },
        { id: 'm11', title: 'Reach three months of expenses', done: false },
      ],
    },
  ];
  const t = (id, fields) => ({ id, notes: '', isFollowUp: false, followUpDate: null, status: 'open', createdAt: now, completedAt: null, overrides: [], goalId: null, startTime: null, ...fields });
  const tasks = [
    t('t_s1', { title: 'Prepare client presentation outline', domain: 'career', importance: 5, dueDate: d(1), scheduledDate: today, startTime: '10:00', estimateMinutes: 120 }),
    t('t_s2', { title: 'Study statistics lesson 4', domain: 'education', importance: 4, dueDate: d(3), scheduledDate: today, startTime: '14:00', estimateMinutes: 90, goalId: 'g_sample_cert' }),
    t('t_s3', { title: 'Review monthly budget', domain: 'finances', importance: 3, dueDate: d(-1), estimateMinutes: 30, goalId: 'g_sample_fund' }),
    t('t_s4', { title: 'Plan weekend visit with family', domain: 'family', importance: 4, dueDate: d(4), estimateMinutes: 20 }),
    t('t_s5', { title: 'Interval run: 4 × 500 m', domain: 'wellness', importance: 3, scheduledDate: d(1), startTime: '07:00', estimateMinutes: 40, goalId: 'g_sample_5k' }),
    t('t_s6', { title: 'Follow up on project proposal feedback', domain: 'business', importance: 3, dueDate: d(6), isFollowUp: true, followUpDate: today, estimateMinutes: 15 }),
    t('t_s7', { title: 'Draft quarterly team update', domain: 'career', importance: 4, dueDate: d(2), scheduledDate: d(1), startTime: '09:00', estimateMinutes: 240 }),
    t('t_s8', { title: 'Finish expense report', domain: 'career', importance: 3, dueDate: d(2), scheduledDate: d(1), startTime: '13:30', estimateMinutes: 300 }),
    t('t_s9', { title: 'Call an old friend to catch up', domain: 'relationships', importance: 2, dueDate: d(10), estimateMinutes: 30 }),
    t('t_s10', { title: 'Read two chapters of a leadership book', domain: 'growth', importance: 2, estimateMinutes: 60 }),
    t('t_s11', { title: 'Send meeting notes to the team', domain: 'career', importance: 3, dueDate: d(-1), status: 'done', completedAt: `${d(-1)}T16:00:00`, estimateMinutes: 20 }),
  ];
  const ev = (id, sourceId, title, date, startTime, endTime, extra = {}) => ({
    id, sourceId, title, date, startTime, endTime, endDate: date, allDay: false, busy: true, location: '', overrides: [], ...extra,
  });
  const sources = [
    { id: 'src_sample_work', type: 'ics', label: 'Work calendar (sample)', category: 'professional', importedAt: now, rangeStart: d(-7), rangeEnd: d(90) },
    { id: 'src_sample_home', type: 'ics', label: 'Personal calendar (sample)', category: 'personal', importedAt: now, rangeStart: d(-7), rangeEnd: d(90) },
  ];
  const events = [
    ev('e_s1', 'src_sample_work', 'Team stand-up', today, '09:30', '10:15'),
    ev('e_s2', 'src_sample_work', 'Project review', today, '15:30', '16:30', { location: 'Conference room' }),
    ev('e_s3', 'src_sample_work', 'Client dinner', d(2), '18:30', '20:30'),
    ev('e_s4', 'src_sample_work', 'Planning workshop', d(1), '11:00', '12:00'),
    ev('e_s5', 'src_sample_home', 'Dentist appointment', d(3), '08:00', '09:00'),
    ev('e_s6', 'src_sample_home', 'Community volunteer day', d(5), null, null, { allDay: true }),
  ];
  return normalizeState({
    schemaVersion: SCHEMA_VERSION,
    sources,
    events,
    settings: {
      ...defaultSettings(),
      protectedBlocks: [{ id: 'pb_sample_dinner', label: 'Family dinner', days: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '20:00' }],
    },
    tasks,
    goals,
  });
}
