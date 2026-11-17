/* Table editing in the (Markdown) preview, Obsidian-style: right-click a cell for row/column
 * commands, Tab / Shift+Tab move between cells (Tab in the last cell adds a row), Enter moves down.
 * Every change edits the preview DOM and is then written back to Markdown via syncFromPreview(). */

function previewCellAt(node) {
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  const cell = el && el.closest('td, th');
  return cell && preview.contains(cell) && cell.closest('table') ? cell : null;
}

function tableInfo(cell) {
  const table = cell.closest('table');
  const rows = [...table.rows];
  const r = cell.parentElement.rowIndex;
  const c = cell.cellIndex;
  const headerRows = table.tHead ? table.tHead.rows.length : 1;
  const cols = Math.max(...rows.map((row) => row.cells.length));
  return { table, rows, r, c, headerRows, cols, isHeader: r < headerRows };
}

function newCell(tag, align) {
  const cell = document.createElement(tag);
  if (align) {
    cell.setAttribute('align', align);
    cell.style.textAlign = align;
  }
  return cell;
}

function columnAlign(info, c) {
  const head = info.rows[0] && info.rows[0].cells[c];
  return head ? head.getAttribute('align') || '' : '';
}

function focusCell(cell, selectAll) {
  if (!cell) return;
  preview.focus();
  const sel = window.getSelection();
  const r = document.createRange();
  r.selectNodeContents(cell);
  if (!selectAll) r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
  cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function tableChanged(focusOn) {
  syncFromPreview();
  if (focusOn) focusCell(focusOn, false);
}

function bodyOf(info) {
  let body = info.table.tBodies[0];
  if (!body) {
    body = document.createElement('tbody');
    info.table.appendChild(body);
  }
  return body;
}

function insertRow(cell, after) {
  const info = tableInfo(cell);
  if (info.isHeader && !after) return;
  const tr = document.createElement('tr');
  for (let c = 0; c < info.cols; c++) tr.appendChild(newCell('td', columnAlign(info, c)));
  if (info.isHeader) bodyOf(info).insertBefore(tr, bodyOf(info).firstChild);
  else if (after) info.rows[info.r].after(tr);
  else info.rows[info.r].before(tr);
  tableChanged(tr.cells[Math.min(info.c, tr.cells.length - 1)]);
}

function deleteRow(cell) {
  const info = tableInfo(cell);
  if (info.isHeader) return;
  const next = info.rows[info.r + 1] || info.rows[info.r - 1];
  info.rows[info.r].remove();
  tableChanged(next && next.cells[Math.min(info.c, next.cells.length - 1)]);
}

function insertColumn(cell, after) {
  const info = tableInfo(cell);
  const at = info.c + (after ? 1 : 0);
  let focus = null;
  info.rows.forEach((row, i) => {
    const c = newCell(i < info.headerRows ? 'th' : 'td', '');
    row.insertBefore(c, row.cells[at] || null);
    if (i === info.r) focus = c;
  });
  tableChanged(focus);
}

function deleteColumn(cell) {
  const info = tableInfo(cell);
  if (info.cols <= 1) return deleteTable(cell);
  info.rows.forEach((row) => {
    if (row.cells[info.c]) row.cells[info.c].remove();
  });
  const row = info.rows[info.r];
  tableChanged(row.cells[Math.min(info.c, row.cells.length - 1)]);
}

function moveRow(cell, dir) {
  const info = tableInfo(cell);
  const target = info.r + dir;
  if (info.isHeader || target < info.headerRows || target >= info.rows.length) return;
  const row = info.rows[info.r];
  if (dir < 0) info.rows[target].before(row);
  else info.rows[target].after(row);
  tableChanged(row.cells[info.c]);
}

function moveColumn(cell, dir) {
  const info = tableInfo(cell);
  const target = info.c + dir;
  if (target < 0 || target >= info.cols) return;
  info.rows.forEach((row) => {
    const a = row.cells[info.c];
    const b = row.cells[target];
    if (!a || !b) return;
    if (dir < 0) b.before(a);
    else b.after(a);
  });
  tableChanged(info.rows[info.r].cells[target]);
}

function alignColumn(cell, align) {
  const info = tableInfo(cell);
  info.rows.forEach((row) => {
    const c = row.cells[info.c];
    if (!c) return;
    if (align) {
      c.setAttribute('align', align);
      c.style.textAlign = align;
    } else {
      c.removeAttribute('align');
      c.style.textAlign = '';
    }
  });
  tableChanged(cell);
}

function deleteTable(cell) {
  const info = tableInfo(cell);
  const p = document.createElement('p');
  info.table.replaceWith(p);
  tableChanged(null);
}

function showTableMenu(x, y, cell) {
  const info = tableInfo(cell);
  const align = columnAlign(info, info.c);
  const lastBody = info.r === info.rows.length - 1;
  showContextMenu(x, y, [
    { label: 'TABLE · ' + (info.isHeader ? 'HEADER ROW' : 'ROW ' + (info.r - info.headerRows + 1)) + ' · COLUMN ' + (info.c + 1), header: true },
    { label: 'Add row above', icon: '↑', disabled: info.isHeader, action: () => insertRow(cell, false) },
    { label: 'Add row below', icon: '↓', gesture: lastBody ? 'Tab at end' : '', action: () => insertRow(cell, true) },
    { label: 'Add column left', icon: '←', action: () => insertColumn(cell, false) },
    { label: 'Add column right', icon: '→', action: () => insertColumn(cell, true) },
    'sep',
    { label: 'Move row up', icon: '⇡', disabled: info.isHeader || info.r <= info.headerRows, action: () => moveRow(cell, -1) },
    { label: 'Move row down', icon: '⇣', disabled: info.isHeader || lastBody, action: () => moveRow(cell, 1) },
    { label: 'Move column left', icon: '⇠', disabled: info.c === 0, action: () => moveColumn(cell, -1) },
    { label: 'Move column right', icon: '⇢', disabled: info.c >= info.cols - 1, action: () => moveColumn(cell, 1) },
    'sep',
    {
      label: 'Align column',
      icon: '≡',
      submenu: [
        { label: 'Left', checked: align === 'left', action: () => alignColumn(cell, 'left') },
        { label: 'Center', checked: align === 'center', action: () => alignColumn(cell, 'center') },
        { label: 'Right', checked: align === 'right', action: () => alignColumn(cell, 'right') },
        { label: 'Default', checked: !align, action: () => alignColumn(cell, '') },
      ],
    },
    'sep',
    { label: 'Delete row', icon: '✕', disabled: info.isHeader, action: () => deleteRow(cell) },
    { label: 'Delete column', icon: '✕', action: () => deleteColumn(cell) },
    { label: 'Delete table', icon: '✕', action: () => deleteTable(cell) },
  ]);
}

/** Tab / Shift+Tab / Enter inside a table cell of the editable preview. Returns true if handled. */
function handleTableKey(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  if (e.key !== 'Tab' && e.key !== 'Enter') return false;
  if (preview.getAttribute('contenteditable') !== 'true') return false;
  const sel = window.getSelection();
  const cell = sel && sel.rangeCount ? previewCellAt(sel.anchorNode) : null;
  if (!cell) return false;
  const info = tableInfo(cell);
  e.preventDefault();
  if (e.key === 'Tab') {
    const flat = info.rows.flatMap((row) => [...row.cells]);
    const i = flat.indexOf(cell) + (e.shiftKey ? -1 : 1);
    if (i >= 0 && i < flat.length) focusCell(flat[i], true);
    else if (!e.shiftKey) insertRow(info.rows[info.rows.length - 1].cells[0], true);
    return true;
  }
  if (e.shiftKey) return true; // no line breaks inside Markdown table cells
  const below = info.rows[info.r + 1];
  if (below && below.cells[info.c]) focusCell(below.cells[info.c], false);
  else insertRow(cell, true);
  return true;
}
