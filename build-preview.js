// Собирает www/ в один самодостаточный файл для веб-витрины.
// Нужен только для предпросмотра — в APK уезжает обычный www/.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'www');
const OUT = process.argv[2];
if (!OUT) { console.error('укажи путь для результата'); process.exit(1); }

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const assetName = f => f.replace(/[?#].*$/, '');
let html = read('index.html');

// Демо-данные, чтобы страница открылась не пустой.
// Ставим только если пользователь ещё ничего не создал.
const seed = `
(function () {
  try {
    if (localStorage.getItem('dayplan.v1')) return;
  } catch (e) { return; }

  var base = new Date();
  var d = function (n) {
    var x = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  };

  var id = 10, gid = 500, tasks = [];
  // Одна задача = один заход. Дней может быть сколько угодно.
  var add = function (pid, title, days, time, rem, note, doneOffsets) {
    gid++;
    days.forEach(function (n) {
      tasks.push({
        id: id++, groupId: gid, projectId: pid, title: title,
        date: d(n), time: time || null, reminder: time ? rem : null,
        done: (doneOffsets || []).indexOf(n) >= 0,
        note: note || '', createdAt: Date.now() - id * 1000, doneAt: null
      });
    });
  };

  // Учёба: несколько циклов внутри одного раздела
  add(1, 'Цикл 1', [-2, -1, 0, 1, 2], null, null, 'Первые пять тем', [-2, -1]);
  add(1, 'Цикл 2', [5, 6, 7, 8, 9], null, null, '');
  add(1, 'Зачёт',  [10], '10:00', 120, '');

  // Другой раздел — другая работа, механика та же
  add(2, 'Серия 12',            [0], '18:00', 15, 'Проверить дорожку 4K');
  add(2, 'Серия 13',            [3], '18:00', 15, '');
  add(3, 'Отправить смету',     [0], '14:00', 30, '');
  add(3, 'Правки по лендингу',  [1, 2], '10:00', 60, 'Шапка и блок с ценами');
  add(4, 'Забрать посылку',     [0], null, null, '', [0]);
  add(4, 'Записаться к врачу', [-2], null, null, '');

  var data = {
    seq: 2000,
    projects: [
      { id: 1, name: 'Учёба',    color: '#F5A524' },
      { id: 2, name: 'Озвучка',  color: '#6E8BFF' },
      { id: 3, name: 'Клиенты',  color: '#2DD4BF' },
      { id: 4, name: 'Личное',   color: '#FB7185' }
    ],
    tasks: tasks,
    settings: {
      theme: 'dark', defaultReminder: 15,
      morning: { on: true, time: '08:00' },
      untimed: { on: true, time: '10:00' },
      overdue: { on: true, time: '21:00' }
    }
  };
  try { localStorage.setItem('dayplan.v1', JSON.stringify(data)); } catch (e) {}
})();`;

// Вклеиваем стили и скрипты
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g,
  (m, f) => `<style>\n${read(assetName(f))}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g,
  (m, f) => `<script>\n${read(assetName(f))}\n</script>`);

// Витрина публикуется без обёртки документа: оставляем title, стили и содержимое body
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, 'Галка: Планы и заметки'])[1];
const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const body = (html.match(/<body>([\s\S]*?)<\/body>/) || [, ''])[1];

const out = `<title>${title}</title>\n${style}\n<script>${seed}</script>\n${body}\n`;

fs.writeFileSync(OUT, out, 'utf8');
console.log(`готово: ${OUT} (${(Buffer.byteLength(out) / 1024).toFixed(0)} КБ)`);
