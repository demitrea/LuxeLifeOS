// Boundary Intelligence: deterministic conflict detection.
//
// Rules (only tasks with a scheduled date are checked):
//  CAPACITY_EXCEEDED (high)   professional minutes on a day > daily maximum
//  CAPACITY_NEAR     (notice) professional minutes > 85 % of the maximum
//  REST_DAY          (high)   open professional task on a non-working day
//                             while rest-day protection is on
//  OUTSIDE_HOURS     (medium) open professional task with a start time whose
//                             time span falls outside working hours (work days)
//  PROTECTED_TIME    (high)   ANY open task whose time span overlaps a
//                             protected block on that weekday
//
// Capacity counts every professional task scheduled that day, finished or not,
// because finished work still used that day's hours. Capacity conflicts are
// only raised while at least one professional task on that day is still open.

import { BOUNDARIES, DOMAINS, SEVERITY_RANK } from './config.js';
import { formatHours, timeToMinutes, weekday } from './dates.js';

const PROFESSIONAL = new Set(DOMAINS.filter((d) => d.type === 'professional').map((d) => d.id));

export const CONFLICT_LABELS = Object.freeze({
  CAPACITY_EXCEEDED: 'Over capacity',
  CAPACITY_NEAR: 'Near capacity',
  REST_DAY: 'Rest day',
  OUTSIDE_HOURS: 'Outside working hours',
  PROTECTED_TIME: 'Protected time',
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

const minutesOf = (task) => {
  const est = Number(task.estimateMinutes);
  return Number.isFinite(est) && est > 0 ? est : 0;
};

/** Professional minutes scheduled on `date` (finished or not). */
export function dayLoad(tasks, date) {
  return tasks
    .filter((t) => t.scheduledDate === date && isProfessional(t.domain))
    .reduce((sum, t) => sum + minutesOf(t), 0);
}

export function isWorkDay(settings, date) {
  return (settings.workDays || []).includes(weekday(date));
}

const hasOverride = (task, code) => Array.isArray(task.overrides) && task.overrides.includes(code);

export function dayConflicts(tasks, settings, date) {
  const dayTasks = tasks.filter((t) => t.scheduledDate === date);
  const open = dayTasks.filter((t) => t.status === 'open');
  const openPro = open.filter((t) => isProfessional(t.domain));
  const wd = weekday(date);
  const workDay = isWorkDay(settings, date);
  const conflicts = [];

  // Capacity
  const load = dayLoad(tasks, date);
  const cap = Number(settings.maxDailyWorkMinutes);
  if (openPro.length && Number.isFinite(cap) && cap >= 0) {
    const ids = openPro.map((t) => t.id);
    const acknowledged = openPro.some((t) => hasOverride(t, 'CAPACITY_EXCEEDED'));
    if (load > cap) {
      conflicts.push({
        code: 'CAPACITY_EXCEEDED', severity: 'high', date, taskIds: ids, load, capacity: cap, acknowledged,
        message: `${formatHours(load)} h of work planned against a ${formatHours(cap)} h limit (${formatHours(load - cap)} h over).`,
      });
    } else if (load > cap * BOUNDARIES.capacityNearRatio) {
      conflicts.push({
        code: 'CAPACITY_NEAR', severity: 'notice', date, taskIds: ids, load, capacity: cap, acknowledged: false,
        message: `${formatHours(load)} h of ${formatHours(cap)} h planned (${Math.round((load / cap) * 100)}% of capacity).`,
      });
    }
  }

  const workStart = timeToMinutes(settings.workStart);
  const workEnd = timeToMinutes(settings.workEnd);
  const blocks = (settings.protectedBlocks || []).filter((b) => (b.days || []).includes(wd));

  for (const task of open) {
    const span = taskInterval(task);

    if (isProfessional(task.domain)) {
      if (!workDay && settings.protectRestDays) {
        conflicts.push({
          code: 'REST_DAY', severity: 'high', date, taskIds: [task.id], acknowledged: hasOverride(task, 'REST_DAY'),
          message: `"${task.title}" is work scheduled on a protected rest day.`,
        });
      }
      if (workDay && span && !Number.isNaN(workStart) && !Number.isNaN(workEnd)
        && (span.start < workStart || span.end > workEnd)) {
        conflicts.push({
          code: 'OUTSIDE_HOURS', severity: 'medium', date, taskIds: [task.id], acknowledged: hasOverride(task, 'OUTSIDE_HOURS'),
          message: `"${task.title}" runs outside working hours (${settings.workStart}–${settings.workEnd}).`,
        });
      }
    }

    if (span) {
      for (const block of blocks) {
        const b = { start: timeToMinutes(block.start), end: timeToMinutes(block.end) };
        if (Number.isNaN(b.start) || Number.isNaN(b.end) || b.end <= b.start) continue;
        if (overlaps(span, b)) {
          conflicts.push({
            code: 'PROTECTED_TIME', severity: 'high', date, taskIds: [task.id], blockId: block.id,
            acknowledged: hasOverride(task, 'PROTECTED_TIME'),
            message: `"${task.title}" overlaps ${block.label} (${block.start}–${block.end}).`,
          });
        }
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

/** Conflicts on every scheduled date from `from` to `to` (inclusive; `to` optional). */
export function conflictsInRange(tasks, settings, from, to) {
  const dates = [...new Set(tasks
    .filter((t) => t.status === 'open' && t.scheduledDate && t.scheduledDate >= from && (!to || t.scheduledDate <= to))
    .map((t) => t.scheduledDate))];
  return sortConflicts(dates.flatMap((d) => dayConflicts(tasks, settings, d)));
}

const conflictKey = (c) => `${c.code}|${c.date}|${(c.taskIds || []).join(',')}|${c.blockId || ''}`;

/**
 * Conflicts that a proposed change would create.
 * A per-task conflict is new if it did not exist before the change.
 * A capacity conflict is new whenever the change increases that day's
 * professional load and the day ends up near or over capacity (so adding
 * more work to a day that is already over capacity warns again, while
 * removing work never warns).
 */
export function newConflicts(beforeTasks, afterTasks, settings, dates) {
  const unique = [...new Set(dates.filter(Boolean))];
  const before = unique.flatMap((d) => dayConflicts(beforeTasks, settings, d));
  const after = unique.flatMap((d) => dayConflicts(afterTasks, settings, d));
  const beforeKeys = new Set(before.filter((c) => !c.code.startsWith('CAPACITY')).map(conflictKey));

  return sortConflicts(after.filter((c) => {
    if (c.code.startsWith('CAPACITY')) return c.load > dayLoad(beforeTasks, c.date);
    return !beforeKeys.has(conflictKey(c));
  }));
}

/** Notices are informational; high and medium conflicts ask for a decision. */
export function needsDecision(conflicts) {
  return conflicts.some((c) => c.severity !== 'notice');
}
