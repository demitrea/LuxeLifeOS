// LuxeLifeOS — application controller: state, routing and user actions.

import {
  emptyState, exportJSON, importJSON, loadState, newId, sampleState, saveState,
} from './store.js';
import { conflictsInRange, diffConflicts, needsDecision, newConflicts } from './logic/boundaries.js';
import { answerQuestion, isReady, parseCapture, toRecords } from './logic/capture.js';
import { localISODate, localISODateTime, timeToMinutes } from './logic/dates.js';
import { defaultTargetDate } from './logic/goals.js';
import { goalsMap, scoreTask } from './logic/priority.js';
import { weeklyReview } from './logic/review.js';
import { eventsFromICS } from './integrations/ics.js';
import { dictationSheet, reviewSheet as captureReviewSheet } from './ui/capture.js';
import { renderToday } from './ui/today.js';
import { renderLife } from './ui/life.js';
import { renderGoals } from './ui/goals.js';
import { renderBoundaries } from './ui/boundaries.js';
import {
  blockForm, confirmSheet, conflictWarning, daySheet, goalForm, guideSheet, importSheet, msRow,
  reviewSheet, taskForm, whySheet,
} from './ui/sheets.js';

const SCREENS = {
  today: { render: renderToday, title: 'Today' },
  life: { render: renderLife, title: 'My Life' },
  goals: { render: renderGoals, title: 'My Goals' },
  boundaries: { render: renderBoundaries, title: 'Boundaries' },
};

const loaded = loadState();
let state = loaded.state;
const DRAFT_KEY = 'luxelifeos.captureDraft';
const readDraft = () => { try { return localStorage.getItem(DRAFT_KEY) || ''; } catch { return ''; } };
const writeDraft = (v) => { try { if (v) localStorage.setItem(DRAFT_KEY, v); else localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };
const ui = { lifeView: 'open', lifeFilter: 'all', captureDraft: readDraft(), lastCapture: null };
let capture = null; // the note being reviewed: { text, items, excluded, editing }
let pendingTask = null; // a task waiting for a boundary decision
let pendingImport = null; // a calendar file waiting for the user's choices
let undo = null;

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const sheet = $('#sheet');
const sheetBody = $('#sheet-body');
const toastEl = $('#toast');

const today = () => localISODate();
const route = () => {
  const r = location.hash.replace('#', '');
  return SCREENS[r] ? r : 'today';
};

// ---------- persistence ----------
function commit(next, message) {
  state = next;
  if (!saveState(state)) toast('Could not save. Storage may be full or disabled.', { error: true });
  else if (message) toast(message);
  render();
}

// ---------- rendering ----------
function render() {
  const r = route();
  const scrollY = window.scrollY;
  main.innerHTML = SCREENS[r].render({ state, today: today(), now: new Date(), ui });
  document.title = r === 'today' ? 'LuxeLifeOS' : `${SCREENS[r].title} · LuxeLifeOS`;
  document.querySelectorAll('[data-tab]').forEach((a) => {
    if (a.dataset.tab === r) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, scrollY);
}

function onRoute() {
  render();
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

// ---------- sheet ----------
let lastFocus = null;
function openSheet(html) {
  lastFocus = document.activeElement;
  sheetBody.innerHTML = html;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
  const first = sheetBody.querySelector('input:not([type=hidden]), select, textarea');
  if (first && !first.value) first.focus({ preventScroll: true });
  else sheetBody.querySelector('.sheet-head .icon-btn')?.focus({ preventScroll: true });
}
function closeSheet() {
  if (sheet.open) sheet.close();
}
sheet.addEventListener('close', () => {
  sheetBody.innerHTML = '';
  pendingTask = null;
  pendingImport = null;
  capture = null;
  lastFocus?.focus?.({ preventScroll: true });
});
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet(); // tap on the backdrop
});

// ---------- toast ----------
let toastTimer;
function toast(message, { error = false, undoLabel } = {}) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${message.replace(/[<>&]/g, '')}</span>${undoLabel ? `<button type="button" data-action="undo">${undoLabel}</button>` : ''}`;
  toastEl.classList.toggle('is-error', error);
  toastEl.classList.add('is-visible');
  toastTimer = setTimeout(() => { toastEl.classList.remove('is-visible'); undo = null; }, undoLabel ? 6000 : 2600);
}

// ---------- tasks ----------
function blankTask() {
  if (ui.lifeFilter === 'none') return { domain: null, importance: 3 };
  return { domain: ui.lifeFilter !== 'all' ? ui.lifeFilter : 'career', importance: 3 };
}

function readTaskForm(form) {
  const f = new FormData(form);
  const v = (k) => (f.get(k) || '').toString().trim();
  return {
    id: v('id'),
    title: v('title'),
    domain: v('domain') || null,
    importance: Number(v('importance')) || 3,
    dueDate: v('dueDate') || null,
    scheduledDate: v('scheduledDate') || null,
    startTime: v('startTime') || null,
    estimateMinutes: Number(v('estimateMinutes')) || null,
    goalId: v('goalId') || null,
    isFollowUp: f.get('isFollowUp') === 'on',
    followUpDate: f.get('isFollowUp') === 'on' ? v('followUpDate') || null : null,
    notes: v('notes'),
  };
}

function formError(form, message) {
  const el = form.querySelector('.form-error');
  el.textContent = message;
  el.hidden = false;
  el.scrollIntoView({ block: 'nearest' });
}

function submitTask(form) {
  const draft = readTaskForm(form);
  if (!draft.title) return formError(form, 'Please give the task a name.');
  const existing = state.tasks.find((t) => t.id === draft.id);
  const task = existing
    ? { ...existing, ...draft }
    : {
      ...draft, id: newId('t'), status: 'open', createdAt: localISODateTime(), completedAt: null, overrides: [],
    };
  const after = existing ? state.tasks.map((t) => (t.id === task.id ? task : t)) : [...state.tasks, task];
  const created = newConflicts(state.tasks, after, state.settings, [existing?.scheduledDate, task.scheduledDate], state.events)
    .filter((c) => (c.taskIds || []).includes(task.id));

  if (needsDecision(created)) {
    pendingTask = { task, existing: Boolean(existing), conflicts: created.filter((c) => c.severity !== 'notice') };
    const keep = pendingTask;
    openSheet(conflictWarning(keep.conflicts, task));
    pendingTask = keep;
    return;
  }
  saveTask(task, Boolean(existing), created.length ? 'Saved. Note: this day is near your capacity.' : undefined);
}

function saveTask(task, existing, message) {
  const tasks = existing ? state.tasks.map((t) => (t.id === task.id ? task : t)) : [...state.tasks, task];
  closeSheet();
  commit({ ...state, tasks }, message || (existing ? 'Task updated.' : 'Task added.'));
}

function toggleTask(id) {
  const tasks = state.tasks.map((t) => {
    if (t.id !== id) return t;
    return t.status === 'done'
      ? { ...t, status: 'open', completedAt: null }
      : { ...t, status: 'done', completedAt: localISODateTime() };
  });
  const now = tasks.find((t) => t.id === id);
  commit({ ...state, tasks }, now?.status === 'done' ? 'Done. Well handled.' : 'Marked as open.');
}

// ---------- goals ----------
function readGoalForm(form) {
  const f = new FormData(form);
  const v = (k) => (f.get(k) || '').toString().trim();
  const milestones = [...form.querySelectorAll('.ms-row')]
    .map((row) => ({ id: row.dataset.id || newId('m'), title: row.querySelector('input').value.trim(), done: row.dataset.done === '1' }))
    .filter((m) => m.title);
  return { id: v('id'), title: v('title'), domain: v('domain'), horizon: v('horizon'), startDate: v('startDate'), targetDate: v('targetDate'), milestones };
}

function submitGoal(form) {
  const goal = readGoalForm(form);
  if (!goal.title) return formError(form, 'Please name the goal.');
  if (!goal.startDate || !goal.targetDate) return formError(form, 'Please choose a start and target date.');
  if (goal.targetDate <= goal.startDate) return formError(form, 'The target date must be after the start date.');
  const exists = state.goals.some((g) => g.id === goal.id);
  const saved = exists ? goal : { ...goal, id: newId('g') };
  const goals = exists ? state.goals.map((g) => (g.id === saved.id ? saved : g)) : [...state.goals, saved];
  closeSheet();
  commit({ ...state, goals }, exists ? 'Goal updated.' : 'Goal created.');
}

// ---------- protected blocks ----------
function submitBlock(form) {
  const f = new FormData(form);
  const block = {
    id: (f.get('id') || '').toString() || newId('pb'),
    label: (f.get('label') || '').toString().trim(),
    days: f.get('date') ? [] : f.getAll('days').map(Number),
    date: (f.get('date') || '').toString() || null,
    start: (f.get('start') || '').toString(),
    end: (f.get('end') || '').toString(),
  };
  if (!block.label) return formError(form, 'Please describe what this time is for.');
  if (!block.date && !block.days.length) return formError(form, 'Choose a date or at least one day.');
  if (!(timeToMinutes(block.end) > timeToMinutes(block.start))) return formError(form, 'The end time must be after the start time (same day).');
  const list = state.settings.protectedBlocks;
  const exists = list.some((b) => b.id === block.id);
  const protectedBlocks = exists ? list.map((b) => (b.id === block.id ? block : b)) : [...list, block];
  closeSheet();
  commit({ ...state, settings: { ...state.settings, protectedBlocks } }, 'Protected time saved.');
}

// ---------- calendar import (.ics, on device) ----------
async function previewCalendar(file) {
  if (file.size > 10 * 1024 * 1024) return toast('That file is larger than 10 MB.', { error: true });
  try {
    const text = await file.text();
    const preview = eventsFromICS(text, { sourceId: 'preview', category: 'professional', today: today() });
    pendingImport = { text, fileName: file.name || 'calendar.ics' };
    const keep = pendingImport;
    openSheet(importSheet(preview, state.sources, keep.fileName));
    pendingImport = keep;
  } catch (err) {
    toast(err.message || 'Could not read that calendar file.', { error: true });
  }
}

function submitImport(form) {
  if (!pendingImport) return closeSheet();
  const f = new FormData(form);
  const label = (f.get('label') || '').toString().trim();
  if (!label) return formError(form, 'Please name this calendar.');
  const category = f.get('category') === 'personal' ? 'personal' : 'professional';
  const replaceId = (f.get('replace') || '').toString();
  const sourceId = replaceId || newId('src');
  const result = eventsFromICS(pendingImport.text, { sourceId, category, today: today() });
  // Keep acknowledgements for events that are still present after a refresh.
  const previous = new Map(state.events.filter((e) => e.sourceId === sourceId).map((e) => [e.id, e.overrides]));
  const events = result.events.map((e) => ({ ...e, overrides: previous.get(e.id) || [] }));
  const source = {
    id: sourceId, type: 'ics', label, category, accountId: null,
    importedAt: localISODateTime(), rangeStart: result.windowStart, rangeEnd: result.windowEnd,
  };
  const sources = replaceId ? state.sources.map((src) => (src.id === sourceId ? source : src)) : [...state.sources, source];
  closeSheet();
  commit({
    ...state,
    sources,
    events: [...state.events.filter((e) => e.sourceId !== sourceId), ...events],
  }, `${events.length} events imported from “${label}”.`);
}

// ---------- quick capture ----------
let previewSeq = 0;
const previewId = (prefix) => `${prefix}_preview${(previewSeq += 1)}`;

/** Builds the state that saving these items would produce, and the conflicts it would add. */
function buildBatch(items, makeId) {
  const now = localISODateTime();
  const tasks = [];
  const blocks = [];
  const ids = new Map();
  for (const item of items) {
    const r = toRecords([item], { makeId, now });
    tasks.push(...r.tasks);
    blocks.push(...r.blocks);
    ids.set(item.id, { tasks: r.tasks.map((t) => t.id), blocks: r.blocks.map((b) => b.id) });
  }
  const next = {
    ...state,
    tasks: [...state.tasks, ...tasks],
    settings: { ...state.settings, protectedBlocks: [...state.settings.protectedBlocks, ...blocks] },
  };
  const before = conflictsInRange(state.tasks, state.settings, today(), undefined, state.events);
  const after = conflictsInRange(next.tasks, next.settings, today(), undefined, state.events);
  const fresh = diffConflicts(before, after);
  const byItem = new Map();
  for (const [itemId, rec] of ids) {
    byItem.set(itemId, fresh.filter((c) => (c.taskIds || []).some((id) => rec.tasks.includes(id)) || rec.blocks.includes(c.blockId)));
  }
  return { next, ids, fresh, byItem, tasks, blocks };
}

const includedItems = () => capture.items.filter((i) => !capture.excluded.has(i.id));

function showReview(keepScroll) {
  const batch = buildBatch(includedItems().filter(isReady), previewId);
  const html = captureReviewSheet(capture, batch.byItem);
  if (keepScroll && sheet.open) {
    const y = sheet.scrollTop;
    sheetBody.innerHTML = html;
    sheet.scrollTop = y;
  } else {
    openSheet(html);
    const keep = capture;
    capture = keep;
  }
}

function startReview() {
  const box = document.getElementById('capture-text');
  const text = (box ? box.value : ui.captureDraft).trim();
  if (!text) {
    toast('Type or dictate something first.');
    box?.focus();
    return;
  }
  ui.captureDraft = text;
  writeDraft(text);
  const items = parseCapture(text, { today: today(), settings: state.settings });
  const next = { text, items, excluded: new Set(), editing: null };
  capture = next;
  showReview(false);
  capture = next; // openSheet may run the close handler of a previous sheet
}

function updateCaptureItem(form) {
  const item = capture.items.find((i) => i.id === form.dataset.id);
  if (!item) return;
  const f = new FormData(form);
  const v = (k) => (f.get(k) || '').toString().trim();
  const title = v('title');
  if (!title) return formError(form, 'Please give it a name.');
  const kind = v('kind') || item.kind;
  let next;
  if (kind === 'protect') {
    const date = v('date') || null;
    const days = date ? [] : f.getAll('days').map(Number);
    const start = timeToMinutes(v('start'));
    const end = timeToMinutes(v('end'));
    if (!date && !days.length) return formError(form, 'Choose a date, or the days it repeats.');
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return formError(form, 'Choose a start and an end time (end after start).');
    const keepDates = item.block && item.block.dates && item.block.dates.length > 1 && date === item.block.dates[0];
    next = {
      ...item, kind, title, isFollowUp: false,
      block: { ...(item.block || {}), label: title, date: keepDates ? null : date, dates: keepDates ? item.block.dates : null, days, start, end },
    };
  } else {
    const dayField = kind === 'followup' ? 'followUpDate' : 'scheduledDate';
    next = {
      ...item, kind, title, isFollowUp: kind === 'followup',
      domain: v('domain') || null,
      importance: Number(v('importance')) || item.importance || 3,
      dueDate: v('dueDate') || null,
      [dayField]: v(dayField) || null,
      startTime: v('startTime') || null,
    };
  }
  // A correction answers any open questions about this item.
  next.questions = item.questions.map((q) => (q.answer === null ? { ...q, answer: -1 } : q));
  next.confidence = 'parsed';
  capture.items = capture.items.map((i) => (i.id === item.id ? next : i));
  capture.editing = null;
  showReview(true);
}

function switchCaptureKind(form, kind) {
  const item = capture.items.find((i) => i.id === form.dataset.id);
  if (!item) return;
  const title = (form.elements.title?.value || item.title).trim();
  const next = { ...item, kind, title, isFollowUp: kind === 'followup' };
  if (kind === 'protect' && !item.block) {
    next.block = { label: title, date: item.scheduledDate || item.followUpDate || item.dueDate || null, dates: null, days: [], start: null, end: null };
  }
  if (kind === 'followup' && !item.followUpDate) next.followUpDate = item.scheduledDate || null;
  capture.items = capture.items.map((i) => (i.id === item.id ? next : i));
  showReview(true);
}

function saveCapture() {
  const items = includedItems();
  if (!items.length || !items.every(isReady)) return;
  const batch = buildBatch(items, newId);
  // One confirmation: saving records any boundary warnings on the new tasks as intentional overrides.
  const tasks = batch.next.tasks.map((t) => {
    if (!batch.tasks.some((n) => n.id === t.id)) return t;
    const codes = batch.fresh.filter((c) => c.severity !== 'notice' && (c.taskIds || []).includes(t.id)).map((c) => c.code);
    return codes.length ? { ...t, overrides: [...new Set(codes)] } : t;
  });
  ui.lastCapture = {
    taskIds: batch.tasks.map((t) => t.id),
    blockIds: batch.blocks.map((b) => b.id),
    count: items.length,
    at: Date.now(),
  };
  ui.captureDraft = '';
  writeDraft('');
  closeSheet();
  commit({ ...batch.next, tasks });
  undo = undoCapture;
  toast(`Saved ${items.length} item${items.length === 1 ? '' : 's'}.`, { undoLabel: 'Undo' });
}

function undoCapture() {
  const last = ui.lastCapture;
  if (!last) return;
  const taskIds = new Set(last.taskIds);
  const blockIds = new Set(last.blockIds);
  ui.lastCapture = null;
  commit({
    ...state,
    tasks: state.tasks.filter((t) => !taskIds.has(t.id)),
    settings: { ...state.settings, protectedBlocks: state.settings.protectedBlocks.filter((b) => !blockIds.has(b.id)) },
  }, 'Removed the items from your note.');
}

// ---------- settings ----------
function updateSetting(el) {
  const key = el.dataset.setting;
  const s = { ...state.settings };
  if (key === 'dayPart') {
    const { part, edge } = el.dataset;
    const span = { ...s.dayParts[part], [edge]: el.value };
    if (Number.isNaN(timeToMinutes(span.start)) || Number.isNaN(timeToMinutes(span.end)) || timeToMinutes(span.end) <= timeToMinutes(span.start)) {
      toast('The end time must be after the start time.', { error: true });
      return render();
    }
    s.dayParts = { ...s.dayParts, [part]: span };
    return commit({ ...state, settings: s }, `"${part[0].toUpperCase()}${part.slice(1)}" now means ${span.start}–${span.end}.`);
  }
  if (key === 'workStart' || key === 'workEnd') {
    if (Number.isNaN(timeToMinutes(el.value))) return render();
    s[key] = el.value;
    if (timeToMinutes(s.workEnd) <= timeToMinutes(s.workStart)) {
      toast('Working hours must end after they start.', { error: true });
      return render();
    }
  } else if (key === 'maxDailyHours') {
    const h = Number(el.value);
    if (!Number.isFinite(h) || h < 0 || h > 16) {
      toast('Enter between 0 and 16 hours.', { error: true });
      return render();
    }
    s.maxDailyWorkMinutes = Math.round(h * 60);
  } else if (key === 'protectRestDays') {
    s.protectRestDays = el.checked;
  }
  commit({ ...state, settings: s }, 'Boundaries updated.');
}

// ---------- data ----------
function exportData() {
  const blob = new Blob([exportJSON(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `luxelifeos-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup exported.');
}

async function importData(file) {
  try {
    const next = importJSON(await file.text());
    commit(next, `Backup restored: ${next.tasks.length} tasks, ${next.goals.length} goals, ${next.sources.length} calendars.`);
  } catch (err) {
    toast(`Could not import: ${err.message}`, { error: true });
  }
}

// ---------- actions ----------
const actions = {
  'close-sheet': closeSheet,
  'capture-review': startReview,
  'capture-edit-text': () => {
    const box = document.getElementById('capture-text');
    lastFocus = box; // the sheet's close handler returns focus here
    closeSheet();
    // Focus synchronously inside the tap so iOS reopens the keyboard.
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  },
  'capture-toggle': (el) => {
    const id = el.dataset.id;
    if (capture.excluded.has(id)) capture.excluded.delete(id); else capture.excluded.add(id);
    showReview(true);
  },
  'capture-edit': (el) => {
    capture.editing = capture.editing === el.dataset.id ? null : el.dataset.id;
    showReview(true);
  },
  'capture-answer': (el) => {
    capture.items = capture.items.map((i) => (i.id === el.dataset.id ? answerQuestion(i, el.dataset.q, Number(el.dataset.opt)) : i));
    showReview(true);
  },
  'capture-save': saveCapture,
  'capture-undo': () => { undo = null; toastEl.classList.remove('is-visible'); undoCapture(); },
  'dictation-info': () => openSheet(dictationSheet()),
  'open-guide': () => openSheet(guideSheet()),
  'open-review': () => openSheet(reviewSheet(weeklyReview(state, today()), today())),
  'new-task': () => openSheet(taskForm(blankTask(), state.goals)),
  'edit-task': (el) => {
    const task = state.tasks.find((t) => t.id === el.dataset.id);
    if (task) openSheet(taskForm(task, state.goals));
  },
  'toggle-task': (el) => toggleTask(el.dataset.id),
  why: (el) => {
    const task = state.tasks.find((t) => t.id === el.dataset.id);
    if (task) openSheet(whySheet(task, scoreTask(task, goalsMap(state.goals), today())));
  },
  'delete-task': (el) => {
    const idx = state.tasks.findIndex((t) => t.id === el.dataset.id);
    if (idx < 0) return;
    const removed = state.tasks[idx];
    closeSheet();
    commit({ ...state, tasks: state.tasks.filter((t) => t.id !== removed.id) });
    undo = () => {
      const tasks = [...state.tasks];
      tasks.splice(idx, 0, removed);
      commit({ ...state, tasks }, 'Task restored.');
    };
    toast('Task deleted.', { undoLabel: 'Undo' });
  },
  undo: () => {
    const fn = undo;
    undo = null;
    toastEl.classList.remove('is-visible');
    fn?.();
  },
  'revise-task': () => {
    const p = pendingTask;
    if (p) openSheet(taskForm(p.task, state.goals));
  },
  'override-task': () => {
    const p = pendingTask;
    if (!p) return;
    const codes = new Set([...(p.task.overrides || []), ...p.conflicts.map((c) => c.code)]);
    saveTask({ ...p.task, overrides: [...codes] }, p.existing, 'Saved with an intentional override.');
  },
  'show-day': (el) => {
    const date = el.dataset.date;
    const tasks = state.tasks.filter((t) => t.scheduledDate === date && t.status === 'open');
    openSheet(daySheet(date, tasks, { today: today(), goalsById: goalsMap(state.goals) }));
  },
  'filter-domain': (el) => { ui.lifeFilter = el.dataset.domain; render(); },
  'life-view': (el) => { ui.lifeView = el.dataset.view; render(); },

  'new-goal': () => {
    const start = today();
    openSheet(goalForm({ startDate: start, targetDate: defaultTargetDate(start, '90d'), horizon: '90d', milestones: [{}, {}, {}] }));
  },
  'edit-goal': (el) => {
    const goal = state.goals.find((g) => g.id === el.dataset.id);
    if (goal) openSheet(goalForm(goal));
  },
  'toggle-milestone': (el) => {
    const goals = state.goals.map((g) => (g.id !== el.dataset.goal ? g : {
      ...g, milestones: g.milestones.map((m) => (m.id === el.dataset.ms ? { ...m, done: !m.done } : m)),
    }));
    commit(goals === state.goals ? state : { ...state, goals });
  },
  'add-milestone': () => {
    const list = sheetBody.querySelector('.ms-list');
    if (list.children.length >= 20) return toast('Up to 20 milestones per goal.');
    list.insertAdjacentHTML('beforeend', msRow());
    list.lastElementChild.querySelector('input').focus();
  },
  'remove-milestone': (el) => el.closest('.ms-row')?.remove(),
  'delete-goal': (el) => openSheet(confirmSheet({
    title: 'Delete this goal?',
    body: 'Its milestones will be deleted. Linked tasks stay in My Life but will no longer be linked to a goal.',
    confirmLabel: 'Delete goal',
    action: `confirm-delete-goal:${el.dataset.id}`,
    danger: true,
  })),

  'toggle-workday': (el) => {
    const d = Number(el.dataset.day);
    const days = state.settings.workDays.includes(d) ? state.settings.workDays.filter((x) => x !== d) : [...state.settings.workDays, d].sort();
    commit({ ...state, settings: { ...state.settings, workDays: days } }, 'Working days updated.');
  },
  'new-block': () => openSheet(blockForm({})),
  'edit-block': (el) => {
    const block = state.settings.protectedBlocks.find((b) => b.id === el.dataset.id);
    if (block) openSheet(blockForm(block));
  },
  'delete-block': (el) => {
    closeSheet();
    commit({ ...state, settings: { ...state.settings, protectedBlocks: state.settings.protectedBlocks.filter((b) => b.id !== el.dataset.id) } }, 'Protected time removed.');
  },

  'ack-event': (el) => {
    const ids = new Set((el.dataset.events || '').split(',').filter(Boolean));
    const code = el.dataset.code;
    const events = state.events.map((e) => (ids.has(e.id) && !e.overrides.includes(code) ? { ...e, overrides: [...e.overrides, code] } : e));
    commit({ ...state, events }, 'Acknowledged.');
  },
  'remove-source': (el) => {
    const src = state.sources.find((x) => x.id === el.dataset.id);
    if (!src) return;
    openSheet(confirmSheet({
      title: `Remove “${src.label}”?`,
      body: 'Its imported events will be removed from LuxeLifeOS on this device. Your original calendar is not affected.',
      confirmLabel: 'Remove calendar', action: `confirm-remove-source:${src.id}`, danger: true,
    }));
  },
  export: exportData,
  'load-sample': () => {
    if (!state.tasks.length && !state.goals.length) return commit(sampleState(today()), 'Fictional sample data loaded.');
    openSheet(confirmSheet({
      title: 'Replace your data?', body: 'Loading sample data replaces everything currently in LuxeLifeOS on this device. Export a backup first if you want to keep it.',
      confirmLabel: 'Replace with sample data', action: 'confirm-sample', danger: true,
    }));
  },
  'confirm-sample': () => { closeSheet(); commit(sampleState(today()), 'Fictional sample data loaded.'); },
  erase: () => openSheet(confirmSheet({
    title: 'Erase all data?', body: 'This permanently removes every task, goal and boundary setting from this device. It cannot be undone.',
    confirmLabel: 'Erase everything', action: 'confirm-erase', danger: true,
  })),
  'confirm-erase': () => { closeSheet(); commit(emptyState(), 'All data erased.'); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const [name, arg] = el.dataset.action.split(':');
  if (name === 'confirm-remove-source') {
    closeSheet();
    commit({
      ...state,
      sources: state.sources.filter((x) => x.id !== arg),
      events: state.events.filter((x) => x.sourceId !== arg),
    }, 'Calendar removed.');
    return;
  }
  if (name === 'confirm-delete-goal') {
    closeSheet();
    commit({
      ...state,
      goals: state.goals.filter((g) => g.id !== arg),
      tasks: state.tasks.map((t) => (t.goalId === arg ? { ...t, goalId: null } : t)),
    }, 'Goal deleted.');
    return;
  }
  const fn = actions[name];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  ({
    task: submitTask, goal: submitGoal, block: submitBlock, import: submitImport, 'capture-item': updateCaptureItem,
  })[form.dataset.form]?.(form);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.setting) return updateSetting(el);
  if (el.id === 'ics-file' && el.files?.[0]) {
    previewCalendar(el.files[0]);
    el.value = '';
    return;
  }
  if (el.id === 'import-file' && el.files?.[0]) {
    importData(el.files[0]);
    el.value = '';
    return;
  }
  if (el.name === 'kind' && el.form?.dataset.form === 'capture-item') return switchCaptureKind(el.form, el.value);
  if (el.name === 'isFollowUp') {
    const row = el.form.querySelector('.follow-date');
    row.hidden = !el.checked;
  }
  const form = el.form;
  if (form?.dataset.form === 'goal' && (el.name === 'horizon' || el.name === 'startDate')) {
    const target = form.elements.targetDate;
    if (target.dataset.auto === '1' || !target.value) {
      target.value = defaultTargetDate(form.elements.startDate.value, form.elements.horizon.value) || target.value;
    }
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'capture-text') {
    ui.captureDraft = e.target.value;
    writeDraft(e.target.value);
  }
  if (e.target.name === 'targetDate') e.target.dataset.auto = '0';
});

window.addEventListener('hashchange', onRoute);
// Refresh "today" when the app returns to the foreground (e.g. the next morning).
document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheet.open) render(); });

render();
if (loaded.error) toast(loaded.error, { error: true });

// ---------- offline ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ });
  });
}
