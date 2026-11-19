import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekRange, weeklyReview } from '../js/logic/review.js';
import {
  STORAGE_KEY, emptyState, exportJSON, importJSON, loadState, normalizeState, sampleState, saveState,
} from '../js/store.js';

const TODAY = '2026-11-18';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
  setItem(k, v) { this.data.set(k, String(v)); }
}

test('week runs Monday to Sunday', () => {
  assert.deepEqual(weekRange(TODAY), { start: '2026-11-16', end: '2026-11-22' });
});

test('weekly review counts, capacity and attention items', () => {
  const state = {
    settings: { ...emptyState().settings },
    goals: [{ id: 'g', title: 'Late goal', startDate: '2026-08-01', targetDate: '2026-11-01', milestones: [{ done: false }] }],
    tasks: [
      { id: '1', title: 'done', status: 'done', domain: 'career', completedAt: '2026-11-17T10:00:00', scheduledDate: '2026-11-17', estimateMinutes: 120 },
      { id: '2', title: 'old done', status: 'done', domain: 'career', completedAt: '2026-11-10T10:00:00' },
      { id: '3', title: 'overdue', status: 'open', domain: 'finances', dueDate: '2026-11-10', createdAt: '2026-10-01T09:00:00' },
      { id: '4', title: 'this week', status: 'open', domain: 'career', scheduledDate: '2026-11-20', estimateMinutes: 60 },
      { id: '5', title: 'later', status: 'open', domain: 'family', dueDate: '2026-12-20', createdAt: '2026-11-04T09:00:00' },
      { id: '6', title: 'fresh', status: 'open', domain: 'wellness', createdAt: '2026-11-05T09:00:00' },
    ],
  };
  const r = weeklyReview(state, TODAY);
  assert.deepEqual(r.completed.map((t) => t.id), ['1']);
  assert.deepEqual(r.unfinished.map((t) => t.id).sort(), ['3', '4']);
  assert.equal(r.plannedMinutes, 180);
  assert.equal(r.capacityMinutes, 5 * 480);
  assert.equal(r.goalCounts.behind, 1);
  const kinds = r.attention.map((a) => `${a.kind}:${a.domain || a.goalId || ''}`);
  assert.ok(kinds.includes('overdue:finances'));
  assert.ok(kinds.includes('goal-behind:g'));
  assert.ok(kinds.includes('neglected:finances'));
  assert.ok(kinds.includes('neglected:family'));
  assert.ok(!kinds.includes('neglected:career')); // completed something yesterday
  assert.ok(!kinds.includes('neglected:wellness')); // waited only 13 days
});

test('save and load round-trip through storage', () => {
  const storage = new MemoryStorage();
  const state = sampleState(TODAY);
  assert.equal(saveState(state, storage), true);
  const { state: loaded, error } = loadState(storage);
  assert.equal(error, null);
  assert.deepEqual(loaded, state);
});

test('empty storage gives an empty state', () => {
  const { state, error } = loadState(new MemoryStorage());
  assert.equal(error, null);
  assert.deepEqual(state, emptyState());
});

test('corrupt data is set aside instead of overwritten', () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  const { state, error } = loadState(storage);
  assert.ok(error);
  assert.deepEqual(state, emptyState());
  assert.equal(storage.getItem(`${STORAGE_KEY}.corrupt`), '{not json');
});

test('version 1 data (no calendars) loads unchanged into the current version', () => {
  const v1 = { schemaVersion: 1, settings: emptyState().settings, goals: [], tasks: [{ id: 't1', title: 'Old task', status: 'open', domain: 'career' }] };
  const s = normalizeState(v1);
  assert.equal(s.schemaVersion, 3);
  assert.equal(s.tasks[0].title, 'Old task');
  assert.equal(s.tasks[0].source, null);
  assert.deepEqual(s.sources, []);
  assert.deepEqual(s.events, []);
});

test('events without a known calendar source are dropped', () => {
  const s = normalizeState({
    sources: [{ id: 'src1', type: 'ics', label: 'Work', category: 'personal' }, { id: 'bad', type: 'unknown' }],
    events: [
      { id: 'e1', sourceId: 'src1', title: 'Kept', date: '2026-11-18', startTime: '09:00', endTime: '10:00', category: 'professional' },
      { id: 'e2', sourceId: 'missing', title: 'Orphan', date: '2026-11-18' },
    ],
  });
  assert.equal(s.sources.length, 1);
  assert.deepEqual(s.events.map((e) => e.id), ['e1']);
  assert.equal(s.events[0].category, 'personal'); // category always follows the source
});

test('version 2 data migrates to version 3 with every record preserved', () => {
  // A realistic v2 backup: settings without dayParts, repeating blocks, calendar data.
  const v2 = {
    schemaVersion: 2,
    settings: {
      workStart: '08:30', workEnd: '17:00', workDays: [1, 2, 3, 4], maxDailyWorkMinutes: 420, protectRestDays: false,
      protectedBlocks: [{ id: 'pb1', label: 'Family dinner', days: [1, 2, 3, 4, 5], start: '18:00', end: '20:00' }],
    },
    goals: [{ id: 'g1', title: 'Goal', domain: 'education', horizon: '90d', startDate: '2026-11-01', targetDate: '2027-01-30', milestones: [{ id: 'm1', title: 'M1', done: true }] }],
    tasks: [
      { id: 't1', title: 'Task one', status: 'open', domain: 'career', importance: 4, dueDate: '2026-11-23', goalId: 'g1', overrides: ['REST_DAY'], createdAt: '2026-11-18T09:00:00' },
      { id: 't2', title: 'Done task', status: 'done', domain: 'family', completedAt: '2026-11-18T10:00:00', createdAt: '2026-11-17T09:00:00' },
    ],
    sources: [{ id: 'src1', type: 'ics', label: 'Work', category: 'professional', importedAt: '2026-11-18T09:00:00' }],
    events: [{ id: 'e1', sourceId: 'src1', title: 'Sync', date: '2026-11-19', startTime: '10:00', endTime: '10:30', endDate: '2026-11-19', overrides: ['DOUBLE_BOOKED'] }],
  };
  const s = normalizeState(v2);
  assert.equal(s.schemaVersion, 3);
  assert.deepEqual(
    { ...s.settings, dayParts: undefined, protectedBlocks: undefined },
    { workStart: '08:30', workEnd: '17:00', workDays: [1, 2, 3, 4], maxDailyWorkMinutes: 420, protectRestDays: false, dayParts: undefined, protectedBlocks: undefined },
  );
  assert.deepEqual(s.settings.protectedBlocks, [{ id: 'pb1', label: 'Family dinner', days: [1, 2, 3, 4, 5], date: null, start: '18:00', end: '20:00' }]);
  assert.deepEqual(s.settings.dayParts, { morning: { start: '06:00', end: '12:00' }, afternoon: { start: '12:00', end: '18:00' }, evening: { start: '18:00', end: '22:00' } });
  assert.deepEqual(s.tasks.map((t) => [t.id, t.title, t.status, t.domain, t.importance, t.dueDate, t.goalId, t.overrides.join()]), [
    ['t1', 'Task one', 'open', 'career', 4, '2026-11-23', 'g1', 'REST_DAY'],
    ['t2', 'Done task', 'done', 'family', 3, null, null, ''],
  ]);
  assert.equal(s.goals[0].milestones[0].done, true);
  assert.equal(s.sources.length, 1);
  assert.deepEqual(s.events[0].overrides, ['DOUBLE_BOOKED']);
  // Saving and loading again is stable.
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(s))), s);
});

test('version 3 keeps uncategorized tasks, one-time blocks and edited day parts', () => {
  const s = normalizeState({
    schemaVersion: 3,
    settings: {
      protectedBlocks: [{ id: 'pb2', label: 'Friday evening', days: [5], date: '2026-11-20', start: '18:00', end: '22:00' }],
      dayParts: { morning: { start: '07:00', end: '11:00' }, afternoon: { start: '13:00', end: '12:00' } }, // afternoon invalid → default
    },
    tasks: [{ id: 't', title: 'Loose end', status: 'open', domain: null }],
  });
  assert.equal(s.tasks[0].domain, null);
  assert.deepEqual(s.settings.protectedBlocks[0], { id: 'pb2', label: 'Friday evening', days: [], date: '2026-11-20', start: '18:00', end: '22:00' });
  assert.deepEqual(s.settings.dayParts.morning, { start: '07:00', end: '11:00' });
  assert.deepEqual(s.settings.dayParts.afternoon, { start: '12:00', end: '18:00' });
});

test('weekly review counts uncategorized tasks and suggests sorting them', () => {
  const state = { ...emptyState(), tasks: [{ id: 'u', title: 'Loose end', status: 'open', domain: null, dueDate: '2026-11-20' }] };
  const r = weeklyReview(state, TODAY);
  assert.equal(r.byDomain.find((d) => d.domain === null).unfinished, 1);
  assert.ok(r.attention.some((a) => a.kind === 'uncategorized'));
});

test('import validates and cleans data', () => {
  const restored = importJSON(exportJSON(sampleState(TODAY)));
  assert.deepEqual(restored, sampleState(TODAY));
  assert.throws(() => importJSON('[]'));
  assert.throws(() => importJSON('{"schemaVersion": 99}'));
  assert.throws(() => importJSON('{"schemaVersion": 4}'));
  const cleaned = normalizeState({
    tasks: [{ id: 'x', title: 'T', domain: 'nonsense', importance: 12, dueDate: '2026-02-30', goalId: 'missing', overrides: ['BOGUS', 'REST_DAY'] }, { title: 'no id' }],
  });
  assert.equal(cleaned.tasks.length, 1);
  assert.equal(cleaned.tasks[0].domain, null); // unknown area → uncategorized (v3), never a guessed area
  assert.equal(cleaned.tasks[0].importance, 5);
  assert.equal(cleaned.tasks[0].dueDate, null);
  assert.equal(cleaned.tasks[0].goalId, null);
  assert.deepEqual(cleaned.tasks[0].overrides, ['REST_DAY']);
});

test('sample data is fictional and produces boundary conflicts to demonstrate', () => {
  const s = sampleState(TODAY);
  assert.ok(s.tasks.length >= 8);
  assert.equal(s.goals.length, 3);
  const text = JSON.stringify(s);
  assert.ok(!/@|\bhttps?:/.test(text), 'no emails or links in sample data');
});
