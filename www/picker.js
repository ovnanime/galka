/* ============================================================
   Свои окна выбора вместо системных.

   Android показывает круглые часы и радио-списки в своём оформлении,
   которое не имеет ничего общего с приложением. Здесь три окна —
   время, дата и список вариантов — на одной шторке.
   ============================================================ */

const Picker = (() => {

  const ITEM_H = 44;          // высота строки барабана, синхронно с CSS
  let resolver = null;        // ждёт результат текущего окна
  let state = null;           // { type, value, month }

  const el = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');

  /* ---------- общее ---------- */

  function finish(value) {
    const done = resolver;
    resolver = null;
    state = null;
    if (done) done(value);
  }

  /** Закрытие снаружи (кнопка «Назад», тап по фону) */
  function cancel() {
    if (!resolver) return false;
    finish(null);
    return true;
  }

  const isOpen = () => !!resolver;

  function open(type, config) {
    // Если предыдущее окно почему-то не закрылось — не теряем его промис
    if (resolver) finish(null);

    return new Promise(resolve => {
      resolver = resolve;
      state = { type, value: config.value ?? null, month: null };
      el('pickerTitle').textContent = config.title || '';
      el('pickerDone').style.display = type === 'time' ? '' : 'none';

      if (type === 'time') renderTime(config);
      else if (type === 'date') renderDate(config);
      else renderChoice(config);

      showSheet('#pickerSheet');
    });
  }

  /* ---------- время ---------- */

  function renderTime(config) {
    const [h, m] = /^\d{2}:\d{2}$/.test(config.value || '')
      ? config.value.split(':').map(Number)
      : [12, 0];
    state.value = `${pad(h)}:${pad(m)}`;

    const column = (name, count) => {
      const items = Array.from({ length: count },
        (_, i) => `<div class="wheel-item" data-index="${i}">${pad(i)}</div>`).join('');
      return `<div class="wheel" data-wheel="${name}">
        <div class="wheel-pad"></div>${items}<div class="wheel-pad"></div>
      </div>`;
    };

    el('pickerBody').innerHTML = `<div class="wheel-box">
      <div class="wheel-band" aria-hidden="true"></div>
      ${column('h', 24)}
      <span class="wheel-colon">:</span>
      ${column('m', 60)}
    </div>`;

    setupWheel('h', h);
    setupWheel('m', m);
  }

  function setupWheel(name, index) {
    const wheel = document.querySelector(`[data-wheel="${name}"]`);
    wheel.scrollTop = index * ITEM_H;
    mark(wheel, index);

    let timer = null;
    wheel.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const picked = Math.round(wheel.scrollTop / ITEM_H);
        mark(wheel, picked);
        const [h, m] = state.value.split(':').map(Number);
        state.value = name === 'h' ? `${pad(picked)}:${pad(m)}` : `${pad(h)}:${pad(picked)}`;
      }, 90);
    }, { passive: true });

    // Тап по строке — быстрее, чем докручивать
    wheel.addEventListener('click', e => {
      const item = e.target.closest('[data-index]');
      if (!item) return;
      wheel.scrollTo({ top: Number(item.dataset.index) * ITEM_H, behavior: 'smooth' });
    });
  }

  function mark(wheel, index) {
    wheel.querySelectorAll('.wheel-item.on').forEach(x => x.classList.remove('on'));
    wheel.querySelector(`[data-index="${index}"]`)?.classList.add('on');
  }

  /* ---------- дата ---------- */

  function renderDate(config) {
    const value = /^\d{4}-\d{2}-\d{2}$/.test(config.value || '') ? config.value : DT.today();
    state.value = value;
    state.month = DT.parse(value);
    drawMonth();
  }

  function drawMonth() {
    const label = cap(DT.monthLabel(state.month));
    const days = monthCells(state.month, state.value).map(c => {
      const cls = ['pick-day'];
      if (c.out) cls.push('out');
      if (c.we) cls.push('we');
      if (c.today) cls.push('today');
      if (c.sel) cls.push('on');
      return `<button class="${cls.join(' ')}" data-day="${c.key}">${c.num}</button>`;
    }).join('');

    el('pickerBody').innerHTML = `<div class="picker">
      <div class="picker-head">
        <button data-shift="-1" aria-label="Предыдущий месяц">
          <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
        <b>${label}</b>
        <button data-shift="1" aria-label="Следующий месяц">
          <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
      <div class="pick-wd">${WEEKDAYS
        .map((d, i) => `<span class="${i >= 5 ? 'we' : ''}">${d}</span>`).join('')}</div>
      <div class="pick-grid">${days}</div>
    </div>`;
  }

  /* ---------- список вариантов ---------- */

  function renderChoice(config) {
    el('pickerBody').innerHTML = `<div class="choice-list">
      ${config.options.map(option => `
        <button class="choice-row ${option.value === config.value ? 'on' : ''}"
          data-choice="${option.value === null ? '' : option.value}">
          <span>${option.label}</span>
          <i aria-hidden="true"></i>
        </button>`).join('')}
    </div>`;
  }

  /* ---------- события ---------- */

  function bind() {
    el('pickerCancel').addEventListener('click', () => { closePicker(); });
    el('pickerDone').addEventListener('click', () => {
      const value = state?.value ?? null;
      finish(value);
      closePicker();
    });

    el('pickerBody').addEventListener('click', e => {
      if (!state) return;

      const shift = e.target.closest('[data-shift]');
      if (shift) {
        state.month.setMonth(state.month.getMonth() + Number(shift.dataset.shift));
        drawMonth();
        return;
      }

      const day = e.target.closest('[data-day]');
      if (day) {
        finish(day.dataset.day);
        closePicker();
        return;
      }

      const choice = e.target.closest('[data-choice]');
      if (choice) {
        const raw = choice.dataset.choice;
        // Обёртка нужна, чтобы отличить выбор варианта «Нет» от отмены окна
        finish({ value: raw === '' ? null : Number(raw) });
        closePicker();
      }
    });
  }

  return {
    bind, cancel, isOpen,
    time: config => open('time', config),
    date: config => open('date', config),
    choice: config => open('choice', config)
  };
})();
