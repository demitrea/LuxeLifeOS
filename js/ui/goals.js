// My Goals — strategic goals, milestones and progress.

import { HORIZONS } from '../logic/config.js';
import { formatDate } from '../logic/dates.js';
import { goalStatus } from '../logic/goals.js';
import { domainLabel, emptyState, esc, icon, ring, screenHead, statusPill } from './shared.js';

function goalCard(goal, state, today) {
  const s = goalStatus(goal, today);
  const linkedOpen = state.tasks.filter((t) => t.goalId === goal.id && t.status === 'open').length;
  return `
  <article class="card goal">
    <div class="goal-top">
      ${ring(s.percent, 64, `${goal.title}: ${s.percent}% complete`)}
      <div class="goal-head">
        <h3 class="goal-title">${esc(goal.title)}</h3>
        <p class="task-meta">${esc(domainLabel(goal.domain))}<span class="dot">·</span>Target ${esc(formatDate(goal.targetDate))}</p>
        ${statusPill(s.status, s.label)}
      </div>
      <button class="icon-btn" type="button" data-action="edit-goal" data-id="${esc(goal.id)}" aria-label="Edit goal: ${esc(goal.title)}">${icon('chevron')}</button>
    </div>
    <p class="goal-reason small muted">${esc(s.total ? s.reason : 'Add milestones to measure progress.')}</p>
    ${goal.milestones.length ? `<ul class="milestones">${goal.milestones.map((m) => `
      <li><button class="milestone ${m.done ? 'is-done' : ''}" type="button" data-action="toggle-milestone"
        data-goal="${esc(goal.id)}" data-ms="${esc(m.id)}" aria-pressed="${m.done}">
        <span class="check-sm">${icon('check')}</span><span>${esc(m.title)}</span></button></li>`).join('')}</ul>` : ''}
    <p class="small muted">${s.done} of ${s.total} milestones · ${linkedOpen} open linked task${linkedOpen === 1 ? '' : 's'}</p>
  </article>`;
}

export function renderGoals({ state, today }) {
  const { goals } = state;
  const counts = { 'on-track': 0, 'at-risk': 0, behind: 0, complete: 0 };
  goals.forEach((g) => { counts[goalStatus(g, today).status] += 1; });

  const groups = HORIZONS.map((h) => ({ h, items: goals.filter((g) => g.horizon === h.id) })).filter((g) => g.items.length);

  return `
  ${screenHead('My Goals', 'Strategic goals', 'From the next 30 days to the next 12 months. Progress comes from completed milestones.')}
  <button class="btn btn-primary btn-block" type="button" data-action="new-goal">${icon('plus')} New goal</button>

  ${goals.length ? `
  <div class="summary-pills">
    ${statusPill('on-track', `${counts['on-track']} On track`)}
    ${statusPill('at-risk', `${counts['at-risk']} At risk`)}
    ${statusPill('behind', `${counts.behind} Behind`)}
    ${counts.complete ? statusPill('complete', `${counts.complete} Complete`) : ''}
  </div>
  ${groups.map(({ h, items }) => `
    <section class="section">
      <h2 class="section-title">${esc(h.label)}</h2>
      ${items.map((g) => goalCard(g, state, today)).join('')}
    </section>`).join('')}
  ` : emptyState('Name what matters most.', 'Set a goal, break it into milestones, and link daily tasks to it. LuxeLifeOS will tell you if it starts falling behind.', '<button class="btn" type="button" data-action="new-goal">Create a goal</button>')}
  `;
}
