// Boundary Intelligence: deterministic conflict detection.
//
// Rules (tasks are checked when they have a planned date; calendar events are
// checked when they are "busy"):
//  CAPACITY_EXCEEDED (high)   work minutes on a day > daily maximum
//  CAPACITY_NEAR     (notice) work minutes > 85 % of the maximum
//  REST_DAY          (high)   open work task, or professional meeting, on a
//                             non-working day while rest-day protection is on
//  OUTSIDE_HOURS     (medium) timed work task or professional meeting that
//                             falls outside working hours (on working days)
//  PROTECTED_TIME    (high)   ANY timed open task, or any professional meeting,
//                             that overlaps a protected block on that weekday
//  DOUBLE_BOOKED     (medium) a timed open task overlaps a busy meeting, or two
//                             busy meetings overlap (across any calendars)
//
// "Work minutes" = professional tasks planned that day (finished or not,
// because finished work still used the day's hours) + busy, timed meetings
// from professional calendars. Personal calendar events never count as work and
// never trigger protected-time alerts (a family event in family time is fine).
// Capacity conflicts are raised only while there is open work that day.

import { BOUNDARIES, DOMAINS, SEVERITY_RANK } from './config.js';
import { formatHours, timeToMinutes, weekday } from './dates.js';

const PROFESSIONAL = new Set(DOMAINS.filter((d) => d.type === 'professional').map((d) => d.id));

export const CONFLICT_LABELS = Object.freeze({
  CAPACITY_EXCEEDED: 'Over capacity',
  CAPACITY_NEAR: 'Near capacity',
  REST_DAY: 'Rest day',
  OUTSIDE_HOURS: 'Outside working hours',
  PROTECTED_TIME: 'Protected time',
  DOUBLE_BOOKED: 'Double-booked',
});

export function isProfessional(domain) {
  return PROFESSIONAL.has(domain);
}

/** Two time spans overlap when startA < endB and startB < endA. */
export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

/** A task's time span in minutes after midnight, or null without a start time. */
export function taskInterval(task) {
  const start = timeToMinutes(task.startTime);
  if (Number.isNaN(start)) return null;
  const est = Number(task.estimateMinutes);
  return { start, end: start + (Number.isFinite(est) && est > 0 ? est : 0) };
}

/** A timed event's span on its start date (clipped at midnight), or null for all-day events. */
export function eventInterval(event) {
  if (event.allDay) return null;
  const start = timeToMinutes(event.startTime);
  if (Number.isNaN(start)) return null;
  const endRaw = event.endDate > event.date ? 1440 : timeToMinutes(event.endTime);
  return { start, end: Number.isNaN(endRaw) ? start : Math.max(start, endRaw) };
}

const minutesOf = (task) => {
  const est = Number(task.estimateMinutes);
  return Number.isFinite(est) && est > 0 ? est : 0;
};

const isWorkEvent = (e) => e.busy && e.category === 'professional' && !e.allDay;

/** Busy, timed professional meeting minutes on `date`. */
export function meetingLoad(events, date) {
  return (events || [])
    .filter((e) => e.date === date && isWorkEvent(e))
    .reduce((sum, e) => {
      const span = eventInterval(e);
      return sum + (span ? span.end - span.start : 0);
    }, 0);
}

/** Work minutes on `date`: professional tasks (finished or not) + professional meetings. */
export function dayLoad(tasks, date, events = []) {
  const taskMinutes = tasks
    .filter((t) => t.scheduledDate === date && isProfessional(t.domain))
    .reduce((sum, t) => sum + minutesOf(t), 0);
  return taskMinutes + meetingLoad(events, date);
}

export function isWorkDay(settings, date) {
  return (settings.workDays || []).includes(weekday(date));
}

const hasOverride = (item, code) => Array.isArray(item.overrides) && item.overrides.includes(code);

export function dayConflicts(tasks, settings, date, events = []) {
  const open = tasks.filter((t) => t.scheduledDate === date && t.status === 'open');
  const openPro = open.filter((t) => isProfessional(t.domain));
  const dayEvents = (events || []).filter((e) => e.date === date && e.busy);
  const workEvents = dayEvents.filter(isWorkEvent);
  const wd = weekday(date);
  const workDay = isWorkDay(settings, date);
  const conflicts = [];

  // Capacity
  const load = dayLoad(tasks, date, events);
  const cap = Number(settings.maxDailyWorkMinutes);
  if ((openPro.length || workEvents.length) && Number.isFinite(cap) && cap >= 0) {
    const base = {
      date, taskIds: openPro.map((t) => t.id), eventIds: workEvents.map((e) => e.id), load, capacity: cap,
    };
    if (load > cap) {
      conflicts.push({
        ...base, code: 'CAPACITY_EXCEEDED', severity: 'high',
        acknowledged: openPro.some((t) => hasOverride(t, 'CAPACITY_EXCEEDED')) || workEvents.some((e) => hasOverride(e, 'CAPACITY_EXCEEDED')),
        message: `${formatHours(load)} h of work planned against a ${formatHours(cap)} h limit (${formatHours(load - cap)} h over).`,
      });
    } else if (load > cap * BOUNDARIES.capacityNearRatio) {
      conflicts.push({
        ...base, code: 'CAPACITY_NEAR', severity: 'notice', acknowledged: false,
        message: `${formatHours(load)} h of ${formatHours(cap)} h planned (${Math.round((load / cap) * 100)}% of capacity).`,
      });
    }
  }

  const workStart = timeToMinutes(settings.workStart);
  const workEnd = timeToMinutes(settings.workEnd);
  const hoursValid = !Number.isNaN(workStart) && !Number.isNaN(workEnd);
  const blocks = (settings.protectedBlocks || [])
    .filter((b) => (b.days || []).includes(wd))
    .map((b) => ({ block: b, span: { start: timeToMinutes(b.start), end: timeToMinutes(b.end) } }))
    .filter(({ span }) => !Number.isNaN(span.start) && !Number.isNaN(span.end) && span.end > span.start);

  // Shared checks for a work item (task or professional meeting).
  const checkWorkItem = (item, span, ids, noun) => {
    if (!workDay && settings.protectRestDays) {
      conflicts.push({
        code: 'REST_DAY', severity: 'high', date, ...ids, acknowledged: hasOverride(item, 'REST_DAY'),
        message: `"${item.title}" is ${noun} scheduled on a protected rest day.`,
      });
    }
    if (workDay && span && hoursValid && (span.start < workStart || span.end > workEnd)) {
      conflicts.push({
        code: 'OUTSIDE_HOURS', severity: 'medium', date, ...ids, acknowledged: hasOverride(item, 'OUTSIDE_HOURS'),
        message: `"${item.title}" runs outside working hours (${settings.workStart}–${settings.workEnd}).`,
      });
    }
  };
  const checkProtected = (item, span, ids) => {
    if (!span) return;
    for (const { block, span: b } of blocks) {
      if (overlaps(span, b)) {
        conflicts.push({
          code: 'PROTECTED_TIME', severity: 'high', date, ...ids, blockId: block.id,
          acknowledged: hasOverride(item, 'PROTECTED_TIME'),
          message: `"${item.title}" overlaps ${block.label} (${block.start}–${block.end}).`,
        });
      }
    }
  };

  for (const task of open) {
    const span = taskInterval(task);
    const ids = { taskIds: [task.id], eventIds: [] };
    if (isProfessional(task.domain)) checkWorkItem(task, span, ids, 'work');
    checkProtected(task, span, ids);
  }
  for (const ev of workEvents) {
    const span = eventInterval(ev);
    const ids = { taskIds: [], eventIds: [ev.id] };
    checkWorkItem(ev, span, ids, 'a work meeting');
    checkProtected(ev, span, ids);
  }

  // Double-booking: task vs meeting, and meeting vs meeting.
  const timedEvents = dayEvents.map((e) => ({ e, span: eventInterval(e) })).filter((x) => x.span && x.span.end > x.span.start);
  for (const task of open) {
    const span = taskInterval(task);
    if (!span || span.end <= span.start) continue;
    for (const { e, span: es } of timedEvents) {
      if (overlaps(span, es)) {
        conflicts.push({
          code: 'DOUBLE_BOOKED', severity: 'medium', date, taskIds: [task.id], eventIds: [e.id],
          acknowledged: hasOverride(task, 'DOUBLE_BOOKED') || hasOverride(e, 'DOUBLE_BOOKED'),
          message: `"${task.title}" overlaps the meeting "${e.title}" (${e.startTime}–${e.endDate > e.date ? '24:00' : e.endTime}).`,
        });
      }
    }
  }
  for (let i = 0; i < timedEvents.length; i += 1) {
    for (let j = i + 1; j < timedEvents.length; j += 1) {
      const a = timedEvents[i];
      const b = timedEvents[j];
      if (overlaps(a.span, b.span)) {
        conflicts.push({
          code: 'DOUBLE_BOOKED', severity: 'medium', date, taskIds: [], eventIds: [a.e.id, b.e.id],
          acknowledged: hasOverride(a.e, 'DOUBLE_BOOKED') && hasOverride(b.e, 'DOUBLE_BOOKED'),
          message: `"${a.e.title}" and "${b.e.title}" are scheduled at the same time.`,
        });
      }
    }
  }
  return conflicts;
}

export function sortConflicts(list) {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  });
}

/** Conflicts on every planned date from `from` to `to` (inclusive; `to` optional). */
export function conflictsInRange(tasks, settings, from, to, events = []) {
  const inRange = (d) => d && d >= from && (!to || d <= to);
  const dates = new Set([
    ...tasks.filter((t) => t.status === 'open' && inRange(t.scheduledDate)).map((t) => t.scheduledDate),
    ...(events || []).filter((e) => e.busy && inRange(e.date)).map((e) => e.date),
  ]);
  return sortConflicts([...dates].flatMap((d) => dayConflicts(tasks, settings, d, events)));
}

const conflictKey = (c) => `${c.code}|${c.date}|${(c.taskIds || []).join(',')}|${(c.eventIds || []).join(',')}|${c.blockId || ''}`;

/**
 * Conflicts that a proposed change to tasks would create.
 * A per-item conflict is new if it did not exist before the change.
 * A capacity conflict is new whenever the change increases that day's work
 * load and the day ends up near or over capacity (so adding more work to a day
 * that is already over capacity warns again, while removing work never warns).
 */
export function newConflicts(beforeTasks, afterTasks, settings, dates, events = []) {
  const unique = [...new Set(dates.filter(Boolean))];
  const before = unique.flatMap((d) => dayConflicts(beforeTasks, settings, d, events));
  const after = unique.flatMap((d) => dayConflicts(afterTasks, settings, d, events));
  const beforeKeys = new Set(before.filter((c) => !c.code.startsWith('CAPACITY')).map(conflictKey));

  return sortConflicts(after.filter((c) => {
    if (c.code.startsWith('CAPACITY')) return c.load > dayLoad(beforeTasks, c.date, events);
    return !beforeKeys.has(conflictKey(c));
  }));
}

/** Notices are informational; high and medium conflicts ask for a decision. */
export function needsDecision(conflicts) {
  return conflicts.some((c) => c.severity !== 'notice');
}
