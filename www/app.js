/* ============================================================
   Интерфейс
   ============================================================ */

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const REMINDERS = [
  { v: null, l: 'Нет' },
  { v: 0,    l: 'Вовремя' },
  { v: 5,    l: 'За 5 мин' },
  { v: 15,   l: 'За 15 мин' },
  { v: 30,   l: 'За 30 мин' },
  { v: 60,   l: 'За час' },
  { v: 120,  l: 'За 2 часа' },
  { v: 1440, l: 'За день' }
];

const MAX_REPEAT_DATES = 366;

const APP_META = {
  name: 'Галка',
  fullName: 'Галка: Планы и заметки',
  slogan: 'Не забудь про галочку!',
  developer: 'Феофилакт Птахен',
  category: 'Планировщик / Производительность',
  description: '«Галка» — простой и удобный планировщик для задач, заметок и важных дел. Пользователь может записывать планы на сегодня или любую другую дату, создавать заметки, устанавливать напоминания и отмечать выполненные задачи галочкой. Главная идея приложения — собрать всё важное в одном месте без перегруженного интерфейса и лишней сложности.',
  principle: 'записал → не забыл → сделал → поставил галочку'
};

/**
 * Куда собирается приложение.
 *
 * 'github' — раздача файлом, есть проверка обновлений.
 * 'store'  — сборка для магазина: раздел обновлений скрыт. Магазины
 *            запрещают приложениям обновлять себя в обход магазина,
 *            обновления там раздаёт сам магазин.
 */
const DISTRIBUTION = 'store';

const APP_LINKS = {
  support: 'https://pay.cloudtips.ru/p/d90ce98a',
  // raw.githubusercontent отдаёт разрешающий заголовок CORS,
  // поэтому запрос из приложения проходит без прокси.
  updateManifest: 'https://raw.githubusercontent.com/ovnanime/galka/main/update.json'
};

/* ---------- состояние экрана ---------- */

let cursor    = new Date();        // показываемый месяц
let selected  = DT.today();        // выбранный день
let collapsed = false;             // календарь свёрнут до одной недели
const showDone = true;
let listMode  = 'sections';   // подхватывается из настроек при запуске
const expandedGroups = new Set();   // какие задачи развёрнуты по дням
let sectionFilter = null;           // null = выбраны все разделы
let draft     = null;              // редактируемая задача
let draftProj = null;              // редактируемый раздел
let viewHistory = ['v-cal'];
let settingsStandalone = true;     // настройки открыли сами, а не из редактора текста
let dayMode = 'once';
// Границы диапазона держим в состоянии: системных полей ввода больше нет
let dayRange = { start: DT.today(), end: DT.today() };

let pickMonth = new Date();        // месяц в выборе дней
let picked    = new Set();         // выбранные дни
let jumpYear  = new Date().getFullYear();   // год в окне перехода по датам

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function plural(n, one, few, many) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), 2400);
}

const ICON = {
  plus:  '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  bell:  '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 01-3.4 0"/></svg>',
  cal:   '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>',
  edit:  '<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  chev:  '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  gear:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.1"/><path d="M18.7 14.6a1.6 1.6 0 00.3 1.8 1.9 1.9 0 11-2.6 2.6 1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5 1.9 1.9 0 11-3.8 0 1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3 1.9 1.9 0 11-2.6-2.6 1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1 1.9 1.9 0 110-3.8 1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8 1.9 1.9 0 112.6-2.6 1.6 1.6 0 001.8.3h.1a1.6 1.6 0 001-1.5 1.9 1.9 0 113.8 0 1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3 1.9 1.9 0 112.6 2.6 1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1 1.9 1.9 0 110 3.8 1.6 1.6 0 00-1.5 1z"/></svg>',
  info:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.2h.01"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.7a5.5 5.5 0 00-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 000-7.8z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5M18.2 9A7 7 0 006.8 6.8L4 11M5.8 15A7 7 0 0017.2 17.2L20 13"/></svg>',
  battery: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="17" height="12" rx="2"/><path d="M20 10h2v4h-2M11 8.5L8.5 13H12l-1 3.5 4.5-6H12z"/></svg>',
  collapse: '<svg viewBox="0 0 24 24"><path d="M7 13l5-5 5 5M6 19h12"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path d="M7 11l5 5 5-5M6 5h12"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l1 12.2h9l1-12.2M10 11v5M14 11v5"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7.5 10.5L12 15l4.5-4.5M4 20h16"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5M4 20h16"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M10 14v6"/></svg>'
};

/* ============================================================
   Тема
   ============================================================ */

function currentTheme() {
  const t = Store.state.settings.theme;
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return t === 'system' ? (sysDark ? 'dark' : 'light') : t;
}

const hexAlpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

function applyTheme() {
  const real = currentTheme();
  const root = document.documentElement;
  root.setAttribute('data-theme', real);

  // Цвет акцента задаётся поверх темы: --accent-ink остаётся из темы,
  // поэтому подпись на цветной кнопке читается при любом выборе.
  const accent = accentByKey(Store.state.settings.accent);
  const color = real === 'dark' ? accent.dark : accent.light;
  root.style.setProperty('--accent', color);
  root.style.setProperty('--accent-sfc', hexAlpha(color, real === 'dark' ? 0.18 : 0.12));
}

/* ============================================================
   Календарь
   ============================================================ */

function renderWeekdays() {
  const html = WEEKDAYS.map((d, i) => `<span class="${i >= 5 ? 'we' : ''}">${d}</span>`).join('');
  $('#weekdays').innerHTML = html;
  $('#pickWd').innerHTML = html;
}

function dotsFor(dateStr) {
  const tasks = Store.forDate(dateStr);
  if (!tasks.length) return '';
  const seen = new Map();
  for (const t of tasks) {
    const c = Store.colorOf(t);
    if (!seen.has(c)) seen.set(c, true);
    if (!t.done) seen.set(c, false);      // false = остались незакрытые
  }
  return Array.from(seen.entries())
    .slice(0, 3)
    .map(([c, allDone]) => `<i class="${allDone ? 'done' : ''}" style="--c:${c}"></i>`)
    .join('');
}

function monthCells(base, selectedKey, opts = {}) {
  const y = base.getFullYear(), m = base.getMonth();
  const first = new Date(y, m, 1);
  const dow = (first.getDay() + 6) % 7;           // понедельник = 0
  const start = new Date(y, m, 1 - dow);
  const today = DT.today();
  const out = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    out.push({
      key: DT.ymd(date),
      num: date.getDate(),
      out: date.getMonth() !== m,
      we: i % 7 >= 5,
      today: DT.ymd(date) === today,
      sel: DT.ymd(date) === selectedKey
    });
  }
  return out;
}

function renderMonth() {
  $('#monthLabel').textContent = cap(DT.monthLabel(cursor));
  const cells = monthCells(cursor, selected);

  let html = '', selWeek = 0;
  cells.forEach((c, i) => {
    if (i % 7 === 0) html += '<div class="week">';
    if (c.sel) selWeek = Math.floor(i / 7);

    const cls = ['cell'];
    if (c.out) cls.push('out');
    if (c.we) cls.push('we');
    if (c.today) cls.push('today');
    if (c.sel) cls.push('sel');

    html += `<button class="${cls.join(' ')}" data-date="${c.key}">
      <span class="num">${c.num}</span>
      <span class="dots">${dotsFor(c.key)}</span>
    </button>`;
    if (i % 7 === 6) html += '</div>';
  });

  $('#weeks').innerHTML = html;
  $('#month').style.setProperty('--selweek', selWeek);
}

function setCollapsed(value) {
  collapsed = value;
  $('#month').classList.toggle('collapsed', collapsed);
  const button = $('#collapseBtn');
  button.innerHTML = collapsed ? ICON.expand : ICON.collapse;
  button.setAttribute('aria-label', collapsed ? 'Развернуть календарь' : 'Свернуть календарь');
}

/* ---------- переход к произвольной дате ---------- */

function renderJump() {
  const now = new Date();
  const thisYear = now.getFullYear();
  const from = Math.min(thisYear, jumpYear) - 10;
  const to = Math.max(thisYear, jumpYear) + 10;

  let years = '';
  for (let y = from; y <= to; y++) {
    const cls = ['year-btn'];
    if (y === jumpYear) cls.push('on');
    if (y === thisYear) cls.push('now');
    years += `<button class="${cls.join(' ')}" data-year="${y}">${y}</button>`;
  }
  $('#yearStrip').innerHTML = years;

  const curYear = cursor.getFullYear(), curMonth = cursor.getMonth();
  $('#monthGrid').innerHTML = MONTHS.map((name, i) => {
    const cls = ['month-cell'];
    if (jumpYear === curYear && i === curMonth) cls.push('on');
    if (jumpYear === thisYear && i === now.getMonth()) cls.push('now');
    return `<button class="${cls.join(' ')}" data-month="${i}">${name}</button>`;
  }).join('');
}

function openJumpSheet() {
  jumpYear = cursor.getFullYear();
  renderJump();
  showSheet('#jumpSheet');
  setTimeout(() => {
    $('#yearStrip .year-btn.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, 80);
}

function jumpTo(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(DT.parse(selected).getDate(), lastDay);
  cursor = new Date(year, month, 1);
  selected = DT.ymd(new Date(year, month, day));
  setCollapsed(false);
  renderMonth();
  renderAgenda();
  closeSheets();
}

/* ---------- карточка задачи в ленте дня ---------- */

/**
 * Заметка в карточке.
 *
 * Строки-пункты становятся галочками, по которым можно ткнуть прямо из
 * списка, не открывая редактор. Остальные строки остаются обычным текстом:
 * заметка не обязана быть списком целиком.
 */
function noteBlock(groupId, note) {
  const lines = Store.noteLines(note);
  if (!lines.length) return '';

  // Строка выводится своим тегом: заголовок остаётся заголовком, цитата
  // цитатой, список списком. Пункт с галочкой — единственное, что рисуется
  // по-своему: ему нужен квадратик и обработчик нажатия.
  let idx = -1;
  return `<div class="t-list">${lines.map(l => {
    const html = linksInMarkup(l.html);
    if (l.item) {
      idx++;
      return `<div class="t-item ${l.done ? 'done' : ''} ${l.cls}" data-noteitem="${groupId}:${idx}"
        role="checkbox" tabindex="0" aria-checked="${l.done}">
        <span class="t-item-box">${ICON.check}</span><span class="t-item-text">${html}</span>
      </div>`;
    }
    if (l.tag === 'HR') return '<hr>';
    if (!html.trim() || html === '<br>') return '';
    const tag = l.tag === 'DIV' ? 'div' : l.tag.toLowerCase();
    const cls = l.tag === 'DIV' ? `t-list-text ${l.cls}` : l.cls;
    return `<${tag}${cls.trim() ? ` class="${cls.trim()}"` : ''}>${html}</${tag}>`;
  }).join('')}</div>`;
}


/** Заменяет ссылки в разметке строки на их вид для карточки */
function linksInMarkup(html) {
  if (typeof document === 'undefined' || html.indexOf('<a') < 0) return html;
  const box = document.createElement('div');
  box.innerHTML = html;
  Array.from(box.querySelectorAll('a')).forEach(a => {
    const tmp = document.createElement('div');
    tmp.innerHTML = linkMarkup(a);
    a.replaceWith(tmp.firstElementChild || document.createTextNode(a.textContent));
  });
  return box.innerHTML;
}




const emptyBlock = (title, sub) => `<div class="empty">
  <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M9 15h6"/></svg>
  <b>${title}</b><p>${sub}</p>
</div>`;

function renderAgenda() {
  const tasks = Store.forDate(selected);
  const left = tasks.filter(t => !t.done).length;
  const rel = DT.relLabel(selected);

  let html = `<div class="day-head">
    <b>${rel || cap(DT.dayLabel(selected))}</b>
    <span>${rel ? cap(DT.dayLabel(selected)) : (left ? `${left} открыто` : 'свободно')}</span>
  </div>`;

  if (!tasks.length) {
    html += emptyBlock('Пусто', 'Ни одной задачи на этот день');
  } else {
    const timed = tasks.filter(t => t.time);
    const untimed = tasks.filter(t => !t.time);
    html += timed.map(taskCard).join('');
    if (untimed.length) {
      if (timed.length) html += `<div class="group-label">Без времени</div>`;
      html += untimed.map(taskCard).join('');
    }
  }
  $('#agenda').innerHTML = html;
}

/* ============================================================
   Задачи: по разделам или в хронологическом порядке
   ============================================================ */

function listDateLabel(dateStr) {
  const rel = DT.relLabel(dateStr);
  if (rel) return rel;
  const d = DT.parse(dateStr);
  return cap(new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short', day: 'numeric', month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  }).format(d).replace(/\./g, ''));
}

const sectionKey = projectId => projectId == null ? 'none' : String(projectId);

function sectionOptions() {
  return Store.state.projects.map(p => ({
    key: String(p.id), name: p.name, color: p.color
  })).concat({ key: 'none', name: 'Без раздела', color: NO_PROJ_COLOR });
}

function normalizeSectionFilter(options) {
  if (sectionFilter === null) return;
  const valid = new Set(options.map(option => option.key));
  sectionFilter = new Set(Array.from(sectionFilter).filter(key => valid.has(key)));
  if (sectionFilter.size === valid.size) sectionFilter = null;
}

function sectionEnabled(projectId) {
  return sectionFilter === null || sectionFilter.has(sectionKey(projectId));
}

function renderSectionFilter(options) {
  const allOn = sectionFilter === null;
  let html = `<button class="chip ${allOn ? 'on' : ''}" style="--c:var(--accent)"
    data-section-filter="all" aria-pressed="${allOn}">Все</button>`;
  html += options.map(option => {
    const on = allOn || sectionFilter.has(option.key);
    return `<button class="chip ${on ? 'on' : ''}" style="--c:${option.color}"
      data-section-filter="${option.key}" aria-pressed="${on}"><i></i>${esc(option.name)}</button>`;
  }).join('');
  $('#sectionFilter').innerHTML = html;
}

function toggleSection(key) {
  const keys = sectionOptions().map(option => option.key);
  if (key === 'all') {
    sectionFilter = sectionFilter === null ? new Set() : null;
  } else {
    if (sectionFilter === null) sectionFilter = new Set(keys);
    if (sectionFilter.has(key)) sectionFilter.delete(key);
    else sectionFilter.add(key);
    if (sectionFilter.size === keys.length) sectionFilter = null;
  }
  renderList();
}

function occurrenceRow(t) {
  const late = !t.done && t.time && DT.at(t.date, t.time).getTime() < Date.now();
  return `<div class="occurrence ${t.done ? 'done' : ''}" data-list-task="${t.id}"
    role="checkbox" tabindex="0" aria-checked="${t.done}">
    <span class="occ-check">${ICON.check}</span>
    <span class="occ-date">${esc(listDateLabel(t.date))}</span>
    <span class="occ-time ${t.time ? (late ? 'late' : '') : 'none'}">${t.time || 'Без времени'}</span>
  </div>`;
}

/**
 * Карточка задачи в списке.
 *
 * Раскрывать её не нужно: даты подписаны строкой, а внутри задачи ничего,
 * кроме текста, нет. Справа две кнопки — шестерёнка ведёт в настройки
 * задачи, карандаш открывает текст.
 */
function groupCard(g) {
  const c = Store.projById(g.projectId)?.color || NO_PROJ_COLOR;
  const allDone = g.done === g.total;
  const visibleTasks = showDone ? g.tasks : g.tasks.filter(t => !t.done);
  if (!visibleTasks.length) return '';
  const expanded = expandedGroups.has(g.groupId);
  const many = g.total > 1;
  const bell = (g.time && g.reminder != null)
    ? `<span class="t-bell">${ICON.bell}${REMINDERS.find(r => r.v === g.reminder)?.l.replace('За ', '') || ''}</span>`
    : '';

  // Счётчика справа нет намеренно: он спорил со списком внутри задачи,
  // у которого свой счёт, и читался как головоломка.

  return `<article class="task-group ${allDone ? 'done' : ''} ${expanded ? 'expanded' : ''}" style="--c:${c}">
    <div class="task-group-head">
      ${many ? `<button class="group-chevron-btn" data-toggle-group="${g.groupId}"
        aria-expanded="${expanded}" aria-label="${expanded ? 'Свернуть дни' : 'Показать дни'}">
        <span class="group-chevron" aria-hidden="true">${ICON.chev}</span>
      </button>` : ''}
      <button class="task-group-toggle" data-opennote="${g.groupId}">
        <span class="t-main">
          <span class="t-title">${esc(g.title)}</span>
          <span class="t-meta">
          <span class="t-bell">${ICON.cal}${g.total} ${plural(g.total, 'день', 'дня', 'дней')}</span>
          ${bell}
          </span>
        </span>
      </button>
      <button class="task-edit" data-editgroup="${g.groupId}" aria-label="Настройки задачи">${ICON.gear}</button>
      <button class="task-edit" data-editnote="${g.groupId}" aria-label="Изменить текст">${ICON.edit}</button>
    </div>
    ${noteBlock(g.groupId, g.note)}
    ${many ? `<div class="occurrences-wrap" aria-hidden="${!expanded}">
      <div class="occurrences">${visibleTasks.map(occurrenceRow).join('')}</div>
    </div>` : ''}
  </article>`;
}


/**
 * Правая часть карточки: настройки и правка текста.
 *
 * Одинаковая во всех списках, чтобы рука привыкала к одному месту.
 * Карандаш открывает заметку сразу в правке, а нажатие по середине
 * карточки — на просмотр: смотрят чаще, чем правят.
 */
const cardTools = groupId => `
  <button class="task-edit" data-editgroup="${groupId}" aria-label="Настройки задачи">${ICON.gear}</button>
  <button class="task-edit" data-editnote="${groupId}" aria-label="Изменить текст">${ICON.edit}</button>`;

function taskCard(t) {
  const c = Store.colorOf(t);
  const proj = Store.projById(t.projectId);
  const late = !t.done && t.time && DT.at(t.date, t.time).getTime() < Date.now();

  const bell = (t.time && t.reminder != null)
    ? `<span class="t-bell">${ICON.bell}${
        REMINDERS.find(r => r.v === t.reminder)?.l.replace('За ', '') || ''}</span>`
    : '';

  return `<div class="task ${t.done ? 'done' : ''}" style="--c:${c}">
    <button class="check" data-check="${t.id}" aria-label="Отметить">${ICON.check}</button>
    <button class="t-body" data-opennote="${t.groupId}">
      <span class="t-main">
        <span class="t-title">${esc(t.title)}</span>
        ${(proj || bell) ? `<span class="t-meta">
          ${proj ? `<span class="t-proj" style="--c:${c}">${esc(proj.name)}</span>` : ''}
          ${bell}
        </span>` : ''}
      </span>
      <span class="t-time ${t.time ? (late ? 'late' : '') : 'none'}">${t.time || '—'}</span>
    </button>
    ${cardTools(t.groupId)}
    ${noteBlock(t.groupId, t.note)}
  </div>`;
}

function orderedTaskCard(t) {
  const c = Store.colorOf(t);
  const proj = Store.projById(t.projectId);
  const late = !t.done && t.time && DT.at(t.date, t.time).getTime() < Date.now();
  return `<div class="task ordered-task ${t.done ? 'done' : ''}" style="--c:${c}">
    <button class="check" data-check="${t.id}" aria-label="Отметить">${ICON.check}</button>
    <button class="t-body" data-opennote="${t.groupId}">
      <span class="t-main">
        <span class="t-title">${esc(t.title)}</span>
        ${proj ? `<span class="t-meta"><span class="t-proj" style="--c:${c}">${esc(proj.name)}</span></span>` : ''}
      </span>
      <span class="t-time ${t.time ? (late ? 'late' : '') : 'none'}">${t.time || '—'}</span>
    </button>
    ${cardTools(t.groupId)}
  </div>`;
}


function renderListBySections() {
  const all = Store.groups().filter(g =>
    (showDone || g.done < g.total) && sectionEnabled(g.projectId));
  const byProj = new Map();
  all.forEach(g => {
    const key = g.projectId ?? 'none';
    if (!byProj.has(key)) byProj.set(key, []);
    byProj.get(key).push(g);
  });
  const order = Store.state.projects.map(p => p.id).filter(id => byProj.has(id));
  if (byProj.has('none')) order.push('none');
  let html = '';
  order.forEach(key => {
    const list = byProj.get(key).sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
    const proj = key === 'none' ? null : Store.projById(key);
    const open = list.reduce((n, g) => n + (g.total - g.done), 0);
    html += `<div class="sect-head" style="--c:${proj?.color || NO_PROJ_COLOR}">
      <i></i><b>${esc(proj?.name || 'Без раздела')}</b>
      <span>${open ? `${open} ${plural(open, 'открыта', 'открыто', 'открыто')}` : 'всё закрыто'}</span>
    </div>`;
    html += list.map(groupCard).join('');
  });
  return html;
}

function renderListByDate() {
  const tasks = Store.state.tasks.filter(t =>
    (showDone || !t.done) && sectionEnabled(t.projectId)).slice()
    .sort((a, b) => a.date.localeCompare(b.date) ||
      (a.time || '99:99').localeCompare(b.time || '99:99') || a.createdAt - b.createdAt);
  const openByDay = new Map();
  tasks.forEach(t => openByDay.set(t.date, (openByDay.get(t.date) || 0) + (t.done ? 0 : 1)));
  let html = '', day = null;
  tasks.forEach(t => {
    if (t.date !== day) {
      day = t.date;
      const open = openByDay.get(day);
      html += `<div class="date-head"><b>${esc(listDateLabel(day))}</b><span>${open ? `${open} открыто` : 'всё закрыто'}</span></div>`;
    }
    html += orderedTaskCard(t);
  });
  return html;
}

function renderList() {
  const options = sectionOptions();
  normalizeSectionFilter(options);
  renderSectionFilter(options);
  let html = listMode === 'sections' ? renderListBySections() : renderListByDate();
  if (!html && sectionFilter !== null) {
    html = sectionFilter.size
      ? emptyBlock('Ничего нет', 'В выбранных разделах нет задач')
      : emptyBlock('Разделы не выбраны', 'Выберите один или несколько разделов выше');
  } else if (!html) {
    html = emptyBlock(showDone ? 'Ничего нет' : 'Всё закрыто',
      showDone ? 'Задач пока не создано' : 'Ни одной открытой задачи');
  }
  $('#listBody').innerHTML = html;
  $$('[data-list-mode]').forEach(button => {
    const on = button.dataset.listMode === listMode;
    button.classList.toggle('on', on);
    button.setAttribute('aria-selected', String(on));
  });
}

/* ============================================================
   Настройки
   ============================================================ */

let permState = 'unknown', exactState = 'unknown', pendingCount = null;
let notifEnabled = null;
let remindersChannel = { enabled: null, importance: null, sound: null, vibration: null };
let digestChannel = { enabled: null, importance: null, sound: null, vibration: null };
let batteryExempt = null;
let appVersion = { name: '1.0.0', code: 1 };
let pendingImport = null;      // разобранный файл, ждущий подтверждения

const reminderLabel = value => REMINDERS.find(r => r.v === value)?.l ?? 'Нет';

function notifRow(key, title, sub) {
  const s = Store.state.settings[key];
  return `<div class="row">
    <div class="lbl"><b>${title}</b><small>${sub}</small></div>
    <button type="button" class="value-btn" data-time="${key}" ${s.on ? '' : 'disabled'}>${s.time}</button>
    <label>
      <input type="checkbox" class="sw" data-on="${key}" ${s.on ? 'checked' : ''}>
      <i class="sw-track"></i>
    </label>
  </div>`;
}

/** Подписи для пунктов «При запуске» */
const startViewLabel = () =>
  Store.state.settings.startView === 'v-list' ? 'Задачи' : 'Календарь';
const startListLabel = () =>
  Store.state.settings.startListMode === 'date' ? 'По порядку' : 'По разделам';

function notificationChannelLabel(channel) {
  if (channel.enabled === false) return 'Канал отключён в Android';
  if (channel.importance == null) return 'Звук, вибрация и показ сверху';

  const parts = [];
  if (Number(channel.importance) >= 4) parts.push('показ сверху');
  if (channel.sound === true) parts.push('звук');
  if (channel.vibration === true) parts.push('вибрация');
  return parts.length ? `Включены: ${parts.join(', ')}` : 'Откройте системные параметры канала';
}

function renderSettings() {
  const st = Store.state;
  const t = st.settings.theme;
  const real = currentTheme();

  const permLabel = permState === 'granted' ? 'Разрешены'
    : permState === 'denied' ? 'Запрещены в Android' : 'Нужно разрешение';
  const exactLabel = exactState === 'granted' ? 'Разрешено'
    : exactState === 'denied' ? 'Запрещено' : 'Нужно разрешение';
  const notificationsReady = permState === 'granted' && notifEnabled !== false &&
    remindersChannel.enabled !== false;
  const batteryLabel = batteryExempt === true ? 'Ограничения сняты'
    : batteryExempt === false ? 'Откройте при задержках уведомлений'
    : 'Статус недоступен';
  const remindersChannelLabel = notificationChannelLabel(remindersChannel);
  const digestChannelLabel = notificationChannelLabel(digestChannel);
  $('#setBody').innerHTML = `
    <div class="sect">
      <h2>Оформление</h2>
      <div class="seg">
        ${[['dark', 'Тёмная'], ['light', 'Светлая'], ['system', 'Системная']]
          .map(([v, l]) => `<button class="${t === v ? 'on' : ''}" data-set-theme="${v}">${l}</button>`).join('')}
      </div>
      <div class="accent-row">
        ${ACCENTS.map(a => `<button class="accent-dot ${st.settings.accent === a.key ? 'on' : ''}"
          style="--c:${real === 'dark' ? a.dark : a.light}"
          data-accent="${a.key}" aria-label="${a.name}"></button>`).join('')}
      </div>
    </div>

    <div class="sect">
      <h2>При запуске</h2>
      <div class="card">
        <div class="row">
          <div class="lbl"><b>Открывать</b><small>Страница при запуске</small></div>
          <button type="button" class="value-btn" data-startview>${startViewLabel()}</button>
          <span class="sw-placeholder" aria-hidden="true"></span>
        </div>
        <div class="row">
          <div class="lbl"><b>Задачи показывать</b><small>Вид списка задач</small></div>
          <button type="button" class="value-btn" data-startlist>${startListLabel()}</button>
          <span class="sw-placeholder" aria-hidden="true"></span>
        </div>
      </div>
    </div>

    <div class="sect">
      <h2>Разделы</h2>
      <div class="card">
        ${st.projects.map(p => {
          const open = st.tasks.filter(x => x.projectId === p.id && !x.done).length;
          const total = st.tasks.filter(x => x.projectId === p.id).length;
          return `<button type="button" class="row tap setting-action" data-editproj="${p.id}">
            <span class="dotcol" style="--c:${p.color}"></span>
            <div class="lbl"><b>${esc(p.name)}</b>
              ${p.description ? `<small class="project-description">${esc(p.description)}</small>` : ''}
              <small>${open} открыто · ${total} всего</small></div>
            <span class="setting-chevron">${ICON.chev}</span>
          </button>`;
        }).join('')}
        <button type="button" class="row tap setting-action" data-newproj>
          <span class="dotcol" style="--c:var(--faint)"></span>
          <div class="lbl"><b class="accent-label">Новый раздел</b><small>Название, описание и цвет</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
      </div>
    </div>

    <div class="sect">
      <h2>Уведомления</h2>
      <div class="card">
        <button type="button" class="row tap setting-action" data-notif-permission>
          <span class="setting-icon">${ICON.bell}</span>
          <div class="lbl"><b>Разрешение на уведомления</b>
            <small>${notifEnabled === false ? 'Отключены в настройках Android' : permLabel}</small></div>
          <span class="setting-value ${notificationsReady ? 'ok' : 'warn'}">${notificationsReady ? 'Настроить' : 'Разрешить'}</span>
        </button>
        <button type="button" class="row tap setting-action" data-notif-channel="reminders">
          <span class="setting-icon">${ICON.sliders}</span>
          <div class="lbl"><b>Напоминания о задачах</b><small>${remindersChannelLabel}</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
        <button type="button" class="row tap setting-action" data-notif-channel="digest">
          <span class="setting-icon">${ICON.sliders}</span>
          <div class="lbl"><b>Сводки за день</b><small>${digestChannelLabel}</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
        <button type="button" class="row tap setting-action" data-askexact>
          <span class="setting-icon">${ICON.cal}</span>
          <div class="lbl"><b>Точное время срабатывания</b><small>Для напоминаний минута в минуту</small></div>
          <span class="setting-value ${exactState === 'granted' ? 'ok' : 'warn'}">${exactLabel}</span>
        </button>
        <button type="button" class="row tap setting-action" data-battery>
          <span class="setting-icon">${ICON.battery}</span>
          <div class="lbl"><b>Энергосбережение</b><small>${batteryLabel}</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
        <button type="button" class="row tap setting-action" data-app-settings>
          <span class="setting-icon">${ICON.sliders}</span>
          <div class="lbl"><b>Все системные настройки</b><small>Разрешения, батарея и данные приложения</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
      </div>
    </div>

    <div class="sect">
      <h2>Когда напоминать</h2>
      <div class="card notif-when">
        ${notifRow('morning', 'Список на день', 'Все задачи на сегодня')}
        ${notifRow('untimed', 'Задачи без времени', 'Где время не задано')}
        ${notifRow('overdue', 'Что осталось', 'Сколько не закрыто')}
        <div class="row">
          <div class="lbl"><b>По умолчанию</b><small>Для новых задач</small></div>
          <button type="button" class="value-btn" data-defrem>${reminderLabel(st.settings.defaultReminder)}</button>
          <span class="sw-placeholder" aria-hidden="true"></span>
        </div>
      </div>
    </div>

    <div class="sect">
      <h2>Проверка</h2>
      <button type="button" class="wide-btn" data-test>Прислать проверочное уведомление</button>
    </div>

    <div class="sect">
      <h2>Данные</h2>
      <div class="card">
        <button type="button" class="row tap setting-action" data-export>
          <span class="setting-icon">${ICON.download}</span>
          <div class="lbl"><b>Экспорт</b><small>Сохранить всё в файл</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
        <button type="button" class="row tap setting-action" data-import>
          <span class="setting-icon">${ICON.upload}</span>
          <div class="lbl"><b>Импорт</b><small>Загрузить из файла</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
        <button type="button" class="row tap setting-action" data-wipe>
          <span class="setting-icon danger-icon">${ICON.trash}</span>
          <div class="lbl"><b class="danger-label">Удалить все данные</b><small>Сначала сохранит копию</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
      </div>
    </div>

    <div class="sect utility-section">
      <h2>Дополнительно</h2>
      <div class="card">
        <button type="button" class="row tap setting-action" data-about>
          <span class="setting-icon">${ICON.info}</span>
          <div class="lbl"><b>О приложении</b><small>${esc(APP_META.fullName)} · версия ${esc(appVersion.name)}</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
        <button type="button" class="row tap setting-action" data-support>
          <span class="setting-icon">${ICON.heart}</span>
          <div class="lbl"><b>Поддержка</b><small>Донаты и поддержка проекта</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>
        ${DISTRIBUTION === 'store' ? '' : `
        <button type="button" class="row tap setting-action" data-update>
          <span class="setting-icon">${ICON.refresh}</span>
          <div class="lbl"><b>Проверить обновление</b><small>Установлена версия ${esc(appVersion.name)}</small></div>
          <span class="setting-chevron">${ICON.chev}</span>
        </button>`}
      </div>
    </div>
  `;
}

async function refreshNotifState() {
  const status = await Notify.status();
  permState = status.permission;
  exactState = status.exact;
  pendingCount = status.pending;
  notifEnabled = status.enabled;
  batteryExempt = status.batteryExempt ?? null;
  remindersChannel = {
    enabled: status.remindersChannelEnabled ?? null,
    importance: status.remindersChannelImportance ?? null,
    sound: status.remindersChannelSound ?? null,
    vibration: status.remindersChannelVibration ?? null
  };
  digestChannel = {
    enabled: status.digestChannelEnabled ?? null,
    importance: status.digestChannelImportance ?? null,
    sound: status.digestChannelSound ?? null,
    vibration: status.digestChannelVibration ?? null
  };
  if (status.versionName) appVersion.name = String(status.versionName);
  if (Number.isFinite(Number(status.versionCode))) appVersion.code = Number(status.versionCode);
}

function ensureSettingsMarkup() {
  const projectBody = $('#projSheet .sheet-body');
  const projectName = $('#pName');
  const palette = $('#palette');

  if (projectBody && projectName && !$('#pDescription')) {
    const description = document.createElement('textarea');
    description.className = 'note-input';
    description.id = 'pDescription';
    description.placeholder = 'Описание раздела (необязательно)';
    description.rows = 2;
    projectName.insertAdjacentElement('afterend', description);
  }

  if (projectBody && palette && !$('#projectDetails')) {
    const details = document.createElement('div');
    details.className = 'project-details hidden';
    details.id = 'projectDetails';
    details.innerHTML = `<div class="project-stats" id="projectStats"></div>
      <div class="field-label">Задачи раздела</div>
      <div class="project-tasks" id="projectTasks"></div>`;
    palette.insertAdjacentElement('afterend', details);
  }

  if (!$('#infoSheet')) {
    const sheet = document.createElement('div');
    sheet.className = 'sheet info-sheet';
    sheet.id = 'infoSheet';
    sheet.innerHTML = `<div class="sheet-grab"><span></span></div>
      <div class="sheet-head">
        <button class="sheet-cancel" id="infoClose">Закрыть</button>
        <span class="sheet-title" id="infoSheetTitle">О приложении</span>
        <span class="sheet-head-spacer" aria-hidden="true"></span>
      </div>
      <div class="sheet-body info-body" id="infoBody"></div>`;
    document.body.appendChild(sheet);
  }
}

function showInfoSheet(title, html) {
  $('#infoSheetTitle').textContent = title;
  $('#infoBody').innerHTML = html;
  showSheet('#infoSheet');
}

function openAbout() {
  showInfoSheet('О приложении', `
    <div class="info-hero">
      <b>${esc(APP_META.name)}</b>
      <span>${esc(APP_META.slogan)}</span>
      <small>Версия ${esc(appVersion.name)}</small>
    </div>
    <p class="info-copy">${esc(APP_META.description)}</p>
    <div class="info-list">
      <div><span>Полное название</span><b>${esc(APP_META.fullName)}</b></div>
      <div><span>Разработчик</span><b>${esc(APP_META.developer)}</b></div>
      <div><span>Категория</span><b>${esc(APP_META.category)}</b></div>
    </div>
  `);
}

function openSupport() {
  if (!APP_LINKS.support) {
    showInfoSheet('Поддержка', `<div class="info-state">
      ${ICON.heart}<b>Ссылка на поддержку пока не указана</b>
      <p>Раздел готов к работе. После добавления адреса здесь откроется страница донатов.</p>
    </div>`);
    return;
  }
  showInfoSheet('Поддержка', `<div class="info-state">
    ${ICON.heart}<b>Поддержать «Галку»</b>
    <p>Спасибо за помощь в развитии приложения.</p>
    <button class="info-action" data-open-url="${esc(APP_LINKS.support)}">Открыть страницу поддержки</button>
  </div>`);
}

function showImportConfirm(counts) {
  const made = counts.exportedAt ? new Date(counts.exportedAt) : null;
  const madeLine = made && Number.isFinite(made.getTime())
    ? `Файл создан ${new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      }).format(made)}.`
    : '';

  showInfoSheet('Импорт расписаний', `<div class="info-state">
    ${ICON.upload}
    <b>${counts.tasks} ${plural(counts.tasks, 'задача', 'задачи', 'задач')} в файле</b>
    <p>${counts.groups} ${plural(counts.groups, 'запись', 'записи', 'записей')},
    ${counts.projects} ${plural(counts.projects, 'раздел', 'раздела', 'разделов')}. ${madeLine}</p>
    <button class="info-action" data-import-mode="merge">Добавить к текущим</button>
    <button class="info-action danger" data-import-mode="replace">Заменить всё</button>
  </div>`);
}

/** Приложение открыли файлом .galka из проводника */
async function checkOpenedFile() {
  const text = await Backup.openedFile();
  if (!text) return;
  const parsed = Store.readBundle(text);
  if (!parsed.ok) { toast(parsed.error); return; }
  pendingImport = parsed.bundle;
  showImportConfirm(parsed.counts);
}

function openWipeConfirm() {
  const counts = { tasks: Store.state.tasks.length, projects: Store.state.projects.length };
  showInfoSheet('Удаление всех данных', `<div class="info-state">
    ${ICON.trash}
    <b>${counts.tasks} ${plural(counts.tasks, 'запись', 'записи', 'записей')} и
    ${counts.projects} ${plural(counts.projects, 'раздел', 'раздела', 'разделов')}</b>
    <p>Копия сохранится в файл до удаления. Впишите слово <b>Подтверждаю</b>.</p>
    <input class="wipe-input" id="wipeWord" placeholder="Подтверждаю"
           autocomplete="off" autocapitalize="off" spellcheck="false">
    <button class="info-action danger" id="wipeGo" disabled>Удалить всё</button>
  </div>`);
  setTimeout(() => $('#wipeWord')?.focus(), 340);
}

async function checkForUpdates() {
  showInfoSheet('Проверка обновлений', `<div class="info-state loading">
    ${ICON.refresh}<b>Проверяем версию…</b><p>Это займёт несколько секунд.</p>
  </div>`);

  if (!APP_LINKS.updateManifest) {
    $('#infoBody').innerHTML = `<div class="info-state">
      ${ICON.refresh}<b>Источник обновлений пока не указан</b>
      <p>Установлена версия ${esc(appVersion.name)}. Проверка заработает после добавления адреса файла обновлений.</p>
    </div>`;
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    // cache: 'no-store' отключает кеш вебвью, но не кеш CDN GitHub —
    // тот держит файл несколько минут. Уникальный параметр обходит и его.
    const url = `${APP_LINKS.updateManifest}?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const latest = await response.json();
    const latestCode = Number(latest.versionCode);
    if (!Number.isFinite(latestCode)) throw new Error('В файле обновлений нет versionCode');

    if (latestCode > appVersion.code) {
      const download = latest.downloadUrl
        ? `<button class="info-action" data-open-url="${esc(latest.downloadUrl)}">Скачать обновление</button>` : '';
      $('#infoBody').innerHTML = `<div class="info-state update-ready">
        ${ICON.refresh}<b>Доступна версия ${esc(latest.versionName || String(latestCode))}</b>
        <p>${esc(latest.notes || 'Можно установить новую версию приложения.')}</p>${download}
      </div>`;
    } else {
      $('#infoBody').innerHTML = `<div class="info-state success">
        ${ICON.check}<b>У вас актуальная версия</b>
        <p>Установлена версия ${esc(appVersion.name)}.</p>
      </div>`;
    }
  } catch (error) {
    $('#infoBody').innerHTML = `<div class="info-state error">
      ${ICON.refresh}<b>Не удалось проверить обновление</b>
      <p>${esc(error?.name === 'AbortError' ? 'Сервер не ответил вовремя' : String(error?.message || error))}</p>
    </div>`;
  } finally {
    clearTimeout(timeout);
  }
}

/* ============================================================
   Выбор дней
   ============================================================ */

function renderPicker() {
  $('#pickLabel').textContent = cap(DT.monthLabel(pickMonth));
  $('#pickGrid').innerHTML = monthCells(pickMonth, null).map(c => {
    const cls = ['pick-day'];
    if (c.out) cls.push('out');
    if (c.we) cls.push('we');
    if (c.today) cls.push('today');
    if (picked.has(c.key)) cls.push('on');
    return `<button class="${cls.join(' ')}" data-pick="${c.key}">${c.num}</button>`;
  }).join('');
  updatePickCount();
}

function updatePickCount() {
  const n = picked.size;
  const el = $('#pickCount');
  if (n === 0) el.textContent = 'Ничего не выбрано';
  else if (n === 1) el.innerHTML = `Один день — <b>${DT.shortDay(Array.from(picked)[0])}</b>`;
  else el.innerHTML = `Выбрано <b>${n}</b> ${plural(n, 'день', 'дня', 'дней')}`;
  $('#pickClear').style.visibility = n ? 'visible' : 'hidden';
}

function applyPick(date, mode) {
  if (mode === 'add') picked.add(date); else picked.delete(date);
  const cell = $(`#pickGrid [data-pick="${date}"]`);
  if (cell) cell.classList.toggle('on', picked.has(date));
  updatePickCount();
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = DT.parse(value);
  return Number.isFinite(date.getTime()) && DT.ymd(date) === value;
}

function daysBetween(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function inferDayMode(dates) {
  const sorted = Array.from(new Set(dates)).sort();
  if (sorted.length <= 1) return 'once';
  const gaps = sorted.slice(1).map((date, index) => daysBetween(sorted[index], date));
  if (gaps.every(gap => gap === 1)) return 'daily';
  if (gaps.every(gap => gap === 7)) return 'weekly';
  return 'custom';
}

function collectDayDates(mode = dayMode) {
  if (mode === 'custom') {
    const dates = Array.from(picked).sort();
    return dates.length
      ? { dates, error: '' }
      : { dates: [], error: 'Выбери хотя бы один день' };
  }

  const start = dayRange.start;
  if (!validDateKey(start)) return { dates: [], error: 'Укажи дату' };
  if (mode === 'once') return { dates: [start], error: '' };

  const end = dayRange.end;
  if (!validDateKey(end)) return { dates: [], error: 'Укажи дату окончания' };
  const span = daysBetween(start, end);
  if (span < 0) return { dates: [], error: 'Дата «По» должна быть не раньше даты «С»' };

  const step = mode === 'weekly' ? 7 : 1;
  const count = Math.floor(span / step) + 1;
  if (count > MAX_REPEAT_DATES) {
    return { dates: [], error: `Можно создать не больше ${MAX_REPEAT_DATES} повторов` };
  }

  return {
    dates: Array.from({ length: count }, (_, index) => DT.addDays(start, index * step)),
    error: ''
  };
}

function updateDayModeSummary() {
  if (dayMode === 'custom') return;
  const result = collectDayDates();
  const el = $('#dayModeSummary');
  el.classList.toggle('error', Boolean(result.error));
  if (result.error) {
    el.textContent = result.error;
    return;
  }

  const first = result.dates[0];
  const last = result.dates[result.dates.length - 1];
  if (dayMode === 'once') {
    el.textContent = cap(DT.dayLabel(first));
    return;
  }

  const count = result.dates.length;
  if (dayMode === 'daily') {
    el.textContent = `${count} ${plural(count, 'день', 'дня', 'дней')} подряд · ${DT.shortDay(first)} — ${DT.shortDay(last)}`;
    return;
  }

  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(DT.parse(first));
  el.textContent = `${count} ${plural(count, 'повтор', 'повтора', 'повторов')} · раз в неделю, ${weekday}`;
}

function renderDayEditor() {
  $$('[data-day-mode]').forEach(button => {
    const on = button.dataset.dayMode === dayMode;
    button.classList.toggle('on', on);
    button.setAttribute('aria-selected', String(on));
  });

  const custom = dayMode === 'custom';
  $('#daySimple').classList.toggle('hidden', custom);
  $('#dayCustom').classList.toggle('hidden', !custom);
  $('#dateEndField').classList.toggle('hidden', dayMode === 'once');
  $('#dateStartLabel').textContent = dayMode === 'once' ? 'Дата' : 'С';

  $('#dateStartText').textContent = validDateKey(dayRange.start)
    ? DT.shortDay(dayRange.start) : '—';
  $('#dateEndText').textContent = validDateKey(dayRange.end)
    ? DT.shortDay(dayRange.end) : '—';

  if (custom) renderPicker();
  else updateDayModeSummary();
}

function prepareDayEditor(dates) {
  const sorted = Array.from(new Set(dates)).sort();
  const safeDates = sorted.length ? sorted : [selected];
  picked = new Set(safeDates);
  dayMode = inferDayMode(safeDates);
  dayRange = { start: safeDates[0], end: safeDates[safeDates.length - 1] };
  pickMonth = DT.parse(safeDates[0]);
  renderDayEditor();
}

function switchDayMode(nextMode) {
  if (!['once', 'daily', 'weekly', 'custom'].includes(nextMode) || nextMode === dayMode) return;

  const current = collectDayDates();
  if (!current.error && current.dates.length) picked = new Set(current.dates);
  const base = Array.from(picked).sort();
  const start = base[0] || selected;
  let end = base[base.length - 1] || start;

  if (nextMode === 'daily' && daysBetween(start, end) < 1) end = DT.addDays(start, 6);
  if (nextMode === 'weekly' && daysBetween(start, end) < 7) end = DT.addDays(start, 28);
  if (nextMode === 'once') end = start;

  dayMode = nextMode;
  dayRange = { start, end };
  if (nextMode === 'custom') pickMonth = DT.parse(start);
  renderDayEditor();
}

/* ============================================================
   Шторка задачи
   ============================================================ */

function renderProjChips() {
  const ps = Store.state.projects;
  let html = `<button class="chip ${draft.projectId === null ? 'on' : ''}"
    style="--c:${NO_PROJ_COLOR}" data-proj="none"><i></i>Без раздела</button>`;
  html += ps.map(p => `<button class="chip ${draft.projectId === p.id ? 'on' : ''}"
    style="--c:${p.color}" data-proj="${p.id}"><i></i>${esc(p.name)}</button>`).join('');
  html += `<button class="chip add" data-proj="new">${ICON.plus}Раздел</button>`;
  $('#projChips').innerHTML = html;
}

function updateTimeButton() {
  $('#fTimeText').textContent = draft.time || 'Не задано';
  $('#fTimeBtn').classList.toggle('empty', !draft.time);
}

function renderRemChips() {
  const disabled = !draft.time;
  $('#remChips').innerHTML = REMINDERS.map(r =>
    `<button class="chip ${draft.reminder === r.v ? 'on' : ''}" data-rem="${r.v === null ? '' : r.v}"
      ${disabled ? 'style="opacity:.4"' : ''}>${r.l}</button>`).join('');
}

/** Готовит черновик задачи. Обе шторки правят его, каждая — свою часть. */
function startDraft(group) {
  if (group) {
    draft = {
      groupId: group.groupId, title: group.title, note: group.note,
      projectId: group.projectId, time: group.time, reminder: group.reminder
    };
    picked = new Set(group.dates);
    pickMonth = DT.parse(group.dates[0]);
  } else {
    draft = {
      groupId: null, title: '', note: '', projectId: null,
      time: null, reminder: Store.state.settings.defaultReminder
    };
    picked = new Set([selected]);
    pickMonth = DT.parse(selected);
  }
}

/**
 * Текст задачи: заголовок и поле ввода, как в заметках на телефоне.
 * Даты, время и раздел сюда не лезут — они за шестерёнкой.
 */
/**
 * Заметка открывается на просмотр, а не на правку.
 *
 * Раньше по нажатию на задачу сразу вылезала клавиатура и заслоняла половину
 * экрана, хотя чаще всего нужно просто посмотреть список и отметить сделанное.
 * Теперь правка включается отдельно: карандашом в шапке или двойным касанием
 * по тексту. Галочки при этом работают и на просмотре — ради них и заходят.
 */
let noteEditing = false;

function setNoteMode(editing) {
  noteEditing = editing;
  const area = $('#nText');
  area.setAttribute('contenteditable', editing ? 'true' : 'false');
  area.classList.toggle('reading', !editing);
  $('#nTitle').readOnly = !editing;
  $('#noteTools').hidden = !editing;
  $('#noteEdit').hidden = editing;
  $('#noteSave').hidden = !editing;
  if (editing) {
    normalizeLines();
    setTimeout(() => area.focus(), 60);
  } else {
    document.activeElement?.blur();
  }
}

function openNoteEditor(group, edit) {
  startDraft(group);
  $('#nTitle').value = draft.title;
  $('#nText').innerHTML = Store.noteSanitize(Store.noteToHtml(draft.note));
  // Просим встроенный браузер делать на Enter именно строки-блоки:
  // без этого он местами вставляет переносы, и строк как таковых нет.
  try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) {}
  normalizeLines();
  updateNoteMeta();
  // Новая задача сразу в правке: смотреть в ней пока нечего
  setNoteMode(edit !== undefined ? edit : !group);
  showSheet('#noteSheet');
  if (!group) setTimeout(() => $('#nTitle').focus(), 340);
}

/**
 * Отметка пункта на просмотре сохраняется сразу.
 * Кнопки «готово» в этом режиме нет, а уходить с несохранённой галочкой —
 * ровно та потеря, из-за которой к спискам перестают доверять.
 */
function saveNoteQuietly() {
  if (!draft || !draft.groupId) return;
  Store.saveGroup({
    groupId: draft.groupId,
    title: ($('#nTitle').value || draft.title || '').trim() || draft.title,
    note: noteValue(),
    projectId: draft.projectId,
    dates: Array.from(picked),
    time: draft.time,
    reminder: draft.time ? draft.reminder : null
  });
}



/** Строка под заголовком: когда создано и сколько набрано */
const noteArea = () => $('#nText');

// Теги, которые сами по себе являются строкой. Раньше строкой считался
// только div, и приведение к строкам заворачивало цитату, заголовок или
// список внутрь него — отсюда и множились вложенные цитаты.
const BLOCK_TAGS = { DIV: 1, H1: 1, H2: 1, H3: 1, BLOCKQUOTE: 1, UL: 1, OL: 1, HR: 1 };

/**
 * Приводит содержимое к строкам-блокам.
 *
 * Встроенный браузер держит первую строку голым текстом прямо в поле,
 * без обёртки. Пока её нет, «строки под курсором» не существует, и кнопка
 * пункта на первой строке молча ничего не делала.
 */
function normalizeLines() {
  const area = noteArea();
  let stray = [];
  const flush = () => {
    if (!stray.length) return;
    const line = document.createElement('div');
    stray[0].before(line);
    stray.forEach(n => line.appendChild(n));
    stray = [];
  };
  Array.from(area.childNodes).forEach(node => {
    if (node.nodeType === 1 && BLOCK_TAGS[node.tagName]) { flush(); return; }
    if (node.nodeType === 1 && node.tagName === 'BR' && !stray.length) {
      const line = document.createElement('div');
      node.before(line);
      line.appendChild(node);
      return;
    }
    stray.push(node);
  });
  flush();
  if (!area.firstChild) area.appendChild(document.createElement('div')).appendChild(document.createElement('br'));
}


/**
 * Разметка из поля ввода, приведённая в порядок.
 *
 * Встроенный браузер по ходу набора вставляет своё: пустые строки, обёртки
 * от вставки из буфера, иногда стили. Очистка оставляет только начертания
 * и пункты списка, поэтому в хранилище попадает ровно то, что мы умеем
 * показать в карточке. Пустая заметка становится пустой строкой, а не
 * набором пустых тегов.
 */
function noteValue() {
  const html = Store.noteSanitize($('#nText').innerHTML);
  return Store.notePlain(html).trim() ? html : '';
}

function updateNoteMeta() {
  const when = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  }).format(new Date());
  const n = Store.notePlain($('#nText').innerHTML).length;
  $('#nMeta').textContent = `${when} · ${n} ${plural(n, 'символ', 'символа', 'символов')}`;
}

/**
 * Настройки задачи: раздел, дни, время, напоминание.
 *
 * Открываются двумя путями. Шестерёнкой с карточки — тогда «Готово»
 * сохраняет задачу целиком. Шестерёнкой из редактора текста — тогда
 * «Готово» только закрывает настройки, а сохранит уже галочка в тексте.
 */
function openTaskSettings(group, standalone = true) {
  if (group !== undefined) startDraft(group);
  settingsStandalone = standalone;

  $('#taskSheetTitle').textContent = draft.groupId ? 'Настройки задачи' : 'Новая задача';
  $('#taskDelete').classList.toggle('hidden', !draft.groupId);
  $('#fNoTime').checked = !draft.time;
  updateTimeButton();
  renderProjChips();
  renderRemChips();
  prepareDayEditor(Array.from(picked));
  showSheet('#taskSheet');
}

/** Сохраняет черновик целиком. Возвращает false, если сохранять нечего. */
function saveDraft() {
  const title = ($('#nTitle').value || draft.title || '').trim();
  if (!title) {
    toast('Нужен заголовок');
    return false;
  }
  const daySelection = collectDayDates();
  if (daySelection.error) { toast(daySelection.error); return false; }

  const dates = daySelection.dates;
  picked = new Set(dates);
  Store.saveGroup({
    groupId: draft.groupId,
    title,
    note: noteValue(),
    projectId: draft.projectId,
    dates,
    time: draft.time,
    reminder: draft.time ? draft.reminder : null
  });

  selected = dates.includes(selected) ? selected : dates[0];
  const d = DT.parse(selected);
  cursor = new Date(d.getFullYear(), d.getMonth(), 1);
  return true;
}

function openProjSheet(proj) {
  draftProj = proj
    ? Object.assign({}, proj)
    : { id: null, name: '', description: '', color: PALETTE[Store.state.projects.length % PALETTE.length] };

  $('#projSheetTitle').textContent = proj ? 'Редактирование раздела' : 'Новый раздел';
  $('#projDelete').classList.toggle('hidden', !proj);
  $('#pName').value = draftProj.name;
  $('#pDescription').value = draftProj.description || '';
  $('#palette').innerHTML = PALETTE.map(c =>
    `<button class="sw-col ${draftProj.color === c ? 'on' : ''}" style="--c:${c}" data-color="${c}"></button>`).join('');
  $('#projectDetails').classList.toggle('hidden', !proj);
  if (proj) renderProjectDetails(proj.id);

  showSheet('#projSheet');
  if (!proj) setTimeout(() => $('#pName').focus(), 340);
}

function renderProjectDetails(projectId) {
  const project = Store.projById(projectId);
  if (!project) return;
  const groups = Store.groups().filter(g => g.projectId === projectId)
    .sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
  const total = groups.reduce((n, g) => n + g.total, 0);
  const done = groups.reduce((n, g) => n + g.done, 0);
  $('#projectStats').innerHTML = `<b>${groups.length} ${plural(groups.length, 'задача', 'задачи', 'задач')}</b>
    <span>${done} из ${total} дней закрыто</span>`;
  $('#projectTasks').innerHTML = groups.length
    ? groups.map(g => `<article class="project-group ${g.done === g.total ? 'done' : ''}" style="--c:${project.color}">
        <div class="project-group-head" data-editgroup="${g.groupId}" role="button" tabindex="0">
          <div><b>${esc(g.title)}</b>${g.note ? `<small>${esc(g.note)}</small>` : ''}</div>
          <span>${g.done} / ${g.total}</span>${ICON.edit}
        </div>
        <div class="occurrences">${g.tasks.map(occurrenceRow).join('')}</div>
      </article>`).join('')
    : '<div class="project-empty">В этом разделе пока нет задач</div>';
}

/* ---------- своё окно подтверждения вместо системного ---------- */

let dialogResolve = null;

/**
 * Окно ссылки: адрес и способ показа.
 *
 * Превью с заголовком и картинкой сделать нельзя — за ним пришлось бы идти
 * на сайт, а приложение в сеть не ходит. Поэтому «карточкой» означает
 * домен и адрес: это видно сразу и не требует загрузки.
 */
function askLink({ url = '', text = '', card = false } = {}) {
  return new Promise(resolve => {
    if (dialogResolve) dialogResolve(null);
    dialogResolve = resolve;

    $('#dialogTitle').textContent = url ? 'Ссылка' : 'Вставить ссылку';
    $('#dialogText').style.display = 'none';

    const extra = $('#dialogExtra');
    extra.hidden = false;
    extra.innerHTML = `
      <input class="dialog-input" id="linkUrl" placeholder="адрес" inputmode="url"
        autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(url)}">
      <input class="dialog-input" id="linkText" placeholder="подпись, необязательно"
        autocomplete="off" value="${esc(text)}">
      <label class="dialog-switch">
        <span>Показывать карточкой</span>
        <input type="checkbox" class="sw" id="linkCard" ${card ? 'checked' : ''}>
        <i class="sw-track"></i>
      </label>`;

    const okBtn = $('#dialogOk');
    okBtn.textContent = url ? 'Сохранить' : 'Вставить';
    okBtn.classList.add('primary');
    okBtn.classList.remove('danger');
    $('#dialogWrap').classList.add('on');
    setTimeout(() => $('#linkUrl')?.focus(), 120);
  });
}

/** Собирает ответ окна ссылки. null — окно закрыли без сохранения. */
function readLinkDialog() {
  const raw = $('#linkUrl')?.value || '';
  const href = Store.noteSafeUrl(raw);
  if (!href) return null;
  return {
    url: href,
    text: ($('#linkText')?.value || '').trim(),
    card: !!$('#linkCard')?.checked
  };
}

/** Ссылка под курсором, если она там есть */
function linkAtCaret() {
  const sel = window.getSelection();
  const node = sel && sel.anchorNode;
  const host = node && (node.nodeType === 1 ? node : node.parentElement);
  const a = host && host.closest ? host.closest('a') : null;
  return a && a.closest('#nText') ? a : null;
}

/**
 * Вставка и правка ссылки в заметке.
 *
 * Курсор внутри ссылки — правим её. Есть выделение — оно становится
 * подписью. Ничего нет — вставляем новую, подписью будет адрес.
 */
async function insertLink() {
  normalizeLines();
  const existing = linkAtCaret();
  const sel = window.getSelection();
  const selected = sel && !sel.isCollapsed ? sel.toString().trim() : '';

  // Окно уводит фокус в своё поле, и выделение в заметке пропадает.
  // Запоминаем его заранее, иначе вставка уходит не туда, а выделенный
  // текст остаётся на месте и задваивается.
  const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;

  const answer = await askLink(existing
    ? { url: existing.getAttribute('href'), text: existing.textContent, card: existing.classList.contains('card') }
    : { url: Store.noteSafeUrl(selected) ? selected : '', text: Store.noteSafeUrl(selected) ? '' : selected });

  if (!answer) return;

  if (existing) {
    existing.setAttribute('href', answer.url);
    existing.textContent = answer.text || answer.url;
    existing.classList.toggle('card', answer.card);
    updateNoteMeta();
    return;
  }

  const a = document.createElement('a');
  a.setAttribute('href', answer.url);
  a.textContent = answer.text || answer.url;
  if (answer.card) a.className = 'card';

  noteArea().focus();
  const range = saved || (sel && sel.rangeCount ? sel.getRangeAt(0) : null);
  if (range) {
    range.deleteContents();
    range.insertNode(a);
    const after = document.createRange();
    after.setStartAfter(a);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  } else {
    (noteArea().lastElementChild || noteArea()).appendChild(a);
  }
  updateNoteMeta();
}


/**
 * Показ ссылки в карточке задачи.
 *
 * Обычная — строкой в тексте. Карточкой — отдельным блоком с доменом
 * и адресом: заголовка и картинки взять неоткуда, сеть мы не трогаем.
 */
function linkMarkup(a) {
  const href = a.getAttribute('href');
  const host = Store.noteUrlHost(href);
  if (!a.classList.contains('card')) {
    return `<a class="t-link" data-openlink="${esc(href)}">${esc(a.textContent)}</a>`;
  }
  return `<span class="t-linkcard" data-openlink="${esc(href)}">
    <span class="t-linkcard-host">${esc(host)}</span>
    <span class="t-linkcard-url">${esc(href)}</span>
  </span>`;
}

function askConfirm({ title, text = '', ok = 'Продолжить', danger = false }) {
  return new Promise(resolve => {
    if (dialogResolve) dialogResolve(false);   // предыдущее считаем отменённым
    dialogResolve = resolve;
    $('#dialogTitle').textContent = title;
    $('#dialogText').textContent = text;
    $('#dialogText').style.display = text ? '' : 'none';
    // Поля остаются от окна ссылки — в обычном подтверждении они лишние
    $('#dialogExtra').hidden = true;
    $('#dialogExtra').innerHTML = '';
    const okBtn = $('#dialogOk');
    okBtn.textContent = ok;
    okBtn.classList.toggle('danger', danger);
    okBtn.classList.toggle('primary', !danger);
    $('#dialogWrap').classList.add('on');
  });
}

function closeDialog(value) {
  const resolve = dialogResolve;
  const extra = $('#dialogExtra');
  dialogResolve = null;
  $('#dialogWrap').classList.remove('on');
  extra.hidden = true;
  extra.innerHTML = '';
  if (resolve) resolve(value);
}

async function askExit() {
  const ok = await askConfirm({ title: 'Выйти из приложения?', ok: 'Выйти', danger: true });
  if (!ok) return;
  const native = window.Capacitor?.Plugins?.AppSettings;
  if (native?.exitApp) await native.exitApp();
}

function showSheet(sel) {
  $('#backdrop').classList.add('on');
  $(sel).classList.add('on');
  $('#fab').classList.add('hidden');
}

function closeSheets() {
  $('#backdrop').classList.remove('on');
  Picker.cancel();
  $('#pickerSheet').classList.remove('on');
  $('#taskSheet').classList.remove('on');
  $('#noteSheet').classList.remove('on');
  $('#projSheet').classList.remove('on');
  $('#infoSheet').classList.remove('on');
  $('#jumpSheet').classList.remove('on');
  $('#fab').classList.toggle('hidden', $('.view.active')?.id === 'v-set');
  document.activeElement?.blur();
}

/**
 * Окно выбора открывается поверх других шторок, поэтому закрывает
 * только себя — иначе вместе с ним схлопывалась бы и задача под ним.
 */
function closePicker() {
  Picker.cancel();
  $('#pickerSheet').classList.remove('on');
  // Список должен перечислять все шторки, из которых можно вызвать выбор.
  // Забудешь одну — окно выбора закроет её вместе с собой.
  const under = ['#noteSheet', '#taskSheet', '#projSheet', '#infoSheet', '#jumpSheet']
    .some(sel => $(sel).classList.contains('on'));
  if (!under) closeSheets();
}

function closeTopSheet() {
  if ($('#pickerSheet').classList.contains('on')) { closePicker(); return true; }
  if ($('#jumpSheet').classList.contains('on')) { closeSheets(); return true; }
  if ($('#infoSheet').classList.contains('on')) {
    $('#infoSheet').classList.remove('on');
    closeSheets();
    return true;
  }
  if ($('#projSheet').classList.contains('on')) {
    $('#projSheet').classList.remove('on');
    if (!$('#taskSheet').classList.contains('on')) closeSheets();
    document.activeElement?.blur();
    return true;
  }
  if ($('#taskSheet').classList.contains('on')) {
    // Настройки, открытые поверх текста, закрываются в текст: он ещё не сохранён
    if (!settingsStandalone && $('#noteSheet').classList.contains('on')) {
      $('#taskSheet').classList.remove('on');
      document.activeElement?.blur();
      return true;
    }
    closeSheets();
    return true;
  }
  if ($('#noteSheet').classList.contains('on')) { closeSheets(); return true; }
  return false;
}

function openGroupEditor(groupId) {
  const group = Store.groupById(groupId);
  if (!group) return;
  if ($('#projSheet').classList.contains('on')) $('#projSheet').classList.remove('on');
  openTaskSettings(group);
}

/* ============================================================
   Отрисовка целиком
   ============================================================ */

function render() {
  const active = $('.view.active')?.id;
  if (active === 'v-cal') { renderMonth(); renderAgenda(); }
  else if (active === 'v-list') renderList();
  else if (active === 'v-set') {
    // не перерисовываем, пока пользователь возится с полем внутри настроек
    if (!$('#setBody').contains(document.activeElement)) renderSettings();
  }
  if ($('#projSheet').classList.contains('on') && draftProj?.id) renderProjectDetails(draftProj.id);
}

function switchView(id, options = {}) {
  const current = $('.view.active')?.id;
  if (current === id) return;
  if (options.resetHistory || (id === 'v-cal' && options.record !== false)) viewHistory = ['v-cal'];
  else if (options.record !== false && viewHistory[viewHistory.length - 1] !== id) viewHistory.push(id);
  $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === id));
  $('#fab').classList.toggle('hidden', id === 'v-set');
  const next = $(`#${id}`);
  if (options.direction && next) {
    const cls = options.direction === 'left' ? 'view-in-left' : 'view-in-right';
    next.classList.add(cls);
    setTimeout(() => next.classList.remove(cls), 230);
  }
  render();
}

function goBackView() {
  if (viewHistory.length > 1) {
    viewHistory.pop();
    switchView(viewHistory[viewHistory.length - 1], { record: false, direction: 'right' });
    return true;
  }
  const current = $('.view.active')?.id;
  if (current && current !== 'v-cal') {
    viewHistory = ['v-cal'];
    switchView('v-cal', { record: false, direction: 'right' });
    return true;
  }
  return false;
}

/**
 * Кнопку «Назад» разбирает веб-часть. Возвращать нужно строго синхронно:
 * Java читает результат сразу, поэтому подтверждение выхода показывается
 * без ожидания, а true отдаётся немедленно — обработку мы взяли на себя.
 */
window.dayplanHandleBack = () => {
  if (dialogResolve) { closeDialog(false); return true; }
  if (closeTopSheet()) return true;
  if (goBackView()) return true;
  askExit();
  return true;
};

/* ============================================================
   События
   ============================================================ */

async function handleSettingsClick(e) {
  // Атрибут именно data-set-theme: data-theme висит на <html> для оформления,
  // и closest() находил бы его для любого клика, съедая все остальные ветки.
  const th = e.target.closest('[data-set-theme]');
  if (th) { Store.updateSettings({ theme: th.dataset.setTheme }); applyTheme(); renderSettings(); return; }

  const sv = e.target.closest('[data-startview]');
  if (sv) {
    const choice = await Picker.choice({
      title: 'Открывать при запуске',
      value: Store.state.settings.startView,
      options: [
        { value: 'v-cal', label: 'Календарь' },
        { value: 'v-list', label: 'Задачи' }
      ]
    });
    if (choice && choice.value) Store.updateSettings({ startView: choice.value });
    renderSettings();
    return;
  }

  const sl = e.target.closest('[data-startlist]');
  if (sl) {
    const choice = await Picker.choice({
      title: 'Вид списка задач',
      value: Store.state.settings.startListMode,
      options: [
        { value: 'sections', label: 'По разделам' },
        { value: 'date', label: 'По порядку' }
      ]
    });
    if (choice && choice.value) {
      Store.updateSettings({ startListMode: choice.value });
      listMode = choice.value;
      renderList();
    }
    renderSettings();
    return;
  }

  const ac = e.target.closest('[data-accent]');
  if (ac) { Store.updateSettings({ accent: ac.dataset.accent }); applyTheme(); renderSettings(); return; }

  if (e.target.closest('[data-wipe]')) { openWipeConfirm(); return; }

  const ep = e.target.closest('[data-editproj]');
  if (ep) {
    const project = Store.projById(Number(ep.dataset.editproj));
    if (!project) { toast('Раздел не найден'); return; }
    openProjSheet(project);
    return;
  }

  if (e.target.closest('[data-newproj]')) { openProjSheet(null); return; }

  if (e.target.closest('[data-notif-permission]')) {
    if (!Notify.isNative()) { toast('Системные настройки доступны в приложении'); return; }
    if (permState !== 'granted') {
      permState = await Notify.requestPermission();
      if (permState === 'granted') {
        await Notify.createChannels();
        await Notify.reschedule(Store.state);
        toast('Уведомления разрешены');
      } else {
        await Notify.openNotificationSettings();
      }
    } else {
      await Notify.openNotificationSettings();
    }
    await refreshNotifState();
    renderSettings();
    return;
  }

  const notificationChannel = e.target.closest('[data-notif-channel]');
  if (notificationChannel) {
    if (!Notify.isNative()) { toast('Настройки канала доступны в приложении'); return; }
    const opened = await Notify.openNotificationChannelSettings(notificationChannel.dataset.notifChannel);
    if (!opened) await Notify.openNotificationSettings();
    return;
  }

  if (e.target.closest('[data-askexact]')) {
    if (!Notify.isNative()) { toast('Точные напоминания доступны в приложении'); return; }
    if (exactState === 'granted') toast('Точные напоминания уже разрешены');
    else await Notify.openExactSettings();
    return;
  }

  if (e.target.closest('[data-battery]')) {
    if (!Notify.isNative()) { toast('Настройки энергосбережения доступны в приложении'); return; }
    const opened = await Notify.openBatterySettings();
    if (!opened) toast('Не удалось открыть настройки энергосбережения');
    return;
  }

  if (e.target.closest('[data-app-settings]')) {
    if (!Notify.isNative()) { toast('Системные настройки доступны в приложении'); return; }
    const opened = await Notify.openAppDetails();
    if (!opened) toast('Не удалось открыть настройки приложения');
    return;
  }

  if (e.target.closest('[data-test]')) {
    const result = await Notify.fireTest();
    if (!result.ok) toast(result.message);
    await refreshNotifState();
    renderSettings();
    return;
  }

  const timeButton = e.target.closest('[data-time]');
  if (timeButton) {
    if (timeButton.disabled) return;
    const key = timeButton.dataset.time;
    const picked = await Picker.time({
      title: 'Во сколько напоминать',
      value: Store.state.settings[key].time
    });
    if (picked) {
      Store.updateSettings({ [key]: Object.assign({}, Store.state.settings[key], { time: picked }) });
      renderSettings();
    }
    return;
  }

  if (e.target.closest('[data-defrem]')) {
    const picked = await Picker.choice({
      title: 'Напоминание по умолчанию',
      options: REMINDERS.map(r => ({ value: r.v, label: r.l })),
      value: Store.state.settings.defaultReminder
    });
    if (picked) {
      Store.updateSettings({ defaultReminder: picked.value });
      renderSettings();
    }
    return;
  }

  if (e.target.closest('[data-export]')) {
    const result = await Backup.save({ versionName: appVersion.name, versionCode: appVersion.code });
    if (!result.ok) toast(result.message);
    return;
  }

  if (e.target.closest('[data-import]')) {
    const picked = await Backup.pick();
    if (picked.cancelled) return;
    if (picked.error) { toast(picked.error); return; }
    const parsed = Store.readBundle(picked.content);
    if (!parsed.ok) { toast(parsed.error); return; }
    pendingImport = parsed.bundle;
    showImportConfirm(parsed.counts);
    return;
  }

  if (e.target.closest('[data-about]')) { openAbout(); return; }
  if (e.target.closest('[data-support]')) { openSupport(); return; }
  if (DISTRIBUTION !== 'store' && e.target.closest('[data-update]')) { checkForUpdates(); }
}

function handleSettingsChange(e) {
  const on = e.target.closest('[data-on]');
  if (on) {
    const k = on.dataset.on;
    Store.updateSettings({ [k]: Object.assign({}, Store.state.settings[k], { on: on.checked }) });
    renderSettings();
    return;
  }
}

function bind() {

  $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

  $('#dialogCancel').addEventListener('click', () => closeDialog(false));
  $('#dialogOk').addEventListener('click', () => {
    // Окно ссылки возвращает поля, обычное подтверждение — просто «да»
    if ($('#linkUrl')) {
      const answer = readLinkDialog();
      if (!answer) { toast('Не похоже на адрес'); $('#linkUrl').focus(); return; }
      closeDialog(answer);
      return;
    }
    closeDialog(true);
  });
  $('#dialogWrap').addEventListener('click', e => {
    if (e.target === $('#dialogWrap')) closeDialog(false);
  });

  // Настройки постоянно перерисовываются. Обработчики стоят на стабильном
  // контейнере, поэтому кнопки разделов и системных пунктов не «отваливаются».
  $('#setBody').addEventListener('click', handleSettingsClick);
  $('#setBody').addEventListener('change', handleSettingsChange);

  /* --- навигация по месяцам --- */
  $('#prevMonth').addEventListener('click', () => { cursor.setMonth(cursor.getMonth() - 1); renderMonth(); });
  $('#nextMonth').addEventListener('click', () => { cursor.setMonth(cursor.getMonth() + 1); renderMonth(); });
  $('#todayBtn').addEventListener('click', () => {
    selected = DT.today(); cursor = new Date(); renderMonth(); renderAgenda();
  });

  const toggleCollapse = () => setCollapsed(!collapsed);
  $('#grabber').addEventListener('click', toggleCollapse);
  $('#collapseBtn').addEventListener('click', toggleCollapse);

  // Заголовок с месяцем открывает переход к дате, а не сворачивает календарь
  $('#monthBtn').addEventListener('click', openJumpSheet);
  $('#jumpCancel').addEventListener('click', closeTopSheet);
  $('#jumpToday').addEventListener('click', () => {
    const now = new Date();
    selected = DT.today();
    jumpTo(now.getFullYear(), now.getMonth());
  });
  $('#yearStrip').addEventListener('click', e => {
    const button = e.target.closest('[data-year]');
    if (!button) return;
    jumpYear = Number(button.dataset.year);
    renderJump();
  });
  $('#monthGrid').addEventListener('click', e => {
    const button = e.target.closest('[data-month]');
    if (button) jumpTo(jumpYear, Number(button.dataset.month));
  });

  $('#weeks').addEventListener('click', e => {
    const cell = e.target.closest('[data-date]');
    if (!cell) return;
    selected = cell.dataset.date;
    const d = DT.parse(selected);
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) {
      cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    renderMonth();
    renderAgenda();
  });

  /* --- свайп по месяцу --- */
  let sx = 0, sy = 0, swiping = false;
  $('#month').addEventListener('touchstart', e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiping = true;
  }, { passive: true });
  $('#month').addEventListener('touchend', e => {
    if (!swiping) return;
    swiping = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      cursor.setMonth(cursor.getMonth() + (dx < 0 ? 1 : -1));
      renderMonth();
    }
  }, { passive: true });

  const viewOrder = ['v-cal', 'v-list', 'v-set'];
  let pageSwipe = null, suppressTapUntil = 0;
  $('#main').addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    if (e.target.closest('.month, input, textarea, select, .chips-row, .list-switch')) return;
    const t = e.touches[0];
    pageSwipe = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  $('#main').addEventListener('touchend', e => {
    if (!pageSwipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - pageSwipe.x, dy = t.clientY - pageSwipe.y;
    pageSwipe = null;
    if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const index = viewOrder.indexOf($('.view.active')?.id);
    const nextIndex = index + (dx < 0 ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= viewOrder.length) return;
    suppressTapUntil = Date.now() + 450;
    switchView(viewOrder[nextIndex], { direction: dx < 0 ? 'left' : 'right' });
  }, { passive: true });

  /* --- тап по задачам --- */
  document.addEventListener('click', e => {
    if (Date.now() < suppressTapUntil) { e.preventDefault(); return; }
    const toggleGroup = e.target.closest('[data-toggle-group]');
    if (toggleGroup) {
      e.stopPropagation();
      const id = Number(toggleGroup.dataset.toggleGroup);
      if (expandedGroups.has(id)) expandedGroups.delete(id); else expandedGroups.add(id);
      renderList();
      return;
    }
    // Ссылка в карточке. Открываем через системный обработчик, а не
    // переходом: приложение не должно уезжать во встроенный браузер.
    const link = e.target.closest('[data-openlink]');
    if (link) {
      e.stopPropagation();
      e.preventDefault();
      Notify.openUrl(link.dataset.openlink).then(ok => { if (!ok) toast('Не удалось открыть ссылку'); });
      return;
    }
    // Скрытый текст раскрывается нажатием. Проверяем раньше галочки:
    // скрытый кусок может лежать внутри пункта, и тогда нажатие по нему
    // не должно заодно отмечать пункт сделанным.
    const spoiler = e.target.closest('.sp');
    if (spoiler && !spoiler.closest('#nText')) {
      e.stopPropagation();
      spoiler.classList.toggle('open');
      return;
    }
    // Галочка у пункта заметки. Останавливаем всплытие: иначе следом
    // сработает открытие карточки, и список тут же скроется редактором.
    const noteItem = e.target.closest('[data-noteitem]');
    if (noteItem) {
      e.stopPropagation();
      const [gid, idx] = noteItem.dataset.noteitem.split(':').map(Number);
      Store.toggleNoteItem(gid, idx);
      return;
    }
    const openNote = e.target.closest('[data-opennote]');
    if (openNote) {
      e.stopPropagation();
      const g = Store.groupById(Number(openNote.dataset.opennote));
      if (g) openNoteEditor(g, false);
      return;
    }
    // Карандаш ведёт в ту же заметку, но сразу в правку
    const editNote = e.target.closest('[data-editnote]');
    if (editNote) {
      e.stopPropagation();
      const g = Store.groupById(Number(editNote.dataset.editnote));
      if (g) openNoteEditor(g, true);
      return;
    }
    const editGroup = e.target.closest('[data-editgroup]');
    if (editGroup) { e.stopPropagation(); openGroupEditor(Number(editGroup.dataset.editgroup)); return; }
    const listTask = e.target.closest('[data-list-task]');
    if (listTask) { e.stopPropagation(); Store.toggleTask(Number(listTask.dataset.listTask)); return; }
    const check = e.target.closest('[data-check]');
    if (check) {
      e.stopPropagation();
      Store.toggleTask(Number(check.dataset.check));
      return;
    }
    const card = e.target.closest('[data-task]');
    if (card) {
      const t = Store.byId(Number(card.dataset.task));
      if (t) openNoteEditor(Store.groupById(t.groupId));
      return;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const editGroup = e.target.closest('[data-editgroup]');
    const listTask = e.target.closest('[data-list-task]');
    const openNote = e.target.closest('[data-opennote]');
    if (!editGroup && !openNote && !listTask) return;
    e.preventDefault();
    if (editGroup) openGroupEditor(Number(editGroup.dataset.editgroup));
    else if (openNote) {
      const g = Store.groupById(Number(openNote.dataset.opennote));
      if (g) openNoteEditor(g);
    }
    else Store.toggleTask(Number(listTask.dataset.listTask));
  });

  $('.list-switch').addEventListener('click', e => {
    const button = e.target.closest('[data-list-mode]');
    if (!button) return;
    listMode = button.dataset.listMode;
    // Запоминаем выбор: при следующем запуске список откроется таким же
    Store.updateSettings({ startListMode: listMode });
    renderList();
  });

  $('#sectionFilter').addEventListener('click', e => {
    const button = e.target.closest('[data-section-filter]');
    if (!button) return;
    toggleSection(button.dataset.sectionFilter);
  });

  $('#fab').addEventListener('click', () => openNoteEditor(null));

  /* --- шторка задачи --- */
  $('#backdrop').addEventListener('click', closeTopSheet);
  $('#taskCancel').addEventListener('click', closeSheets);
  $('#projCancel').addEventListener('click', closeTopSheet);
  $('#infoClose')?.addEventListener('click', closeTopSheet);

  // Кнопка удаления оживает только на точное слово
  $('#infoBody')?.addEventListener('input', e => {
    if (e.target.id !== 'wipeWord') return;
    const ok = e.target.value.trim().toLowerCase() === 'подтверждаю';
    $('#wipeGo').disabled = !ok;
  });

  $('#infoBody')?.addEventListener('click', async e => {
    const wipe = e.target.closest('#wipeGo');
    if (wipe) {
      if (wipe.disabled) return;
      wipe.disabled = true;
      const copy = await Backup.autoSave({ versionName: appVersion.name, versionCode: appVersion.code });
      if (!copy.ok) { toast(copy.message); wipe.disabled = false; return; }
      Store.wipeAll();
      closeSheets();
      renderSettings();
      toast(copy.location ? `Удалено. Копия в «${copy.location}»` : 'Удалено, копия сохранена');
      return;
    }

    const mode = e.target.closest('[data-import-mode]');
    if (mode) {
      if (!pendingImport) { closeSheets(); return; }
      const how = mode.dataset.importMode;
      if (how === 'replace') {
        const ok = await askConfirm({
          title: 'Заменить всё?',
          text: 'Текущие задачи и разделы будут удалены, вместо них загрузятся данные из файла.',
          ok: 'Заменить', danger: true
        });
        if (!ok) return;
      }
      Store.applyBundle(pendingImport, how);
      pendingImport = null;
      closeSheets();
      renderSettings();
      toast('Импорт завершён');
      return;
    }

    const link = e.target.closest('[data-open-url]');
    if (!link) return;
    const opened = await Notify.openUrl(link.dataset.openUrl);
    if (!opened) toast('Не удалось открыть ссылку');
  });

  $('#fNoTime').addEventListener('change', e => {
    draft.time = e.target.checked ? null : (draft.time || '12:00');
    updateTimeButton();
    renderRemChips();
  });
  $('#fTimeBtn').addEventListener('click', async () => {
    const picked = await Picker.time({ title: 'Время задачи', value: draft.time || '12:00' });
    if (!picked) return;
    draft.time = picked;
    $('#fNoTime').checked = false;
    updateTimeButton();
    renderRemChips();
  });

  $('#projChips').addEventListener('click', e => {
    const chip = e.target.closest('[data-proj]');
    if (!chip) return;
    const v = chip.dataset.proj;
    if (v === 'new') { openProjSheet(null); return; }
    draft.projectId = v === 'none' ? null : Number(v);
    renderProjChips();
  });

  $('#remChips').addEventListener('click', e => {
    const chip = e.target.closest('[data-rem]');
    if (!chip || !draft.time) return;
    draft.reminder = chip.dataset.rem === '' ? null : Number(chip.dataset.rem);
    renderRemChips();
  });

  $('#dayModeSwitch').addEventListener('click', e => {
    const button = e.target.closest('[data-day-mode]');
    if (button) switchDayMode(button.dataset.dayMode);
  });

  $('#daySimple').addEventListener('click', async e => {
    const field = e.target.closest('[data-date-field]');
    if (!field) return;
    const which = field.dataset.dateField;
    const picked = await Picker.date({
      title: which === 'end' ? 'Окончание'
        : (dayMode === 'once' ? 'Дата задачи' : 'Начало'),
      value: dayRange[which]
    });
    if (!picked) return;

    dayRange[which] = picked;
    // «По» не может оказаться раньше «С» — подтягиваем вторую границу
    if (dayMode !== 'once' && daysBetween(dayRange.start, dayRange.end) < 0) {
      if (which === 'start') dayRange.end = picked;
      else dayRange.start = picked;
    }
    renderDayEditor();
  });

  /* --- выбор дней: тап, палец и мышь --- */
  const grid = $('#pickGrid');
  let dragMode = null, mouseDown = false, lastTouchAt = 0;

  grid.addEventListener('touchstart', e => {
    const cell = e.target.closest('[data-pick]');
    if (!cell) return;
    lastTouchAt = Date.now();
    dragMode = picked.has(cell.dataset.pick) ? 'remove' : 'add';
    applyPick(cell.dataset.pick, dragMode);
  }, { passive: true });

  grid.addEventListener('touchmove', e => {
    if (!dragMode) return;
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const cell = el && el.closest ? el.closest('[data-pick]') : null;
    if (cell) applyPick(cell.dataset.pick, dragMode);
  }, { passive: true });

  window.addEventListener('touchend', () => { dragMode = null; lastTouchAt = Date.now(); });

  grid.addEventListener('mousedown', e => {
    if (Date.now() - lastTouchAt < 600) return;   // это был палец, событие синтетическое
    const cell = e.target.closest('[data-pick]');
    if (!cell) return;
    e.preventDefault();
    mouseDown = true;
    dragMode = picked.has(cell.dataset.pick) ? 'remove' : 'add';
    applyPick(cell.dataset.pick, dragMode);
  });
  grid.addEventListener('mouseover', e => {
    if (!mouseDown || !dragMode) return;
    const cell = e.target.closest('[data-pick]');
    if (cell) applyPick(cell.dataset.pick, dragMode);
  });
  window.addEventListener('mouseup', () => { mouseDown = false; dragMode = null; });

  $('#pickPrev').addEventListener('click', () => {
    pickMonth.setMonth(pickMonth.getMonth() - 1); renderPicker();
  });
  $('#pickNext').addEventListener('click', () => {
    pickMonth.setMonth(pickMonth.getMonth() + 1); renderPicker();
  });
  $('#pickClear').addEventListener('click', () => { picked.clear(); renderPicker(); });

  /* --- сохранение задачи --- */
  /* --- редактор текста --- */
  /* --- редактор заметки: оформление --- */

  /**
   * Выделение приходится помнить самим.
   *
   * Нажатие по кнопке панели уводит фокус из поля, и выделение пропадает.
   * Перехватывать касание нельзя: вместе с ним отменяется и само нажатие —
   * ровно из-за этого кнопка скрытого текста не срабатывала вовсе.
   * Поэтому запоминаем последнее выделение внутри поля и возвращаем его
   * перед каждым действием.
   */
  let savedRange = null;

  document.addEventListener('selectionchange', () => {
    if (!$('#noteSheet').classList.contains('on')) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const host = range.commonAncestorContainer;
    const el = host.nodeType === 1 ? host : host.parentElement;
    if (el && el.closest && el.closest('#nText')) savedRange = range.cloneRange();
    updateFmtState();
  });

  /** Возвращает выделение в поле и выполняет действие */
  function withSelection(fn) {
    const area = noteArea();
    area.focus();
    const sel = window.getSelection();
    const inside = sel && sel.rangeCount &&
      (sel.getRangeAt(0).commonAncestorContainer.nodeType === 1
        ? sel.getRangeAt(0).commonAncestorContainer
        : sel.getRangeAt(0).commonAncestorContainer.parentElement)?.closest?.('#nText');
    if (!inside && savedRange) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    normalizeLines();
    fn();
    updateFmtState();
    updateNoteMeta();
  }

  /** Строка, в которой сейчас курсор */
  function currentLine() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    let node = sel.anchorNode;
    while (node && node !== noteArea()) {
      if (node.parentNode === noteArea() && node.nodeType === 1) return node;
      node = node.parentNode;
    }
    return null;
  }

  /** Все строки, которых касается выделение */
  function selectedLines() {
    const area = noteArea();
    const sel = window.getSelection();
    const rows = Array.from(area.children);
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const touched = rows.filter(row => {
        try { return range.intersectsNode(row); } catch (e) { return false; }
      });
      if (touched.length) return touched;
    }
    const line = currentLine();
    if (line) return [line];
    // Курсор потерялся. Берём строку из запомненного выделения, а не первую
    // попавшуюся: из-за этого цитата применялась к самому верхнему пункту,
    // хотя нажимали внизу.
    if (savedRange) {
      const host = savedRange.commonAncestorContainer;
      const el = host.nodeType === 1 ? host : host.parentElement;
      const row = el && el.closest ? rows.find(r => r === el || r.contains(el)) : null;
      if (row) return [row];
    }
    return rows.length ? [rows[rows.length - 1]] : [];
  }

  /** Меняет тег строки, сохраняя её содержимое и разрешённые классы */
  function setLineTag(line, tag) {
    if (line.tagName === tag) return line;
    const next = document.createElement(tag);
    Array.from(line.classList).forEach(c => { if (c !== 'ci') next.classList.add(c); });
    while (line.firstChild) next.appendChild(line.firstChild);
    line.replaceWith(next);
    return next;
  }

  /** Ставит курсор в конец строки — после правки он не должен пропадать */
  function placeCaret(line) {
    noteArea().focus();
    const range = document.createRange();
    range.selectNodeContents(line);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    savedRange = range.cloneRange();
  }

  /** Оборачивает выделение своим начертанием: скрытый текст или подсветка */
  function wrapSelection(className) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const node = sel.anchorNode;
    const host = node && (node.nodeType === 1 ? node : node.parentElement);
    const inside = host && host.closest ? host.closest('span.' + className) : null;

    if (inside) {
      const parent = inside.parentNode;
      while (inside.firstChild) parent.insertBefore(inside.firstChild, inside);
      inside.remove();
      return;
    }

    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.className = className;
    try {
      if (range.collapsed) {
        span.textContent = '​';
        range.insertNode(span);
      } else {
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
      const after = document.createRange();
      after.selectNodeContents(span);
      after.collapse(false);
      sel.removeAllRanges();
      sel.addRange(after);
      savedRange = after.cloneRange();
    } catch (e) {
      // выделение пересекло границы строк — сломанная разметка хуже,
      // чем несработавшая кнопка
    }
  }

  /* ---------- действия кнопок ---------- */

  const ALIGN = ['al-c', 'al-r', 'al-j'];
  const INDENT = ['in-1', 'in-2', 'in-3'];

  async function pickHeading() {
    const line = currentLine();
    const value = line && /^H[123]$/.test(line.tagName) ? line.tagName : 'DIV';
    const choice = await Picker.choice({
      title: 'Заголовок',
      value,
      options: [
        { value: 'H1', label: '<span style="font-size:22px;font-weight:750">Крупный</span>' },
        { value: 'H2', label: '<span style="font-size:18px;font-weight:700">Средний</span>' },
        { value: 'H3', label: '<span style="font-size:15.5px;font-weight:650">Мелкий</span>' },
        { value: 'DIV', label: 'Обычный текст' }
      ]
    });
    if (!choice || !choice.value) return;
    withSelection(() => {
      const rows = selectedLines();
      const changed = rows.map(l => setLineTag(l, choice.value));
      placeCaret(changed[changed.length - 1]);
    });
  }

  async function pickAlign() {
    const line = currentLine();
    const cur = line ? (ALIGN.find(c => line.classList.contains(c)) || 'al-l') : 'al-l';
    const choice = await Picker.choice({
      title: 'Выравнивание',
      value: cur,
      options: [
        { value: 'al-l', label: 'По левому краю' },
        { value: 'al-c', label: 'По центру' },
        { value: 'al-r', label: 'По правому краю' },
        { value: 'al-j', label: 'По ширине' }
      ]
    });
    if (!choice || !choice.value) return;
    withSelection(() => {
      selectedLines().forEach(l => {
        ALIGN.forEach(c => l.classList.remove(c));
        if (choice.value !== 'al-l') l.classList.add(choice.value);
      });
    });
  }

  async function pickList() {
    const choice = await Picker.choice({
      title: 'Список',
      value: 'ul',
      options: [
        { value: 'ul', label: '• точками' },
        { value: 'ol', label: '1. цифрами' },
        { value: 'ol-a', label: 'а. буквами' },
        { value: 'off', label: 'Убрать список' }
      ]
    });
    if (!choice || !choice.value) return;
    withSelection(() => {
      if (choice.value === 'off') {
        // Снимать надо тем же видом списка, каким он поставлен: вызвать оба
        // подряд значило выключить один и тут же включить другой.
        const sel = window.getSelection();
        const node = sel && sel.anchorNode;
        const host = node && (node.nodeType === 1 ? node : node.parentElement);
        const list = host && host.closest ? host.closest('ul, ol') : null;
        if (list) {
          document.execCommand(
            list.tagName === 'UL' ? 'insertUnorderedList' : 'insertOrderedList', false, null);
        }
        return;
      }
      document.execCommand(
        choice.value === 'ul' ? 'insertUnorderedList' : 'insertOrderedList', false, null);
      if (choice.value === 'ol-a') {
        const sel = window.getSelection();
        const node = sel && sel.anchorNode;
        const host = node && (node.nodeType === 1 ? node : node.parentElement);
        const ol = host && host.closest ? host.closest('ol') : null;
        if (ol) ol.classList.add('lt-a');
      }
    });
  }

  function shiftIndent(step) {
    withSelection(() => {
      selectedLines().forEach(l => {
        const cur = INDENT.findIndex(c => l.classList.contains(c));
        const next = Math.max(-1, Math.min(INDENT.length - 1, cur + step));
        INDENT.forEach(c => l.classList.remove(c));
        if (next >= 0) l.classList.add(INDENT[next]);
      });
    });
  }

  function toggleQuote() {
    withSelection(() => {
      const rows = selectedLines();
      const allQuotes = rows.every(l => l.tagName === 'BLOCKQUOTE');
      const changed = rows.map(l => setLineTag(l, allQuotes ? 'DIV' : 'BLOCKQUOTE'));
      placeCaret(changed[changed.length - 1]);
    });
  }

  function insertDivider() {
    withSelection(() => {
      const line = currentLine() || noteArea().lastElementChild;
      const hr = document.createElement('hr');
      const after = document.createElement('div');
      after.appendChild(document.createElement('br'));
      if (line) { line.after(hr); hr.after(after); }
      else { noteArea().appendChild(hr); noteArea().appendChild(after); }
      placeCaret(after);
    });
  }

  /* ---------- привязка кнопок ---------- */

  const SIMPLE = { bold: 1, italic: 1, underline: 1, strikeThrough: 1 };

  $$('.note-tool').forEach(btn => {
    // Перехватываем только мышь. Перехват касания отменяет и нажатие,
    // из-за чего кнопки на телефоне не срабатывали вовсе.
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      const kind = btn.dataset.fmt || btn.id;
      if (kind === 'nItemBtn') {
        withSelection(() => {
          const lines = selectedLines();
          if (!lines.length) return;
          const allItems = lines.every(l => l.tagName === 'DIV' && l.classList.contains('ci'));
          lines.forEach(l => {
            const div = setLineTag(l, 'DIV');
            if (allItems) { div.classList.remove('ci'); div.removeAttribute('data-done'); }
            else div.classList.add('ci');
          });
        });
        return;
      }
      if (SIMPLE[kind]) { withSelection(() => document.execCommand(kind, false, null)); return; }
      if (kind === 'spoiler') { withSelection(() => wrapSelection('sp')); return; }
      if (kind === 'highlight') { withSelection(() => wrapSelection('hl')); return; }
      if (kind === 'link') { insertLink(); return; }
      if (kind === 'heading') { pickHeading(); return; }
      if (kind === 'align') { pickAlign(); return; }
      if (kind === 'list') { pickList(); return; }
      if (kind === 'indent') { shiftIndent(1); return; }
      if (kind === 'outdent') { shiftIndent(-1); return; }
      if (kind === 'quote') { toggleQuote(); return; }
      if (kind === 'divider') { insertDivider(); return; }
    });
  });

  /** Подсветка кнопок по тому, что под курсором */
  function updateFmtState() {
    const sel = window.getSelection();
    const node = sel && sel.anchorNode;
    const host = node && (node.nodeType === 1 ? node : node.parentElement);
    const inNote = host && host.closest && host.closest('#nText');
    const line = currentLine();

    $$('.note-tool').forEach(btn => {
      const kind = btn.dataset.fmt || btn.id;
      let on = false;
      if (!inNote) { btn.classList.remove('on'); return; }
      if (SIMPLE[kind]) {
        try { on = document.queryCommandState(kind); } catch (e) { on = false; }
      } else if (kind === 'spoiler') on = !!host.closest('span.sp');
      else if (kind === 'highlight') on = !!host.closest('span.hl');
      else if (kind === 'link') on = !!host.closest('a');
      else if (kind === 'quote') on = !!(line && line.tagName === 'BLOCKQUOTE');
      else if (kind === 'heading') on = !!(line && /^H[123]$/.test(line.tagName));
      else if (kind === 'nItemBtn') on = !!(line && line.classList.contains('ci'));
      else if (kind === 'align') on = !!(line && ALIGN.some(c => line.classList.contains(c)));
      btn.classList.toggle('on', on);
    });
  }

  // Нажатие по квадратику пункта. Ловим по левому краю строки: держать там
  // отдельный элемент нельзя, он мешал бы набору текста.
  noteArea().addEventListener('click', e => {
    const line = e.target.closest ? e.target.closest('div.ci') : null;
    if (!line || line.parentNode !== noteArea()) return;
    if (e.clientX - line.getBoundingClientRect().left > 28) return;
    if (line.dataset.done === '1') line.removeAttribute('data-done');
    else line.dataset.done = '1';
    updateNoteMeta();
    if (!noteEditing) saveNoteQuietly();
  });

  // Enter внутри пункта продолжает список. Пустой пункт вместо этого
  // перестаёт быть пунктом — так список кончают.
  noteArea().addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const line = currentLine();
    if (!line) return;
    const item = line.classList.contains('ci');
    const quote = line.tagName === 'BLOCKQUOTE';
    if (!item && !quote) return;
    if (line.textContent.replace(/​/g, '').trim()) return;

    // Пустая оформленная строка + Enter — выход из оформления.
    // Никуда не перескакиваем: остаёмся здесь же, но уже обычной строкой.
    // Иначе цитату и список нечем закончить, и они множатся вниз.
    e.preventDefault();
    if (item) { line.classList.remove('ci'); line.removeAttribute('data-done'); }
    if (quote) placeCaret(setLineTag(line, 'DIV'));
    updateNoteMeta();
  });

  noteArea().addEventListener('input', () => {
    normalizeLines();
    updateNoteMeta();
  });
  noteArea().addEventListener('focus', normalizeLines);

  $('#noteEdit').addEventListener('click', () => setNoteMode(true));

  // Двойное касание по тексту — тот же переход в правку, но без поиска
  // кнопки: палец уже там, где хочется что-то изменить.
  let lastTap = 0;
  $('#nText').addEventListener('click', () => {
    const now = Date.now();
    if (!noteEditing && now - lastTap < 320) setNoteMode(true);
    lastTap = now;
  });

  $('#noteBack').addEventListener('click', closeSheets);
  $('#noteSettings').addEventListener('click', () => {
    // Черновик уже набран — переносим в него то, что напечатали,
    // иначе настройки закроются и текст потеряется
    draft.title = $('#nTitle').value.trim();
    draft.note = noteValue();
    openTaskSettings(undefined, false);
  });
  $('#noteSave').addEventListener('click', () => {
    const wasNew = !draft.groupId;
    if (!saveDraft()) return;
    closeSheets();
    toast(wasNew ? 'Задача добавлена' : 'Сохранено');
  });

  /* --- настройки задачи --- */
  $('#taskSave').addEventListener('click', () => {
    // Из редактора текста настройки только закрываются: правки уже в черновике,
    // а сохраняет их галочка в самом редакторе.
    if (!settingsStandalone) { $('#taskSheet').classList.remove('on'); return; }
    const wasNew = !draft.groupId;
    if (!saveDraft()) return;
    closeSheets();
    toast(wasNew ? 'Задача добавлена' : 'Сохранено');
  });

  $('#taskDelete').addEventListener('click', () => {
    if (!draft.groupId) return;
    Store.deleteGroup(draft.groupId);
    closeSheets();
    toast('Задача удалена');
  });

  /* --- шторка раздела --- */
  $('#palette').addEventListener('click', e => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    draftProj.color = b.dataset.color;
    $$('#palette .sw-col').forEach(x => x.classList.toggle('on', x.dataset.color === draftProj.color));
  });

  $('#projSave').addEventListener('click', () => {
    const name = $('#pName').value.trim();
    if (!name) { toast('Нужно название'); $('#pName').focus(); return; }
    const isNew = !draftProj.id;
    draftProj.name = name;
    draftProj.description = $('#pDescription').value.trim();
    const id = Store.saveProject(draftProj);

    $('#projSheet').classList.remove('on');
    if ($('#taskSheet').classList.contains('on')) {
      if (isNew) draft.projectId = id;
      renderProjChips();
    } else {
      closeSheets();
    }
    toast('Раздел сохранён');
  });

  $('#projDelete').addEventListener('click', async () => {
    if (!draftProj.id) return;
    const ok = await askConfirm({
      title: 'Удалить раздел?',
      text: 'Задачи останутся и перейдут в «Без раздела».',
      ok: 'Удалить', danger: true
    });
    if (!ok) return;
    Store.deleteProject(draftProj.id);
    if (draft && draft.projectId === draftProj.id) draft.projectId = null;
    $('#projSheet').classList.remove('on');
    if ($('#taskSheet').classList.contains('on')) renderProjChips(); else closeSheets();
    toast('Раздел удалён');
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (Store.state.settings.theme === 'system') applyTheme();
  });
}

/* ============================================================
   Старт
   ============================================================ */

async function init() {
  Store.load();
  applyTheme();
  ensureSettingsMarkup();
  renderWeekdays();
  bind();
  Picker.bind();
  setCollapsed(false);

  // Страница и вид списка, выбранные в настройках. Приложение открывается
  // там, где человек работает чаще всего, а не всегда на календаре.
  listMode = Store.state.settings.startListMode === 'date' ? 'date' : 'sections';
  const start = Store.state.settings.startView;
  if (start === 'v-list') switchView('v-list', { record: false, resetHistory: true });

  Store.onChange(state => {
    render();
    Notify.scheduleSoon(state);
  });

  render();

  if (Notify.isNative()) {
    permState = await Notify.checkPermission();
    if (permState === 'granted') {
      await Notify.createChannels();
      await Notify.reschedule(Store.state);
    }
    Notify.onTap(date => {
      selected = date;
      const d = DT.parse(date);
      cursor = new Date(d.getFullYear(), d.getMonth(), 1);
      switchView('v-cal', { record: false, resetHistory: true });
    });
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden) {
        await Notify.reschedule(Store.state);
        await refreshNotifState();
        if ($('.view.active')?.id === 'v-set') renderSettings();
        await checkOpenedFile();
      }
    });

    await checkOpenedFile();
  }

  await refreshNotifState();
}

document.addEventListener('DOMContentLoaded', init);
