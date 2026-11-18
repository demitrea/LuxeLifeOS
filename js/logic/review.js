// Executive Review: a Monday–Sunday summary of the week containing `today`.

import { BRIEFING, DOMAINS } from './config.js';
import { conflictsInRange, dayLoad, isWorkDay, meetingLoad } from './boundaries.js';
import { addDays, startOfWeek } from './dates.js';
import { goalStatus } from './goals.js';

export function weekRange(today) {
  const start = startOfWeek(today);
  return { start, end: addDays(start, 6) };
}

const inRange = (d, r) => Boolean(d) && d >= r.start && d <= r.end;
const completedOn = (t) => (t.completedAt ? t.completedAt.slice(0, 10) : '');

export function weeklyReview(state, today) {
  const { tasks, goals, settings } = state;
  const events = state.events || [];
  const range = weekRange(today);

  // Completed this week (by completion date).
  const completed = tasks.filter((t) => t.status === 'done' && inRange(completedOn(t), range));
  // Unfinished: open tasks due by the end of this week (including overdue) or scheduled this week.
  const unfinished = tasks.filter((t) => t.status === 'open'
    && ((t.dueDate && t.dueDate <= range.end) || inRange(t.scheduledDate, range)));

  const byDomain = DOMAINS.map((d) => ({
    domain: d.id,
    label: d.label,
    completed: completed.filter((t) => t.domain === d.id).length,
    unfinished: unfinished.filter((t) => t.domain === d.id).length,
  }));

  const goalSummaries = goals.map((goal) => ({ goal, ...goalStatus(goal, today) }));
  const goalCounts = { complete: 0, 'on-track': 0, 'at-risk': 0, behind: 0 };
  goalSummaries.forEach((g) => { goalCounts[g.status] += 1; });

  const days = Array.from({ length: 7 }, (_, i) => addDays(range.start, i));
  const plannedMinutes = days.reduce((sum, d) => sum + dayLoad(tasks, d, events), 0);
  const meetingMinutes = days.reduce((sum, d) => sum + meetingLoad(events, d), 0);
  const capacityMinutes = days.filter((d) => isWorkDay(settings, d)).length * (Number(settings.maxDailyWorkMinutes) || 0);

  const conflicts = conflictsInRange(tasks, settings, range.start, range.end, events);
  const overrides = conflicts.filter((c) => c.acknowledged).length;

  // Areas needing attention
  const attention = [];
  for (const d of DOMAINS) {
    const overdue = tasks.filter((t) => t.status === 'open' && t.domain === d.id && t.dueDate && t.dueDate < today).length;
    if (overdue) attention.push({ kind: 'overdue', domain: d.id, message: `${d.label}: ${overdue} overdue task${overdue === 1 ? '' : 's'}.` });
  }
  for (const g of goalSummaries) {
    if (g.status === 'behind') attention.push({ kind: 'goal-behind', goalId: g.goal.id, message: `Goal "${g.goal.title}" is behind. ${g.reason}` });
  }
  // Neglected: an open task has waited at least 14 days, and nothing in that
  // life area has been completed in the last 14 days.
  const neglectStart = addDays(today, -BRIEFING.neglectDays);
  for (const d of DOMAINS) {
    const waiting = tasks.some((t) => t.status === 'open' && t.domain === d.id
      && t.createdAt && t.createdAt.slice(0, 10) <= neglectStart);
    const recent = tasks.some((t) => t.domain === d.id && t.status === 'done' && completedOn(t) > neglectStart);
    if (waiting && !recent) {
      attention.push({ kind: 'neglected', domain: d.id, message: `${d.label}: a task has waited ${BRIEFING.neglectDays}+ days with nothing completed in this area since.` });
    }
  }
  if (plannedMinutes > capacityMinutes) {
    attention.push({ kind: 'capacity', message: 'Planned work this week is more than your weekly capacity.' });
  }

  return {
    range, completed, unfinished, byDomain, goalSummaries, goalCounts,
    plannedMinutes, meetingMinutes, capacityMinutes, conflicts, overrides, attention,
  };
}
