/* ============================================================
   Обмен расписаниями через файл «.galka».

   На Android файл отдаётся системе: экспорт — через «Поделиться»,
   импорт — через системный выбор файла. В браузере то же самое
   делается обычной загрузкой и <input type="file">.
   ============================================================ */

const Backup = (() => {

  const plugin = () => window.Capacitor?.Plugins?.AppSettings || null;
  const isNative = () => !!(window.Capacitor?.isNativePlatform?.() && plugin());

  const errorText = e => String(e?.message || e || 'Неизвестная ошибка').replace(/^Error:\s*/, '');

  function fileName() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `galka-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${BACKUP_EXT}`;
  }

  /* ---------- экспорт ---------- */

  async function save(appMeta) {
    const bundle = Store.exportBundle(appMeta);
    if (!bundle.counts.tasks && !bundle.counts.projects) {
      return { ok: false, message: 'Нечего сохранять' };
    }

    const content = JSON.stringify(bundle, null, 2);
    const name = fileName();

    if (isNative() && plugin().exportFile) {
      try {
        await plugin().exportFile({ filename: name, content });
        return { ok: true };
      } catch (e) {
        return { ok: false, message: `Не удалось сохранить: ${errorText(e)}` };
      }
    }

    try {
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: `Не удалось сохранить: ${errorText(e)}` };
    }
  }

  /**
   * Копия перед удалением всех данных. В отличие от экспорта пишется сразу
   * в известное место, без окна «куда сохранить»: пользователь в этот момент
   * занят подтверждением удаления, а копия нужна гарантированно.
   */
  async function autoSave(appMeta) {
    const bundle = Store.exportBundle(appMeta);
    if (!bundle.counts.tasks && !bundle.counts.projects) return { ok: true, location: '' };

    const content = JSON.stringify(bundle, null, 2);
    const name = fileName();

    if (isNative() && plugin().saveBackup) {
      try {
        const res = await plugin().saveBackup({ filename: name, content });
        return { ok: true, location: res?.location || '' };
      } catch (e) {
        return { ok: false, message: `Копия не сохранена: ${errorText(e)}` };
      }
    }

    const saved = await save(appMeta);
    return saved.ok ? { ok: true, location: '' } : saved;
  }

  /* ---------- выбор файла ---------- */

  function pickInBrowser() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = `${BACKUP_EXT},application/json`;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) { input.remove(); resolve({ cancelled: true }); return; }
        const reader = new FileReader();
        reader.onload = () => { input.remove(); resolve({ content: String(reader.result) }); };
        reader.onerror = () => { input.remove(); resolve({ error: 'Не удалось прочитать файл' }); };
        reader.readAsText(file);
      });
      input.click();
    });
  }

  /** Файл, которым открыли приложение из проводника. null — открывали обычно. */
  async function openedFile() {
    if (!isNative() || !plugin().consumeOpenedFile) return null;
    try {
      const res = await plugin().consumeOpenedFile();
      return res?.has ? String(res.content || '') : null;
    } catch (e) {
      return null;
    }
  }

  /** Возвращает { content } | { cancelled: true } | { error } */
  async function pick() {
    if (isNative() && plugin().importFile) {
      try {
        const res = await plugin().importFile();
        if (res?.cancelled) return { cancelled: true };
        return { content: String(res?.content || '') };
      } catch (e) {
        return { error: errorText(e) };
      }
    }
    return pickInBrowser();
  }

  return { save, autoSave, pick, openedFile, fileName, isNative };
})();
