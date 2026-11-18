// Fix the time zone so UTC conversion is checked deterministically.
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventsFromICS, parseContentLine, parseDateTime, parseDuration, parseICS, recurrenceMatcher, unfoldLines,
} from '../js/integrations/ics.js';
import { toDayNumber } from '../js/logic/dates.js';

const TODAY = '2026-11-18'; // Wednesday
const opts = { sourceId: 'src_test', category: 'professional', today: TODAY };

const cal = (...events) => [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', 'X-WR-CALNAME:Work',
  ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']),
  'END:VCALENDAR',
].join('\r\n');

test('line unfolding and content lines with quoted parameters', () => {
  assert.deepEqual(unfoldLines('SUMMARY:Long\r\n  title\r\nX:1'), ['SUMMARY:Long title', 'X:1']);
  const p = parseContentLine('DTSTART;TZID="Eastern Standard Time":20261118T090000');
  assert.equal(p.name, 'DTSTART');
  assert.equal(p.params.TZID, 'Eastern Standard Time');
  assert.equal(p.value, '20261118T090000');
  const q = parseContentLine('LOCATION;ALTREP="http://x:1/":Room 1');
  assert.equal(q.value, 'Room 1');
});

test('rejects files that are not calendars', () => {
  assert.throws(() => parseICS('hello'), /not a calendar/);
});

test('date-time parsing: all-day, local/TZID as written, UTC converted', () => {
  assert.deepEqual(parseDateTime('20261118', {}), { date: '2026-11-18', time: null, allDay: true });
  assert.deepEqual(parseDateTime('20261118T093000', { TZID: 'Pacific Standard Time' }), { date: '2026-11-18', time: '09:30', allDay: false });
  // 14:30 UTC = 09:30 in New York (EST, UTC−5) in November
  assert.deepEqual(parseDateTime('20261118T143000Z', {}), { date: '2026-11-18', time: '09:30', allDay: false });
  // 02:00 UTC on the 19th = 21:00 on the 18th in New York
  assert.deepEqual(parseDateTime('20261119T020000Z', {}), { date: '2026-11-18', time: '21:00', allDay: false });
  assert.equal(parseDateTime('garbage', {}), null);
});

test('durations', () => {
  assert.equal(parseDuration('PT1H30M'), 90);
  assert.equal(parseDuration('P1D'), 1440);
  assert.equal(parseDuration('P1W'), 10080);
  assert.equal(parseDuration('nope'), null);
});

test('single, all-day, cancelled, free and out-of-window events', () => {
  const text = cal(
    ['UID:a', 'SUMMARY:Budget review\\, Q4', 'DTSTART:20261118T100000', 'DTEND:20261118T113000', 'LOCATION:Room 2', 'DESCRIPTION:Private notes'],
    ['UID:b', 'SUMMARY:Offsite', 'DTSTART;VALUE=DATE:20261120', 'DTEND;VALUE=DATE:20261122'],
    ['UID:c', 'SUMMARY:Cancelled sync', 'STATUS:CANCELLED', 'DTSTART:20261118T120000', 'DTEND:20261118T123000'],
    ['UID:d', 'SUMMARY:Focus time', 'TRANSP:TRANSPARENT', 'DTSTART:20261119T090000', 'DURATION:PT2H'],
    ['UID:e', 'SUMMARY:Old meeting', 'DTSTART:20250101T090000', 'DTEND:20250101T100000'],
  );
  const { calendarName, events, stats } = eventsFromICS(text, opts);
  assert.equal(calendarName, 'Work');
  assert.equal(stats.cancelled, 1);
  assert.equal(stats.outsideWindow, 1);
  assert.equal(events.length, 3);
  const [a, d, b] = events;
  assert.equal(a.title, 'Budget review, Q4');
  assert.equal(a.startTime, '10:00');
  assert.equal(a.endTime, '11:30');
  assert.equal(a.location, 'Room 2');
  assert.equal(a.category, 'professional');
  assert.ok(!('description' in a), 'descriptions are not stored');
  assert.equal(d.busy, false);
  assert.equal(d.endTime, '11:00');
  assert.equal(b.allDay, true);
  assert.equal(b.endDate, '2026-11-21'); // DTEND is exclusive
});

test('weekly recurrence with BYDAY, EXDATE and a moved occurrence (RECURRENCE-ID)', () => {
  const text = cal(
    ['UID:standup', 'SUMMARY:Stand-up', 'DTSTART:20261102T093000', 'DTEND:20261102T094500',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261127T235959Z', 'EXDATE:20261120T093000'],
    ['UID:standup', 'RECURRENCE-ID:20261123T093000', 'SUMMARY:Stand-up (moved)', 'DTSTART:20261123T110000', 'DTEND:20261123T111500'],
  );
  const { events } = eventsFromICS(text, opts);
  // Window starts 2026-11-11. Occurrences: 11, 13, 16, 18, (20 excluded), (23 moved), 25, 27 + moved one on 23 at 11:00.
  assert.deepEqual(events.map((e) => `${e.date} ${e.startTime}`), [
    '2026-11-11 09:30', '2026-11-13 09:30', '2026-11-16 09:30', '2026-11-18 09:30',
    '2026-11-23 11:00', '2026-11-25 09:30', '2026-11-27 09:30',
  ]);
});

test('COUNT counts from the first occurrence, even before the window', () => {
  const text = cal(['UID:x', 'SUMMARY:Course', 'DTSTART:20261104T180000', 'DTEND:20261104T190000', 'RRULE:FREQ=WEEKLY;COUNT=3']);
  // Occurrences: Nov 4 (before window), Nov 11, Nov 18
  assert.deepEqual(eventsFromICS(text, opts).events.map((e) => e.date), ['2026-11-11', '2026-11-18']);
});

test('monthly "second Tuesday", "last Friday" and day-of-month rules', () => {
  const second = recurrenceMatcher({ FREQ: 'MONTHLY', BYDAY: '2TU' }, '2026-11-10');
  assert.equal(second(toDayNumber('2026-12-08')), true);
  assert.equal(second(toDayNumber('2026-12-15')), false);
  const lastFri = recurrenceMatcher({ FREQ: 'MONTHLY', BYDAY: '-1FR' }, '2026-11-27');
  assert.equal(lastFri(toDayNumber('2026-12-25')), true);
  assert.equal(lastFri(toDayNumber('2026-12-18')), false);
  const fifteenth = recurrenceMatcher({ FREQ: 'MONTHLY', INTERVAL: '2' }, '2026-11-15');
  assert.equal(fifteenth(toDayNumber('2026-12-15')), false);
  assert.equal(fifteenth(toDayNumber('2027-01-15')), true);
  const everyOtherWeek = recurrenceMatcher({ FREQ: 'WEEKLY', INTERVAL: '2', BYDAY: 'TH', WKST: 'SU' }, '2026-11-05');
  assert.equal(everyOtherWeek(toDayNumber('2026-11-12')), false);
  assert.equal(everyOtherWeek(toDayNumber('2026-11-19')), true);
});

test('unsupported recurrence keeps the first occurrence and is reported', () => {
  const text = cal(['UID:h', 'SUMMARY:Hourly', 'DTSTART:20261118T090000', 'DTEND:20261118T091000', 'RRULE:FREQ=HOURLY;COUNT=5']);
  const { events, stats } = eventsFromICS(text, opts);
  assert.equal(events.length, 1);
  assert.equal(stats.limitedRecurrence, 1);
});

test('re-importing the same file produces the same event ids', () => {
  const text = cal(['UID:same', 'SUMMARY:A', 'DTSTART:20261118T090000', 'DTEND:20261118T100000']);
  assert.equal(eventsFromICS(text, opts).events[0].id, eventsFromICS(text, opts).events[0].id);
});
