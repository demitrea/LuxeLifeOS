import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerQuestion, interpretStatement, isReady, nextWeekday, openQuestions, parseCapture, splitStatements, toRecords,
} from '../js/logic/capture.js';
import { defaultSettings } from '../js/store.js';

const TODAY = '2026-11-19'; // Thursday
const ctx = { today: TODAY, settings: defaultSettings() };
const parse = (t) => parseCapture(t, ctx);
const one = (t) => {
  const items = parse(t);
  assert.equal(items.length, 1, `expected one item for "${t}", got ${items.length}`);
  return items[0];
};

// ---------- the course example ----------
test('the example sentence becomes a task, a follow-up and one-time protected time', () => {
  const [paper, follow, protect] = parse('I have a paper due Monday, need to follow up with someone tomorrow, and want Friday evening protected.');
  assert.equal(paper.kind, 'task');
  assert.equal(paper.title, 'Paper');
  assert.equal(paper.dueDate, '2026-11-23');
  assert.equal(paper.domain, 'education'); // from the listed word "paper"
  assert.equal(paper.importance, 3); // no priority words → default
  assert.equal(follow.kind, 'followup');
  assert.equal(follow.title, 'Follow up with someone'); // "someone" is not replaced by a name
  assert.equal(follow.followUpDate, '2026-11-20');
  assert.equal(follow.domain, null); // nothing in the words → uncategorized
  assert.equal(protect.kind, 'protect');
  assert.equal(protect.block.date, '2026-11-20'); // one time
  assert.deepEqual(protect.block.days, []);
  assert.equal(protect.block.start, 18 * 60);
  assert.equal(protect.block.end, 22 * 60);
  assert.ok([paper, follow, protect].every((i) => openQuestions(i).length === 0), 'no questions needed');
  assert.ok([paper, follow, protect].every(isReady));
});

// ---------- splitting ----------
test('splits several commitments only at reliable boundaries', () => {
  assert.deepEqual(splitStatements('Buy milk and eggs'), ['Buy milk and eggs']);
  assert.deepEqual(splitStatements('Email the client and call the bank'), ['Email the client', 'call the bank']);
  assert.deepEqual(splitStatements('Call mom, dad and grandma'), ['Call mom, dad and grandma']);
  assert.deepEqual(splitStatements('Pay rent. Book a dentist appointment!\nSubmit the essay'), ['Pay rent', 'Book a dentist appointment', 'Submit the essay']);
  assert.deepEqual(splitStatements('Meet Dr. Lee at 3 p.m. tomorrow'), ['Meet Dr. Lee at 3 p.m. tomorrow']);
  assert.deepEqual(splitStatements('Finish the slides, then send them to the team'), ['Finish the slides', 'send them to the team']);
  assert.deepEqual(splitStatements('   '), []);
});

test('one statement never produces more than one item', () => {
  const text = 'Pay rent tomorrow. I also need to renew my passport and protect Sunday morning';
  assert.equal(parse(text).length, splitStatements(text).length);
});

// ---------- dates ----------
test('relative dates', () => {
  assert.equal(one('Call the bank today').scheduledDate, TODAY);
  assert.equal(one('Call the bank tomorrow').scheduledDate, '2026-11-20');
  assert.equal(one('Call the bank the day after tomorrow').scheduledDate, '2026-11-21');
  assert.equal(one('Renew passport in 3 days').scheduledDate, '2026-11-22');
  assert.equal(one('Renew passport in two weeks').scheduledDate, '2026-12-03');
});

test('weekday names: next occurrence, "this", and questions when ambiguous', () => {
  assert.equal(nextWeekday(TODAY, 1), '2026-11-23');
  assert.equal(one('Essay due Monday').dueDate, '2026-11-23');
  assert.equal(one('Essay due by Saturday').dueDate, '2026-11-21');
  assert.equal(one('Essay due this Thursday').dueDate, TODAY); // "this" includes today
  // Bare weekday that is today → ask (it changes a deadline).
  const thu = one('Essay due Thursday');
  assert.equal(thu.dueDate, null);
  assert.equal(openQuestions(thu).length, 1);
  assert.equal(answerQuestion(thu, openQuestions(thu)[0].id, 1).dueDate, '2026-11-26');
  // "next Monday": the soonest Monday is already next week → no question.
  assert.equal(one('Essay due next Monday').dueDate, '2026-11-23');
  // "next Saturday": could be Nov 21 or Nov 28 → ask.
  const sat = one('Essay due next Saturday');
  assert.equal(sat.dueDate, null);
  assert.deepEqual(openQuestions(sat)[0].options.map((o) => o.set.dueDate), ['2026-11-21', '2026-11-28']);
});

test('calendar dates', () => {
  assert.equal(one('Taxes due Dec 3').dueDate, '2026-12-03');
  assert.equal(one('Taxes due December 3rd, 2027').dueDate, '2027-12-03');
  assert.equal(one('Taxes due 11/30').dueDate, '2026-11-30');
  assert.equal(one('Taxes due Nov 2').dueDate, '2027-11-02'); // already passed this year → next year
  assert.equal(one('Taxes due the 25th').dueDate, '2026-11-25');
  assert.equal(one('Taxes due the 5th').dueDate, '2026-12-05');
  assert.equal(one('Taxes due Feb 30').dueDate, null); // not a real date → nothing invented
});

test('deadline vs. planned day', () => {
  const a = one('Submit the essay by Friday');
  assert.equal(a.dueDate, '2026-11-20');
  assert.equal(a.scheduledDate, null);
  const b = one('Start the essay tomorrow, due Monday');
  assert.equal(b.scheduledDate, '2026-11-20');
  assert.equal(b.dueDate, '2026-11-23');
});

test('vague phrases never become dates and stay in the title', () => {
  for (const phrase of ['next week', 'soon', 'later', 'this month', 'at some point', 'end of the month']) {
    const item = one(`Finish the report ${phrase}`);
    assert.equal(item.dueDate, null, phrase);
    assert.equal(item.scheduledDate, null, phrase);
    assert.match(item.title, new RegExp(phrase), `"${phrase}" is kept in the title`);
  }
});

test('several dates in one statement → kept exactly as said', () => {
  const item = one('Call the plumber Monday or Tuesday');
  assert.equal(item.confidence, 'as-written');
  assert.equal(item.title, 'Call the plumber Monday or Tuesday');
  assert.equal(item.scheduledDate, null);
});

// ---------- times ----------
test('times: exact, 24-hour, ambiguous, and resolved by time-of-day words', () => {
  const a = one('Call the bank tomorrow at 3pm');
  assert.equal(a.startTime, '15:00');
  assert.equal(a.scheduledDate, '2026-11-20');
  assert.equal(one('Call the bank tomorrow at 15:30').startTime, '15:30');
  assert.equal(one('Call the bank tomorrow at noon').startTime, '12:00');
  // "at 3" alone is ambiguous → one question with AM/PM.
  const b = one('Meet my advisor at 3 tomorrow');
  assert.equal(b.startTime, null);
  const q = openQuestions(b)[0];
  assert.deepEqual(q.options.map((o) => o.label), ['3 AM', '3 PM']);
  assert.equal(answerQuestion(b, q.id, 1).startTime, '15:00');
  // "evening" in the user's own words settles PM.
  assert.equal(one('Call my sister at 7 tomorrow evening').startTime, '19:00');
  assert.equal(one('Go to the gym at 7 tomorrow morning').startTime, '07:00');
});

test('a time with no day asks which day (time-sensitive), a deadline time stays in the title', () => {
  const a = one('Call the pharmacy at 4pm');
  assert.equal(a.scheduledDate, null);
  assert.equal(openQuestions(a)[0].prompt, 'Which day?');
  assert.equal(answerQuestion(a, 'q-scheduledDate', 0).scheduledDate, TODAY);
  const b = one('Submit the application by 5pm Monday');
  assert.equal(b.dueDate, '2026-11-23');
  assert.equal(b.startTime, null);
  assert.match(b.title, /5pm/);
  assert.equal(openQuestions(b).length, 0);
});

test('durations set the effort estimate only when stated', () => {
  assert.equal(one('Gym session for 45 minutes on Saturday').estimateMinutes, 45);
  assert.equal(one('Study for 2 hours tomorrow').estimateMinutes, 120);
  assert.equal(one('Study tomorrow').estimateMinutes, null);
});

// ---------- protected time ----------
test('protected time is one-time unless recurrence is stated', () => {
  assert.equal(one('Protect Saturday morning').block.date, '2026-11-21');
  assert.deepEqual(one('Protect every Saturday morning').block.days, [6]);
  assert.deepEqual(one('Protect Saturdays').block.days, [6]);
  assert.deepEqual(one('Keep weekends free').block.days, [0, 6]);
  assert.deepEqual(one('No work every evening').block.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(one('Protect this weekend').block.dates, ['2026-11-21', '2026-11-22']);
});

test('protected time uses the saved day-part settings', () => {
  const custom = { ...ctx, settings: { ...ctx.settings, dayParts: { ...ctx.settings.dayParts, evening: { start: '17:30', end: '21:00' } } } };
  const item = parseCapture('Protect Friday evening', custom)[0];
  assert.equal(item.block.start, 17 * 60 + 30);
  assert.equal(item.block.end, 21 * 60);
  assert.ok(item.evidence.some((e) => /your settings/.test(e.meaning)));
});

test('protected time: explicit ranges, "after", and questions only when the boundary is unclear', () => {
  const r = one('Protect 6 to 8 pm on Saturday');
  assert.equal(r.block.start, 18 * 60);
  assert.equal(r.block.end, 20 * 60);
  assert.equal(one('Protect 6 to 8 tonight').block.start, 18 * 60); // "tonight" settles PM
  const after = one('No work after 6pm on Friday');
  assert.equal(after.block.start, 18 * 60);
  assert.equal(after.block.end, 1439);
  // No time words at all → ask which part of the day.
  const noTime = one('Protect Sunday for family');
  assert.equal(noTime.title, 'Family time');
  assert.equal(openQuestions(noTime)[0].id, 'q-part');
  const answered = answerQuestion(noTime, 'q-part', 3); // All day
  assert.equal(answered.block.start, 0);
  assert.equal(answered.block.end, 1439);
  assert.ok(isReady(answered));
  // No day at all → ask which days.
  const noDay = one('Protect 7 to 9 pm');
  assert.equal(openQuestions(noDay)[0].id, 'q-days');
  // A single time with no start/end meaning → kept as said.
  assert.equal(one('Protect 6pm Friday').confidence, 'as-written');
});

// ---------- areas, importance, nothing invented ----------
test('life area only from listed words; conflicting words → uncategorized', () => {
  assert.equal(one('Pay the electric bill').domain, 'finances');
  assert.equal(one('Prepare the client presentation').domain, 'career');
  assert.equal(one('Pick up groceries').domain, null);
  assert.equal(one('Book a dentist appointment').domain, 'wellness');
  assert.equal(one('Study with my friend').domain, null); // education + relationships → not guessed
  assert.equal(one('Run errands').domain, null); // "run" is deliberately not a listed word
});

test('importance only from priority words', () => {
  assert.equal(one('Urgent: renew the car insurance').importance, 5);
  assert.equal(one('Important: update my resume').importance, 4);
  assert.equal(one('Organize photos, no rush').importance, 2);
  assert.equal(one('Pick up keys').importance, 3);
});

test('never invents names, dates or commitments', () => {
  const items = parse('Follow up with someone. Something about the project');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Follow up with someone');
  assert.equal(items[0].followUpDate, null);
  assert.equal(items[1].title, 'Something about the project');
  assert.equal(items[1].dueDate, null);
  assert.equal(items[1].scheduledDate, null);
});

test('every set value has evidence from the user’s words', () => {
  const item = one('Urgent: essay due Monday');
  const words = item.evidence.map((e) => e.words.toLowerCase());
  assert.ok(words.some((w) => w.includes('monday')));
  assert.ok(words.includes('essay'));
  assert.ok(words.includes('urgent'));
});

// ---------- saving ----------
test('toRecords creates tasks and blocks without touching anything else', () => {
  const items = parse('I have a paper due Monday, need to follow up with someone tomorrow, and want Friday evening protected. Protect this weekend');
  const weekend = answerQuestion(items[3], 'q-part', 3);
  let n = 0;
  const { tasks, blocks } = toRecords([items[0], items[1], items[2], weekend], { makeId: (p) => `${p}_${(n += 1)}`, now: `${TODAY}T09:00:00` });
  assert.equal(tasks.length, 2);
  assert.equal(blocks.length, 3); // Friday + Saturday + Sunday
  assert.deepEqual(tasks.map((t) => [t.title, t.domain, t.dueDate, t.isFollowUp, t.followUpDate]), [
    ['Paper', 'education', '2026-11-23', false, null],
    ['Follow up with someone', null, null, true, '2026-11-20'],
  ]);
  assert.match(tasks[0].notes, /From your note: “I have a paper due Monday”/);
  assert.deepEqual(blocks.map((b) => [b.date, b.start, b.end, b.days.length]), [
    ['2026-11-20', '18:00', '22:00', 0], ['2026-11-21', '00:00', '23:59', 0], ['2026-11-22', '00:00', '23:59', 0],
  ]);
});

test('interpretStatement ignores empty input', () => {
  assert.equal(interpretStatement('   ', ctx), null);
});
