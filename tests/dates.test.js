import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, daysBetween, formatDate, formatHours, formatMinutes, isISODate,
  startOfWeek, timeToMinutes, weekday,
} from '../js/logic/dates.js';

test('isISODate accepts real dates only', () => {
  assert.equal(isISODate('2026-11-18'), true);
  assert.equal(isISODate('2028-02-29'), true); // leap year
  assert.equal(isISODate('2026-02-29'), false);
  assert.equal(isISODate('2026-13-01'), false);
  assert.equal(isISODate('11/18/2026'), false);
  assert.equal(isISODate(null), false);
});

test('addDays and daysBetween cross month, year and DST boundaries', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-07', 2), '2026-03-09'); // US DST start weekend
  assert.equal(daysBetween('2026-11-18', '2026-11-20'), 2);
  assert.equal(daysBetween('2026-11-20', '2026-11-18'), -2);
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2); // DST end weekend
});

test('weekday and startOfWeek (Monday)', () => {
  assert.equal(weekday('2026-11-18'), 3); // Wednesday
  assert.equal(weekday('2026-11-22'), 0); // Sunday
  assert.equal(startOfWeek('2026-11-18'), '2026-11-16');
  assert.equal(startOfWeek('2026-11-22'), '2026-11-16'); // Sunday belongs to the week before
  assert.equal(startOfWeek('2026-11-16'), '2026-11-16');
});

test('timeToMinutes validates input', () => {
  assert.equal(timeToMinutes('09:30'), 570);
  assert.equal(timeToMinutes('00:00'), 0);
  assert.ok(Number.isNaN(timeToMinutes('24:00')));
  assert.ok(Number.isNaN(timeToMinutes('9:30')));
  assert.ok(Number.isNaN(timeToMinutes(null)));
});

test('formatting helpers', () => {
  assert.equal(formatMinutes(90), '1 h 30 min');
  assert.equal(formatMinutes(120), '2 h');
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatHours(330), '5.5');
  assert.equal(formatHours(480), '8');
  assert.equal(formatDate('2026-11-19'), 'Thu, Nov 19');
  assert.equal(formatDate('2026-11-19', 'long'), 'Thursday, November 19');
});
