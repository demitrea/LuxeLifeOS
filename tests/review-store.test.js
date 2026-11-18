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

test('import validates and cleans data', () => {
  const restored = importJSON(exportJSON(sampleState(TODAY)));
  assert.deepEqual(restored, sampleState(TODAY));
  assert.throws(() => importJSON('[]'));
  assert.throws(() => importJSON('{"schemaVersion": 99}'));
  const cleaned = normalizeState({
    tasks: [{ id: 'x', title: 'T', domain: 'nonsense', importance: 12, dueDate: '2026-02-30', goalId: 'missing', overrides: ['BOGUS', 'REST_DAY'] }, { title: 'no id' }],
  });
  assert.equal(cleaned.tasks.length, 1);
  assert.equal(cleaned.tasks[0].domain, 'growth');
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
