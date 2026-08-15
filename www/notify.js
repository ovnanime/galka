/* ============================================================
   Уведомления. На вебе всё превращается в заглушки,
   на Android работает через нативный AlarmManager.
   ============================================================ */

const Notify = (() => {

  const DIGEST_DAYS = 14;      // на сколько дней вперёд планируем сводки
  const MAX_TASK_ALARMS = 300; // потолок по будильникам на конкретные задачи

  // Диапазоны id, чтобы разные типы не затирали друг друга
  const ID = {
    morning: i => 10000 + i,
    untimed: i => 20000 + i,
    overdue: i => 30000 + i,
    task:    id => 200000 + id,
    test:    () => 900000 + Math.floor(Date.now() % 90000)
  };

  const CHANNEL = {
    reminders: 'reminders_v3',
    digest: 'digest_v3'
  };

  const plugin = () => window.Capacitor?.Plugins?.LocalNotifications || null;
  const settingsPlugin = () => window.Capacitor?.Plugins?.AppSettings || null;
  const isNative = () => !!(window.Capacitor?.isNativePlatform?.() && plugin());
  let useCustomChannels = false;
  let lastError = '';

  const errorText = e => String(e?.message || e || 'Неизвестная ошибка').replace(/^Error:\s*/, '');

  /* ---------- разрешения и каналы ---------- */

  async function requestPermission() {
    if (!isNative()) return 'granted';
    try {
      const res = await plugin().requestPermissions();
      if (res.display !== 'granted') lastError = 'Разрешение на уведомления не выдано';
      return res.display;
    } catch (e) {
      lastError = errorText(e);
      return 'denied';
    }
  }

  async function checkPermission() {
    if (!isNative()) return 'granted';
    const res = await plugin().checkPermissions();
    return res.display;
  }

  async function createChannels() {
    if (!isNative()) return false;
    const nativeSettings = settingsPlugin();
    if (nativeSettings?.ensureNotificationChannels) {
      try {
        await nativeSettings.ensureNotificationChannels();
        useCustomChannels = true;
        return true;
      } catch (e) {
        console.warn('Не удалось создать нативные каналы уведомлений', e);
      }
    }
    const channels = [{
        id: CHANNEL.reminders, name: 'Напоминания о задачах',
        description: 'Срабатывают перед задачей со временем',
        importance: 4, visibility: 1, vibration: true
      }, {
        id: CHANNEL.digest, name: 'Сводки за день',
        description: 'Список задач утром, напоминание вечером',
        importance: 3, visibility: 1, vibration: true
      }];
    let created = 0;
    for (const channel of channels) {
      try { await plugin().createChannel(channel); created++; }
      catch (e) { console.warn('Не удалось создать канал уведомлений', e); }
    }
    useCustomChannels = created === channels.length;
    return useCustomChannels;
  }

  async function areEnabled() {
    if (!isNative()) return null;
    try { return (await plugin().areEnabled()).value; }
    catch (e) { lastError = errorText(e); return false; }
  }

  /* ---------- точные будильники (Android 12+) ---------- */

  async function checkExact() {
    if (!isNative()) return 'granted';
    try {
      const r = await plugin().checkExactNotificationSetting();
      return r.exact_alarm;
    } catch (e) {
      return 'granted';
    }
  }

  async function openExactSettings() {
    if (!isNative()) return;
    try { await plugin().changeExactNotificationSetting(); } catch (e) { console.warn(e); }
  }

  /* ---------- сборка расписания ---------- */

  function pluralTasks(n) {
    const d = n % 10, h = n % 100;
    if (d === 1 && h !== 11) return `${n} задача`;
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return `${n} задачи`;
    return `${n} задач`;
  }

  function listBody(tasks, limit = 4) {
    const names = tasks.slice(0, limit).map(t => (t.time ? `${t.time} · ` : '• ') + t.title);
    const rest = tasks.length - limit;
    if (rest > 0) names.push(`…и ещё ${rest}`);
    return names.join('\n');
  }

  function build(state) {
    const out = [];
    const now = Date.now();
    const s = state.settings;
    const today = DT.today();

    /* --- 1. Напоминания к конкретным задачам --- */
    const timed = state.tasks
      .filter(t => !t.done && t.time && t.reminder != null && t.date >= DT.addDays(today, -1))
      .map(t => {
        const at = DT.at(t.date, t.time);
        at.setMinutes(at.getMinutes() - t.reminder);
        return { t, at };
      })
      .filter(x => x.at.getTime() > now + 3000)
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_TASK_ALARMS);

    for (const { t, at } of timed) {
      const proj = Store.projById(t.projectId);
      out.push({
        id: ID.task(t.id),
        title: t.title,
        body: (proj ? proj.name + ' · ' : '') +
              (t.reminder === 0 ? `сейчас, в ${t.time}` : `в ${t.time}`),
        channelId: useCustomChannels ? CHANNEL.reminders : undefined,
        smallIcon: 'ic_stat_dayplan',
        schedule: { at, allowWhileIdle: true },
        extra: { date: t.date, taskId: t.id }
      });
    }

    /* --- сводки на ближайшие дни --- */
    for (let i = 0; i < DIGEST_DAYS; i++) {
      const day = DT.addDays(today, i);
      const dayTasks = state.tasks.filter(t => t.date === day && !t.done);

      /* --- 2. Утренний список на день --- */
      if (s.morning.on && dayTasks.length) {
        const at = DT.at(day, s.morning.time);
        if (at.getTime() > now + 3000) {
          const sorted = dayTasks.slice().sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
          out.push({
            id: ID.morning(i),
            title: `Сегодня ${pluralTasks(dayTasks.length)}`,
            body: listBody(sorted),
            channelId: useCustomChannels ? CHANNEL.digest : undefined,
            smallIcon: 'ic_stat_dayplan',
            schedule: { at, allowWhileIdle: true },
            extra: { date: day }
          });
        }
      }

      /* --- 3. Задачи без конкретного времени --- */
      if (s.untimed.on) {
        const untimed = dayTasks.filter(t => !t.time);
        if (untimed.length) {
          const at = DT.at(day, s.untimed.time);
          if (at.getTime() > now + 3000) {
            out.push({
              id: ID.untimed(i),
              title: untimed.length === 1 ? untimed[0].title : `Задачи без времени: ${untimed.length}`,
              body: untimed.length === 1
                ? (Store.projById(untimed[0].projectId)?.name || 'На сегодня')
                : listBody(untimed),
              channelId: useCustomChannels ? CHANNEL.digest : undefined,
              smallIcon: 'ic_stat_dayplan',
              schedule: { at, allowWhileIdle: true },
              extra: { date: day }
            });
          }
        }
      }

      /* --- 4. Что осталось незакрытым --- */
      if (s.overdue.on) {
        const left = state.tasks.filter(t => !t.done && t.date <= day);
        if (left.length) {
          const at = DT.at(day, s.overdue.time);
          if (at.getTime() > now + 3000) {
            const past = left.filter(t => t.date < day).length;
            out.push({
              id: ID.overdue(i),
              title: `Не закрыто: ${pluralTasks(left.length)}`,
              body: past
                ? `${past} из них с прошлых дней`
                : listBody(left.slice().sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))),
              channelId: useCustomChannels ? CHANNEL.digest : undefined,
              smallIcon: 'ic_stat_dayplan',
              schedule: { at, allowWhileIdle: true },
              extra: { date: day }
            });
          }
        }
      }
    }

    return out;
  }

  /* ---------- пересборка расписания целиком ---------- */

  let pending = null;

  async function reschedule(state) {
    if (!isNative()) return build(state).length;
    try {
      const permission = await checkPermission();
      if (permission !== 'granted') {
        lastError = 'Уведомления запрещены в настройках Android';
        return 0;
      }
      if (!await areEnabled()) {
        lastError = 'Уведомления отключены в настройках Android';
        return 0;
      }
      await createChannels();
      const cur = await plugin().getPending();
      if (cur.notifications.length) {
        await plugin().cancel({ notifications: cur.notifications.map(n => ({ id: n.id })) });
      }
      const list = build(state);
      if (list.length) await plugin().schedule({ notifications: list });
      lastError = '';
      return list.length;
    } catch (e) {
      console.error('Не удалось перестроить расписание', e);
      lastError = errorText(e);
      return 0;
    }
  }

  // Дёргается на каждое изменение — склеиваем в один вызов
  function scheduleSoon(state) {
    clearTimeout(pending);
    pending = setTimeout(() => reschedule(state), 400);
  }

  /* ---------- проверочное уведомление ---------- */

  async function fireTest() {
    if (!isNative()) return { ok: false, message: 'Проверка работает только в приложении' };
    try {
      let permission = await checkPermission();
      if (permission !== 'granted') permission = await requestPermission();
      if (permission !== 'granted') return { ok: false, message: 'Разреши уведомления в настройках Android' };
      if (!await areEnabled()) return { ok: false, message: 'Уведомления отключены в настройках Android' };
      await createChannels();
      const nativeSettings = settingsPlugin();
      if (nativeSettings?.sendTestNotification) {
        await nativeSettings.sendTestNotification();
        lastError = '';
        return { ok: true };
      }
      await plugin().schedule({ notifications: [{
        id: ID.test(),
        title: 'Галка: проверка уведомлений',
        body: 'Всё работает — не забудь про галочку!',
        channelId: useCustomChannels ? CHANNEL.reminders : undefined,
        smallIcon: 'ic_stat_dayplan',
        iconColor: '#6E8BFF',
        autoCancel: true
      }] });
      lastError = '';
      return { ok: true };
    } catch (e) {
      lastError = errorText(e);
      return { ok: false, message: `Не удалось отправить: ${lastError}` };
    }
  }

  async function countPending() {
    if (!isNative()) return null;
    try {
      const cur = await plugin().getPending();
      return cur.notifications.length;
    } catch (e) { return null; }
  }

  async function status() {
    if (!isNative()) return {
      permission: 'granted', exact: 'granted', enabled: null, pending: null, error: '',
      batteryExempt: null,
      remindersChannelEnabled: null, remindersChannelImportance: null,
      remindersChannelSound: null, remindersChannelVibration: null,
      digestChannelEnabled: null, digestChannelImportance: null,
      digestChannelSound: null, digestChannelVibration: null,
      versionName: '1.0.1', versionCode: 2
    };
    const permission = await checkPermission();
    const exact = await checkExact();
    const enabled = await areEnabled();
    const pending = await countPending();
    let system = {};
    const nativeSettings = settingsPlugin();
    if (nativeSettings?.getStatus) {
      try { system = await nativeSettings.getStatus(); }
      catch (e) { console.warn('Не удалось прочитать системные настройки', e); }
    }
    return Object.assign({ permission, exact, enabled, pending, error: lastError }, system);
  }

  async function systemCall(method, options = {}) {
    const nativeSettings = settingsPlugin();
    if (!nativeSettings?.[method]) return false;
    try {
      await nativeSettings[method](options);
      return true;
    } catch (e) {
      lastError = errorText(e);
      return false;
    }
  }

  const openNotificationSettings = () => systemCall('openNotificationSettings');
  const openNotificationChannelSettings = (channel = 'reminders') =>
    systemCall('openNotificationChannelSettings', {
      channelId: CHANNEL[channel] || CHANNEL.reminders
    });
  const openBatterySettings = () => systemCall('openBatterySettings');
  const openAppDetails = () => systemCall('openAppDetails');

  async function openUrl(url) {
    if (!url) return false;
    if (isNative() && settingsPlugin()?.openUrl) return systemCall('openUrl', { url });
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    return !!opened;
  }

  function onTap(handler) {
    if (!isNative()) return;
    plugin().addListener('localNotificationActionPerformed', ev => {
      const extra = ev.notification?.extra;
      if (extra?.date) handler(extra.date, extra.taskId ?? null);
    });
  }

  return {
    isNative, requestPermission, checkPermission, createChannels, areEnabled, status,
    checkExact, openExactSettings,
    openNotificationSettings, openNotificationChannelSettings, openBatterySettings, openAppDetails, openUrl,
    build, reschedule, scheduleSoon, fireTest, countPending, onTap
  };
})();
