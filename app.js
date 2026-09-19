'use strict';

/* =========================================================
   to-dos — sponsored by ilan Games
   ========================================================= */

/* ---------- Tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

function svg(markup) {
  const wrap = document.createElement('span');
  wrap.innerHTML = markup;
  return wrap.firstElementChild;
}

const ICON = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
};

const cleanText = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 300);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid = () =>
  (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth; // restart the animation
  el.classList.add('shake');
  el.focus();
}

/* ---------- Dates (all local time, stored as "YYYY-MM-DD") ---------- */
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
const dateOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => keyOf(new Date());
const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 86400000); // b − a

function fmt(k, opts) {
  const d = dateOf(k);
  if (d.getFullYear() !== new Date().getFullYear()) opts = { ...opts, year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}
const longDate = (k) => fmt(k, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = (k) => fmt(k, { weekday: 'short', day: 'numeric', month: 'short' });

/** "today", "tomorrow", "yesterday", "Saturday", or "Sat, 4 Oct" */
function relDay(k, capital = false) {
  const n = daysBetween(today, k);
  let s;
  if (n === 0) s = 'today';
  else if (n === 1) s = 'tomorrow';
  else if (n === -1) s = 'yesterday';
  else if (n > 1 && n < 7) return dateOf(k).toLocaleDateString(undefined, { weekday: 'long' });
  else return shortDate(k);
  return capital ? s[0].toUpperCase() + s.slice(1) : s;
}

/* ---------- Storage ---------- */
const STORE_KEY = 'todos.v1';

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((t) => t && typeof t.id === 'string' && typeof t.text === 'string' && isKey(t.date));
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(todos));
  } catch {
    toast("Couldn't save — your browser storage is blocked or full.");
  }
}

/* ---------- State ---------- */
let todos = load();
let today = todayKey();
let view = 'today';
let planDate = addDays(today, 1);
let justAdded = null;
let renderTimer = 0;
let centeredDay = null;

const find = (id) => todos.find((t) => t.id === id);
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
const byDoneAt = (a, b) => (a.doneAt || 0) - (b.doneAt || 0);
const itemsOn = (k) => todos.filter((t) => t.date === k);
const overdueItems = () => todos.filter((t) => !t.done && t.date < today).sort(byOrder);

function allDoneToday() {
  const items = itemsOn(today);
  return items.length > 0 && items.every((t) => t.done) && overdueItems().length === 0;
}

const CHEERS = [
  'Yay, you did it! 🎉',
  'Nice work! 💪',
  'One down! ✨',
  'Crushed it! 🔥',
  'Look at you go! 🚀',
  'Done and dusted! 🌟',
  'Great job! 🙌',
];

/* ---------- Actions ---------- */
function addTodo(text, date) {
  const now = Date.now();
  const t = { id: uid(), text, date, done: false, doneAt: null, order: now, createdAt: now };
  todos.push(t);
  justAdded = t.id;
  save();
  render();
}

function toggleDone(id) {
  const t = find(id);
  if (!t) return;
  const wasAllDone = allDoneToday();

  t.done = !t.done;
  if (t.done) {
    t.doneAt = Date.now();
    if (t.date < today) t.date = today; // finishing a leftover counts for today
  } else {
    t.doneAt = null;
  }
  save();

  // Animate the item in place, then re-render so it moves to "Completed".
  const btn = currentSection().querySelector(`.item[data-id="${CSS.escape(id)}"] .check`);
  const li = btn && btn.closest('.item');
  if (li) {
    li.classList.toggle('done', t.done);
    li.classList.toggle('just-done', t.done);
    btn.setAttribute('aria-pressed', String(t.done));
  }

  if (t.done) {
    if (!wasAllDone && allDoneToday()) {
      bigCelebration();
      toast('Everything done for today! 🏆');
    } else {
      const r = btn ? btn.getBoundingClientRect() : null;
      burst(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + r.height / 2 : innerHeight / 2, 46, 7, 1.5);
      toast(pick(CHEERS));
    }
  }
  scheduleRender(t.done ? 700 : 250);
}

function moveTo(id, date) {
  const t = find(id);
  if (!t) return;
  const wasAllDone = allDoneToday();
  t.date = date;
  t.done = false;
  t.doneAt = null;
  t.order = Date.now();
  save();
  closeSheet();
  render();
  if (!wasAllDone && allDoneToday()) {
    bigCelebration();
    toast(`Moved to ${relDay(date)} — and you're done for today! 🏆`);
  } else {
    toast(`Moved to ${relDay(date)} 👍`);
  }
}

function removeTodo(id) {
  const i = todos.findIndex((t) => t.id === id);
  if (i < 0) return;
  const wasAllDone = allDoneToday();
  const [t] = todos.splice(i, 1);
  save();
  render();
  if (!wasAllDone && allDoneToday()) bigCelebration();
  toast('To-do deleted', {
    label: 'Undo',
    run: () => {
      if (find(t.id)) return;
      todos.splice(Math.min(i, todos.length), 0, t);
      save();
      render();
    },
  });
}

/* ---------- Rendering ---------- */
function scheduleRender(ms) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, ms);
}

function render() {
  clearTimeout(renderTimer);
  renderTimer = 0;
  renderNav();
  renderToday();
  renderPlan();
  justAdded = null;
}

const currentSection = () => (view === 'today' ? $('#view-today') : $('#view-plan'));

function renderNav() {
  $('#view-today').hidden = view !== 'today';
  $('#view-plan').hidden = view !== 'plan';
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
}

function greeting() {
  const hr = new Date().getHours();
  switch (currentPhase()) {
    case 'morning': return 'Good morning ☀️';
    case 'afternoon': return 'Good afternoon 🌤️';
    case 'evening': return 'Good evening 🌆';
    default: return hr >= 20 ? 'Good night 🌙' : 'Up late? 🌙';
  }
}

function itemEl(t, { showFrom = false } = {}) {
  const check = h('button', {
    type: 'button',
    class: 'check',
    'aria-label': t.done ? 'Mark as not done' : 'Mark as done',
    'aria-pressed': String(t.done),
    onclick: () => toggleDone(t.id),
  }, svg(ICON.check));

  const body = h('div', { class: 'body', onclick: () => openMenu(t.id) },
    h('p', { class: 'text' }, t.text),
    showFrom ? h('span', { class: 'meta' }, `From ${relDay(t.date)}`) : null,
  );

  const more = h('button', { type: 'button', class: 'more', 'aria-label': 'More options', onclick: () => openMenu(t.id) }, svg(ICON.dots));

  const cls = ['item'];
  if (t.done) cls.push('done');
  if (showFrom) cls.push('overdue');
  if (t.id === justAdded) cls.push('enter');
  return h('li', { class: cls.join(' '), 'data-id': t.id }, check, body, more);
}

const listEl = (items, opts) => h('ul', { class: 'list' }, items.map((t) => itemEl(t, opts)));

const sectionEl = (title, count, content) =>
  h('div', { class: 'section' },
    h('h2', { class: 'section-title' }, title, h('span', { class: 'count' }, count)),
    content);

const emptyEl = (emoji, title, text) =>
  h('div', { class: 'empty' }, h('div', { class: 'emoji' }, emoji), h('h3', {}, title), h('p', {}, text));

function renderToday() {
  $('#today-date').textContent = longDate(today);
  $('#greeting').textContent = greeting();

  const items = itemsOn(today);
  const pending = items.filter((t) => !t.done).sort(byOrder);
  const done = items.filter((t) => t.done).sort(byDoneAt);
  const overdue = overdueItems();
  const wrap = $('#today-lists');
  wrap.replaceChildren();

  if (items.length) {
    const pct = Math.round((done.length / items.length) * 100);
    wrap.append(h('div', { class: 'progress' },
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Today’s progress' },
        h('i', { style: `width:${pct}%` })),
      h('div', { class: 'stat' },
        h('span', { class: 'pct' }, `${pct}%`),
        h('span', { class: 'of' }, `${done.length} of ${items.length} done`))));
  }

  if (allDoneToday()) {
    wrap.append(h('div', { class: 'celebrate' },
      h('div', { class: 'trophy' }, '🏆'),
      h('h3', {}, 'All done for today!'),
      h('p', {}, 'You finished everything on your list. Enjoy the rest of your day.'),
      h('button', { type: 'button', onclick: () => { planDate = addDays(today, 1); setView('plan'); } }, 'Plan tomorrow →')));
  }

  if (overdue.length) wrap.append(sectionEl('Left from earlier', overdue.length, listEl(overdue, { showFrom: true })));
  if (pending.length) wrap.append(sectionEl(overdue.length ? 'Today' : 'To do', pending.length, listEl(pending)));

  if (!items.length && !overdue.length) {
    wrap.append(emptyEl('🌱', 'A fresh new day', 'Type your first to-do above, or tap the mic and just say it.'));
  }

  if (done.length) wrap.append(sectionEl('Completed', done.length, listEl(done)));
}

function stripDays() {
  const days = [];
  for (let i = 1; i <= 14; i++) days.push(addDays(today, i));
  const last = days[days.length - 1];
  const extra = new Set(todos.filter((t) => t.date > last).map((t) => t.date));
  if (planDate > last) extra.add(planDate);
  return days.concat([...extra].sort());
}

function renderPlan() {
  if (planDate <= today) planDate = addDays(today, 1);
  const tomorrow = addDays(today, 1);

  // Day chips
  const strip = $('#day-strip');
  strip.replaceChildren();
  for (const k of stripDays()) {
    const d = dateOf(k);
    const count = todos.filter((t) => t.date === k && !t.done).length;
    strip.append(h('button', {
      type: 'button',
      class: 'day',
      'data-day': k,
      'aria-pressed': String(k === planDate),
      'aria-label': `${longDate(k)}${count ? `, ${count} planned` : ''}`,
      onclick: () => { planDate = k; render(); },
    },
    h('span', { class: 'dow' }, k === tomorrow ? 'Tmrw' : d.toLocaleDateString(undefined, { weekday: 'short' })),
    h('span', { class: 'num' }, d.getDate()),
    h('span', { class: 'mon' }, d.toLocaleDateString(undefined, { month: 'short' })),
    count ? h('span', { class: 'badge' }, count) : null));
  }
  strip.append(h('button', { type: 'button', class: 'day pick', 'aria-label': 'Pick another date', onclick: openDatePicker },
    svg(ICON.calendar), h('span', { class: 'mon' }, 'Pick date')));

  // Keep the selected chip in view (horizontal only, never jumps the page)
  if (view === 'plan' && centeredDay !== planDate) {
    const chip = strip.querySelector(`[data-day="${planDate}"]`);
    if (chip) {
      strip.scrollTo({
        left: chip.offsetLeft - strip.clientWidth / 2 + chip.offsetWidth / 2,
        behavior: centeredDay ? 'smooth' : 'auto',
      });
      centeredDay = planDate;
    }
  }

  // Heading
  const n = daysBetween(today, planDate);
  const weekday = dateOf(planDate).toLocaleDateString(undefined, { weekday: 'long' });
  $('#plan-title').textContent = n === 1 ? 'Tomorrow' : weekday;
  $('#plan-date').textContent = n === 1
    ? longDate(planDate)
    : `${fmt(planDate, { day: 'numeric', month: 'long' })} · in ${n} days`;
  $('#plan-input').placeholder = `Add a to-do for ${n === 1 ? 'tomorrow' : weekday}…`;

  // List
  const items = itemsOn(planDate);
  const pending = items.filter((t) => !t.done).sort(byOrder);
  const done = items.filter((t) => t.done).sort(byDoneAt);
  const wrap = $('#plan-list');
  wrap.replaceChildren();
  if (pending.length) wrap.append(sectionEl('Planned', pending.length, listEl(pending)));
  if (!items.length) {
    wrap.append(emptyEl('🗓️', 'Nothing planned yet', `What do you want to get done ${n === 1 ? 'tomorrow' : `on ${weekday}`}?`));
  }
  if (done.length) wrap.append(sectionEl('Completed', done.length, listEl(done)));
}

function setView(v) {
  if (view === v) { render(); return; }
  stopVoice();
  view = v;
  centeredDay = null;
  window.scrollTo(0, 0);
  render();
}

/* ---------- Sheets (pop-ups) ---------- */
const sheet = $('#sheet');

function openSheet(build) {
  const inner = h('div', { class: 'sheet-inner' });
  build(inner);
  sheet.replaceChildren(inner);
  if (!sheet.open) sheet.showModal();
  const first = inner.querySelector('[data-autofocus]') || inner.querySelector('button, input');
  if (first) first.focus({ preventScroll: true });
}

function closeSheet() {
  if (sheet.open) sheet.close();
}

sheet.addEventListener('click', (e) => {
  if (e.target === sheet) closeSheet(); // click on the dim background
});

function action(ico, label, onclick, { danger = false, hint = null } = {}) {
  return h('button', { type: 'button', class: `action${danger ? ' danger' : ''}`, onclick },
    h('span', { class: 'ico', 'aria-hidden': 'true' }, ico),
    h('span', { class: 'lbl' }, label),
    hint ? h('span', { class: 'hint' }, hint) : null);
}

const footer = (...btns) => h('div', { class: 'sheet-footer' }, btns);
const cancelBtn = () => h('button', { type: 'button', class: 'btn', onclick: closeSheet }, 'Cancel');

function openMenu(id) {
  const t = find(id);
  if (!t) return;
  let when;
  if (t.done) when = 'Completed ✓';
  else if (t.date < today) when = `📌 Left over from ${relDay(t.date)}`;
  else when = `📅 ${relDay(t.date, true)}`;

  openSheet((inner) => inner.append(
    h('h3', { class: 'clamp' }, t.text),
    h('p', { class: 'sheet-sub' }, when),
    h('div', { class: 'actions' },
      action(t.done ? '↩️' : '✅', t.done ? 'Mark as not done' : 'Mark as done', () => { closeSheet(); toggleDone(id); }),
      t.done ? null : action('⏭️', t.date > today ? 'Move to another day' : 'Postpone', () => openPostpone(id)),
      action('✏️', 'Edit', () => openEdit(id)),
      action('🗑️', 'Delete', () => { closeSheet(); removeTodo(id); }, { danger: true })),
    footer(cancelBtn()),
  ));
}

function openPostpone(id) {
  const t = find(id);
  if (!t) return;
  const seen = new Set([t.date]);
  const opts = [];
  const add = (ico, label, k) => {
    if (seen.has(k)) return;
    seen.add(k);
    opts.push({ k, el: action(ico, label, () => moveTo(id, k), { hint: shortDate(k) }) });
  };
  const dow = dateOf(today).getDay(); // 0 = Sunday
  if (t.date < today) add('☀️', 'Today', today);
  add('🌅', 'Tomorrow', addDays(today, 1));
  add('🏖️', dow === 0 || dow === 6 ? 'Next weekend' : 'This weekend', addDays(today, ((6 - dow + 7) % 7) || 7));
  add('📆', 'Next week', addDays(today, ((1 - dow + 7) % 7) || 7));

  const base = t.date > today ? t.date : today;
  const input = h('input', { type: 'date', class: 'field', min: today, value: addDays(base, 1), 'aria-label': 'Pick a date' });
  const form = h('form', {
    class: 'date-row',
    onsubmit: (e) => {
      e.preventDefault();
      const v = input.value;
      if (!isKey(v) || v < today) { shake(input); return; }
      if (v === t.date) { closeSheet(); return; }
      moveTo(id, v);
    },
  }, input, h('button', { type: 'submit', class: 'btn primary inline' }, 'Move'));

  openSheet((inner) => inner.append(
    h('h3', {}, t.date > today ? 'Move to…' : 'Postpone to…'),
    h('p', { class: 'sheet-sub clamp' }, t.text),
    h('div', { class: 'actions' }, opts.sort((a, b) => (a.k < b.k ? -1 : 1)).map((o) => o.el)),
    h('p', { class: 'label' }, 'Or pick a date'),
    form,
    footer(h('button', { type: 'button', class: 'btn', onclick: () => openMenu(id) }, '← Back')),
  ));
}

function openEdit(id) {
  const t = find(id);
  if (!t) return;
  const input = h('input', { type: 'text', class: 'field', maxlength: '300', value: t.text, 'aria-label': 'To-do text', 'data-autofocus': true });
  openSheet((inner) => inner.append(h('form', {
    onsubmit: (e) => {
      e.preventDefault();
      const v = cleanText(input.value);
      if (!v) { shake(input); return; }
      t.text = v;
      save();
      closeSheet();
      render();
    },
  },
  h('h3', {}, 'Edit to-do'),
  h('p', { class: 'sheet-sub' }, 'Fix a typo or make it clearer.'),
  input,
  footer(cancelBtn(), h('button', { type: 'submit', class: 'btn primary' }, 'Save')))));
  input.select();
}

function openDatePicker() {
  const min = addDays(today, 1);
  const input = h('input', { type: 'date', class: 'field', min, value: planDate >= min ? planDate : min, 'aria-label': 'Date', 'data-autofocus': true });
  openSheet((inner) => inner.append(h('form', {
    onsubmit: (e) => {
      e.preventDefault();
      const v = input.value;
      if (!isKey(v) || v < min) { shake(input); return; }
      planDate = v;
      closeSheet();
      render();
    },
  },
  h('h3', {}, 'Plan another day'),
  h('p', { class: 'sheet-sub' }, 'Pick any day in the future.'),
  input,
  footer(cancelBtn(), h('button', { type: 'submit', class: 'btn primary' }, 'Go')))));
}

/* ---------- Toast ---------- */
let toastTimer = 0;
const toastEl = $('#toast');

function toast(msg, act) {
  toastEl.replaceChildren(h('span', {}, msg));
  if (act) toastEl.append(h('button', { type: 'button', onclick: () => { act.run(); hideToast(); } }, act.label));
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, act ? 5000 : 2400);
}
function hideToast() {
  clearTimeout(toastTimer);
  toastEl.classList.remove('show');
}

/* ---------- Confetti ---------- */
const cv = $('#confetti');
const ctx = cv.getContext('2d');
const COLORS = ['#FF8A5B', '#F2575F', '#9B5CF6', '#FFC857', '#3DDC97', '#4CC9F0', '#FF6B8B'];
let parts = [];
let raf = 0;

function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeCanvas();
window.addEventListener('resize', sizeCanvas);

/** Shoot `count` pieces from (x, y). `spread` 1 = half circle upward. */
function burst(x, y, count, power, spread = 1, baseAngle = -Math.PI / 2) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (Math.random() - 0.5) * Math.PI * spread;
    const speed = power * (0.45 + Math.random() * 0.75);
    parts.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 5,
      h: 8 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      tilt: Math.random() * Math.PI,
      color: pick(COLORS),
      round: Math.random() < 0.3,
      life: 0,
      ttl: 90 + Math.random() * 70,
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life < p.ttl && p.y < innerHeight + 40);
  for (const p of parts) {
    p.life++;
    p.vx *= 0.985;
    p.vy = p.vy * 0.985 + 0.28;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.tilt += 0.12;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (p.ttl - p.life) / 30);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.cos(p.tilt));
    ctx.fillStyle = p.color;
    if (p.round) {
      ctx.beginPath();
      ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }
  if (parts.length) {
    raf = requestAnimationFrame(tick);
  } else {
    raf = 0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
}

function bigCelebration() {
  const w = innerWidth, ht = innerHeight;
  burst(0, ht * 0.85, 90, 20, 0.35, -Math.PI / 3);
  burst(w, ht * 0.85, 90, 20, 0.35, (-2 * Math.PI) / 3);
  setTimeout(() => burst(w / 2, ht * 0.4, 120, 13, 2), 280);
}

/* ---------- Voice typing ---------- */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;

function stopVoice() {
  if (rec) { try { rec.abort(); } catch { /* already stopped */ } }
}

function startVoice(input, btn) {
  if (!SpeechRec) {
    toast('Voice typing isn’t supported in this browser. Try Safari or Chrome.');
    return;
  }
  if (rec) { // tapping the mic again stops listening
    const wasThis = btn.classList.contains('listening');
    try { rec.stop(); } catch { /* ignore */ }
    if (wasThis) return;
  }

  const r = new SpeechRec();
  r.lang = navigator.language || 'en-US';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;

  const before = input.value.trim();
  const placeholder = input.placeholder;

  r.onresult = (e) => {
    let said = '';
    for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
    said = said.trim();
    if (!before && said) said = said[0].toUpperCase() + said.slice(1);
    input.value = cleanText(before ? `${before} ${said}` : said);
  };
  r.onerror = (e) => {
    const msg = {
      'not-allowed': 'Microphone is blocked. Allow it for this site in Safari → Settings → Websites → Microphone.',
      'service-not-allowed': 'Voice typing is off. Turn on Dictation in System Settings → Keyboard.',
      'no-speech': 'Didn’t hear anything — tap the mic and try again.',
      'audio-capture': 'No microphone found.',
      'network': 'Voice typing needs an internet connection.',
    }[e.error];
    if (msg) toast(msg);
  };
  r.onend = () => {
    if (rec === r) rec = null;
    btn.classList.remove('listening');
    btn.setAttribute('aria-pressed', 'false');
    input.placeholder = placeholder;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  };

  try {
    r.start();
  } catch {
    toast('Couldn’t start the microphone. Try again.');
    return;
  }
  rec = r;
  btn.classList.add('listening');
  btn.setAttribute('aria-pressed', 'true');
  input.placeholder = 'Listening… say your to-do';
}

/* ---------- Sky (changes with the time of day) ---------- */
const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const previewPhase = PHASES.includes(new URLSearchParams(location.search).get('sky'))
  ? new URLSearchParams(location.search).get('sky')
  : null;

function phaseOf(hr) {
  if (hr >= 5 && hr < 12) return 'morning';
  if (hr >= 12 && hr < 17) return 'afternoon';
  if (hr >= 17 && hr < 20) return 'evening';
  return 'night';
}
const currentPhase = () => previewPhase || phaseOf(new Date().getHours());

function applyPhase() {
  const p = currentPhase();
  if (document.documentElement.dataset.phase !== p) document.documentElement.dataset.phase = p;
}

function makeStars() {
  const box = $('#stars');
  const W = Math.max(screen.width || 0, innerWidth, 1600);
  const H = Math.max(screen.height || 0, innerHeight, 1000);
  // [how many, size in px, twinkle speed]
  for (const [count, size, dur] of [[170, 1, 4.5], [70, 1.6, 6.5], [22, 2.4, 3.2]]) {
    const dots = [];
    for (let i = 0; i < count; i++) {
      const x = Math.round(Math.random() * W);
      const y = Math.round(Math.random() * H * 0.8); // keep stars above the hills
      const a = (0.45 + Math.random() * 0.55).toFixed(2);
      dots.push(`${x}px ${y}px ${size > 2 ? '3px' : '0'} rgba(255,255,255,${a})`);
    }
    box.append(h('div', {
      class: 'star-layer',
      style: `width:${size}px;height:${size}px;box-shadow:${dots.join(',')};animation-duration:${dur}s;animation-delay:-${(Math.random() * dur).toFixed(1)}s`,
    }));
  }
}

function makeClouds() {
  const box = $('#clouds');
  // top position, size, seconds to cross the sky, where it starts, resting spot (reduced motion)
  const CLOUDS = [
    { top: 6, s: 0.9, dur: 260, at: 0.15, x0: 8 },
    { top: 18, s: 0.55, dur: 200, at: 0.55, x0: 62 },
    { top: 30, s: 1.1, dur: 340, at: 0.8, x0: 70 },
    { top: 44, s: 0.7, dur: 240, at: 0.35, x0: -10 },
    { top: 58, s: 0.5, dur: 190, at: 0.02, x0: 40 },
  ];
  CLOUDS.forEach((c, i) => {
    const f = (n) => `filter:url(#cloud-${((i + n) % 3) + 1})`;
    box.append(h('div', {
      class: 'cloud',
      style: `top:${c.top}vh;--s:${c.s};--dur:${c.dur}s;--delay:-${Math.round(c.at * c.dur)}s;--x0:${c.x0}vw`,
    },
    h('div', { class: 'puff base', style: f(0) }),
    h('div', { class: 'puff shade', style: f(1) }),
    h('div', { class: 'puff top', style: f(2) })));
  });
}

function shootingStars() {
  const next = 7000 + Math.random() * 16000;
  setTimeout(() => {
    if (currentPhase() === 'night' && !document.hidden && !reducedMotion()) {
      const s = h('div', { class: 'shooting', style: `left:${30 + Math.random() * 65}vw;top:${3 + Math.random() * 35}vh` }, h('i'));
      $('#sky').insertBefore(s, $('.sun'));
      setTimeout(() => s.remove(), 1500);
    }
    shootingStars();
  }, next);
}

applyPhase();
makeStars();
makeClouds();
shootingStars();

/* ---------- Settings ---------- */
const SETTINGS_KEY = 'todos.settings.v1';
const settings = (() => {
  const defaults = { music: true, volume: 0.5 };
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      music: typeof s.music === 'boolean' ? s.music : defaults.music,
      volume: typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : defaults.volume,
    };
  } catch {
    return defaults;
  }
})();

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* not critical */ }
}

/* ---------- Background music (shuffled, loops forever) ---------- */
const TRACKS = [
  { src: 'music/lavender.mp3', title: 'Lavender' },
  { src: 'music/open-sky.mp3', title: 'Open Sky' },
  { src: 'music/flowers.mp3', title: 'Flowers' },
];
const audio = new Audio();
audio.preload = 'auto';
let queue = [];
let track = null;
let failures = 0;

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextTrack() {
  if (!queue.length) {
    queue = shuffled(TRACKS);
    // never play the same song twice in a row
    if (track && queue[0] === track && queue.length > 1) queue.push(queue.shift());
  }
  track = queue.shift();
  audio.src = track.src;
  updateNowPlaying();
}

function playMusic() {
  if (!settings.music) return;
  if (!track) nextTrack();
  audio.volume = settings.volume;
  const p = audio.play();
  if (p) p.catch(() => { /* browser waits for a click first — handled by unlockAudio */ });
}

function setMusic(on) {
  settings.music = on;
  saveSettings();
  if (on) playMusic();
  else audio.pause();
  updateNowPlaying();
}

function nowPlayingText() {
  if (!settings.music) return 'Off';
  return track ? `Now playing: ${track.title}` : `Shuffling ${TRACKS.length} songs`;
}

function updateNowPlaying() {
  const el = document.getElementById('now-playing');
  if (el) el.textContent = nowPlayingText();
}

audio.addEventListener('ended', () => { nextTrack(); playMusic(); });
audio.addEventListener('playing', () => { failures = 0; document.body.classList.add('music-playing'); });
audio.addEventListener('pause', () => document.body.classList.remove('music-playing'));
audio.addEventListener('error', () => {
  document.body.classList.remove('music-playing');
  if (++failures < TRACKS.length) { nextTrack(); playMusic(); } // skip a broken file, but don't loop forever
});

// Browsers only allow sound after the user clicks or types something.
function unlockAudio(e) {
  if (e.target instanceof Element && e.target.closest('[data-music-switch]')) return;
  if (settings.music && audio.paused) playMusic();
}
document.addEventListener('pointerdown', unlockAudio, true);
document.addEventListener('keydown', unlockAudio, true);

function openSettings() {
  const sw = h('button', {
    type: 'button',
    class: 'switch',
    role: 'switch',
    'data-music-switch': true,
    'aria-checked': String(settings.music),
    'aria-label': 'Music',
    onclick: () => {
      setMusic(!settings.music);
      sw.setAttribute('aria-checked', String(settings.music));
      volRow.classList.toggle('disabled', !settings.music);
    },
  });
  const vol = h('input', {
    type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.volume), 'aria-label': 'Music volume',
    oninput: () => { settings.volume = Number(vol.value); audio.volume = settings.volume; saveSettings(); },
  });
  const volRow = h('div', { class: `setting${settings.music ? '' : ' disabled'}` },
    h('span', { class: 'ico', 'aria-hidden': 'true' }, '🔊'),
    vol,
    h('button', { type: 'button', class: 'small-btn', onclick: () => { nextTrack(); playMusic(); } }, 'Next song'));

  openSheet((inner) => inner.append(
    h('h3', {}, 'Settings'),
    h('p', { class: 'sheet-sub' }, 'Make to-dos feel like yours.'),
    h('div', { class: 'setting' },
      h('span', { class: 'ico', 'aria-hidden': 'true' }, '🎵'),
      h('span', { class: 'lbl' }, 'Music', h('small', { id: 'now-playing' }, nowPlayingText())),
      sw),
    volRow,
    footer(h('button', { type: 'button', class: 'btn primary', onclick: closeSheet }, 'Done')),
  ));
}

$('#settings-btn').addEventListener('click', openSettings);

/* ---------- Wiring ---------- */
function setupComposer(form, getDate) {
  const input = form.querySelector('input');
  const mic = form.querySelector('.mic');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    stopVoice();
    const text = cleanText(input.value);
    if (!text) { shake(input); return; }
    addTodo(text, getDate());
    input.value = '';
    input.focus();
  });
  mic.addEventListener('click', () => startVoice(input, mic));
}

setupComposer($('#today-form'), () => today);
setupComposer($('#plan-form'), () => planDate);

document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

// Press "/" to jump to the add box
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || sheet.open) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  e.preventDefault();
  currentSection().querySelector('.composer input').focus();
});

// Keep "today" correct: re-check the date every few seconds and when the app comes back.
function checkDay() {
  applyPhase();
  const t = todayKey();
  if (t !== today) {
    today = t;
    render();
  } else {
    $('#greeting').textContent = greeting();
  }
}
setInterval(checkDay, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
window.addEventListener('focus', checkDay);

// Stay in sync if the app is open in two windows
window.addEventListener('storage', (e) => {
  if (e.key === STORE_KEY) { todos = load(); render(); }
});

/* ---------- Splash ---------- */
const splash = $('#splash');
const SPLASH_MIN = 2200; // clicks can't skip it before this
const SPLASH_TIME = 4400; // then it closes by itself
const splashStart = Date.now();

(function goldDust() {
  const box = $('#splash-dust');
  for (let i = 0; i < 28; i++) {
    const size = (1 + Math.random() * 2.2).toFixed(1);
    const dur = (6 + Math.random() * 6).toFixed(1);
    box.append(h('span', {
      style: `left:${(Math.random() * 100).toFixed(1)}%;top:${(45 + Math.random() * 55).toFixed(1)}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:-${(Math.random() * dur).toFixed(1)}s`,
    }));
  }
})();

function hideSplash() {
  if (!splash || splash.classList.contains('hide')) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 1000);
  $('#today-input').focus({ preventScroll: true });
}
splash.addEventListener('click', () => { if (Date.now() - splashStart >= SPLASH_MIN) hideSplash(); });
setTimeout(hideSplash, SPLASH_TIME);

/* ---------- Offline support ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
playMusic();
