import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conflictsInRange, dayConflicts, dayLoad, needsDecision, newConflicts, overlaps,
} from '../js/logic/boundaries.js';

const WED = '2026-11-18';
const SAT = '2026-11-21';
const settings = {
  workStart: '09:00', workEnd: '17:30', workDays: [1, 2, 3, 4, 5], maxDailyWorkMinutes: 480, protectRestDays: true,
  protectedBlocks: [{ id: 'pb1', label: 'Family dinner', days: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '20:00' }],
};
const task = (id, fields) => ({ id, title: id, status: 'open', domain: 'career', overrides: [], ...fields });
const codes = (list) => list.map((c) => c.code).sort();

test('overlap rule: startA < endB and startB < endA (touching is not overlap)', () => {
  assert.equal(overlaps({ start: 60, end: 120 }, { start: 100, end: 200 }), true);
  assert.equal(overlaps({ start: 60, end: 120 }, { start: 120, end: 200 }), false);
  assert.equal(overlaps({ start: 130, end: 130 }, { start: 120, end: 200 }), true); // zero-length inside
});

test('capacity counts only professional tasks, finished or not', () => {
  const tasks = [
    task('a', { scheduledDate: WED, estimateMinutes: 240 }),
    task('b', { scheduledDate: WED, estimateMinutes: 120, status: 'done' }),
    task('c', { scheduledDate: WED, estimateMinutes: 300, domain: 'family' }),
  ];
  assert.equal(dayLoad(tasks, WED), 360);
});

test('capacity: exactly 100 % is near, above 100 % is exceeded, 85 % is not flagged', () => {
  const at = (mins) => dayConflicts([task('a', { scheduledDate: WED, estimateMinutes: mins })], settings, WED);
  assert.deepEqual(codes(at(408)), []); // exactly 85 %
  assert.deepEqual(codes(at(409)), ['CAPACITY_NEAR']);
  assert.deepEqual(codes(at(480)), ['CAPACITY_NEAR']);
  assert.deepEqual(codes(at(481)), ['CAPACITY_EXCEEDED']);
});

test('no capacity conflict once every professional task that day is finished', () => {
  const tasks = [task('a', { scheduledDate: WED, estimateMinutes: 600, status: 'done' })];
  assert.deepEqual(dayConflicts(tasks, settings, WED), []);
});

test('rest day: work on a non-working day is flagged only while protection is on', () => {
  const tasks = [task('a', { scheduledDate: SAT, estimateMinutes: 60 })];
  assert.deepEqual(codes(dayConflicts(tasks, settings, SAT)), ['REST_DAY']);
  assert.deepEqual(codes(dayConflicts(tasks, { ...settings, protectRestDays: false }, SAT)), []);
  // Personal tasks on a rest day are fine.
  assert.deepEqual(codes(dayConflicts([task('b', { scheduledDate: SAT, domain: 'wellness' })], settings, SAT)), []);
});

test('outside hours: start before or end after working hours', () => {
  const check = (startTime, estimateMinutes) => codes(dayConflicts([task('a', { scheduledDate: WED, startTime, estimateMinutes })], settings, WED));
  assert.deepEqual(check('09:00', 60), []);
  assert.deepEqual(check('16:30', 60), []); // ends exactly at 17:30
  assert.deepEqual(check('08:30', 60), ['OUTSIDE_HOURS']);
  assert.deepEqual(check('17:00', 60), ['OUTSIDE_HOURS']);
  // Personal tasks are never "outside working hours".
  assert.deepEqual(codes(dayConflicts([task('b', { scheduledDate: WED, startTime: '07:00', estimateMinutes: 30, domain: 'wellness' })], settings, WED)), []);
});

test('protected time catches any task, work or personal', () => {
  const work = task('w', { scheduledDate: WED, startTime: '17:00', estimateMinutes: 90 });
  assert.deepEqual(codes(dayConflicts([work], settings, WED)), ['OUTSIDE_HOURS', 'PROTECTED_TIME']);
  const errand = task('e', { scheduledDate: WED, startTime: '19:00', estimateMinutes: 30, domain: 'finances' });
  assert.deepEqual(codes(dayConflicts([errand], settings, WED)), ['PROTECTED_TIME']);
  const before = task('x', { scheduledDate: WED, startTime: '17:00', estimateMinutes: 60, domain: 'finances' });
  assert.deepEqual(codes(dayConflicts([before], settings, WED)), []); // ends exactly 18:00
});

test('tasks without a start time skip time-of-day checks', () => {
  assert.deepEqual(dayConflicts([task('a', { scheduledDate: WED, estimateMinutes: 60 })], settings, WED), []);
});

test('overrides mark conflicts as acknowledged', () => {
  const tasks = [task('a', { scheduledDate: SAT, overrides: ['REST_DAY'] })];
  assert.equal(dayConflicts(tasks, settings, SAT)[0].acknowledged, true);
});

test('newConflicts reports only what a change adds', () => {
  const existing = [task('a', { scheduledDate: WED, estimateMinutes: 420 })];
  const adding = task('b', { scheduledDate: WED, estimateMinutes: 120 });
  const added = newConflicts(existing, [...existing, adding], settings, [WED]);
  assert.deepEqual(codes(added), ['CAPACITY_EXCEEDED']);
  assert.equal(needsDecision(added), true);

  // Adding more work to a day that is already over capacity warns again.
  const over = [...existing, adding];
  const more = task('c', { scheduledDate: WED, estimateMinutes: 30 });
  assert.deepEqual(codes(newConflicts(over, [...over, more], settings, [WED])), ['CAPACITY_EXCEEDED']);

  // Removing work never warns.
  assert.deepEqual(newConflicts(over, existing, settings, [WED]), []);

  // Editing an unrelated field of a conflicting task does not warn again.
  const sat = [task('s', { scheduledDate: SAT })];
  assert.deepEqual(newConflicts(sat, [{ ...sat[0], title: 'renamed' }], settings, [SAT]).filter((c) => c.code === 'REST_DAY'), []);
});

test('notices alone do not require a decision', () => {
  assert.equal(needsDecision([{ severity: 'notice' }]), false);
  assert.equal(needsDecision([{ severity: 'medium' }]), true);
});

test('conflictsInRange sorts by date then severity', () => {
  const tasks = [
    task('a', { scheduledDate: SAT }),
    task('b', { scheduledDate: WED, startTime: '08:00', estimateMinutes: 660 }),
  ];
  const list = conflictsInRange(tasks, settings, WED);
  assert.deepEqual(list.map((c) => `${c.date}:${c.code}`), [
    `${WED}:CAPACITY_EXCEEDED`, `${WED}:PROTECTED_TIME`, `${WED}:OUTSIDE_HOURS`, `${SAT}:REST_DAY`,
  ]);
  assert.deepEqual(conflictsInRange(tasks, settings, '2026-11-19'), [list[3]]);
});
