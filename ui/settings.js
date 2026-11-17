/* Settings dialog and the view toggles it controls (word wrap, sidebar, menu bar, status bar, fonts,
 * colours, defaults for new tabs). Loaded before renderer.js; only touches renderer globals inside
 * functions. Settings are saved in session.json (ui.settings) like every other remembered state. */

const settingsEl = document.getElementById('settings');
const statusbarEl = document.querySelector('.statusbar');

const DEFAULT_SETTINGS = {
  restoreSession: true,
  menuBar: true,
  sidebar: true,
  statusBar: true,
  wordWrap: true,
  tabSize: 4,
  newTabView: 'preview-only', // or 'same' = same view as the tab you are on
  newTabFontSize: 14,
  editFont: 'Consolas',
  editStyle: 'normal',
  editColor: '', // '' = follow the theme
  editBg: '',
  previewFont: 'Segoe UI',
  previewStyle: 'normal',
  previewColor: '',
  previewBg: '',
};

let settings = { ...DEFAULT_SETTINGS };
let appliedMenuBar = null;

const FONT_STYLES = {
  normal: ['400', 'normal'],
  bold: ['700', 'normal'],
  italic: ['400', 'italic'],
  'bold-italic': ['700', 'italic'],
};

function loadSettings(saved) {
  settings = { ...DEFAULT_SETTINGS };
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (saved[k] !== undefined && typeof saved[k] === typeof DEFAULT_SETTINGS[k]) settings[k] = saved[k];
    }
  }
  settings.newTabFontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(settings.newTabFontSize)));
  if (![2, 4, 8].includes(settings.tabSize)) settings.tabSize = 4;
}

function fontStack(name, mono) {
  const clean = String(name || '').replace(/["';{}<>\\]/g, '').trim();
  const fallback = mono ? 'Consolas, "Cascadia Code", Menlo, monospace' : '"Segoe UI", Tahoma, Arial, sans-serif';
  return clean ? '"' + clean + '", ' + fallback : fallback;
}

function setVar(name, value) {
  const s = document.documentElement.style;
  if (value) s.setProperty(name, value);
  else s.removeProperty(name);
}

const COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Applies every setting to the page (cheap; safe to call after any change). */
function applySettings() {
  const [ew, es] = FONT_STYLES[settings.editStyle] || FONT_STYLES.normal;
  const [pw, ps] = FONT_STYLES[settings.previewStyle] || FONT_STYLES.normal;
  setVar('--edit-font-family', fontStack(settings.editFont, true));
  setVar('--edit-font-weight', ew);
  setVar('--edit-font-style', es);
  setVar('--edit-fg', COLOR_RE.test(settings.editColor) ? settings.editColor : '');
  setVar('--edit-bg', COLOR_RE.test(settings.editBg) ? settings.editBg : '');
  setVar('--preview-font-family', fontStack(settings.previewFont, false));
  setVar('--preview-font-weight', pw);
  setVar('--preview-font-style', ps);
  setVar('--preview-fg', COLOR_RE.test(settings.previewColor) ? settings.previewColor : '');
  setVar('--preview-bg', COLOR_RE.test(settings.previewBg) ? settings.previewBg : '');
  setVar('--tab-size', String(settings.tabSize));

  document.body.classList.toggle('nowrap', !settings.wordWrap);
  editor.setAttribute('wrap', settings.wordWrap ? 'soft' : 'off');
  sidebarEl.classList.toggle('hidden', !settings.sidebar);
  statusbarEl.classList.toggle('hidden', !settings.statusBar);
  if (appliedMenuBar !== settings.menuBar) {
    appliedMenuBar = settings.menuBar;
    invoke('cmd_set_menu_visible', { visible: settings.menuBar }).catch((e) => console.error('menu bar', e));
  }
  renderEditorOverlay();
  updateLineNumbers();
  updateTabScrollButtons();
  if (typeof scheduleGridRender === 'function') scheduleGridRender();
}

function changeSetting(key, value) {
  settings[key] = value;
  applySettings();
  scheduleSessionSave();
  if (!settingsEl.classList.contains('hidden')) syncSettingsForm();
}

function toggleWordWrap() {
  if (!debounceAction('toggle-wrap')) return;
  changeSetting('wordWrap', !settings.wordWrap);
  flashFindStatus('Word wrap ' + (settings.wordWrap ? 'on' : 'off'));
}

function toggleSidebar() {
  if (!debounceAction('toggle-sidebar')) return;
  changeSetting('sidebar', !settings.sidebar);
}

function toggleMenuBar() {
  if (!debounceAction('toggle-menubar')) return;
  changeSetting('menuBar', !settings.menuBar);
}

function toggleStatusBar() {
  changeSetting('statusBar', !settings.statusBar);
}

/* ---------- the dialog ---------- */

// Settings that live elsewhere in the app (they also have their own menu items / shortcuts).
const LIVE_SETTINGS = {
  theme: {
    get: () => themeOverride || 'system',
    set: (v) => {
      themeOverride = v === 'system' ? null : v;
      applyTheme();
    },
  },
  lineNumbers: { get: () => lineNumbersVisible, set: (v) => setLineNumbersVisible(v) },
  toolbar: { get: () => !toolbarEl.classList.contains('hidden'), set: (v) => setToolbarVisible(v) },
  spellEnabled: {
    get: () => spell.enabled,
    set: (v) => {
      spell.enabled = v;
      updateSpellStatus();
      refreshSpellEverywhere();
    },
  },
  spellLang: { get: () => spell.lang, set: (v) => setSpellLang(v) },
};

function readSetting(key) {
  return LIVE_SETTINGS[key] ? LIVE_SETTINGS[key].get() : settings[key];
}

function computedColor(prop, el) {
  // Shows the current theme colour in a colour box whose setting is "follow the theme".
  const c = getComputedStyle(el)[prop];
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  return m ? '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('') : '#000000';
}

function syncSettingsForm() {
  settingsEl.querySelectorAll('[data-s]').forEach((el) => {
    const key = el.dataset.s;
    const v = readSetting(key);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (el.type === 'color') {
      const custom = COLOR_RE.test(v);
      const sample = key.startsWith('edit') ? editorHighlight.parentElement : preview;
      el.value = custom ? v : computedColor(key.endsWith('Bg') ? 'backgroundColor' : 'color', sample);
      const flag = settingsEl.querySelector('[data-theme-flag="' + key + '"]');
      if (flag) flag.textContent = custom ? 'custom' : 'theme';
    } else el.value = String(v);
  });
}

function openSettings() {
  hideContextMenu();
  hideAbout();
  settingsMessage('');
  syncSettingsForm();
  refreshFileTypeStatus();
  settingsEl.classList.remove('hidden');
  const first = settingsEl.querySelector('select, input');
  if (first) first.focus();
}

function closeSettings(keepFocus) {
  if (settingsEl.classList.contains('hidden')) return;
  settingsEl.classList.add('hidden');
  if (keepFocus === true) return;
  if (layoutMode === 'preview-only') preview.focus();
  else editor.focus();
}

function resetSettings() {
  loadSettings(null);
  themeOverride = null;
  applyTheme();
  setLineNumbersVisible(false);
  setToolbarVisible(false);
  spell.enabled = true;
  setSpellLang('en_GB');
  applySettings();
  syncSettingsForm();
  scheduleSessionSave();
}

/* ---------- About & updates ---------- */

const aboutEl = document.getElementById('about');
const aboutStatus = document.getElementById('about-update-status');
const aboutUpdateBtn = document.getElementById('about-update');

async function showAbout() {
  hideContextMenu();
  closeSettings(true);
  try {
    const info = await invoke('cmd_app_info');
    document.getElementById('about-version').textContent = 'v' + info.version;
  } catch (e) {
    /* keep the built-in text */
  }
  aboutEl.classList.remove('hidden');
  aboutUpdateBtn.focus();
}

function hideAbout() {
  aboutEl.classList.add('hidden');
}

/** Check -> confirm -> download + verify -> replace the exe -> restart (tabs come back via the session). */
async function checkForUpdates() {
  aboutUpdateBtn.disabled = true;
  aboutStatus.classList.remove('error');
  aboutStatus.textContent = 'Checking GitHub for a newer version...';
  try {
    const u = await invoke('cmd_check_update');
    if (!u.newer) {
      aboutStatus.textContent = '✓ You have the latest version (v' + u.current + ').';
      return;
    }
    if (!u.asset_url) {
      aboutStatus.textContent = 'Version ' + u.latest + ' is available, but it has no Windows download attached. See ' + u.page_url;
      return;
    }
    const notes = (u.notes || '').replace(/\r/g, '').trim();
    const ok = await dialogApi.ask(
      'Version ' + u.latest + ' is available (you have ' + u.current + ').\n\n' +
        (notes ? notes.slice(0, 600) + (notes.length > 600 ? '…' : '') + '\n\n' : '') +
        'Download and install it now? Notepad MD will close and reopen with your tabs.',
      { title: 'Update available', kind: 'info', okLabel: 'Update now', cancelLabel: 'Later' }
    );
    if (!ok) {
      aboutStatus.textContent = 'Update postponed. Version ' + u.latest + ' is available.';
      return;
    }
    aboutStatus.textContent = 'Downloading ' + (u.asset_name || 'the update') + (u.asset_size ? ' (' + (u.asset_size / 1048576).toFixed(1) + ' MB)' : '') + '...';
    saveDocView(getActive());
    await saveSessionNow(); // the new version reopens every tab from this
    await invoke('cmd_install_update', { assetUrl: u.asset_url, digest: u.digest || null, size: u.asset_size || null });
    aboutStatus.textContent = 'Installed. Restarting...';
  } catch (e) {
    aboutStatus.textContent = String(e && e.message ? e.message : e);
    aboutStatus.classList.add('error');
  } finally {
    aboutUpdateBtn.disabled = false;
  }
}

function wireAbout() {
  aboutUpdateBtn.addEventListener('click', checkForUpdates);
  document.getElementById('about-close').addEventListener('click', hideAbout);
  document.getElementById('about-link').addEventListener('click', (e) => {
    e.preventDefault();
    invoke('cmd_open_url', { url: 'https://github.com/mccabedd/notepad-md' });
  });
  aboutEl.addEventListener('click', (e) => {
    if (e.target === aboutEl) hideAbout();
  });
  aboutEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideAbout();
    }
  });
}

/* ---------- import / export ---------- */

const settingsMsg = document.getElementById('settings-msg');

function settingsMessage(text, isError) {
  settingsMsg.textContent = text;
  settingsMsg.classList.toggle('error', !!isError);
  settingsMsg.title = text;
}

function exportableSettings() {
  return {
    app: 'Notepad MD',
    kind: 'settings',
    version: 1,
    settings: { ...settings },
    theme: themeOverride || 'system',
    lineNumbers: lineNumbersVisible,
    toolbar: !toolbarEl.classList.contains('hidden'),
    spell: { enabled: spell.enabled, lang: spell.lang, userWords: [...spell.userWords].sort() },
  };
}

async function exportSettings() {
  const path = await dialogApi.save({
    filters: [{ name: 'Notepad MD settings', extensions: ['json'] }],
    defaultPath: 'notepad-md-settings.json',
  });
  if (!path) return;
  try {
    await invoke('cmd_write_file', { path, content: JSON.stringify(exportableSettings(), null, 2) + '\n' });
    settingsMessage('Exported to ' + basename(path));
  } catch (e) {
    settingsMessage('Export failed: ' + e, true);
  }
}

/** Applies an exported settings object; the spelling dictionary is merged, not replaced. */
function applyImportedSettings(data) {
  if (!data || data.kind !== 'settings' || typeof data.settings !== 'object') throw new Error('This is not a Notepad MD settings file.');
  loadSettings({ ...settings, ...data.settings });
  if (['system', 'light', 'dark'].includes(data.theme)) {
    themeOverride = data.theme === 'system' ? null : data.theme;
    applyTheme();
  }
  if (typeof data.lineNumbers === 'boolean') setLineNumbersVisible(data.lineNumbers);
  if (typeof data.toolbar === 'boolean') setToolbarVisible(data.toolbar);
  if (data.spell) {
    if (Array.isArray(data.spell.userWords)) data.spell.userWords.forEach((w) => typeof w === 'string' && spell.userWords.add(w.toLowerCase()));
    if (typeof data.spell.enabled === 'boolean') spell.enabled = data.spell.enabled;
    if (SPELL_LANG_LABELS[data.spell.lang]) setSpellLang(data.spell.lang);
    if (!data.spell.enabled) spell.enabled = false;
    updateSpellStatus();
    refreshSpellEverywhere();
  }
  applySettings();
  syncSettingsForm();
  scheduleSessionSave();
}

async function importSettings() {
  const sel = await dialogApi.open({
    multiple: false,
    filters: [
      { name: 'Notepad MD settings', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (!sel) return;
  const path = Array.isArray(sel) ? sel[0] : sel;
  try {
    const file = await invoke('cmd_read_file', { path });
    applyImportedSettings(JSON.parse(file.content));
    settingsMessage('Imported from ' + basename(path));
  } catch (e) {
    settingsMessage('Import failed: ' + (e && e.message ? e.message : e), true);
  }
}

/* ---------- file types ---------- */

const ftStatus = document.getElementById('ft-status');

function supportedExtensions() {
  return Object.keys(EXT_LANG).sort();
}

async function refreshFileTypeStatus() {
  document.getElementById('ft-exts').textContent = 'Types: ' + supportedExtensions().map((e) => '.' + e).join(' ');
  try {
    const s = await invoke('cmd_file_types_status');
    ftStatus.textContent = s.registered
      ? '✓ Registered: Notepad MD appears in "Open with" for these file types.'
      : s.other_exe
      ? 'Registered for a different copy of the app (' + s.other_exe.replace(/ "%1"$/, '') + '). Click Register to point it at this one.'
      : 'Not registered.';
  } catch (e) {
    ftStatus.textContent = 'Could not check registration: ' + e;
  }
  await refreshContextMenuStatus();
}

/* ---------- Explorer right-click "Edit in Notepad-MD" ---------- */

const ctxMenuBox = document.getElementById('ctx-menu');
const ctxStatus = document.getElementById('ctx-status');
const CTX_HINT = 'On Windows 11 it\'s under "Show more options" (or Shift+right-click).';

async function refreshContextMenuStatus() {
  try {
    const s = await invoke('cmd_context_menu_status');
    ctxMenuBox.checked = s === 'on';
    ctxStatus.textContent =
      s === 'other' ? 'It currently opens a different copy of the app. Tick the box to point it at this one.' : CTX_HINT;
  } catch (e) {
    ctxStatus.textContent = 'Could not check the right-click menu: ' + e;
  }
}

async function setContextMenu(enabled) {
  try {
    await invoke('cmd_set_context_menu', { enabled });
    settingsMessage(enabled ? '"Edit in Notepad-MD" added to the Explorer right-click menu.' : '"Edit in Notepad-MD" removed from the Explorer right-click menu.');
  } catch (e) {
    settingsMessage('Could not change the right-click menu: ' + e, true);
  }
  await refreshContextMenuStatus();
}

async function registerFileTypes() {
  try {
    const n = await invoke('cmd_register_file_types', { exts: supportedExtensions() });
    settingsMessage('Registered ' + n + ' file types.');
  } catch (e) {
    settingsMessage('Registration failed: ' + e, true);
  }
  await refreshFileTypeStatus();
}

async function unregisterFileTypes() {
  try {
    await invoke('cmd_unregister_file_types', { exts: supportedExtensions() });
    settingsMessage('File types unregistered.');
  } catch (e) {
    settingsMessage('Could not unregister: ' + e, true);
  }
  await refreshFileTypeStatus();
}

function wireSettings() {
  document.getElementById('settings-export').addEventListener('click', exportSettings);
  document.getElementById('settings-import').addEventListener('click', importSettings);
  document.getElementById('ft-register').addEventListener('click', registerFileTypes);
  document.getElementById('ft-unregister').addEventListener('click', unregisterFileTypes);
  ctxMenuBox.addEventListener('change', (e) => {
    e.stopPropagation(); // registry state, not a saved setting
    setContextMenu(ctxMenuBox.checked);
  });
  document.getElementById('ft-defaults').addEventListener('click', () =>
    invoke('cmd_open_default_apps').catch((e) => settingsMessage('Could not open Windows Settings: ' + e, true))
  );
  settingsEl.addEventListener('input', onSettingInput);
  settingsEl.addEventListener('change', onSettingInput);
  settingsEl.addEventListener('click', (e) => {
    const clear = e.target.closest('[data-clear]');
    if (clear) {
      changeSetting(clear.dataset.clear, '');
      syncSettingsForm();
    }
    if (e.target === settingsEl) closeSettings(); // click outside the panel
  });
  document.getElementById('settings-close').addEventListener('click', () => closeSettings());
  document.getElementById('settings-done').addEventListener('click', () => closeSettings());
  wireAbout();
  document.getElementById('settings-reset').addEventListener('click', resetSettings);
  settingsEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSettings();
    }
  });
}

function onSettingInput(e) {
  const el = e.target.closest('[data-s]');
  if (!el) return;
  const key = el.dataset.s;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'number') {
    v = parseInt(el.value, 10);
    if (isNaN(v)) return;
    if (key === 'newTabFontSize') v = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, v));
  } else if (key === 'tabSize') v = parseInt(el.value, 10);
  else v = el.value;
  if (LIVE_SETTINGS[key]) {
    LIVE_SETTINGS[key].set(v);
    scheduleSessionSave();
  } else {
    settings[key] = v;
    applySettings();
    scheduleSessionSave();
  }
  if (el.type === 'color') {
    const flag = settingsEl.querySelector('[data-theme-flag="' + key + '"]');
    if (flag) flag.textContent = 'custom';
  }
}
