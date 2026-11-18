// Shared rendering helpers. Every piece of user text goes through esc().

import { DOMAINS } from '../logic/config.js';
import { daysBetween, formatDate, formatMinutes } from '../logic/dates.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const DOMAIN_MAP = new Map(DOMAINS.map((d) => [d.id, d]));
export const domainLabel = (id) => DOMAIN_MAP.get(id)?.label ?? 'Other';
export const domainType = (id) => DOMAIN_MAP.get(id)?.type ?? 'personal';

const PATHS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  life: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.3"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
}

export function dueLabel(task, today) {
  if (!task.dueDate) return '';
  const d = daysBetween(today, task.dueDate);
  if (d < 0) return `Overdue by ${-d} day${d === -1 ? '' : 's'}`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `Due ${formatDate(task.dueDate)}`;
}

export function taskMeta(task, today, goalsById) {
  const bits = [esc(domainLabel(task.domain))];
  const due = dueLabel(task, today);
  if (due) bits.push(`<span class="${task.status === 'open' && task.dueDate < today ? 'text-danger' : ''}">${esc(due)}</span>`);
  if (task.scheduledDate && task.scheduledDate !== today) bits.push(`Planned ${esc(formatDate(task.scheduledDate))}`);
  if (task.startTime) bits.push(esc(task.startTime));
  if (task.estimateMinutes) bits.push(esc(formatMinutes(task.estimateMinutes)));
  const goal = task.goalId && goalsById?.get(task.goalId);
  if (goal) bits.push(`<span class="text-gold">◆ ${esc(goal.title)}</span>`);
  if (task.isFollowUp) bits.push('<span class="tag">Follow-up</span>');
  return bits.join('<span class="dot" aria-hidden="true">·</span>');
}

export function taskRow(task, { today, goalsById, score, rank } = {}) {
  const done = task.status === 'done';
  return `
  <li class="task ${done ? 'is-done' : ''}">
    <button class="check" type="button" data-action="toggle-task" data-id="${esc(task.id)}"
      aria-pressed="${done}" aria-label="${done ? 'Mark as not done' : 'Mark complete'}: ${esc(task.title)}">${icon('check')}</button>
    <button class="task-body" type="button" data-action="edit-task" data-id="${esc(task.id)}">
      ${rank ? `<span class="rank" aria-hidden="true">${rank}</span>` : ''}
      <span class="task-text">
        <span class="task-title">${esc(task.title)}</span>
        <span class="task-meta">${taskMeta(task, today, goalsById)}</span>
      </span>
    </button>
    ${score !== undefined && !done ? `<button class="score" type="button" data-action="why" data-id="${esc(task.id)}" aria-label="Priority score ${score} of 100. Show how it was calculated">${score}</button>` : ''}
  </li>`;
}

export function ring(percent, size = 56, label = '') {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label || `${percent}% complete`)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-value" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" class="ring-text">${percent}%</text>
  </svg>`;
}

export function statusPill(status, label) {
  return `<span class="pill pill-${esc(status)}">${esc(label)}</span>`;
}

export function severityTag(severity) {
  const label = { high: 'High', medium: 'Medium', notice: 'Notice' }[severity] || severity;
  return `<span class="sev sev-${esc(severity)}">${esc(label)}</span>`;
}

export function screenHead(overline, title, lede = '') {
  return `<header class="screen-head">
    <p class="overline">${esc(overline)}</p>
    <h1 class="display">${esc(title)}</h1>
    ${lede ? `<p class="lede">${esc(lede)}</p>` : ''}
  </header>`;
}

export function emptyState(title, body, actions = '') {
  return `<div class="empty">
    <div class="empty-mark" aria-hidden="true">${icon('sparkle')}</div>
    <p class="empty-title">${esc(title)}</p>
    <p class="empty-body">${esc(body)}</p>
    ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
  </div>`;
}

export function meter(load, cap) {
  const pct = cap > 0 ? Math.round((load / cap) * 100) : (load > 0 ? 101 : 0);
  const cls = pct > 100 ? 'over' : pct > 85 ? 'near' : 'ok';
  return `<div class="meter meter-${cls}" role="meter" aria-valuemin="0" aria-valuemax="${cap}" aria-valuenow="${load}" aria-label="Work planned">
    <span style="width:${Math.min(100, pct)}%"></span>
  </div>`;
}
