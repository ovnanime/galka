/* ============================================================
   Витринный набор задач для скриншотов: store/demo.galka

   Даты считаются от сегодняшнего дня, поэтому календарь на снимке
   всегда выглядит живым, а не пустым.

   Запуск: node store/make-demo.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

const base = new Date();
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = n => ymd(new Date(base.getFullYear(), base.getMonth(), base.getDate() + n));

/** Дни недели в диапазоне: 1 — понедельник, 7 — воскресенье */
function weekdays(from, to, list) {
  const out = [];
  for (let n = from; n <= to; n++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
    const wd = d.getDay() === 0 ? 7 : d.getDay();
    if (list.includes(wd)) out.push(ymd(d));
  }
  return out;
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => day(from + i));

const projects = [
  { id: 1, name: 'Работа',   color: '#6E8BFF', description: 'Текущие дела и созвоны' },
  { id: 2, name: 'Учёба',    color: '#F5A524', description: 'Семестр разбит на циклы' },
  { id: 3, name: 'Здоровье', color: '#A3E635', description: '' },
  { id: 4, name: 'Дом',      color: '#FB7185', description: '' },
  { id: 5, name: 'Личное',   color: '#2DD4BF', description: '' }
];

let id = 100, group = 500;
const tasks = [];

/** @param done — смещения дней, которые считаются выполненными */
function add(projectId, title, days, time, reminder, note, done = []) {
  group++;
  days.forEach(date => {
    tasks.push({
      id: id++, groupId: group, projectId, title,
      note: note || '', date, time: time || null,
      reminder: time ? reminder : null,
      done: done.includes(date),
      createdAt: Date.now() - id * 60000,
      doneAt: done.includes(date) ? Date.now() : null
    });
  });
}

/* --- Работа --- */
add(1, 'Отчёт за квартал', range(-1, 2), null, null, 'Свести цифры и отправить',
    [day(-1), day(0)]);
add(1, 'Созвон с командой', weekdays(-3, 14, [2, 5]), '11:00', 15, '', [day(-3)]);
add(1, 'Разобрать почту', range(0, 4), '09:30', 5, '');
add(1, 'Согласовать смету', [day(3)], '14:00', 30, 'Уточнить сроки');

/* --- Учёба --- */
add(2, 'Цикл 1: линейная алгебра', range(-2, 2), null, null, 'Пять тем подряд',
    [day(-2), day(-1)]);
add(2, 'Цикл 2: матанализ', range(5, 9), null, null, '');
add(2, 'Зачёт', [day(12)], '10:00', 120, 'Аудитория 314');

/* --- Здоровье --- */
add(3, 'Тренировка', weekdays(-2, 12, [1, 3, 5]), '19:00', 30, '', [day(-2)]);
add(3, 'Записаться к врачу', [day(1)], null, null, '');

/* --- Дом --- */
add(4, 'Оплатить счета', [day(0)], '12:00', 60, '');
add(4, 'Генеральная уборка', weekdays(0, 10, [6]), null, null, '');

/* --- Личное --- */
add(5, 'Позвонить родителям', [day(0)], '20:00', 15, '');
add(5, 'Книга, по 30 страниц', range(0, 6), null, null, '', [day(0)]);

const bundle = {
  format: 'galka',
  formatVersion: 1,
  exportedAt: new Date().toISOString(),
  app: { versionName: '1.0.0', versionCode: 1 },
  counts: {
    projects: projects.length,
    tasks: tasks.length,
    groups: new Set(tasks.map(t => t.groupId)).size
  },
  data: {
    projects,
    tasks,
    settings: {
      theme: 'dark',
      accent: 'white',
      defaultReminder: 15,
      morning: { on: true, time: '08:00' },
      untimed: { on: true, time: '10:00' },
      overdue: { on: true, time: '21:00' }
    }
  }
};

const out = path.join(__dirname, 'demo.galka');
fs.writeFileSync(out, JSON.stringify(bundle, null, 2), 'utf8');

console.log(`готово: ${out}`);
console.log(`разделов: ${bundle.counts.projects}, задач: ${bundle.counts.groups}, дней занято: ${bundle.counts.tasks}`);
console.log(`диапазон дат: ${tasks.map(t => t.date).sort()[0]} — ${tasks.map(t => t.date).sort().slice(-1)[0]}`);
console.log(`выполнено дней: ${tasks.filter(t => t.done).length}`);
