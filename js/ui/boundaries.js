// Boundaries — settings, protected time, live conflicts, and data controls.

import { CONFLICT_LABELS, conflictsInRange, dayLoad, isWorkDay } from '../logic/boundaries.js';
import { WEEKDAY_SHORT, addDays, formatDate, formatHours, weekday } from '../logic/dates.js';
import { esc, icon, meter, screenHead, severityTag } from './shared.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

function conflictAction(c, titleOf) {
  if (c.taskIds?.length === 1) {
    return `<button class="btn-link" type="button" data-action="edit-task" data-id="${esc(c.taskIds[0])}">Review “${esc(titleOf(c.taskIds[0]))}”</button>`;
  }
  if (c.taskIds?.length > 1) {
    return `<button class="btn-link" type="button" data-action="show-day" data-date="${esc(c.date)}">Review tasks on this day</button>`;
  }
  // Meetings only: calendars are read-only, so the user can acknowledge here and change the meeting in Outlook.
  return `<p class="small muted">Calendar events are read-only. Change the meeting in your calendar, then re-import it.</p>
    ${c.acknowledged ? '' : `<button class="btn-link" type="button" data-action="ack-event" data-code="${esc(c.code)}" data-events="${esc((c.eventIds || []).join(','))}">Acknowledge</button>`}`;
}

function calendarsCard(sources, events) {
  const count = (id) => events.filter((e) => e.sourceId === id).length;
  return `
  <section class="card">
    <h2 class="card-title">Calendars</h2>
    <p class="small muted">Import a calendar file (.ics) exported from Outlook or another calendar app. Meetings appear in your briefing and are checked against your boundaries. The file is read on this device and never uploaded. Only titles, times and locations are kept.</p>
    ${sources.length ? `<ul class="blocks">${sources.map((src) => `
      <li class="block">
        <div><strong>${esc(src.label)}</strong> <span class="pill pill-${src.category === 'professional' ? 'pro' : 'personal'}">${src.category === 'professional' ? 'Professional' : 'Personal'}</span><br>
        <span class="small muted">${count(src.id)} events · imported ${esc(formatDate(src.importedAt.slice(0, 10)))}${src.rangeEnd ? ` · through ${esc(formatDate(src.rangeEnd, 'month'))}` : ''}</span></div>
        <button class="icon-btn" type="button" data-action="remove-source" data-id="${esc(src.id)}" aria-label="Remove ${esc(src.label)}">${icon('trash')}</button>
      </li>`).join('')}</ul>` : ''}
    <label class="btn btn-block" for="ics-file">${icon('upload')} ${sources.length ? 'Import or refresh a calendar' : 'Import calendar (.ics)'}</label>
    <input id="ics-file" class="visually-hidden" type="file">
    <details class="howto">
      <summary>How to export a calendar from Outlook</summary>
      <ul class="small">
        <li><strong>Outlook for Windows (classic):</strong> open the calendar, choose <em>File → Save Calendar</em>, use <em>More Options</em> to pick the date range, and save the .ics file.</li>
        <li><strong>Outlook on the web / Outlook.com:</strong> <em>Settings → Calendar → Shared calendars → Publish a calendar</em>, then open the ICS link to download the file. A published link can be viewed by anyone who has it, so unpublish it after downloading.</li>
        <li><strong>iPhone:</strong> save the .ics file to the Files app (for example from an email attachment), then choose it here.</li>
      </ul>
      <p class="small muted">Imported calendars are a snapshot covering the past week and the next 90 days. Re-import to refresh. Times marked with a time zone are used as written, so export from the same time zone as this device.</p>
    </details>
    <p class="small muted roadmap-note">${icon('clock')} Coming in a future version: secure, read-only connections to multiple Outlook accounts, with flagged emails as follow-ups.</p>
  </section>`;
}

export function renderBoundaries({ state, today }) {
  const { settings, tasks } = state;
  const events = state.events || [];
  const sources = state.sources || [];
  const conflicts = conflictsInRange(tasks, settings, today, undefined, events);
  const titleOf = (id) => tasks.find((t) => t.id === id)?.title || '';
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return `
  ${screenHead('Boundaries', 'Boundary Intelligence', 'Decide in advance what your time is for. LuxeLifeOS warns you before a commitment crosses a line, and you always make the final call.')}

  <section class="card">
    <h2 class="card-title">Upcoming conflicts</h2>
    ${conflicts.length ? `<ul class="alerts">${conflicts.map((c) => `
      <li class="alert alert-${c.severity}">
        ${icon('alert')}
        <div class="alert-body">
          <p><strong>${esc(CONFLICT_LABELS[c.code])}</strong> ${severityTag(c.severity)}${c.acknowledged ? ' <span class="tag">Acknowledged</span>' : ''}</p>
          <p class="small muted">${esc(formatDate(c.date))}</p>
          <p>${esc(c.message)}</p>
          ${conflictAction(c, titleOf)}
        </div>
      </li>`).join('')}</ul>`
    : `<p class="ok-line">${icon('check')} No conflicts. Your plans respect your boundaries.</p>`}
  </section>

  <section class="card">
    <h2 class="card-title">Next 7 days</h2>
    <ul class="week">${week.map((d) => {
    const load = dayLoad(tasks, d, events);
    const work = isWorkDay(settings, d);
    return `<li class="week-row">
        <span class="week-day">${esc(WEEKDAY_SHORT[weekday(d)])}<small>${esc(formatDate(d, 'month'))}</small></span>
        ${work ? meter(load, settings.maxDailyWorkMinutes) : `<span class="rest-label">${load ? `Rest day · ${formatHours(load)} h work` : 'Rest day'}</span>`}
        <span class="week-num">${work ? `${formatHours(load)} h` : ''}</span>
      </li>`;
  }).join('')}</ul>
  </section>

  ${calendarsCard(sources, events)}

  <section class="card">
    <h2 class="card-title">Working hours & capacity</h2>
    <div class="grid-2">
      <label class="field"><span>Start</span><input type="time" data-setting="workStart" value="${esc(settings.workStart)}"></label>
      <label class="field"><span>End</span><input type="time" data-setting="workEnd" value="${esc(settings.workEnd)}"></label>
    </div>
    <fieldset class="field">
      <legend>Working days</legend>
      <div class="day-toggles">${ORDER.map((d) => `
        <button type="button" class="day-toggle" data-action="toggle-workday" data-day="${d}" aria-pressed="${settings.workDays.includes(d)}" aria-label="${WEEKDAY_SHORT[d]}">${WEEKDAY_SHORT[d].slice(0, 2)}</button>`).join('')}
      </div>
    </fieldset>
    <label class="field"><span>Maximum work per day (hours)</span>
      <input type="number" inputmode="decimal" min="0" max="16" step="0.5" data-setting="maxDailyHours" value="${settings.maxDailyWorkMinutes / 60}">
    </label>
    <label class="switch-row">
      <span><strong>Protect rest days</strong><br><span class="small muted">Flag work planned on non-working days.</span></span>
      <input type="checkbox" role="switch" data-setting="protectRestDays" ${settings.protectRestDays ? 'checked' : ''}>
    </label>
  </section>

  <section class="card">
    <h2 class="card-title">Protected time</h2>
    <p class="small muted">Time reserved for family, health and rest. Any task planned inside these hours is flagged.</p>
    ${settings.protectedBlocks.length ? `<ul class="blocks">${settings.protectedBlocks.map((b) => `
      <li class="block">
        <div><strong>${esc(b.label)}</strong><br><span class="small muted">${b.date
    ? `One time · ${esc(formatDate(b.date))}${b.date < today ? ' (past)' : ''}`
    : esc(ORDER.filter((d) => b.days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(', ') || 'No days')} · ${esc(b.start)}–${esc(b.end)}</span></div>
        <button class="icon-btn" type="button" data-action="edit-block" data-id="${esc(b.id)}" aria-label="Edit ${esc(b.label)}">${icon('chevron')}</button>
      </li>`).join('')}</ul>` : ''}
    <button class="btn btn-block" type="button" data-action="new-block">${icon('plus')} Add protected time</button>
  </section>

  <section class="card">
    <h2 class="card-title">Time-of-day words</h2>
    <p class="small muted">What “morning”, “afternoon” and “evening” mean when you type or dictate a note, for example “protect Friday evening”.</p>
    ${['morning', 'afternoon', 'evening'].map((part) => `
      <div class="daypart-row">
        <span class="daypart-name">${part[0].toUpperCase()}${part.slice(1)}</span>
        <label class="field"><span class="visually-hidden">${part} starts</span><input type="time" data-setting="dayPart" data-part="${part}" data-edge="start" value="${esc(settings.dayParts[part].start)}"></label>
        <span aria-hidden="true">–</span>
        <label class="field"><span class="visually-hidden">${part} ends</span><input type="time" data-setting="dayPart" data-part="${part}" data-edge="end" value="${esc(settings.dayParts[part].end)}"></label>
      </div>`).join('')}
  </section>

  <section class="card">
    <h2 class="card-title">Your data & privacy</h2>
    <p class="small">Everything you enter stays on this device. LuxeLifeOS has no account, no server and no tracking. Export a backup now and then. Deleting the app or clearing website data erases it.</p>
    <div class="btn-stack">
      <button class="btn" type="button" data-action="export">${icon('download')} Export backup</button>
      <label class="btn" for="import-file">${icon('upload')} Import backup</label>
      <input id="import-file" class="visually-hidden" type="file" accept="application/json,.json">
      <button class="btn" type="button" data-action="load-sample">${icon('sparkle')} Load fictional sample data</button>
      <button class="btn btn-danger" type="button" data-action="erase">${icon('trash')} Erase all data</button>
    </div>
  </section>

  <button class="btn-link center" type="button" data-action="open-guide">How LuxeLifeOS makes its recommendations</button>
  `;
}
