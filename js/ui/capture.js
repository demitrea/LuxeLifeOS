// Quick capture UI: the Today entry card, the review sheet and the
// "About dictation" explainer.

import { CAPTURE, DOMAINS } from '../logic/config.js';
import { CONFLICT_LABELS } from '../logic/boundaries.js';
import { openQuestions, isReady } from '../logic/capture.js';
import { WEEKDAY_SHORT, formatDate, minutesToTime } from '../logic/dates.js';
import { domainLabel, esc, icon } from './shared.js';
import { sheetHeader } from './sheets.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const KIND_LABEL = { task: 'Task', followup: 'Follow-up', protect: 'Protected time' };

/** The prominent entry card at the top of Today. */
export function captureCard(draft, lastCapture) {
  return `
  ${lastCapture ? `
  <div class="undo-banner" role="status">
    <span>${icon('check')} Added ${lastCapture.count} item${lastCapture.count === 1 ? '' : 's'} from your note.</span>
    <button type="button" class="undo-btn" data-action="capture-undo">${icon('undo')} Undo</button>
  </div>` : ''}
  <section class="card capture" aria-labelledby="capture-title">
    <h2 id="capture-title" class="capture-title"><label for="capture-text">What’s on your mind?</label></h2>
    <textarea id="capture-text" class="capture-input" rows="3" autocapitalize="sentences" autocomplete="off" autocorrect="on" spellcheck="true"
      aria-describedby="capture-hint"
      placeholder="Paper due Monday, follow up with my advisor tomorrow, protect Friday evening…">${esc(draft)}</textarea>
    <div class="capture-row">
      <button class="btn btn-primary capture-go" type="button" data-action="capture-review">Review</button>
      <button class="btn-link" type="button" data-action="new-task">Add manually</button>
    </div>
    <p id="capture-hint" class="capture-hint small muted">
      ${icon('mic')}<span>To speak, tap the microphone on your iPhone keyboard. Say several things at once — you’ll review them before anything is saved.
      <button class="btn-link inline" type="button" data-action="dictation-info">About dictation</button></span>
    </p>
  </section>`;
}

function chips(item) {
  const bits = [];
  if (item.kind === 'protect') {
    const b = item.block || {};
    if (b.date) bits.push(`${formatDate(b.date)} · one time`);
    else if (b.dates && b.dates.length) bits.push(`${b.dates.map((d) => formatDate(d)).join(' & ')} · one time`);
    else if (b.days && b.days.length) bits.push(`Every ${b.days.length === 7 ? 'day' : ORDER.filter((d) => b.days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(', ')}`);
    else bits.push('<span class="text-warn">Day needed</span>');
    if (Number.isFinite(b.start) && Number.isFinite(b.end)) bits.push(`${minutesToTime(b.start)}–${b.end >= 1439 ? '23:59' : minutesToTime(b.end)}`);
    else bits.push('<span class="text-warn">Time needed</span>');
    return bits.join('<span class="dot">·</span>');
  }
  if (item.dueDate) bits.push(`Due ${esc(formatDate(item.dueDate))}`);
  if (item.kind === 'followup' && item.followUpDate) bits.push(`Follow up ${esc(formatDate(item.followUpDate))}`);
  if (item.scheduledDate && item.kind !== 'followup') bits.push(`Planned ${esc(formatDate(item.scheduledDate))}`);
  if (item.startTime) bits.push(esc(item.startTime));
  if (item.estimateMinutes) bits.push(`${item.estimateMinutes} min`);
  bits.push(item.domain ? esc(domainLabel(item.domain)) : '<span class="muted">Uncategorized</span>');
  bits.push(item.importance === CAPTURE.defaultImportance ? '<span class="muted">Importance normal</span>' : `Importance ${item.importance}`);
  return bits.join('<span class="dot">·</span>');
}

function editor(item) {
  const kindSelect = `<label class="field"><span>Type</span><select name="kind">
    ${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}" ${item.kind === k ? 'selected' : ''}>${l}</option>`).join('')}
  </select></label>`;
  if (item.kind === 'protect') {
    const b = item.block || {};
    const date = b.date || (b.dates && b.dates[0]) || '';
    return `
    <form class="review-editor form" data-form="capture-item" data-id="${esc(item.id)}" novalidate>
      ${kindSelect}
      <label class="field"><span>Label</span><input name="title" maxlength="80" value="${esc(item.title)}"></label>
      <label class="field"><span>One time on <span class="muted">(leave empty to repeat)</span></span><input type="date" name="date" value="${esc(date)}"></label>
      <fieldset class="field"><legend>Or repeat every</legend>
        <div class="day-toggles">${ORDER.map((d) => `
          <label class="day-toggle"><input type="checkbox" name="days" value="${d}" ${(b.days || []).includes(d) ? 'checked' : ''}><span>${WEEKDAY_SHORT[d].slice(0, 2)}</span></label>`).join('')}
        </div>
      </fieldset>
      <div class="grid-2">
        <label class="field"><span>From</span><input type="time" name="start" value="${Number.isFinite(b.start) ? minutesToTime(b.start) : ''}"></label>
        <label class="field"><span>Until</span><input type="time" name="end" value="${Number.isFinite(b.end) ? minutesToTime(Math.min(b.end, 1439)) : ''}"></label>
      </div>
      ${b.dates && b.dates.length > 1 ? `<p class="small muted">Covers ${b.dates.map((d) => formatDate(d)).join(' & ')}. Changing the date keeps only that day.</p>` : ''}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">Done</button>
    </form>`;
  }
  const dayField = item.kind === 'followup' ? 'followUpDate' : 'scheduledDate';
  return `
  <form class="review-editor form" data-form="capture-item" data-id="${esc(item.id)}" novalidate>
    ${kindSelect}
    <label class="field"><span>Title</span><input name="title" maxlength="200" value="${esc(item.title)}"></label>
    <label class="field"><span>Life area</span><select name="domain">
      <option value="" ${!item.domain ? 'selected' : ''}>Uncategorized</option>
      ${DOMAINS.map((d) => `<option value="${d.id}" ${item.domain === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}
    </select></label>
    <fieldset class="field"><legend>Importance</legend>
      <div class="scale">${[1, 2, 3, 4, 5].map((n) => `
        <label><input type="radio" name="importance" value="${n}" ${item.importance === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}
      </div>
    </fieldset>
    <div class="grid-2">
      <label class="field"><span>Due date</span><input type="date" name="dueDate" value="${esc(item.dueDate || '')}"></label>
      <label class="field"><span>${item.kind === 'followup' ? 'Follow up on' : 'Plan to do it on'}</span><input type="date" name="${dayField}" value="${esc(item[dayField] || '')}"></label>
    </div>
    <label class="field"><span>Start time <span class="muted">(optional)</span></span><input type="time" name="startTime" value="${esc(item.startTime || '')}"></label>
    <p class="form-error" role="alert" hidden></p>
    <button class="btn btn-primary btn-block" type="submit">Done</button>
  </form>`;
}

/** The review sheet: every interpreted item, its evidence, any question, and boundary checks. */
export function reviewSheet(capture, conflictsByItem) {
  const { items, excluded, editing, text } = capture;
  const included = items.filter((i) => !excluded.has(i.id));
  const open = included.reduce((n, i) => n + openQuestions(i).length, 0);
  const notReady = included.filter((i) => !openQuestions(i).length && !isReady(i)).length;
  const canSave = included.length > 0 && open === 0 && notReady === 0;
  const preview = text.length > 160 ? `${text.slice(0, 157)}…` : text;

  return `
  ${sheetHeader('Review', items.length ? `I understood ${items.length} item${items.length === 1 ? '' : 's'}` : 'Nothing to add')}
  <div class="sheet-body review">
    <div class="review-note">
      <p class="small">“${esc(preview)}”</p>
      <button class="btn-link" type="button" data-action="capture-edit-text">Edit wording</button>
    </div>
    ${items.length ? `<ol class="review-list">${items.map((item) => {
    const isOff = excluded.has(item.id);
    const qs = openQuestions(item);
    const conflicts = conflictsByItem.get(item.id) || [];
    return `
      <li class="review-item ${isOff ? 'is-excluded' : ''} ${editing === item.id ? 'is-editing' : ''}">
        <div class="review-top">
          <button class="check" type="button" data-action="capture-toggle" data-id="${esc(item.id)}" aria-pressed="${!isOff}"
            aria-label="${isOff ? 'Include' : 'Leave out'}: ${esc(item.title)}">${icon('check')}</button>
          <button class="review-body" type="button" data-action="capture-edit" data-id="${esc(item.id)}" aria-expanded="${editing === item.id}">
            <span class="review-kind kind-${item.kind}">${KIND_LABEL[item.kind]}${item.confidence === 'as-written' ? ' · kept as you said it' : ''}</span>
            <span class="review-title">${esc(item.title)}</span>
            <span class="review-chips small">${chips(item)}</span>
          </button>
        </div>
        ${!isOff && qs.length ? qs.map((q) => `
          <div class="review-q" role="group" aria-label="${esc(q.prompt)}">
            <p>${esc(q.prompt)}</p>
            <div class="q-options">${q.options.map((o, idx) => `
              <button class="chip" type="button" data-action="capture-answer" data-id="${esc(item.id)}" data-q="${esc(q.id)}" data-opt="${idx}">${esc(o.label)}</button>`).join('')}
            </div>
          </div>`).join('') : ''}
        ${!isOff && conflicts.length ? `<ul class="review-warn">${conflicts.map((c) => `
          <li>${icon('alert')}<span><strong>${esc(CONFLICT_LABELS[c.code])}:</strong> ${esc(c.message)}</span></li>`).join('')}</ul>` : ''}
        ${item.evidence.length ? `<p class="review-why small muted">${item.evidence.map((e) => `“${esc(e.words)}” → ${esc(e.meaning)}`).join('<br>')}</p>` : ''}
        ${editing === item.id ? editor(item) : ''}
      </li>`;
  }).join('')}</ol>` : `<p class="muted">Nothing was entered. Tap <strong>Edit wording</strong> to add something.</p>`}
    <div class="review-footer">
      ${included.some((i) => (conflictsByItem.get(i.id) || []).some((c) => c.severity !== 'notice'))
    ? '<p class="small muted">Saving records the boundary warnings above as intentional overrides.</p>' : ''}
      <button class="btn btn-primary btn-block" type="button" data-action="capture-save" ${canSave ? '' : 'disabled'}>
        ${open ? `Answer ${open} question${open === 1 ? '' : 's'} to save` : notReady ? 'Complete the highlighted item to save' : `Save ${included.length} item${included.length === 1 ? '' : 's'}`}
      </button>
      <p class="small muted center-text">Tap any item to correct it.</p>
    </div>
  </div>`;
}

export function dictationSheet() {
  return `
  ${sheetHeader('About dictation')}
  <div class="sheet-body prose">
    <h3>How speaking works in LuxeLifeOS</h3>
    <p>LuxeLifeOS does <strong>not</strong> record audio or include its own speech recognition. When you tap the microphone on the <strong>iPhone keyboard</strong>, iOS turns your speech into text and types it into the box. LuxeLifeOS only ever receives that text.</p>
    <h3>Privacy</h3>
    <p>Keyboard dictation is an Apple feature, outside LuxeLifeOS. Depending on your device, language and settings, Apple may process dictation on its servers. LuxeLifeOS cannot control or guarantee that speech stays on your device. If you prefer, simply type — everything works the same way.</p>
    <p>Once the text is in LuxeLifeOS, it is interpreted on your device with fixed rules. Nothing is sent anywhere.</p>
    <h3>Turning dictation on</h3>
    <p>On iPhone: <em>Settings → General → Keyboard → Enable Dictation</em>.</p>
    <h3>Tips</h3>
    <ul>
      <li>Say several things at once: “Paper due Monday, follow up with my advisor tomorrow, and protect Friday evening.”</li>
      <li>Use “due” or “by” for deadlines, and “every” for things that repeat (“protect every Sunday morning”).</li>
      <li>Say “morning”, “afternoon” or “evening” — their times come from your settings under Boundaries.</li>
      <li>Anything LuxeLifeOS can’t interpret confidently is kept exactly as you said it.</li>
    </ul>
  </div>`;
}
