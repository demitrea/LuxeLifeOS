// Strategic goals: progress from milestones, expected progress from the
// calendar, and a status that compares the two.

import { GOAL_STATUS, HORIZON_DAYS } from './config.js';
import { addDays, daysBetween, isISODate } from './dates.js';

export const STATUS_LABELS = Object.freeze({
  complete: 'Complete',
  'on-track': 'On track',
  'at-risk': 'At risk',
  behind: 'Behind',
});

export function defaultTargetDate(startDate, horizon) {
  const days = HORIZON_DAYS[horizon];
  if (!isISODate(startDate) || days === undefined) return '';
  return addDays(startDate, days);
}

/** Progress % = round(completed milestones ÷ total milestones × 100). */
export function goalProgress(goal) {
  const milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
  const total = milestones.length;
  const done = milestones.filter((m) => m.done).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

/** Expected % = days elapsed ÷ total days, kept between 0 and 100. */
export function expectedProgress(goal, today) {
  if (!isISODate(goal.startDate) || !isISODate(goal.targetDate)) return 0;
  const total = daysBetween(goal.startDate, goal.targetDate);
  if (total <= 0) return today >= goal.targetDate ? 100 : 0;
  const elapsed = daysBetween(goal.startDate, today);
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/**
 * Status rules, checked in order:
 *  1. Every milestone done (and at least one exists) → Complete
 *  2. Target date has passed                         → Behind
 *  3. progress < expected − 25                       → Behind
 *  4. progress < expected − 10                       → At risk
 *  5. otherwise                                      → On track
 */
export function goalStatus(goal, today) {
  const { done, total, percent } = goalProgress(goal);
  const expected = expectedProgress(goal, today);
  const gap = expected - percent;
  const base = { percent, expected, gap, done, total };

  if (total > 0 && done === total) {
    return { ...base, status: 'complete', label: STATUS_LABELS.complete, reason: 'Every milestone is complete.' };
  }
  if (isISODate(goal.targetDate) && today > goal.targetDate) {
    return { ...base, status: 'behind', label: STATUS_LABELS.behind, reason: `The target date has passed with ${percent}% complete.` };
  }
  const compare = `Progress ${percent}% vs. expected ${expected}%`;
  if (gap > GOAL_STATUS.behindGap) {
    return { ...base, status: 'behind', label: STATUS_LABELS.behind, reason: `${compare}: ${gap} points behind (more than ${GOAL_STATUS.behindGap}).` };
  }
  if (gap > GOAL_STATUS.atRiskGap) {
    return { ...base, status: 'at-risk', label: STATUS_LABELS['at-risk'], reason: `${compare}: ${gap} points behind (more than ${GOAL_STATUS.atRiskGap}).` };
  }
  return {
    ...base,
    status: 'on-track',
    label: STATUS_LABELS['on-track'],
    reason: gap > 0 ? `${compare}: within ${GOAL_STATUS.atRiskGap} points.` : `${compare}: on or ahead of schedule.`,
  };
}
