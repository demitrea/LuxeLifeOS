// Bottom-sheet content: forms, the conflict warning, score explanation,
// weekly review and the "how it works" guide.

import { BOUNDARIES, BRIEFING, DOMAINS, GOAL_STATUS, HORIZONS, HORIZON_DAYS, SCORING } from '../logic/config.js';
import { CONFLICT_LABELS } from '../logic/boundaries.js';
import { WEEKDAY_SHORT, formatDate, formatHours, formatMinutes } from '../logic/dates.js';
import { domainLabel, esc, icon, ring, severityTag, statusPill, taskRow } from './shared.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function sheetHeader(title, subtitle = '') {
  return `<header class="sheet-head">
    <div><h2 id="sheet-title" class="sheet-title">${esc(title)}</h2>${subtitle ? `<p class="small muted">${esc(subtitle)}</p>` : ''}</div>
    <button class="icon-btn" type="button" data-action="close-sheet" aria-label="Close">${icon('close')}</button>
  </header>`;
}

const domainOptions = (selected) => ['professional', 'personal'].map((type) => `
  <optgroup label="${type === 'professional' ? 'Professional' : 'Personal'}">
    ${DOMAINS.filter((d) => d.type === type).map((d) => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}
  </optgroup>`).join('');

const EFFORT = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

export function taskForm(task, goals) {
  const isNew = !task.id;
  const effort = EFFORT.includes(task.estimateMinutes) || !task.estimateMinutes ? EFFORT : [...EFFORT, task.estimateMinutes].sort((a, b) => a - b);
  return `
  ${sheetHeader(isNew ? 'New task' : 'Edit task')}
  <form class="sheet-body form" data-form="task" novalidate>
    <input type="hidden" name="id" value="${esc(task.id || '')}">
    <label class="field"><span>What needs to be done?</span>
      <input name="title" required maxlength="200" autocomplete="off" value="${esc(task.title || '')}" placeholder="e.g. Prepare presentation outline">
    </label>
    <label class="field"><span>Life area</span><select name="domain">${domainOptions(task.domain || 'career')}</select></label>
    <fieldset class="field">
      <legend>Importance <span class="muted small">1 = minor · 5 = critical</span></legend>
      <div class="scale">${[1, 2, 3, 4, 5].map((n) => `
        <label><input type="radio" name="importance" value="${n}" ${Number(task.importance || 3) === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}
      </div>
    </fieldset>
    <div class="grid-2">
      <label class="field"><span>Due date</span><input type="date" name="dueDate" value="${esc(task.dueDate || '')}"></label>
      <label class="field"><span>Plan to do it on</span><input type="date" name="scheduledDate" value="${esc(task.scheduledDate || '')}"></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Start time <span class="muted">(optional)</span></span><input type="time" name="startTime" value="${esc(task.startTime || '')}"></label>
      <label class="field"><span>Effort</span>
        <select name="estimateMinutes"><option value="">Not sure</option>
          ${effort.map((m) => `<option value="${m}" ${task.estimateMinutes === m ? 'selected' : ''}>${esc(formatMinutes(m))}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="field"><span>Supports goal</span>
      <select name="goalId"><option value="">None</option>
        ${goals.map((g) => `<option value="${esc(g.id)}" ${task.goalId === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}
      </select>
    </label>
    <label class="switch-row">
      <span><strong>Follow-up</strong><br><span class="small muted">A commitment you are waiting on or need to chase.</span></span>
      <input type="checkbox" role="switch" name="isFollowUp" ${task.isFollowUp ? 'checked' : ''}>
    </label>
    <label class="field follow-date" ${task.isFollowUp ? '' : 'hidden'}><span>Follow up on</span><input type="date" name="followUpDate" value="${esc(task.followUpDate || '')}"></label>
    <label class="field"><span>Notes <span class="muted">(optional)</span></span><textarea name="notes" rows="2" maxlength="2000">${esc(task.notes || '')}</textarea></label>
    <p class="hint small muted">Add a planned date and start time so Boundary Intelligence can check capacity, working hours and protected time.</p>
    <p class="form-error" role="alert" hidden></p>
    <div class="sheet-actions">
      <button class="btn btn-primary btn-block" type="submit">${isNew ? 'Add task' : 'Save changes'}</button>
      ${isNew ? '' : `<button class="btn btn-danger btn-block" type="button" data-action="delete-task" data-id="${esc(task.id)}">${icon('trash')} Delete task</button>`}
    </div>
  </form>`;
}

export function conflictWarning(conflicts, task) {
  return `
  ${sheetHeader('Before you commit')}
  <div class="sheet-body">
    <p>Saving <strong>“${esc(task.title)}”</strong> would cross ${conflicts.length === 1 ? 'one of your boundaries' : 'some of your boundaries'}:</p>
    <ul class="alerts">${conflicts.map((c) => `
      <li class="alert alert-${c.severity}">${icon('alert')}
        <div><strong>${esc(CONFLICT_LABELS[c.code])}</strong> ${severityTag(c.severity)}<br>
        <span class="small muted">${esc(formatDate(c.date))}</span><br>${esc(c.message)}</div>
      </li>`).join('')}</ul>
    <p class="small muted">This is your decision. If you save anyway, LuxeLifeOS records it as an intentional override and shows it as acknowledged.</p>
    <div class="sheet-actions">
      <button class="btn btn-primary btn-block" type="button" data-action="revise-task">Change the plan</button>
      <button class="btn btn-block" type="button" data-action="override-task">Save anyway</button>
      <button class="btn-link center" type="button" data-action="close-sheet">Cancel</button>
    </div>
  </div>`;
}

export function whySheet(task, score) {
  return `
  ${sheetHeader('Why this priority?', task.title)}
  <div class="sheet-body">
    <p class="why-total"><span>${score.total}</span> / 100</p>
    <ul class="factors">${score.parts.map((p) => `
      <li class="factor">
        <div class="factor-head"><strong>${esc(p.label)}</strong><span>${p.points} / ${p.max}</span></div>
        <div class="bar"><span style="width:${(p.points / p.max) * 100}%"></span></div>
        <p class="small muted">${esc(p.reason)}</p>
      </li>`).join('')}</ul>
    <p class="small">${score.parts.map((p) => `${p.points}`).join(' + ')} = <strong>${score.total}</strong></p>
    <p class="small muted">Scores are calculated with fixed, published rules. No AI is involved, and the same task always receives the same score on the same day.</p>
    <button class="btn-link" type="button" data-action="open-guide">See all scoring rules</button>
  </div>`;
}

export function goalForm(goal) {
  const isNew = !goal.id;
  const ms = goal.milestones || [];
  return `
  ${sheetHeader(isNew ? 'New goal' : 'Edit goal')}
  <form class="sheet-body form" data-form="goal" novalidate>
    <input type="hidden" name="id" value="${esc(goal.id || '')}">
    <label class="field"><span>Goal</span><input name="title" required maxlength="200" autocomplete="off" value="${esc(goal.title || '')}" placeholder="e.g. Earn a professional certificate"></label>
    <label class="field"><span>Life area</span><select name="domain">${domainOptions(goal.domain || 'career')}</select></label>
    <label class="field"><span>Time horizon</span>
      <select name="horizon">${HORIZONS.map((h) => `<option value="${h.id}" ${h.id === (goal.horizon || '90d') ? 'selected' : ''}>${esc(h.label)}</option>`).join('')}</select>
    </label>
    <div class="grid-2">
      <label class="field"><span>Start</span><input type="date" name="startDate" required value="${esc(goal.startDate || '')}"></label>
      <label class="field"><span>Target</span><input type="date" name="targetDate" required value="${esc(goal.targetDate || '')}" data-auto="${isNew ? '1' : '0'}"></label>
    </div>
    <fieldset class="field">
      <legend>Milestones <span class="muted small">Progress = completed ÷ total</span></legend>
      <ul class="ms-list">${ms.map((m) => msRow(m)).join('')}</ul>
      <button class="btn btn-block" type="button" data-action="add-milestone">${icon('plus')} Add milestone</button>
    </fieldset>
    <p class="form-error" role="alert" hidden></p>
    <div class="sheet-actions">
      <button class="btn btn-primary btn-block" type="submit">${isNew ? 'Create goal' : 'Save changes'}</button>
      ${isNew ? '' : `<button class="btn btn-danger btn-block" type="button" data-action="delete-goal" data-id="${esc(goal.id)}">${icon('trash')} Delete goal</button>`}
    </div>
  </form>`;
}

export function msRow(m = {}) {
  return `<li class="ms-row" data-id="${esc(m.id || '')}" data-done="${m.done ? '1' : '0'}">
    <input name="milestone" maxlength="200" value="${esc(m.title || '')}" placeholder="Milestone" aria-label="Milestone">
    <button class="icon-btn" type="button" data-action="remove-milestone" aria-label="Remove milestone">${icon('close')}</button>
  </li>`;
}

export function blockForm(block) {
  const isNew = !block.id;
  const days = block.days || [1, 2, 3, 4, 5];
  return `
  ${sheetHeader(isNew ? 'Protect time' : 'Edit protected time')}
  <form class="sheet-body form" data-form="block" novalidate>
    <input type="hidden" name="id" value="${esc(block.id || '')}">
    <label class="field"><span>What is this time for?</span><input name="label" required maxlength="80" value="${esc(block.label || '')}" placeholder="e.g. Family dinner"></label>
    <fieldset class="field"><legend>Days</legend>
      <div class="day-toggles">${ORDER.map((d) => `
        <label class="day-toggle"><input type="checkbox" name="days" value="${d}" ${days.includes(d) ? 'checked' : ''}><span aria-label="${WEEKDAY_SHORT[d]}">${WEEKDAY_SHORT[d].slice(0, 2)}</span></label>`).join('')}
      </div>
    </fieldset>
    <div class="grid-2">
      <label class="field"><span>From</span><input type="time" name="start" required value="${esc(block.start || '18:00')}"></label>
      <label class="field"><span>Until</span><input type="time" name="end" required value="${esc(block.end || '20:00')}"></label>
    </div>
    <p class="form-error" role="alert" hidden></p>
    <div class="sheet-actions">
      <button class="btn btn-primary btn-block" type="submit">${isNew ? 'Protect this time' : 'Save changes'}</button>
      ${isNew ? '' : `<button class="btn btn-danger btn-block" type="button" data-action="delete-block" data-id="${esc(block.id)}">${icon('trash')} Remove</button>`}
    </div>
  </form>`;
}

export function daySheet(date, tasks, ctx) {
  return `
  ${sheetHeader(formatDate(date, 'long'), 'Tasks planned for this day')}
  <div class="sheet-body">
    <ul class="task-list">${tasks.map((t) => taskRow(t, ctx)).join('')}</ul>
    <p class="small muted">Tap a task to move it, shorten it, or change its time.</p>
  </div>`;
}

export function reviewSheet(review, today) {
  const { range } = review;
  const domains = review.byDomain.filter((d) => d.completed || d.unfinished);
  return `
  ${sheetHeader('Executive Review', `${formatDate(range.start)} – ${formatDate(range.end)}`)}
  <div class="sheet-body">
    <dl class="stats stats-4">
      <div><dt>Completed</dt><dd>${review.completed.length}</dd></div>
      <div><dt>Unfinished</dt><dd>${review.unfinished.length}</dd></div>
      <div><dt>Work planned</dt><dd>${formatHours(review.plannedMinutes)}<small> / ${formatHours(review.capacityMinutes)} h</small></dd></div>
      <div><dt>Conflicts</dt><dd>${review.conflicts.length}<small>${review.overrides ? ` · ${review.overrides} ack.` : ''}</small></dd></div>
    </dl>

    <h3 class="section-title">Needs attention</h3>
    ${review.attention.length ? `<ul class="attention">${review.attention.map((a) => `<li><span class="text-gold">◆</span> ${esc(a.message)}</li>`).join('')}</ul>`
    : '<p class="ok-line">' + icon('check') + ' Nothing needs extra attention this week.</p>'}

    <h3 class="section-title">Goals</h3>
    ${review.goalSummaries.length ? `<ul class="review-goals">${review.goalSummaries.map((g) => `
      <li>${ring(g.percent, 44)}<div><strong>${esc(g.goal.title)}</strong><br>${statusPill(g.status, g.label)}</div></li>`).join('')}</ul>`
    : '<p class="small muted">No goals yet.</p>'}

    <h3 class="section-title">By life area</h3>
    ${domains.length ? `<table class="table"><thead><tr><th scope="col">Area</th><th scope="col">Done</th><th scope="col">Open</th></tr></thead>
      <tbody>${domains.map((d) => `<tr><th scope="row">${esc(d.label)}</th><td>${d.completed}</td><td>${d.unfinished}</td></tr>`).join('')}</tbody></table>`
    : '<p class="small muted">No activity this week.</p>'}

    ${review.completed.length ? `<h3 class="section-title">Completed this week</h3>
      <ul class="plain">${review.completed.map((t) => `<li>${icon('check', 'text-gold')} ${esc(t.title)} <span class="muted small">· ${esc(domainLabel(t.domain))}</span></li>`).join('')}</ul>` : ''}
    ${review.unfinished.length ? `<h3 class="section-title">Still open</h3>
      <ul class="plain">${review.unfinished.map((t) => `<li>${esc(t.title)} <span class="muted small">· ${esc(domainLabel(t.domain))}${t.dueDate && t.dueDate < today ? ' · <span class="text-danger">overdue</span>' : ''}</span></li>`).join('')}</ul>` : ''}
    <p class="small muted">Week runs Monday to Sunday. Capacity = working days × your daily maximum.</p>
  </div>`;
}

export function guideSheet() {
  const U = SCORING.urgency;
  const E = SCORING.effort;
  const urgencyRows = [
    ['Overdue', U.overdue],
    ...U.brackets.map((b, i) => {
      const prev = i ? U.brackets[i - 1].maxDays + 1 : 0;
      const label = b.maxDays === 0 ? 'Due today' : b.maxDays === 1 ? 'Due tomorrow' : `Due in ${prev}–${b.maxDays} days`;
      return [label, b.points];
    }),
    [`Due in more than ${U.brackets.at(-1).maxDays} days`, U.beyond],
    ['No due date', U.noDueDate],
  ];
  const effortRows = [
    ...E.brackets.map((b, i) => [i ? `${E.brackets[i - 1].maxMinutes + 1}–${b.maxMinutes} min` : `Up to ${b.maxMinutes} min`, b.points]),
    [`More than ${E.brackets.at(-1).maxMinutes} min`, E.beyond],
    ['No estimate', E.unknown],
  ];
  const table = (rows) => `<table class="table"><tbody>${rows.map(([l, p]) => `<tr><th scope="row">${esc(l)}</th><td>${p}</td></tr>`).join('')}</tbody></table>`;

  return `
  ${sheetHeader('How LuxeLifeOS decides', 'Transparent rules, no AI')}
  <div class="sheet-body prose">
    <p>Every recommendation comes from fixed rules you can check by hand. Nothing you enter leaves this device.</p>

    <h3>Priority score (0–100)</h3>
    <p>Score = Urgency (${U.max}) + Importance (${SCORING.importance.max}) + Goal alignment (${SCORING.alignment.max}) + Effort (${E.max}).</p>
    <h4>Urgency, up to ${U.max}</h4>${table(urgencyRows)}
    <h4>Importance, up to ${SCORING.importance.max}</h4><p>Your rating from 1 to 5, multiplied by ${SCORING.importance.perLevel}.</p>
    <h4>Goal alignment, up to ${SCORING.alignment.max}</h4>
    ${table([['Not linked to a goal', SCORING.alignment.none], ['Supports a goal', SCORING.alignment.linked], ['Supports a goal that is Behind', SCORING.alignment.linkedBehind]])}
    <h4>Effort, up to ${E.max}</h4>${table(effortRows)}
    <p class="small muted">Quick wins earn a small boost, capped so effort can never outweigh urgency or importance.</p>
    <p><strong>Ties</strong> are broken by earlier due date, then higher importance, then the older task. Today’s Top ${BRIEFING.topCount} only include open tasks that are not planned for a future day.</p>

    <h3>Goal progress & status</h3>
    <p>Progress = completed milestones ÷ total milestones. Expected progress = days elapsed ÷ days between start and target.</p>
    <ul>
      <li><strong>At risk</strong> when progress trails expected by more than ${GOAL_STATUS.atRiskGap} points.</li>
      <li><strong>Behind</strong> when it trails by more than ${GOAL_STATUS.behindGap} points, or the target date has passed.</li>
      <li><strong>Complete</strong> when every milestone is done.</li>
    </ul>
    <p class="small muted">Default target dates: ${HORIZONS.map((h) => `${h.label} = ${HORIZON_DAYS[h.id]} days`).join(', ')}.</p>

    <h3>Boundary Intelligence</h3>
    <p>Work tasks are those in Career, Business and Education. Checks run on tasks with a planned date.</p>
    <ul>
      <li><strong>Over capacity</strong> (high): work planned for a day exceeds your daily maximum.</li>
      <li><strong>Near capacity</strong> (notice): above ${Math.round(BOUNDARIES.capacityNearRatio * 100)}% of your daily maximum.</li>
      <li><strong>Rest day</strong> (high): work planned on a non-working day while rest days are protected.</li>
      <li><strong>Outside working hours</strong> (medium): a timed work task starts before or ends after your working hours.</li>
      <li><strong>Protected time</strong> (high): any timed task overlaps a protected block.</li>
    </ul>
    <p>Before you save a task that creates a high or medium conflict, LuxeLifeOS asks you to decide. Choosing <em>Save anyway</em> records an intentional override.</p>
  </div>`;
}

export function confirmSheet({ title, body, confirmLabel, action, danger = false }) {
  return `
  ${sheetHeader(title)}
  <div class="sheet-body">
    <p>${esc(body)}</p>
    <div class="sheet-actions">
      <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'} btn-block" type="button" data-action="${esc(action)}">${esc(confirmLabel)}</button>
      <button class="btn btn-block" type="button" data-action="close-sheet">Cancel</button>
    </div>
  </div>`;
}
