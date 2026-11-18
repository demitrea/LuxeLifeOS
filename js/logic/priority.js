// Priority Intelligence: a transparent, deterministic score from 0 to 100.
// Score = Urgency (40) + Importance (30) + Goal alignment (20) + Effort (10).

import { BRIEFING, SCORING } from './config.js';
import { daysBetween, formatMinutes } from './dates.js';
import { goalStatus } from './goals.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function urgencyScore(task, today) {
  const U = SCORING.urgency;
  if (!task.dueDate) return { points: U.noDueDate, reason: 'No due date' };
  const days = daysBetween(today, task.dueDate);
  if (days < 0) return { points: U.overdue, reason: `${plural(-days, 'day')} overdue` };
  const bracket = U.brackets.find((b) => days <= b.maxDays);
  const points = bracket ? bracket.points : U.beyond;
  const reason = days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
  return { points, reason };
}

export function importanceLevel(task) {
  const n = Math.round(Number(task.importance));
  if (!Number.isFinite(n)) return SCORING.importance.defaultLevel;
  return Math.min(5, Math.max(1, n));
}

export function importanceScore(task) {
  const level = importanceLevel(task);
  return { points: level * SCORING.importance.perLevel, reason: `Rated ${level} of 5` };
}

export function alignmentScore(task, goal, today) {
  const A = SCORING.alignment;
  if (!task.goalId || !goal) return { points: A.none, reason: 'Not linked to a goal' };
  const status = goalStatus(goal, today);
  if (status.status === 'behind') {
    return { points: A.linkedBehind, reason: `Supports "${goal.title}", which is behind schedule` };
  }
  return { points: A.linked, reason: `Supports "${goal.title}"` };
}

export function effortScore(task) {
  const E = SCORING.effort;
  const minutes = Number(task.estimateMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return { points: E.unknown, reason: 'No estimate' };
  const bracket = E.brackets.find((b) => minutes <= b.maxMinutes);
  return { points: bracket ? bracket.points : E.beyond, reason: `About ${formatMinutes(minutes)}` };
}

/** Full score with a factor-by-factor explanation. */
export function scoreTask(task, goalsById, today) {
  const goal = task.goalId ? goalsById.get(task.goalId) : undefined;
  const parts = [
    { key: 'urgency', label: 'Urgency', max: SCORING.urgency.max, ...urgencyScore(task, today) },
    { key: 'importance', label: 'Importance', max: SCORING.importance.max, ...importanceScore(task) },
    { key: 'alignment', label: 'Goal alignment', max: SCORING.alignment.max, ...alignmentScore(task, goal, today) },
    { key: 'effort', label: 'Effort', max: SCORING.effort.max, ...effortScore(task) },
  ];
  const total = parts.reduce((sum, p) => sum + p.points, 0);
  return { total, parts };
}

/** "Urgency 32/40 (Due tomorrow) + … = 82" */
export function explainScore(score) {
  return `${score.parts.map((p) => `${p.label} ${p.points}/${p.max} (${p.reason})`).join(' + ')} = ${score.total}`;
}

/**
 * Deterministic ordering:
 *  1. Higher score  2. Earlier due date (none last)  3. Higher importance
 *  4. Older creation time  5. Task id (alphabetical)
 */
export function compareRanked(a, b) {
  if (b.score.total !== a.score.total) return b.score.total - a.score.total;
  const da = a.task.dueDate || '9999-12-31';
  const db = b.task.dueDate || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  const ia = importanceLevel(a.task);
  const ib = importanceLevel(b.task);
  if (ia !== ib) return ib - ia;
  const ca = a.task.createdAt || '';
  const cb = b.task.createdAt || '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  const ida = String(a.task.id);
  const idb = String(b.task.id);
  return ida < idb ? -1 : ida > idb ? 1 : 0;
}

export function goalsMap(goals) {
  return new Map((goals || []).map((g) => [g.id, g]));
}

/** Score and sort tasks. Returns [{ task, score }]. */
export function rankTasks(tasks, goals, today) {
  const byId = goalsMap(goals);
  return tasks.map((task) => ({ task, score: scoreTask(task, byId, today) })).sort(compareRanked);
}

/** Open tasks that are not scheduled for a future day. */
export function isFocusCandidate(task, today) {
  return task.status === 'open' && (!task.scheduledDate || task.scheduledDate <= today);
}

export function topPriorities(tasks, goals, today, count = BRIEFING.topCount) {
  return rankTasks(tasks.filter((t) => isFocusCandidate(t, today)), goals, today).slice(0, count);
}
