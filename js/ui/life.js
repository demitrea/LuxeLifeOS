// My Life — tasks across every life domain.

import { DOMAINS } from '../logic/config.js';
import { goalsMap, rankTasks } from '../logic/priority.js';
import { emptyState, esc, icon, screenHead, taskRow } from './shared.js';

export function renderLife({ state, today, ui }) {
  const { tasks, goals } = state;
  const goalsById = goalsMap(goals);
  const view = ui.lifeView;
  const filter = ui.lifeFilter;
  const inView = tasks.filter((t) => (view === 'done' ? t.status === 'done' : t.status === 'open'));
  const inFilter = (t) => (filter === 'none' ? !t.domain : t.domain === filter);
  const filtered = filter === 'all' ? inView : inView.filter(inFilter);
  const uncategorized = inView.filter((t) => !t.domain).length;
  const openCount = tasks.filter((t) => t.status === 'open').length;
  const doneCount = tasks.length - openCount;

  let rows;
  if (view === 'done') {
    rows = [...filtered].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
      .map((t) => taskRow(t, { today, goalsById }));
  } else {
    rows = rankTasks(filtered, goals, today).map((r) => taskRow(r.task, { today, goalsById, score: r.score.total }));
  }

  const chip = (id, label, count, type = '') => `
    <button class="chip ${filter === id ? 'is-active' : ''} ${type ? `chip-${type}` : ''}" type="button"
      data-action="filter-domain" data-domain="${id}" aria-pressed="${filter === id}">${esc(label)}<span class="chip-count">${count}</span></button>`;

  return `
  ${screenHead('My Life', 'Life & commitments', 'Everything you are responsible for, personal and professional, in one place.')}
  <button class="btn btn-primary btn-block" type="button" data-action="new-task">${icon('plus')} New task</button>

  <div class="segmented" role="group" aria-label="Show">
    <button type="button" data-action="life-view" data-view="open" aria-pressed="${view === 'open'}">Open <span>${openCount}</span></button>
    <button type="button" data-action="life-view" data-view="done" aria-pressed="${view === 'done'}">Completed <span>${doneCount}</span></button>
  </div>

  <div class="chips" role="group" aria-label="Filter by life area">
    ${chip('all', 'All', inView.length)}
    ${uncategorized || filter === 'none' ? chip('none', 'Uncategorized', uncategorized, 'none') : ''}
    ${DOMAINS.map((d) => chip(d.id, d.label, inView.filter((t) => t.domain === d.id).length, d.type)).join('')}
  </div>
  <p class="legend small muted"><span class="legend-dot legend-professional"></span>Professional (counts toward work capacity) <span class="legend-dot legend-personal"></span>Personal</p>

  ${rows.length
    ? `<ul class="task-list">${rows.join('')}</ul>`
    : emptyState(
      view === 'done' ? 'Nothing completed yet.' : 'A clear slate.',
      view === 'done' ? 'Completed tasks will appear here.' : 'Add the commitments on your mind, from work deadlines to family plans.',
      view === 'done' ? '' : '<button class="btn" type="button" data-action="new-task">Add a task</button>',
    )}
  `;
}
