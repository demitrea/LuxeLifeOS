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

const domainOptions = (selected, allowNone = false) => (allowNone
  ? `<option value="" ${!selected ? 'selected' : ''}>Uncategorized</option>` : '') + ['professional', 'personal'].map((type) => `
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
    <label class="field"><span>Life area</span><select name="domain">${domainOptions(task.domain === undefined ? 'career' : task.domain, true)}</select></label>
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
    <label class="field"><span>One time only on <span class="muted">(optional — leave empty to repeat weekly)</span></span>
      <input type="date" name="date" value="${esc(block.date || '')}"></label>
    <fieldset class="field"><legend>Repeat on <span class="muted small">(ignored when a date is set)</span></legend>
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

    <h3>Quick capture (typing or dictating a note)</h3>
    <p>Each sentence, or each part that starts with an action such as “need to”, “call” or “protect”, becomes one proposed item. Nothing is saved until you review it.</p>
    <ul>
      <li><strong>Type:</strong> “protect”, “block off” or “no work” → protected time. “Follow up”, “check in with” or “waiting on” → follow-up. Anything else → task.</li>
      <li><strong>Dates:</strong> today, tomorrow, weekday names, “in 3 days”, “Nov 25”, “11/25”, “the 25th”. A date after “due”, “by” or “deadline” is a deadline. Otherwise it is the day you plan to do it. “Next week” or “soon” never becomes a date.</li>
      <li><strong>Weekdays:</strong> “Monday” means the next Monday after today. If today is Monday, or “next Friday” could mean two dates, you are asked.</li>
      <li><strong>Protected time:</strong> one time unless you say “every” or use a plural (“Fridays”). “Morning”, “afternoon” and “evening” use the times you set under Boundaries.</li>
      <li><strong>Life area:</strong> only from listed words (for example “paper” or “exam” → Education). No listed word, or words from different areas → uncategorized.</li>
      <li><strong>Importance:</strong> only from words like “urgent” (5), “important” (4) or “low priority” (2). Otherwise normal (3).</li>
      <li><strong>Questions</strong> appear only when the answer changes a deadline, a time or a boundary, such as AM or PM.</li>
      <li>If a statement can’t be interpreted confidently, it is kept exactly as you said it.</li>
    </ul>

    <h3>Boundary Intelligence</h3>
    <p>Work tasks are those in Career, Business and Education. Checks run on tasks with a planned date and on imported calendar events.</p>
    <ul>
      <li><strong>Over capacity</strong> (high): work planned for a day exceeds your daily maximum.</li>
      <li><strong>Near capacity</strong> (notice): above ${Math.round(BOUNDARIES.capacityNearRatio * 100)}% of your daily maximum.</li>
      <li><strong>Rest day</strong> (high): work planned on a non-working day while rest days are protected.</li>
      <li><strong>Outside working hours</strong> (medium): a timed work task starts before or ends after your working hours.</li>
      <li><strong>Protected time</strong> (high): any timed task, or a meeting from a professional calendar, overlaps a protected block.</li>
      <li><strong>Double-booked</strong> (medium): a timed task overlaps a meeting, or two meetings overlap, across any of your calendars.</li>
    </ul>
    <p>Meetings from calendars marked <em>Professional</em> count as work toward your daily capacity and are checked against working hours and rest days. Personal calendar events are only checked for double-booking. All-day and “free” events never count.</p>
    <p>Before you save a task that creates a high or medium conflict, LuxeLifeOS asks you to decide. Choosing <em>Save anyway</em> records an intentional override.</p>
  </div>`;
}

export function importSheet(preview, sources, fileName) {
  const { stats, calendarName, windowStart, windowEnd } = preview;
  const suggested = calendarName || fileName.replace(/\.[^.]+$/, '') || 'Calendar';
  const icsSources = sources.filter((src) => src.type === 'ics');
  const notes = [
    stats.cancelled ? `${stats.cancelled} cancelled event${stats.cancelled === 1 ? '' : 's'} skipped.` : '',
    stats.outsideWindow ? `${stats.outsideWindow} event${stats.outsideWindow === 1 ? '' : 's'} outside this range skipped.` : '',
    stats.limitedRecurrence ? `${stats.limitedRecurrence} repeating series use a pattern LuxeLifeOS cannot expand yet; only the first occurrence is included.` : '',
    stats.truncated ? `Only the first ${stats.imported} events are included.` : '',
  ].filter(Boolean);
  return `
  ${sheetHeader('Import calendar', fileName)}
  <form class="sheet-body form" data-form="import" novalidate>
    <p><strong>${stats.imported}</strong> event${stats.imported === 1 ? '' : 's'} found from ${esc(formatDate(windowStart))} to ${esc(formatDate(windowEnd))}.</p>
    ${notes.length ? `<ul class="small muted plain">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <label class="field"><span>Calendar name</span><input name="label" maxlength="80" required value="${esc(suggested)}"></label>
    <fieldset class="field">
      <legend>What kind of calendar is this?</legend>
      <label class="choice"><input type="radio" name="category" value="professional" checked>
        <span><strong>Professional</strong><br><span class="small muted">Meetings count as work and are checked against working hours, rest days and protected time.</span></span></label>
      <label class="choice"><input type="radio" name="category" value="personal">
        <span><strong>Personal</strong><br><span class="small muted">Shown in your schedule and checked for double-booking, but never counted as work.</span></span></label>
    </fieldset>
    ${icsSources.length ? `<label class="field"><span>Add or replace</span><select name="replace">
      <option value="">Add as a new calendar</option>
      ${icsSources.map((src) => `<option value="${esc(src.id)}">Replace “${esc(src.label)}”</option>`).join('')}
    </select></label>` : ''}
    <p class="small muted">Read on this device only. Titles, times and locations are kept; descriptions, attendees and notes are discarded.</p>
    <p class="form-error" role="alert" hidden></p>
    <div class="sheet-actions">
      <button class="btn btn-primary btn-block" type="submit" ${stats.imported ? '' : 'disabled'}>Import ${stats.imported} event${stats.imported === 1 ? '' : 's'}</button>
    </div>
  </form>`;
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
