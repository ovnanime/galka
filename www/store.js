/* ============================================================
   Хранилище: разделы, задачи, настройки. Всё локально.

   Задача живёт группой: у неё есть выбранные дни, и на каждый
   создаётся своя запись. Один день — разовая задача,
   несколько — цикл. Отдельной сущности для цикла нет.
   ============================================================ */

const PALETTE = [
  '#6E8BFF', '#2DD4BF', '#F5A524', '#FB7185',
  '#A78BFA', '#A3E635', '#38BDF8', '#FB923C'
];

const NO_PROJ_COLOR = '#6B7488';

// Формат файла обмена расписаниями
const BACKUP_FORMAT = 'galka';
const BACKUP_VERSION = 1;
const BACKUP_EXT = '.galka';

/* ---------- Работа с датами (всё в локальном времени) ---------- */

const DT = {
  ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  at(dateStr, timeStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  },
  today() { return DT.ymd(new Date()); },
  addDays(dateStr, n) {
    const d = DT.parse(dateStr);
    d.setDate(d.getDate() + n);
    return DT.ymd(d);
  },
  monthLabel(d) {
    // year: 'numeric' добавляет « г.» — собираем вручную
    const month = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(d);
    return `${month} ${d.getFullYear()}`;
  },
  dayLabel(dateStr) {
    const d = DT.parse(dateStr);
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  },
  shortDay(dateStr) {
    const d = DT.parse(dateStr);
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(d);
  },
  // «12 авг» — для тесных мест
  tinyDay(dateStr) {
    const d = DT.parse(dateStr);
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(d).replace('.', '');
  },
  relLabel(dateStr) {
    const t = DT.today();
    if (dateStr === t) return 'Сегодня';
    if (dateStr === DT.addDays(t, 1)) return 'Завтра';
    if (dateStr === DT.addDays(t, -1)) return 'Вчера';
    return null;
  }
};

/* ---------- Хранилище ---------- */

const Store = (() => {
  const KEY = 'dayplan.v1';

  const DEFAULTS = () => ({
    seq: 1,
    projects: [],
    tasks: [],
    settings: {
      theme: 'dark',
      defaultReminder: 15,
      morning: { on: true, time: '08:00' },
      untimed: { on: true, time: '10:00' },
      overdue: { on: true, time: '21:00' }
    }
  });

  let state = DEFAULTS();
  const listeners = [];

  /**
   * Данные ранних версий. Там были расписания релизов и циклов —
   * теперь их нет, задачи просто становятся обычными.
   */
  function migrate() {
    state.projects.forEach(p => {
      delete p.release;
      delete p.cycle;
      if (typeof p.description !== 'string') p.description = '';
    });
    state.tasks.forEach(t => {
      delete t.gen;
      if (t.groupId == null) t.groupId = state.seq++;
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(DEFAULTS(), parsed);
        state.settings = Object.assign(DEFAULTS().settings, parsed.settings || {});
        migrate();
      }
    } catch (e) {
      console.warn('Не удалось прочитать данные, начинаем с чистого листа', e);
    }
    return state;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Не удалось сохранить', e);
    }
  }

  function emit() {
    persist();
    listeners.forEach(fn => fn(state));
  }

  const nextId = () => state.seq++;

  /* --- задачи --- */

  /**
   * Создаёт или обновляет задачу целиком, по всем её дням.
   * Дни, которые остались выбранными, сохраняют отметку о выполнении.
   * Снятые дни удаляются, добавленные создаются.
   */
  function saveGroup(data) {
    const gid = data.groupId || nextId();
    const dates = Array.from(new Set(data.dates)).sort();
    if (!dates.length) return gid;

    const kept = new Map();
    state.tasks.forEach(t => { if (t.groupId === gid) kept.set(t.date, t); });

    state.tasks = state.tasks.filter(t => t.groupId !== gid || dates.includes(t.date));

    dates.forEach(date => {
      const cur = kept.get(date);
      if (cur) {
        cur.title = data.title;
        cur.note = data.note || '';
        cur.projectId = data.projectId ?? null;
        cur.time = data.time || null;
        cur.reminder = data.reminder ?? null;
      } else {
        state.tasks.push({
          id: nextId(),
          groupId: gid,
          title: data.title,
          note: data.note || '',
          projectId: data.projectId ?? null,
          date,
          time: data.time || null,
          reminder: data.reminder ?? null,
          done: false,
          createdAt: Date.now(),
          doneAt: null
        });
      }
    });

    emit();
    return gid;
  }

  function deleteGroup(groupId) {
    state.tasks = state.tasks.filter(t => t.groupId !== groupId);
    emit();
  }

  function toggleTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    emit();
  }

  /** Задача со всеми её днями */
  function groupById(groupId) {
    const tasks = state.tasks
      .filter(t => t.groupId === groupId)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!tasks.length) return null;
    const f = tasks[0];
    return {
      groupId,
      title: f.title,
      note: f.note,
      projectId: f.projectId,
      time: f.time,
      reminder: f.reminder,
      dates: tasks.map(t => t.date),
      tasks,
      done: tasks.filter(t => t.done).length,
      total: tasks.length
    };
  }

  /** Все задачи, свёрнутые по группам */
  function groups() {
    const seen = new Set();
    const out = [];
    state.tasks.forEach(t => {
      if (seen.has(t.groupId)) return;
      seen.add(t.groupId);
      out.push(groupById(t.groupId));
    });
    return out;
  }

  /* --- разделы --- */

  function saveProject(data) {
    let id = data.id;
    if (id) {
      const i = state.projects.findIndex(p => p.id === id);
      if (i >= 0) state.projects[i] = Object.assign({}, state.projects[i], data);
    } else {
      id = nextId();
      state.projects.push({
        id,
        name: data.name,
        color: data.color || PALETTE[0],
        description: data.description || ''
      });
    }
    emit();
    return id;
  }

  function deleteProject(id) {
    state.projects = state.projects.filter(p => p.id !== id);
    state.tasks.forEach(t => { if (t.projectId === id) t.projectId = null; });
    emit();
  }

  /* --- выборки --- */

  const byId = id => state.tasks.find(t => t.id === id);
  const projById = id => state.projects.find(p => p.id === id) || null;
  const colorOf = t => (projById(t.projectId)?.color) || NO_PROJ_COLOR;

  function forDate(dateStr) {
    return state.tasks
      .filter(t => t.date === dateStr)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (!a.time && !b.time) return a.createdAt - b.createdAt;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
      });
  }

  function overdue(beforeDate) {
    return state.tasks
      .filter(t => !t.done && t.date < beforeDate)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  }

  function updateSettings(patch) {
    state.settings = Object.assign({}, state.settings, patch);
    emit();
  }

  /* ============================================================
     Свой формат файла «.galka» — обычный JSON с шапкой.
     Синхронизации нет намеренно: она требует сервера и аккаунтов,
     а приложение бесплатное. Перенос делается файлом.
     ============================================================ */

  const isColor = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  const isDate  = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTime  = v => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
  const asText  = (v, fallback, limit) =>
    (typeof v === 'string' && v.trim() ? v : fallback).slice(0, limit);
  const asInt   = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  };

  function exportBundle(app) {
    return {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      app: app || null,
      counts: {
        projects: state.projects.length,
        tasks: state.tasks.length,
        groups: new Set(state.tasks.map(t => t.groupId)).size
      },
      data: {
        projects: state.projects,
        tasks: state.tasks,
        settings: state.settings
      }
    };
  }

  /** Разбирает и проверяет файл, ничего не меняя в текущих данных */
  function readBundle(raw) {
    let parsed;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return { ok: false, error: 'Файл повреждён — не удалось его прочитать' };
    }
    if (!parsed || typeof parsed !== 'object' || parsed.format !== BACKUP_FORMAT) {
      return { ok: false, error: 'Это не файл «Галки»' };
    }
    if (asInt(parsed.formatVersion, 1) > BACKUP_VERSION) {
      return { ok: false, error: 'Файл создан более новой версией приложения' };
    }
    const d = parsed.data;
    if (!d || !Array.isArray(d.projects) || !Array.isArray(d.tasks)) {
      return { ok: false, error: 'В файле нет разделов и задач' };
    }
    return {
      ok: true,
      bundle: parsed,
      counts: {
        projects: d.projects.length,
        tasks: d.tasks.length,
        groups: new Set(d.tasks.map(t => t.groupId)).size,
        exportedAt: parsed.exportedAt || null
      }
    };
  }

  function cleanProject(raw, id) {
    return {
      id,
      name: asText(raw?.name, 'Без названия', 120),
      color: isColor(raw?.color) ? raw.color : PALETTE[0],
      description: typeof raw?.description === 'string' ? raw.description.slice(0, 500) : ''
    };
  }

  function cleanTask(raw, id, groupId, projectId) {
    const reminder = raw?.reminder == null ? null : asInt(raw.reminder, null);
    return {
      id,
      groupId,
      projectId,
      title: asText(raw?.title, 'Без названия', 200),
      note: typeof raw?.note === 'string' ? raw.note.slice(0, 1000) : '',
      date: isDate(raw?.date) ? raw.date : DT.today(),
      time: isTime(raw?.time) ? raw.time : null,
      reminder,
      done: !!raw?.done,
      createdAt: asInt(raw?.createdAt, Date.now()),
      doneAt: raw?.doneAt == null ? null : asInt(raw.doneAt, null)
    };
  }

  /**
   * Кладёт содержимое файла в приложение.
   * mode 'replace' — вместо текущих данных, 'merge' — в дополнение к ним.
   * Во втором случае все идентификаторы выдаются заново, чтобы
   * задачи из файла не затёрли уже существующие.
   */
  function applyBundle(bundle, mode) {
    const d = bundle.data;

    const projects = [];
    const tasks = [];
    const projectMap = new Map();
    const groupMap = new Map();

    if (mode === 'replace') {
      state.projects = [];
      state.tasks = [];
      state.seq = 1;
    }

    d.projects.forEach(p => {
      const id = nextId();
      projectMap.set(p?.id, id);
      projects.push(cleanProject(p, id));
    });

    d.tasks.forEach(t => {
      const rawGroup = t?.groupId ?? `solo-${t?.id}`;
      if (!groupMap.has(rawGroup)) groupMap.set(rawGroup, nextId());
      const projectId = projectMap.has(t?.projectId) ? projectMap.get(t.projectId) : null;
      tasks.push(cleanTask(t, nextId(), groupMap.get(rawGroup), projectId));
    });

    state.projects = state.projects.concat(projects);
    state.tasks = state.tasks.concat(tasks);

    if (mode === 'replace' && d.settings) {
      const theme = state.settings.theme;   // оформление остаётся как на этом телефоне
      state.settings = Object.assign(DEFAULTS().settings, d.settings, { theme });
    }

    emit();
    return { projects: projects.length, tasks: tasks.length, groups: groupMap.size };
  }

  return {
    load, emit,
    get state() { return state; },
    onChange: fn => listeners.push(fn),
    saveGroup, deleteGroup, toggleTask, groupById, groups,
    saveProject, deleteProject,
    byId, projById, colorOf, forDate, overdue, updateSettings,
    exportBundle, readBundle, applyBundle
  };
})();
