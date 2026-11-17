const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const dialogApi = window.__TAURI__.dialog;
const clipboard = window.__TAURI__.clipboardManager;

const tabbarEl = document.getElementById('tabbar');
const toolbarEl = document.getElementById('toolbar');
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const replaceInput = document.getElementById('replace-input');
const findPrevBtn = document.getElementById('find-prev');
const findNextBtn = document.getElementById('find-next');
const replaceOneBtn = document.getElementById('replace-one');
const replaceAllBtn = document.getElementById('replace-all');
const findStatus = document.getElementById('find-status');
const findCloseBtn = document.getElementById('find-close');
const workspace = document.getElementById('workspace');
const editorPane = document.getElementById('editor-pane');
const lineNumbersEl = document.getElementById('line-numbers');
const editor = document.getElementById('editor');
const resizer = document.getElementById('resizer');
const previewPane = document.getElementById('preview-pane');
const lineNumbersPreviewEl = document.getElementById('line-numbers-preview');
const preview = document.getElementById('preview');
const statusFile = document.getElementById('status-file');
const statusDirty = document.getElementById('status-dirty');
const statusLayout = document.getElementById('status-layout');
const statusTheme = document.getElementById('status-theme');
const statusCount = document.getElementById('status-count');

let marked_ = window.marked;
let turndownService;

let docs = [];
let activeId = null;
let docCounter = 0;
let untitledCounter = 0;
let layoutMode = 'preview-only';
let lineNumbersVisible = false;
let splitRatio = 0.5;
let fontSize = 14;
let themeOverride = null;
let lastFocused = 'preview';
let lastGlobalDirty = false;
let findMatches = [];
let findIndex = -1;

function setupMarkdownEngine() {
  marked_.setOptions({ gfm: true, breaks: false });
  turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  turndownService.use(turndownPluginGfm.gfm);
  turndownService.addRule('underline', {
    filter: ['u'],
    replacement: (content) => '<u>' + content + '</u>',
  });
  turndownService.addRule('findHighlight', {
    filter: (node) => node.nodeName === 'MARK' && node.classList.contains('find-highlight'),
    replacement: (content) => content,
  });
  turndownService.addRule('codeCopyButton', {
    filter: (node) => node.nodeName === 'BUTTON' && node.classList.contains('code-copy-btn'),
    replacement: () => '',
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function basename(p) {
  return p.replace(/\\/g, '/').split('/').pop();
}

function tabTitle(doc) {
  return doc.path ? basename(doc.path) : 'Untitled' + (doc.untitledNum > 1 ? ' ' + doc.untitledNum : '');
}

function getActive() {
  return docs.find((d) => d.id === activeId);
}

function makeDoc(path, content) {
  docCounter++;
  const doc = { id: 'doc' + docCounter, path: path || null, content: content || '', dirty: false };
  if (!doc.path) {
    untitledCounter++;
    doc.untitledNum = untitledCounter;
  }
  return doc;
}

/* ---------- theme ---------- */

function applyTheme() {
  const mode = themeOverride || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', mode);
  statusTheme.textContent = mode === 'dark' ? 'Dark' : 'Light';
}

const lastActionAt = {};
function debounceAction(key, ms = 250) {
  const now = Date.now();
  if (lastActionAt[key] && now - lastActionAt[key] < ms) return false;
  lastActionAt[key] = now;
  return true;
}

function toggleTheme() {
  if (!debounceAction('toggle-theme')) return;
  const current = document.documentElement.getAttribute('data-theme');
  themeOverride = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme-override', themeOverride);
  applyTheme();
}

/* ---------- font size ---------- */

function applyFontSize() {
  document.documentElement.style.setProperty('--content-font-size', fontSize + 'px');
}

function changeFontSize(delta) {
  fontSize = Math.min(28, Math.max(10, fontSize + delta));
  localStorage.setItem('font-size', String(fontSize));
  applyFontSize();
  updateLineNumbers();
}

/* ---------- layout modes ---------- */

const layoutLabels = {
  'preview-only': 'Preview Only',
  'edit-only': 'Edit Only',
  'split-pe': 'Preview Left / Edit Right',
  'split-ep': 'Edit Left / Preview Right',
};

function setLayoutMode(mode) {
  layoutMode = mode;
  editorPane.style.flexBasis = '';
  previewPane.style.flexBasis = '';
  workspace.className = 'workspace mode-' + mode;
  if (mode === 'split-pe' || mode === 'split-ep') applySplit();
  statusLayout.textContent = layoutLabels[mode];
}

function applySplit() {
  const leftPercent = splitRatio * 100;
  const rightPercent = 100 - leftPercent;
  if (layoutMode === 'split-pe') {
    previewPane.style.flexBasis = leftPercent + '%';
    editorPane.style.flexBasis = rightPercent + '%';
  } else if (layoutMode === 'split-ep') {
    editorPane.style.flexBasis = leftPercent + '%';
    previewPane.style.flexBasis = rightPercent + '%';
  }
}

function setupResizer() {
  let dragging = false;
  resizer.addEventListener('mousedown', (e) => {
    dragging = true;
    resizer.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = workspace.getBoundingClientRect();
    let ratio = (e.clientX - rect.left) / rect.width;
    ratio = Math.min(0.85, Math.max(0.15, ratio));
    splitRatio = ratio;
    applySplit();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      resizer.classList.remove('dragging');
      localStorage.setItem('split-ratio', String(splitRatio));
    }
  });
}

/* ---------- toolbar / line numbers ---------- */

function toggleToolbar() {
  if (!debounceAction('toggle-toolbar')) return;
  const visible = !toolbarEl.classList.contains('hidden');
  toolbarEl.classList.toggle('hidden', visible);
}

function toggleLineNumbers() {
  if (!debounceAction('toggle-line-numbers')) return;
  lineNumbersVisible = !lineNumbersVisible;
  lineNumbersEl.classList.toggle('hidden', !lineNumbersVisible);
  lineNumbersPreviewEl.classList.toggle('hidden', !lineNumbersVisible);
  localStorage.setItem('line-numbers-visible', String(lineNumbersVisible));
  updateLineNumbers();
}

function updateLineNumbers() {
  if (!lineNumbersVisible) return;
  const count = editor.value.split('\n').length;
  const nums = [];
  for (let i = 1; i <= count; i++) nums.push(i);
  const text = nums.join('\n');
  lineNumbersEl.textContent = text;
  lineNumbersEl.scrollTop = editor.scrollTop;
  lineNumbersPreviewEl.textContent = text;
  lineNumbersPreviewEl.scrollTop = preview.scrollTop;
}

/* ---------- document <-> panes sync ---------- */

function enableCheckboxes() {
  preview.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.removeAttribute('disabled'));
}

function addCodeCopyButtons() {
  preview.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector(':scope > .code-copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.title = 'Copy code';
    btn.setAttribute('contenteditable', 'false');
    btn.innerHTML =
      '<svg viewBox="0 0 20 20" width="13" height="13"><rect x="7" y="7" width="9" height="9" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="4" y="4" width="9" height="9" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
    pre.appendChild(btn);
  });
}

async function copyCodeBlock(pre) {
  const clone = pre.cloneNode(true);
  const btn = clone.querySelector('.code-copy-btn');
  if (btn) btn.remove();
  await clipboard.writeText(clone.textContent);
}

function updateCharCount() {
  const doc = getActive();
  statusCount.textContent = (doc ? doc.content.length : 0) + ' characters';
}

function syncFromEditor() {
  const doc = getActive();
  if (!doc) return;
  doc.content = editor.value;
  preview.innerHTML = marked_.parse(doc.content);
  enableCheckboxes();
  addCodeCopyButtons();
  updateLineNumbers();
  updateCharCount();
  markDirty(doc);
}

function syncFromPreview() {
  const doc = getActive();
  if (!doc) return;
  doc.content = turndownService.turndown(preview.innerHTML);
  editor.value = doc.content;
  addCodeCopyButtons();
  updateLineNumbers();
  updateCharCount();
  markDirty(doc);
}

function loadActiveDocIntoPanes() {
  const doc = getActive();
  if (!doc) return;
  editor.value = doc.content;
  preview.innerHTML = marked_.parse(doc.content);
  enableCheckboxes();
  addCodeCopyButtons();
  updateLineNumbers();
  updateStatusBar();
}

function markDirty(doc) {
  if (!doc.dirty) {
    doc.dirty = true;
    renderTabs();
  }
  updateStatusBar();
  updateGlobalDirtyFlag();
}

function updateGlobalDirtyFlag() {
  const any = docs.some((d) => d.dirty);
  if (any !== lastGlobalDirty) {
    lastGlobalDirty = any;
    invoke('cmd_set_dirty', { dirty: any });
  }
}

function updateStatusBar() {
  const doc = getActive();
  if (!doc) return;
  statusFile.textContent = doc.path || tabTitle(doc);
  statusDirty.textContent = doc.dirty ? '• Modified' : '';
  statusLayout.textContent = layoutLabels[layoutMode];
  updateCharCount();
}

/* ---------- tabs ---------- */

function renderTabs() {
  tabbarEl.innerHTML = '';
  tabbarEl.classList.toggle('hidden', docs.length < 2);
  docs.forEach((doc) => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (doc.id === activeId ? ' active' : '');
    tab.dataset.id = doc.id;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tabTitle(doc);
    title.title = doc.path || tabTitle(doc);

    const dirty = document.createElement('span');
    dirty.className = 'tab-dirty';
    dirty.textContent = doc.dirty ? '●' : '';

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.textContent = '✕';
    close.title = 'Close';
    close.addEventListener('mousedown', (e) => e.stopPropagation());
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(doc.id);
    });

    tab.appendChild(title);
    tab.appendChild(dirty);
    tab.appendChild(close);
    tab.addEventListener('click', () => setActiveTab(doc.id));
    tabbarEl.appendChild(tab);
  });
}

function setActiveTab(id) {
  if (id === activeId) return;
  activeId = id;
  renderTabs();
  loadActiveDocIntoPanes();
}

function cycleTab(dir) {
  if (docs.length < 2) return;
  const idx = docs.findIndex((d) => d.id === activeId);
  const next = (idx + dir + docs.length) % docs.length;
  setActiveTab(docs[next].id);
}

function addDocAndActivate(doc) {
  docs.push(doc);
  activeId = doc.id;
  renderTabs();
  loadActiveDocIntoPanes();
  updateGlobalDirtyFlag();
}

function removeDoc(id) {
  const idx = docs.findIndex((d) => d.id === id);
  if (idx === -1) return;
  docs.splice(idx, 1);
  if (docs.length === 0) {
    const doc = makeDoc(null, '');
    docs.push(doc);
    activeId = doc.id;
  } else if (id === activeId) {
    const nextIdx = Math.min(idx, docs.length - 1);
    activeId = docs[nextIdx].id;
  }
  renderTabs();
  loadActiveDocIntoPanes();
  updateGlobalDirtyFlag();
}

async function closeTab(id) {
  const doc = docs.find((d) => d.id === id);
  if (!doc) return;
  if (doc.dirty) {
    const save = await dialogApi.ask('Save changes to "' + tabTitle(doc) + '" before closing?', {
      title: 'Unsaved Changes',
      kind: 'warning',
    });
    if (save) {
      const ok = await saveDocGeneric(doc);
      if (!ok) return;
    }
  }
  removeDoc(id);
}

/* ---------- file operations ---------- */

async function saveDocGeneric(doc, forcePrompt) {
  let path = doc.path;
  if (!path || forcePrompt) {
    path = await dialogApi.save({ filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] });
    if (!path) return false;
  }
  await invoke('cmd_write_file', { path, content: doc.content });
  doc.path = path;
  doc.dirty = false;
  renderTabs();
  updateStatusBar();
  updateGlobalDirtyFlag();
  return true;
}

function saveActive() {
  return saveDocGeneric(getActive());
}

function saveActiveAs() {
  return saveDocGeneric(getActive(), true);
}

async function openFile() {
  const selected = await dialogApi.open({
    multiple: false,
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (!selected) return;
  const path = Array.isArray(selected) ? selected[0] : selected;
  const data = await invoke('cmd_read_file', { path });
  const active = getActive();
  if (docs.length === 1 && active && !active.path && !active.dirty && active.content === '') {
    active.path = data.path;
    active.content = data.content;
    renderTabs();
    loadActiveDocIntoPanes();
    updateGlobalDirtyFlag();
  } else {
    addDocAndActivate(makeDoc(data.path, data.content));
  }
}

async function deleteActiveFile() {
  const doc = getActive();
  if (!doc) return;
  if (!doc.path) {
    await dialogApi.message('This file has not been saved yet.', { title: 'Delete File', kind: 'info' });
    return;
  }
  const ok = await dialogApi.ask('Permanently delete "' + basename(doc.path) + '" from disk? This cannot be undone.', {
    title: 'Delete File',
    kind: 'warning',
  });
  if (!ok) return;
  try {
    await invoke('cmd_delete_file', { path: doc.path });
  } catch (err) {
    await dialogApi.message('Could not delete file: ' + err, { title: 'Error', kind: 'error' });
    return;
  }
  removeDoc(doc.id);
}

async function handleCloseRequested() {
  const dirtyDocs = docs.filter((d) => d.dirty);
  if (dirtyDocs.length === 0) {
    await invoke('cmd_force_close');
    return;
  }
  const names = dirtyDocs.map(tabTitle).join(', ');
  const save = await dialogApi.ask(
    'Save changes to ' + dirtyDocs.length + ' file(s) (' + names + ') before closing?',
    { title: 'Unsaved Changes', kind: 'warning' }
  );
  if (save) {
    for (const d of dirtyDocs) {
      const ok = await saveDocGeneric(d);
      if (!ok) return;
    }
  }
  await invoke('cmd_force_close');
}

/* ---------- editor-mode text transforms ---------- */

function wrapEditorSelection(before, after) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;
  const selected = value.slice(start, end);
  editor.value = value.slice(0, start) + before + selected + after + value.slice(end);
  editor.selectionStart = start + before.length;
  editor.selectionEnd = start + before.length + selected.length;
  editor.focus();
  syncFromEditor();
}

function insertAtCursorEditor(text) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;
  editor.value = value.slice(0, start) + text + value.slice(end);
  const cursor = start + text.length;
  editor.selectionStart = editor.selectionEnd = cursor;
  editor.focus();
  syncFromEditor();
}

function transformEditorLines(transform) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = value.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = value.length;
  const block = value.slice(lineStart, lineEnd);
  const newBlock = block.split('\n').map(transform).join('\n');
  editor.value = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
  editor.selectionStart = lineStart;
  editor.selectionEnd = lineStart + newBlock.length;
  editor.focus();
  syncFromEditor();
}

function codeBlockEditor() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;
  const selected = value.slice(start, end) || 'code';
  const snippet = '```\n' + selected + '\n```';
  editor.value = value.slice(0, start) + snippet + value.slice(end);
  editor.selectionStart = start + 4;
  editor.selectionEnd = start + 4 + selected.length;
  editor.focus();
  syncFromEditor();
}

/* ---------- preview-mode commands ---------- */

function previewExec(cmd, value) {
  preview.focus();
  document.execCommand(cmd, false, value);
  syncFromPreview();
}

function codeBlockPreview() {
  const sel = window.getSelection();
  const text = sel && sel.toString() ? sel.toString() : 'code';
  preview.focus();
  document.execCommand('insertHTML', false, '<pre><code>' + escapeHtml(text) + '</code></pre>');
  syncFromPreview();
}

function tablePreview() {
  preview.focus();
  document.execCommand(
    'insertHTML',
    false,
    '<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table><p></p>'
  );
  syncFromPreview();
}

function checklistPreview() {
  preview.focus();
  document.execCommand('insertHTML', false, '<ul><li><input type="checkbox"> New task</li></ul>');
  enableCheckboxes();
  syncFromPreview();
}

function applyHeading(level) {
  if (lastFocused === 'preview') {
    previewExec('formatBlock', '<h' + level + '>');
  } else {
    transformEditorLines((l) => '#'.repeat(level) + ' ' + l.replace(/^#{1,6}\s*/, ''));
  }
}

/* ---------- clipboard ---------- */

function getSelectedText() {
  if (lastFocused === 'editor') return editor.value.slice(editor.selectionStart, editor.selectionEnd);
  const sel = window.getSelection();
  return sel ? sel.toString() : '';
}

async function doCopy() {
  const text = getSelectedText();
  if (!text) return;
  await clipboard.writeText(text);
}

async function doCut() {
  const text = getSelectedText();
  if (!text) return;
  await clipboard.writeText(text);
  if (lastFocused === 'editor') {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = start;
    editor.focus();
    syncFromEditor();
  } else {
    preview.focus();
    window.getSelection().deleteFromDocument();
    syncFromPreview();
  }
}

async function doPaste() {
  const text = await clipboard.readText();
  if (text == null) return;
  if (lastFocused === 'editor') {
    insertAtCursorEditor(text);
  } else {
    preview.focus();
    document.execCommand('insertText', false, text);
    syncFromPreview();
  }
}

/* ---------- find & replace ---------- */

function openFindBar() {
  findBar.classList.remove('hidden');
  const selected = lastFocused === 'editor' ? editor.value.slice(editor.selectionStart, editor.selectionEnd) : '';
  if (selected) findInput.value = selected;
  findInput.focus();
  findInput.select();
  recomputeMatches();
}

function closeFindBar() {
  findBar.classList.add('hidden');
  clearPreviewHighlight();
}

function recomputeMatches() {
  const needle = findInput.value;
  findMatches = [];
  const doc = getActive();
  if (needle && doc) {
    const hay = doc.content.toLowerCase();
    const n = needle.toLowerCase();
    let idx = 0;
    while (true) {
      const pos = hay.indexOf(n, idx);
      if (pos === -1) break;
      findMatches.push(pos);
      idx = pos + Math.max(n.length, 1);
    }
  }
  findIndex = findMatches.length ? 0 : -1;
  updateFindStatus();
  highlightCurrentMatch();
}

function updateFindStatus() {
  findStatus.textContent = findMatches.length
    ? findIndex + 1 + ' of ' + findMatches.length
    : findInput.value
    ? 'No matches'
    : '';
}

function findRangesInPreview(needle) {
  const ranges = [];
  if (!needle) return ranges;
  const needleLower = needle.toLowerCase();
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const lower = node.textContent.toLowerCase();
    let idx = 0;
    while (true) {
      const pos = lower.indexOf(needleLower, idx);
      if (pos === -1) break;
      ranges.push({ node, start: pos, end: pos + needle.length });
      idx = pos + Math.max(needle.length, 1);
    }
  }
  return ranges;
}

function clearPreviewHighlight() {
  preview.querySelectorAll('mark.find-highlight').forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

function highlightMatchInPreview() {
  clearPreviewHighlight();
  const ranges = findRangesInPreview(findInput.value);
  if (!ranges.length) return;
  const r = ranges[findIndex % ranges.length];
  const range = document.createRange();
  range.setStart(r.node, r.start);
  range.setEnd(r.node, r.end);
  const mark = document.createElement('mark');
  mark.className = 'find-highlight';
  range.surroundContents(mark);
  mark.scrollIntoView({ block: 'center' });
}

function highlightCurrentMatch() {
  if (findIndex < 0) return;
  if (getComputedStyle(editorPane).display === 'none') {
    highlightMatchInPreview();
    return;
  }
  const pos = findMatches[findIndex];
  const len = findInput.value.length;
  editor.focus();
  editor.selectionStart = pos;
  editor.selectionEnd = pos + len;
  const upToMatch = editor.value.slice(0, pos).split('\n').length;
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || fontSize * 1.5;
  editor.scrollTop = Math.max(0, (upToMatch - 4) * lineHeight);
}

/* ---------- toolbar dispatch ---------- */

function runToolbarCommand(cmd) {
  switch (cmd) {
    case 'undo':
      document.execCommand('undo');
      break;
    case 'redo':
      document.execCommand('redo');
      break;
    case 'toggle-line-numbers':
      toggleLineNumbers();
      break;
    case 'bold':
      lastFocused === 'preview' ? previewExec('bold') : wrapEditorSelection('**', '**');
      break;
    case 'italic':
      lastFocused === 'preview' ? previewExec('italic') : wrapEditorSelection('_', '_');
      break;
    case 'strike':
      lastFocused === 'preview' ? previewExec('strikeThrough') : wrapEditorSelection('~~', '~~');
      break;
    case 'underline':
      lastFocused === 'preview' ? previewExec('underline') : wrapEditorSelection('<u>', '</u>');
      break;
    case 'copy':
      doCopy();
      break;
    case 'cut':
      doCut();
      break;
    case 'paste':
      doPaste();
      break;
    case 'table':
      lastFocused === 'preview'
        ? tablePreview()
        : insertAtCursorEditor('\n| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n');
      break;
    case 'code-block':
      lastFocused === 'preview' ? codeBlockPreview() : codeBlockEditor();
      break;
    case 'checklist':
      lastFocused === 'preview'
        ? checklistPreview()
        : transformEditorLines((l) =>
            /^\s*-\s\[[ xX]\]\s/.test(l)
              ? l.replace(/^(\s*)-\s\[[ xX]\]\s/, '$1')
              : l.trim() === ''
              ? l
              : '- [ ] ' + l.replace(/^[-*]\s/, '')
          );
      break;
    case 'ordered-list':
      lastFocused === 'preview'
        ? previewExec('insertOrderedList')
        : transformEditorLines((l, i) => (l.trim() === '' ? l : i + 1 + '. ' + l.replace(/^\s*\d+\.\s/, '')));
      break;
    case 'bullet-list':
      lastFocused === 'preview'
        ? previewExec('insertUnorderedList')
        : transformEditorLines((l) =>
            l.trim() === '' ? l : /^\s*-\s/.test(l) ? l : '- ' + l.replace(/^[-*]\s/, '')
          );
      break;
    case 'outdent':
      lastFocused === 'preview' ? previewExec('outdent') : transformEditorLines((l) => l.replace(/^(\s{1,2}|\t)/, ''));
      break;
    case 'indent':
      lastFocused === 'preview' ? previewExec('indent') : transformEditorLines((l) => '  ' + l);
      break;
    case 'font-dec':
      changeFontSize(-1);
      break;
    case 'font-inc':
      changeFontSize(1);
      break;
    case 'find-replace':
      openFindBar();
      break;
    case 'delete-file':
      deleteActiveFile();
      break;
  }
}

/* ---------- wiring ---------- */

function restorePrefs() {
  if (localStorage.getItem('line-numbers-visible') === 'true') {
    lineNumbersVisible = true;
    lineNumbersEl.classList.remove('hidden');
    lineNumbersPreviewEl.classList.remove('hidden');
  }
  const storedRatio = parseFloat(localStorage.getItem('split-ratio'));
  if (!isNaN(storedRatio)) splitRatio = storedRatio;
  const storedFont = parseInt(localStorage.getItem('font-size'), 10);
  if (!isNaN(storedFont)) fontSize = storedFont;
  applyFontSize();
  themeOverride = localStorage.getItem('theme-override');
}

function wireDomEvents() {
  editor.addEventListener('input', syncFromEditor);
  editor.addEventListener('scroll', () => {
    if (lineNumbersVisible) lineNumbersEl.scrollTop = editor.scrollTop;
  });
  editor.addEventListener('focus', () => (lastFocused = 'editor'));
  preview.addEventListener('scroll', () => {
    if (lineNumbersVisible) lineNumbersPreviewEl.scrollTop = preview.scrollTop;
  });
  preview.addEventListener('input', syncFromPreview);
  preview.addEventListener('focus', () => (lastFocused = 'preview'));
  preview.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href && /^https?:\/\//i.test(link.href)) {
      e.preventDefault();
      e.stopPropagation();
      invoke('cmd_open_url', { url: link.href });
      return;
    }
    const copyBtn = e.target.closest('.code-copy-btn');
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const pre = copyBtn.closest('pre');
      if (pre) copyCodeBlock(pre);
      return;
    }
    if (e.target && e.target.matches && e.target.matches('input[type="checkbox"]')) syncFromPreview();
  });

  setupResizer();

  toolbarEl.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });
  toolbarEl.addEventListener('click', (e) => {
    const headingBtn = e.target.closest('button[data-heading]');
    if (headingBtn) {
      applyHeading(Number(headingBtn.dataset.heading));
      return;
    }
    const btn = e.target.closest('button[data-cmd]');
    if (!btn) return;
    runToolbarCommand(btn.dataset.cmd);
  });

  findInput.addEventListener('input', recomputeMatches);
  findNextBtn.addEventListener('click', () => {
    if (!findMatches.length) return;
    findIndex = (findIndex + 1) % findMatches.length;
    updateFindStatus();
    highlightCurrentMatch();
  });
  findPrevBtn.addEventListener('click', () => {
    if (!findMatches.length) return;
    findIndex = (findIndex - 1 + findMatches.length) % findMatches.length;
    updateFindStatus();
    highlightCurrentMatch();
  });
  replaceOneBtn.addEventListener('click', () => {
    if (findIndex < 0) return;
    const doc = getActive();
    const pos = findMatches[findIndex];
    const len = findInput.value.length;
    doc.content = doc.content.slice(0, pos) + replaceInput.value + doc.content.slice(pos + len);
    loadActiveDocIntoPanes();
    markDirty(doc);
    recomputeMatches();
  });
  replaceAllBtn.addEventListener('click', () => {
    if (!findInput.value) return;
    const doc = getActive();
    const re = new RegExp(escapeRegExp(findInput.value), 'gi');
    const count = (doc.content.match(re) || []).length;
    doc.content = doc.content.replace(re, replaceInput.value);
    loadActiveDocIntoPanes();
    markDirty(doc);
    findStatus.textContent = 'Replaced ' + count;
    findMatches = [];
    findIndex = -1;
  });
  findCloseBtn.addEventListener('click', closeFindBar);
  [findInput, replaceInput].forEach((el) =>
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        (e.shiftKey ? findPrevBtn : findNextBtn).click();
      } else if (e.key === 'Escape') {
        closeFindBar();
      }
    })
  );

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      const modes = { '1': 'preview-only', '2': 'edit-only', '3': 'split-pe', '4': 'split-ep' };
      setLayoutMode(modes[e.key]);
      return;
    }
    if (e.altKey) return;

    const key = e.key.toLowerCase();
    if (key === 't') {
      e.preventDefault();
      toggleToolbar();
    } else if (key === 'n') {
      e.preventDefault();
      addDocAndActivate(makeDoc(null, ''));
    } else if (key === 'o') {
      e.preventDefault();
      openFile();
    } else if (key === 's' && e.shiftKey) {
      e.preventDefault();
      saveActiveAs();
    } else if (key === 's') {
      e.preventDefault();
      saveActive();
    } else if (key === 'l' && e.shiftKey) {
      e.preventDefault();
      toggleLineNumbers();
    } else if (key === 'f') {
      e.preventDefault();
      openFindBar();
    } else if (key === 'd' && e.shiftKey) {
      e.preventDefault();
      toggleTheme();
    } else if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      changeFontSize(1);
    } else if (e.key === '-') {
      e.preventDefault();
      changeFontSize(-1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
    } else if (key === 'w') {
      e.preventDefault();
      closeTab(activeId);
    }
  });
}

function wireMenuListeners() {
  listen('menu-new', () => addDocAndActivate(makeDoc(null, '')));
  listen('menu-open', () => openFile());
  listen('menu-save', () => saveActive());
  listen('menu-save-as', () => saveActiveAs());
  listen('menu-delete-file', () => deleteActiveFile());
  listen('menu-toolbar', () => toggleToolbar());
  listen('menu-layout-preview-only', () => setLayoutMode('preview-only'));
  listen('menu-layout-edit-only', () => setLayoutMode('edit-only'));
  listen('menu-layout-preview-left', () => setLayoutMode('split-pe'));
  listen('menu-layout-edit-left', () => setLayoutMode('split-ep'));
  listen('menu-toggle-line-numbers', () => toggleLineNumbers());
  listen('menu-find-replace', () => openFindBar());
  listen('menu-font-increase', () => changeFontSize(1));
  listen('menu-font-decrease', () => changeFontSize(-1));
  listen('menu-toggle-theme', () => toggleTheme());
  listen('close-requested', () => handleCloseRequested());
}

async function init() {
  setupMarkdownEngine();
  restorePrefs();
  wireDomEvents();
  wireMenuListeners();
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!themeOverride) applyTheme();
  });

  let initialDoc = null;
  try {
    const data = await invoke('cmd_get_initial_file');
    if (data) initialDoc = makeDoc(data.path, data.content);
  } catch (e) {
    /* no initial file */
  }
  if (!initialDoc) initialDoc = makeDoc(null, '');
  docs = [initialDoc];
  activeId = initialDoc.id;

  setLayoutMode('preview-only');
  renderTabs();
  loadActiveDocIntoPanes();
}

init();
