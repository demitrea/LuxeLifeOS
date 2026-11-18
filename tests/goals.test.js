import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultTargetDate, expectedProgress, goalProgress, goalStatus } from '../js/logic/goals.js';

const TODAY = '2026-11-18';
const ms = (done, total) => Array.from({ length: total }, (_, i) => ({ id: `m${i}`, title: `M${i}`, done: i < done }));

test('default target dates per horizon', () => {
  assert.equal(defaultTargetDate('2026-11-01', '30d'), '2026-12-01');
  assert.equal(defaultTargetDate('2026-11-01', '90d'), '2027-01-30');
  assert.equal(defaultTargetDate('2026-11-01', '6mo'), '2027-04-30');
  assert.equal(defaultTargetDate('2026-11-01', '12mo'), '2027-11-01');
  assert.equal(defaultTargetDate('2026-11-01', 'bad'), '');
});

test('progress = completed ÷ total milestones, rounded', () => {
  assert.equal(goalProgress({ milestones: ms(1, 3) }).percent, 33);
  assert.equal(goalProgress({ milestones: ms(2, 3) }).percent, 67);
  assert.equal(goalProgress({ milestones: ms(4, 4) }).percent, 100);
  assert.equal(goalProgress({ milestones: [] }).percent, 0);
  assert.equal(goalProgress({}).percent, 0);
});

test('expected progress follows the calendar and is clamped', () => {
  const g = { startDate: '2026-11-08', targetDate: '2026-11-28' }; // 20 days
  assert.equal(expectedProgress(g, '2026-11-18'), 50);
  assert.equal(expectedProgress(g, '2026-11-01'), 0);
  assert.equal(expectedProgress(g, '2026-12-25'), 100);
});

// 100-day goal; on TODAY 50 days have passed → expected 50 %.
const goal = (done, total) => ({ startDate: '2026-09-29', targetDate: '2027-01-07', milestones: ms(done, total) });

test('status thresholds: At risk below expected − 10, Behind below expected − 25', () => {
  assert.equal(expectedProgress(goal(0, 1), TODAY), 50);
  // 40 % (gap 10) → still On track; 39 % would be At risk.
  assert.equal(goalStatus(goal(2, 5), TODAY).status, 'on-track'); // 40 %, gap 10
  assert.equal(goalStatus(goal(39, 100), TODAY).status, 'at-risk'); // gap 11
  assert.equal(goalStatus(goal(25, 100), TODAY).status, 'at-risk'); // gap 25 → not yet Behind
  assert.equal(goalStatus(goal(24, 100), TODAY).status, 'behind'); // gap 26
  assert.equal(goalStatus(goal(3, 5), TODAY).status, 'on-track'); // ahead
});

test('complete and past-due goals', () => {
  assert.equal(goalStatus(goal(5, 5), TODAY).status, 'complete');
  const late = { startDate: '2026-10-01', targetDate: '2026-11-17', milestones: ms(4, 5) };
  const s = goalStatus(late, TODAY);
  assert.equal(s.status, 'behind');
  assert.match(s.reason, /target date has passed/);
  // A goal with no milestones is never "complete".
  assert.notEqual(goalStatus({ startDate: TODAY, targetDate: '2026-12-18', milestones: [] }, TODAY).status, 'complete');
});
