// Today — the Daily Executive Briefing.

import { BRIEFING } from '../logic/config.js';
import { CONFLICT_LABELS, dayConflicts, dayLoad, isWorkDay } from '../logic/boundaries.js';
import { addDays, formatDate, formatHours } from '../logic/dates.js';
import { goalsMap, topPriorities } from '../logic/priority.js';
import { weeklyReview } from '../logic/review.js';
import { emptyState, esc, icon, meter, severityTag, taskRow } from './shared.js';

function greeting(hour) {
  if (hour < 12) return 'Good morning.';
  if (hour < 17) return 'Good afternoon.';
  return 'Good evening.';
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

function focusReason(score) {
  const reasons = score.parts.filter((p) => p.points > 0 && p.key !== 'effort').map((p) => lowerFirst(p.reason));
  return `Ranked first with ${score.total} of 100${reasons.length ? `: ${reasons.join(', ')}` : ''}.`;
}

function welcome() {
  return `
  <section class="card welcome">
    <p class="overline">Welcome</p>
    <h2 class="card-title">Your Personal Chief of Staff</h2>
    <p>LuxeLifeOS helps you decide what deserves your attention, protect your personal time, and keep daily work connected to the life you are building.</p>
    <ol class="steps">
      <li><strong>Set your boundaries.</strong> Working hours, daily capacity and protected time.</li>
      <li><strong>Add what is on your mind.</strong> Tasks across every area of life.</li>
      <li><strong>Name your goals.</strong> Break them into milestones and link tasks to them.</li>
    </ol>
    <div class="btn-row">
      <a class="btn btn-primary" href="#boundaries">Set my boundaries</a>
      <button class="btn" type="button" data-action="new-task">Add a task</button>
    </div>
    <button class="btn-link" type="button" data-action="load-sample">Explore with fictional sample data</button>
  </section>`;
}

function list(title, tasks, ctx, extra = '') {
  if (!tasks.length) return '';
  return `<section class="section">
    <h2 class="section-title">${esc(title)}${extra}</h2>
    <ul class="task-list">${tasks.map((t) => taskRow(t, ctx)).join('')}</ul>
  </section>`;
}

export function renderToday({ state, today, now }) {
  const { tasks, goals, settings } = state;
  const goalsById = goalsMap(goals);
  const isNew = !tasks.length && !goals.length;
  const top = topPriorities(tasks, goals, today);
  const open = tasks.filter((t) => t.status === 'open');
  const byDue = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort(byDue);
  const horizon = addDays(today, BRIEFING.upcomingDays);
  const followUps = open.filter((t) => t.isFollowUp && t.followUpDate && t.followUpDate <= today);
  // Upcoming excludes anything already shown above, so each task appears once.
  const shown = new Set([...top.map((r) => r.task.id), ...followUps.map((t) => t.id)]);
  const upcoming = open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= horizon && !shown.has(t.id)).sort(byDue);
  const load = dayLoad(tasks, today);
  const cap = settings.maxDailyWorkMinutes;
  const workDay = isWorkDay(settings, today);
  const conflicts = dayConflicts(tasks, settings, today);
  const review = weeklyReview(state, today);
  const ctx = { today, goalsById };

  const summary = [
    `${top.length} ${top.length === 1 ? 'priority' : 'priorities'}`,
    `${overdue.length} overdue`,
    workDay ? `${formatHours(load)} of ${formatHours(cap)} h committed` : 'Rest day',
  ].join(' · ');

  const first = top[0];

  return `
  <header class="screen-head hero">
    <p class="overline">${esc(formatDate(today, 'long'))}</p>
    <h1 class="display">${greeting(now.getHours())}</h1>
    <p class="lede">${isNew ? 'Let’s set up your briefing.' : esc(summary)}</p>
  </header>

  ${isNew ? welcome() : ''}

  ${first ? `
  <section class="card focus">
    <p class="overline overline-gold">Focus first</p>
    <h2 class="focus-title">${esc(first.task.title)}</h2>
    <p class="focus-reason">${esc(focusReason(first.score))}</p>
    <div class="btn-row">
      <button class="btn btn-primary" type="button" data-action="toggle-task" data-id="${esc(first.task.id)}">${icon('check')} Mark complete</button>
      <button class="btn" type="button" data-action="why" data-id="${esc(first.task.id)}">Why this?</button>
    </div>
  </section>` : ''}

  ${!isNew ? `
  <section class="section">
    <h2 class="section-title">Top priorities <button class="info-btn" type="button" data-action="open-guide" aria-label="How priorities are calculated">${icon('info')}</button></h2>
    ${top.length
    ? `<ul class="task-list">${top.map((r, i) => taskRow(r.task, { ...ctx, score: r.score.total, rank: i + 1 })).join('')}</ul>`
    : emptyState('Nothing needs you right now.', 'No open tasks are due or planned for today. Enjoy the space, or plan ahead in My Life.', '<button class="btn" type="button" data-action="new-task">Add a task</button>')}
  </section>` : ''}

  ${!isNew ? `
  <section class="card capacity">
    <div class="capacity-head">
      <h2 class="card-title">Today’s capacity</h2>
      <span class="capacity-num">${workDay ? `${formatHours(load)} <small>of ${formatHours(cap)} h</small>` : 'Rest day'}</span>
    </div>
    ${workDay ? meter(load, cap) : ''}
    <p class="muted small">${workDay
    ? `Working hours ${esc(settings.workStart)}–${esc(settings.workEnd)}. Counts work tasks (Career, Business, Education) planned for today.`
    : settings.protectRestDays ? 'Today is protected for rest. Work planned today will be flagged.' : 'Today is not a working day.'}</p>
    ${conflicts.length ? `<ul class="alerts">${conflicts.map((c) => `
      <li class="alert alert-${c.severity}">
        ${icon('alert')}
        <div><strong>${esc(CONFLICT_LABELS[c.code])}</strong> ${severityTag(c.severity)}${c.acknowledged ? ' <span class="tag">Acknowledged</span>' : ''}<br>${esc(c.message)}</div>
      </li>`).join('')}</ul>` : ''}
  </section>` : ''}

  ${list('Overdue', overdue, ctx)}
  ${list('Follow-ups due', followUps, ctx)}
  ${list(`Also due in the next ${BRIEFING.upcomingDays} days`, upcoming, ctx)}

  ${!isNew ? `
  <section class="card review-card">
    <p class="overline overline-gold">Executive Review</p>
    <h2 class="card-title">Week of ${esc(formatDate(review.range.start, 'month'))}</h2>
    <dl class="stats">
      <div><dt>Completed</dt><dd>${review.completed.length}</dd></div>
      <div><dt>Unfinished</dt><dd>${review.unfinished.length}</dd></div>
      <div><dt>Work planned</dt><dd>${formatHours(review.plannedMinutes)}<small> / ${formatHours(review.capacityMinutes)} h</small></dd></div>
    </dl>
    ${review.attention.length ? `<p class="small"><span class="text-gold">◆</span> ${review.attention.length} area${review.attention.length === 1 ? '' : 's'} need${review.attention.length === 1 ? 's' : ''} attention</p>` : ''}
    <button class="btn btn-block" type="button" data-action="open-review">Open weekly review ${icon('chevron')}</button>
  </section>` : ''}
  `;
}
