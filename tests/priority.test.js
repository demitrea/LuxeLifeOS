import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alignmentScore, effortScore, explainScore, importanceScore, rankTasks,
  scoreTask, topPriorities, urgencyScore,
} from '../js/logic/priority.js';
import { SCORING } from '../js/logic/config.js';

const TODAY = '2026-11-18';
const due = (days) => {
  const d = new Date(Date.UTC(2026, 10, 18 + days));
  return d.toISOString().slice(0, 10);
};

test('weights add up to 100', () => {
  const max = SCORING.urgency.max + SCORING.importance.max + SCORING.alignment.max + SCORING.effort.max;
  assert.equal(max, 100);
  assert.deepEqual([SCORING.urgency.max, SCORING.importance.max, SCORING.alignment.max, SCORING.effort.max], [40, 30, 20, 10]);
});

test('urgency brackets, including every boundary', () => {
  const cases = [
    [null, 0], [-5, 40], [-1, 40], [0, 36], [1, 32], [2, 26], [3, 26], [4, 18], [7, 18],
    [8, 10], [14, 10], [15, 5], [30, 5], [31, 2], [365, 2],
  ];
  for (const [days, points] of cases) {
    const task = { dueDate: days === null ? null : due(days) };
    assert.equal(urgencyScore(task, TODAY).points, points, `days=${days}`);
  }
  assert.equal(urgencyScore({ dueDate: due(-2) }, TODAY).reason, '2 days overdue');
  assert.equal(urgencyScore({ dueDate: due(1) }, TODAY).reason, 'Due tomorrow');
});

test('importance is level × 6, clamped to 1–5', () => {
  assert.equal(importanceScore({ importance: 1 }).points, 6);
  assert.equal(importanceScore({ importance: 5 }).points, 30);
  assert.equal(importanceScore({ importance: 9 }).points, 30);
  assert.equal(importanceScore({ importance: 0 }).points, 6);
  assert.equal(importanceScore({}).points, 18); // default level 3
});

test('goal alignment: none 0, linked 12, linked to a Behind goal 20', () => {
  const onTrack = { id: 'g1', title: 'A', startDate: TODAY, targetDate: due(90), milestones: [{ done: false }] };
  const behind = { id: 'g2', title: 'B', startDate: due(-80), targetDate: due(10), milestones: [{ done: false }, { done: false }] };
  assert.equal(alignmentScore({ goalId: null }, undefined, TODAY).points, 0);
  assert.equal(alignmentScore({ goalId: 'g1' }, onTrack, TODAY).points, 12);
  assert.equal(alignmentScore({ goalId: 'g2' }, behind, TODAY).points, 20);
  assert.equal(alignmentScore({ goalId: 'deleted' }, undefined, TODAY).points, 0);
});

test('effort brackets favour quick wins, capped at 10', () => {
  const cases = [[null, 5], [0, 5], [15, 10], [30, 10], [31, 8], [60, 8], [61, 6], [120, 6], [121, 3], [240, 3], [241, 1], [600, 1]];
  for (const [minutes, points] of cases) {
    assert.equal(effortScore({ estimateMinutes: minutes }).points, points, `minutes=${minutes}`);
  }
});

test('worked example from the plan scores 82 and explains itself', () => {
  const goal = { id: 'g', title: 'Certification', startDate: due(-80), targetDate: due(10), milestones: [{ done: false }, { done: false }] };
  const task = { id: 't', dueDate: due(1), importance: 4, goalId: 'g', estimateMinutes: 90 };
  const score = scoreTask(task, new Map([['g', goal]]), TODAY);
  assert.equal(score.total, 32 + 24 + 20 + 6);
  assert.equal(score.total, 82);
  assert.equal(
    explainScore(score),
    'Urgency 32/40 (Due tomorrow) + Importance 24/30 (Rated 4 of 5) + Goal alignment 20/20 (Supports "Certification", which is behind schedule) + Effort 6/10 (About 1 h 30 min) = 82',
  );
});

test('score is always between 0 and 100', () => {
  const max = scoreTask({ dueDate: due(-1), importance: 5, goalId: 'g', estimateMinutes: 10 },
    new Map([['g', { id: 'g', title: 'x', startDate: due(-100), targetDate: due(-1), milestones: [{ done: false }] }]]), TODAY);
  assert.equal(max.total, 100);
  const min = scoreTask({ importance: 1, estimateMinutes: 999 }, new Map(), TODAY);
  assert.equal(min.total, 0 + 6 + 0 + 1);
});

test('ranking is deterministic with documented tie-breakers', () => {
  const base = { status: 'open', importance: 3, estimateMinutes: 30 };
  const tasks = [
    { ...base, id: 'c', title: 'C', dueDate: due(5), createdAt: '2026-11-01T00:00:00' },
    { ...base, id: 'b', title: 'B', dueDate: due(5), createdAt: '2026-10-01T00:00:00' }, // older wins tie
    { ...base, id: 'a', title: 'A', dueDate: due(0) }, // highest urgency
    { ...base, id: 'e', title: 'E', dueDate: due(5), createdAt: '2026-10-01T00:00:00' }, // id breaks final tie (b < e)
    { ...base, id: 'd', title: 'D', dueDate: due(6), importance: 3 }, // same bracket (18), later date
  ];
  const order = rankTasks(tasks, [], TODAY).map((r) => r.task.id);
  assert.deepEqual(order, ['a', 'b', 'e', 'c', 'd']);
  // Same input in a different order gives the same result.
  assert.deepEqual(rankTasks([...tasks].reverse(), [], TODAY).map((r) => r.task.id), order);
});

test('top priorities exclude completed and future-scheduled tasks', () => {
  const tasks = [
    { id: '1', status: 'open', importance: 5, dueDate: due(0) },
    { id: '2', status: 'done', importance: 5, dueDate: due(0) },
    { id: '3', status: 'open', importance: 5, dueDate: due(0), scheduledDate: due(2) },
    { id: '4', status: 'open', importance: 1 },
    { id: '5', status: 'open', importance: 2, scheduledDate: TODAY },
    { id: '6', status: 'open', importance: 3, scheduledDate: due(-1) },
  ];
  assert.deepEqual(topPriorities(tasks, [], TODAY).map((r) => r.task.id), ['1', '6', '5']);
});
