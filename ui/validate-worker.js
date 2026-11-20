/* Syntax checks, off the main thread. The text is only parsed, never run or loaded into anything.
 *   json / jsonc / json5 / jsonl : the parser below (exact line and column, several modes)
 *   yaml                         : js-yaml (vendor/js-yaml.min.js, MIT)
 *   toml                         : smol-toml (vendor/smol-toml.cjs.js, BSD-3-Clause)
 * (XML is checked on the page with the browser's own XML parser: workers don't have one.)
 *
 * Message in:  { id, mode, text }
 * Message out: { id, diagnostics: [{ s, e, line, col, severity, title, message, hint?, fix? }] }
 *   s/e are offsets in the text, line/col are 0-based; fix = { s, e, text, label, expect }. */

importScripts('vendor/js-yaml.min.js', 'vendor/acorn.js', 'validate-more.js');
self.exports = {};
importScripts('vendor/smol-toml.cjs.js');
const TOML = self.exports;

const MAX_DIAGNOSTICS = 100;

/* ---------- helpers ---------- */

function lineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

function makeLocator(text) {
  const starts = lineStarts(text);
  const lineOf = (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  return {
    starts,
    at(pos) {
      const line = lineOf(pos);
      return { line, col: pos - starts[line] };
    },
    offset(line, col) {
      const l = Math.max(0, Math.min(line, starts.length - 1));
      const end = l + 1 < starts.length ? starts[l + 1] - 1 : text.length;
      return Math.min(starts[l] + Math.max(0, col), end);
    },
  };
}

function diag(loc, s, e, severity, title, message, hint, fix) {
  const p = loc.at(s);
  const d = { s, e: Math.max(e, s), line: p.line, col: p.col, severity, title, message };
  if (hint) d.hint = hint;
  if (fix) d.fix = fix;
  return d;
}

function show(ch) {
  if (ch === undefined) return 'the end of the file';
  if (ch === '\n') return 'the end of the line';
  if (ch === '\t') return 'a tab';
  return '“' + ch + '”';
}

/* ---------- JSON, JSON with Comments, JSON5, JSON Lines ---------- */

class Stop extends Error {}

/**
 * A small recursive-descent JSON parser that reports where and why the text is not valid.
 * mode 'json': strict (RFC 8259). 'jsonc': + // and /* comments, trailing commas.
 * 'json5': + single quotes, unquoted keys, hex, Infinity/NaN, leading/trailing decimal point, +sign,
 * line continuations in strings. A few clear-cut mistakes are recovered from (so later problems are
 * still found) and get a suggested fix; anything else stops at the first error.
 */
function checkJson(text, mode, base = 0, loc = makeLocator(text), out = []) {
  const json5 = mode === 'json5';
  const comments = mode !== 'json';
  const trailing = mode !== 'json';
  const kind = { json: 'JSON', jsonc: 'JSON with Comments', json5: 'JSON5', jsonl: 'JSON Lines' }[mode] || 'JSON';
  const title = kind + ' syntax error';
  let i = 0;
  const n = text.length;
  const at = (p) => base + p;
  const add = (s, e, msg, hint, fix, severity = 'error') => {
    if (out.length < MAX_DIAGNOSTICS) out.push(diag(loc, at(s), at(e), severity, severity === 'error' ? title : kind + ' warning', msg, hint, fix));
  };
  const fail = (s, e, msg, hint, fix) => {
    add(s, e, msg, hint, fix);
    throw new Stop();
  };
  const ins = (p, t, label) => ({ s: at(p), e: at(p), text: t, label, expect: '' });
  const rep = (s, e, t, label) => ({ s: at(s), e: at(e), text: t, label, expect: text.slice(s, e) });

  function skip() {
    for (;;) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || (json5 && (c === '\v' || c === '\f' || c === '\u00a0' || c === '\ufeff'))) {
        i++;
      } else if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
        const start = i;
        if (text[i + 1] === '/') {
          const nl = text.indexOf('\n', i);
          i = nl === -1 ? n : nl;
        } else {
          const end = text.indexOf('*/', i + 2);
          if (end === -1) fail(start, start + 2, 'This comment is never closed with */.');
          i = end + 2;
        }
        if (!comments) add(start, Math.min(i, text.indexOf('\n', start) === -1 ? n : text.indexOf('\n', start)), 'Comments are not allowed in JSON.', 'If this file is meant to have comments, choose View > Language > JSON with Comments (or save it as .jsonc).');
        if (!comments) throw new Stop();
      } else return;
    }
  }

  const IDENT_START = /[A-Za-z_$\u0080-\uffff]/;
  const IDENT = /[A-Za-z0-9_$\u0080-\uffff]/;

  function readIdent() {
    const s = i;
    while (i < n && IDENT.test(text[i])) i++;
    return text.slice(s, i);
  }

  function parseString() {
    const q = text[i];
    const s = i;
    i++;
    for (;;) {
      if (i >= n || text[i] === '\n' || (text[i] === '\r' && text[i + 1] === '\n')) {
        // Unclosed: suggest closing it at the end of the line (before a trailing comma).
        const lineEnd = i;
        let p = lineEnd;
        while (p > s + 1 && /[ \t\r]/.test(text[p - 1])) p--;
        const before = p > s + 1 && text[p - 1] === ',' ? p - 1 : p;
        fail(s, lineEnd, 'This string is not closed: a ' + (q === '"' ? 'double' : 'single') + ' quote is missing.', null, ins(before, q, 'Close the string with ' + q));
      }
      const c = text[i];
      if (c === q) {
        i++;
        return text.slice(s + 1, i - 1);
      }
      if (c === '\\') {
        const e = text[i + 1];
        if ('"\\/bfnrt'.includes(e) || (json5 && ("'0vx\n\r\u2028\u2029".includes(e) || !/[1-9]/.test(e)))) {
          if (e === 'x' && !/^[0-9a-fA-F]{2}$/.test(text.substr(i + 2, 2))) fail(i, i + 4, 'Invalid \\x escape: it needs two hexadecimal digits.');
          i += e === 'x' ? 4 : e === '\r' && text[i + 2] === '\n' ? 3 : 2;
        } else if (e === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.substr(i + 2, 4))) fail(i, Math.min(n, i + 6), 'Invalid \\u escape: it needs four hexadecimal digits.');
          i += 6;
        } else {
          fail(i, Math.min(n, i + 2), 'Invalid escape sequence \\' + (e === undefined ? '' : e) + '.', 'In JSON a backslash must be followed by " \\ / b f n r t or u. For a backslash itself (e.g. in a Windows path) write \\\\.', e !== undefined && e !== '\n' ? ins(i, '\\', 'Escape the backslash (\\\\' + e + ')') : null);
        }
        continue;
      }
      if (c < ' ' && c !== '\t') fail(i, i + 1, 'Control characters must be escaped inside a string.');
      if (c === '\t' && !json5) fail(i, i + 1, 'A tab inside a string must be written as \\t.', null, rep(i, i + 1, '\\t', 'Replace the tab with \\t'));
      i++;
    }
  }

  function parseNumber() {
    const s = i;
    const m = /^[+-]?(?:Infinity|NaN|0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 400));
    if (!m) fail(s, s + 1, 'Invalid number.');
    const t = m[0];
    i += t.length;
    if (!json5) {
      const strict = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
      if (!strict.test(t)) {
        const why = /^\+/.test(t)
          ? 'A number cannot start with +.'
          : /Infinity|NaN/.test(t)
          ? t + ' is not allowed in JSON.'
          : /^-?0[xX]/.test(t)
          ? 'Hexadecimal numbers are not allowed in JSON.'
          : /^-?0\d/.test(t)
          ? 'Numbers cannot have leading zeros.'
          : /^-?\./.test(t)
          ? 'A number needs a digit before the decimal point.'
          : /\.(?:[eE]|$)/.test(t)
          ? 'A number needs a digit after the decimal point.'
          : 'Invalid number.';
        fail(s, i, why);
      }
    }
    if (IDENT.test(text[i] || '')) fail(s, i + 1, 'Invalid number.');
  }

  function parseValue(depth) {
    skip();
    const c = text[i];
    if (c === undefined) fail(n, n, 'A value is missing at the end of the file.');
    if (c === '{') return parseObject(depth);
    if (c === '[') return parseArray(depth);
    if (c === '"' || (c === "'" && json5)) return parseString();
    if (c === "'") {
      const s = i;
      const close = text.indexOf("'", i + 1);
      const lineEnd = text.indexOf('\n', i) === -1 ? n : text.indexOf('\n', i);
      const inner = close !== -1 && close < lineEnd ? text.slice(i + 1, close) : null;
      const fix = inner !== null && !/["\\]/.test(inner) ? rep(s, close + 1, '"' + inner + '"', 'Use double quotes') : null;
      add(s, close !== -1 && close < lineEnd ? close + 1 : s + 1, 'Strings must use double quotes in JSON.', null, fix);
      if (!fix) throw new Stop();
      i = close + 1;
      return null;
    }
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) return parseNumber();
    if (IDENT_START.test(c)) {
      const s = i;
      const word = readIdent();
      if (word === 'true' || word === 'false' || word === 'null') return null;
      if (json5 && (word === 'Infinity' || word === 'NaN')) return null;
      const lower = word.toLowerCase();
      if (lower === 'true' || lower === 'false' || lower === 'null') {
        add(s, i, '“' + word + '” is not valid: JSON writes it in lower case.', null, rep(s, i, lower, 'Change it to ' + lower));
        return null;
      }
      if (word === 'None') {
        add(s, i, '“None” is not valid JSON.', 'JSON writes an empty value as null.', rep(s, i, 'null', 'Change it to null'));
        return null;
      }
      if (word === 'undefined') fail(s, i, '“undefined” is not valid JSON.', 'Use null, or leave the property out.');
      fail(s, i, 'Unexpected word “' + word + '”: a value must be a string in double quotes, a number, an object, an array, true, false or null.');
    }
    fail(i, i + 1, 'Unexpected ' + show(c) + ': a value was expected here.');
  }

  function parseKey() {
    const c = text[i];
    const s = i;
    if (c === '"' || (c === "'" && json5)) return parseString();
    if (c === "'") {
      const close = text.indexOf("'", i + 1);
      const lineEnd = text.indexOf('\n', i) === -1 ? n : text.indexOf('\n', i);
      const inner = close !== -1 && close < lineEnd ? text.slice(i + 1, close) : null;
      const fix = inner !== null && !/["\\]/.test(inner) ? rep(s, close + 1, '"' + inner + '"', 'Use double quotes') : null;
      add(s, inner !== null ? close + 1 : s + 1, 'Property names must be in double quotes.', null, fix);
      if (!fix) throw new Stop();
      i = close + 1;
      return inner;
    }
    if (c !== undefined && IDENT_START.test(c)) {
      const word = readIdent();
      if (json5) return word;
      add(s, i, 'Property names must be in double quotes.', null, rep(s, i, '"' + word + '"', 'Put “' + word + '” in double quotes'));
      return word;
    }
    return undefined;
  }

  function parseObject(depth) {
    const open = i;
    i++;
    const seen = new Map();
    let afterComma = -1;
    for (;;) {
      skip();
      if (text[i] === '}') {
        if (afterComma >= 0 && !trailing && !json5) {
          add(afterComma, afterComma + 1, 'Trailing comma: there is no property after it.', 'JSON does not allow a comma before }.', rep(afterComma, afterComma + 1, '', 'Remove the comma'));
        }
        i++;
        return null;
      }
      if (i >= n) {
        const p = loc.at(at(open));
        fail(n, n, 'The { opened on line ' + (p.line + 1) + ' is never closed.', null, endFix());
      }
      const ks = i;
      const key = parseKey();
      if (key === undefined) {
        if (text[i] === ']') fail(i, i + 1, 'Expected } to close the { on line ' + (loc.at(at(open)).line + 1) + ', but found ].');
        fail(i, i + 1, 'Unexpected ' + show(text[i]) + ': a property name in double quotes was expected.');
      }
      const ke = i;
      if (seen.has(key)) add(ks, ke, 'Duplicate key “' + key + '” (also on line ' + (loc.at(at(seen.get(key))).line + 1) + '): only the last value is kept.', null, null, 'warning');
      else seen.set(key, ks);
      skip();
      if (text[i] !== ':') {
        if (text[i] === '=') fail(i, i + 1, 'Use a colon (:) between a property name and its value, not =.', null, rep(i, i + 1, ':', 'Change = to :'));
        fail(ke, ke, 'A colon (:) is missing after “' + key + '”.', null, ins(ke, ':', 'Insert :'));
      }
      i++;
      parseValue(depth + 1);
      const ve = i;
      skip();
      if (text[i] === ',') {
        afterComma = i;
        i++;
        continue;
      }
      afterComma = -1;
      if (text[i] === '}') continue;
      if (text[i] === '"' || (text[i] !== undefined && IDENT_START.test(text[i])) || text[i] === "'") {
        // Another property straight after the value: a comma is missing.
        add(ve, ve, 'Expected a comma between object properties.', null, ins(ve, ',', 'Insert a comma'));
        continue;
      }
      if (i >= n) fail(n, n, 'The { opened on line ' + (loc.at(at(open)).line + 1) + ' is never closed.', null, endFix());
      if (text[i] === ']') fail(i, i + 1, 'Expected } to close the { on line ' + (loc.at(at(open)).line + 1) + ', but found ].');
      fail(i, i + 1, 'Unexpected ' + show(text[i]) + ': expected a comma or }.');
    }
  }

  function parseArray(depth) {
    const open = i;
    i++;
    let afterComma = -1;
    for (;;) {
      skip();
      if (text[i] === ']') {
        if (afterComma >= 0 && !trailing && !json5) add(afterComma, afterComma + 1, 'Trailing comma: there is no value after it.', 'JSON does not allow a comma before ].', rep(afterComma, afterComma + 1, '', 'Remove the comma'));
        i++;
        return null;
      }
      if (i >= n) fail(n, n, 'The [ opened on line ' + (loc.at(at(open)).line + 1) + ' is never closed.', null, endFix());
      if (text[i] === ',') fail(i, i + 1, 'Unexpected comma: a value is missing before it.');
      if (text[i] === '}') fail(i, i + 1, 'Expected ] to close the [ on line ' + (loc.at(at(open)).line + 1) + ', but found }.');
      parseValue(depth + 1);
      const ve = i;
      skip();
      if (text[i] === ',') {
        afterComma = i;
        i++;
        continue;
      }
      afterComma = -1;
      if (text[i] === ']') continue;
      if (i >= n) fail(n, n, 'The [ opened on line ' + (loc.at(at(open)).line + 1) + ' is never closed.', null, endFix());
      const c = text[i];
      if (c === '"' || c === '{' || c === '[' || c === '-' || (c >= '0' && c <= '9') || /[tfn]/.test(c)) {
        add(ve, ve, 'Expected a comma between array values.', null, ins(ve, ',', 'Insert a comma'));
        continue;
      }
      if (c === '}') fail(i, i + 1, 'Expected ] to close the [ on line ' + (loc.at(at(open)).line + 1) + ', but found }.');
      fail(i, i + 1, 'Unexpected ' + show(c) + ': expected a comma or ].');
    }
  }

  // Closing brackets missing at the end of the file: offered only when nothing else is wrong,
  // so the closers follow the nesting that was actually read.
  const stack = [];
  function endFix() {
    if (out.some((d) => d.severity === 'error')) return null;
    // Re-scan to find the brackets still open (strings and comments skipped).
    const open = [];
    let k = 0;
    while (k < n) {
      const c = text[k];
      if (c === '"' || (c === "'" && json5)) {
        k++;
        while (k < n && text[k] !== c) k += text[k] === '\\' ? 2 : 1;
        k++;
      } else if (c === '/' && text[k + 1] === '/') {
        const nl = text.indexOf('\n', k);
        k = nl === -1 ? n : nl;
      } else if (c === '/' && text[k + 1] === '*') {
        const e = text.indexOf('*/', k + 2);
        k = e === -1 ? n : e + 2;
      } else {
        if (c === '{' || c === '[') open.push(c);
        else if (c === '}' || c === ']') open.pop();
        k++;
      }
    }
    if (!open.length || open.length > 20) return null;
    let tail = '';
    for (let d = open.length - 1; d >= 0; d--) tail += '\n' + '  '.repeat(d) + (open[d] === '{' ? '}' : ']');
    const trimmedEnd = text.replace(/\s+$/, '').length;
    return { s: at(trimmedEnd), e: at(trimmedEnd), text: tail, label: 'Add the missing ' + open.map((o) => (o === '{' ? '}' : ']')).reverse().join(' '), expect: '' };
  }
  void stack;

  try {
    skip();
    if (i >= n) return out; // empty: nothing to say
    parseValue(0);
    skip();
    if (i < n) {
      add(i, Math.min(n, i + 1), 'Unexpected ' + show(text[i]) + ' after the end of the ' + kind + ' value.', text[i] === '{' || text[i] === '[' ? 'A JSON file holds one value. To keep several, put them in an array [ ... ], or use JSON Lines (one value per line).' : null);
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
  return out;
}

function checkJsonLines(text) {
  const loc = makeLocator(text);
  const out = [];
  let start = 0;
  while (start <= text.length && out.length < MAX_DIAGNOSTICS) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, '');
    if (line.trim()) checkJson(line, 'json', start, loc, out);
    start = end + 1;
  }
  for (const d of out) d.title = d.title.replace(/^JSON/, 'JSON Lines');
  return out;
}

/* ---------- YAML ---------- */

const YAML_MESSAGES = [
  [/^bad indentation of a (mapping|sequence) entry/, (m) => 'The indentation of this line does not fit the ' + (m[1] === 'mapping' ? 'keys' : 'list items') + ' around it.'],
  [/^duplicated mapping key/, () => 'Duplicate key: this key already appears in the same mapping.'],
  [/tab characters must not be used in indentation/, () => 'Tabs cannot be used for indentation in YAML; use spaces.'],
  [/^unexpected end of the stream within a (double|single) quoted scalar/, (m) => 'This ' + m[1] + '-quoted string is never closed.'],
  [/^end of the stream or a document separator is expected/, () => 'Unexpected content here: the structure above has already ended (check the indentation and the line before).'],
  [/^can not read a block mapping entry; a multiline key may not be an implicit key/, () => 'This line looks like a key, but the line before it is not finished (a missing colon or quote?).'],
  [/^incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line/, () => 'A key is missing before this colon.'],
  [/^unidentified alias "([^"]*)"/, (m) => 'The alias *' + m[1] + ' refers to an anchor (&' + m[1] + ') that is not defined above.'],
  [/^duplication of an anchor/, () => 'This anchor name is already used above.'],
  [/^deficient indentation/, () => 'This line is not indented enough for the value above it (is a quote or bracket on an earlier line left open?).'],
  [/^missed comma between flow collection entries/, () => 'A comma is missing between the items in [ ] or { }.'],
  [/^unexpected end of the stream within a flow collection/, () => 'A [ or { here is never closed.'],
  [/^end of the stream or a document separator is expected/, () => 'Unexpected content after the end of the document.'],
];

/** The indentation (in spaces) of the keys before line `line`, to say what this line should line up with. */
function siblingIndents(text, loc, line) {
  const out = [];
  for (let l = line - 1; l >= 0 && out.length < 6; l--) {
    const s = loc.starts[l];
    const e = l + 1 < loc.starts.length ? loc.starts[l + 1] - 1 : text.length;
    const t = text.slice(s, e);
    if (!t.trim() || /^\s*#/.test(t)) continue;
    const m = /^( *)(- )?([^:#\s][^:#]*?):(?:\s|$)/.exec(t);
    if (m) out.push({ indent: m[1].length + (m[2] ? 2 : 0), key: m[3].trim() });
    if (/^\S/.test(t)) break;
  }
  return out;
}

function checkYaml(text) {
  const loc = makeLocator(text);
  const out = [];
  try {
    jsyaml.loadAll(
      text,
      () => {},
      {
        json: false,
        onWarning: (w) => {
          if (out.length >= MAX_DIAGNOSTICS || !w.mark) return;
          const s = loc.offset(w.mark.line, w.mark.column);
          out.push(diag(loc, s, s + 1, 'warning', 'YAML warning', w.reason || String(w.message)));
        },
      }
    );
  } catch (e) {
    if (!e || !e.mark) return [diag(loc, 0, 0, 'error', 'YAML syntax error', String((e && e.reason) || e))];
    const reason = e.reason || e.message;
    let message = reason.charAt(0).toUpperCase() + reason.slice(1) + '.';
    for (const [re, f] of YAML_MESSAGES) {
      const m = re.exec(reason);
      if (m) {
        message = f(m);
        break;
      }
    }
    let line = e.mark.line;
    let col = e.mark.column;
    let hint = null;
    if (/indentation/.test(reason)) {
      // Point at the start of the badly indented line's text, and say what is above it.
      const lineText = text.slice(loc.starts[line], line + 1 < loc.starts.length ? loc.starts[line + 1] - 1 : text.length);
      col = /^\s*/.exec(lineText)[0].length;
      const sib = siblingIndents(text, loc, line);
      const same = sib.filter((x) => x.indent !== col);
      if (same.length) {
        const byIndent = new Map();
        for (const x of same) if (!byIndent.has(x.indent)) byIndent.set(x.indent, x.key);
        hint =
          'This line is indented by ' + col + ' space' + (col === 1 ? '' : 's') + '. Lines above use ' +
          [...byIndent.entries()].map(([ind, key]) => ind + ' (' + key + ')').join(', ') +
          '. Line it up with the keys it belongs with; indentation changes the meaning, so it is not changed for you.';
      }
    } else if (/duplicated mapping key/.test(reason)) {
      hint = 'YAML does not allow the same key twice in one mapping. Remove one, or merge their values.';
    }
    let s = loc.offset(line, col);
    let eEnd = s + 1;
    const lineEnd = line + 1 < loc.starts.length ? loc.starts[line + 1] - 1 : text.length;
    if (/indentation|duplicated mapping key/.test(reason)) eEnd = lineEnd > s ? lineEnd : s + 1;
    if (s >= text.length) {
      s = Math.max(0, text.length - 1);
      eEnd = text.length;
    }
    out.push(diag(loc, s, eEnd, 'error', 'YAML syntax error', message, hint));
  }
  return out;
}

/* ---------- TOML ---------- */

function checkToml(text) {
  const loc = makeLocator(text);
  try {
    TOML.parse(text);
    return [];
  } catch (e) {
    if (!(e instanceof TOML.TomlError)) return [diag(loc, 0, 0, 'error', 'TOML syntax error', String(e && e.message))];
    let msg = String(e.message).split('\n')[0].replace(/^Invalid TOML document:\s*/, '');
    msg = msg.charAt(0).toUpperCase() + msg.slice(1);
    if (!/[.!?]$/.test(msg)) msg += '.';
    const line = Math.max(0, (e.line || 1) - 1);
    const col = Math.max(0, (e.column || 1) - 1);
    let s = loc.offset(line, col);
    let eEnd = s + 1;
    if (s >= text.length) {
      s = Math.max(0, text.length - 1);
      eEnd = text.length;
    }
    let hint = null;
    if (/key\/value pair|expected "="|=/i.test(msg) && /^\s*[A-Za-z0-9_."'-]+\s+[^=\s]/.test(text.slice(loc.starts[line], s + 40))) hint = 'Each key needs = before its value, e.g. name = "value".';
    if (/already|duplicate|overwrite|redefin/i.test(msg)) hint = 'TOML does not allow the same key or table to be defined twice.';
    return [diag(loc, s, eEnd, 'error', 'TOML syntax error', msg, hint)];
  }
}

/* ---------- dispatch ---------- */

self.onmessage = (ev) => {
  const { id, mode, text, name, eol } = ev.data;
  const ctx = { loc: makeLocator(text), name: (name || '').toLowerCase(), eol };
  let diagnostics = [];
  try {
    if (mode === 'json' || mode === 'jsonc' || mode === 'json5') diagnostics = checkJson(text, mode);
    else if (mode === 'jsonl') diagnostics = checkJsonLines(text);
    else if (mode === 'yaml') diagnostics = checkYaml(text);
    else if (mode === 'toml') diagnostics = checkToml(text);
    else if (mode === 'compose') {
      diagnostics = checkYaml(text);
      if (!diagnostics.some((d) => d.severity === 'error')) {
        let doc;
        try {
          doc = jsyaml.load(text);
        } catch (e) {
          doc = undefined;
        }
        diagnostics = diagnostics.concat(checkComposeStructure(text, ctx, doc));
      }
    } else if (mode === 'javascript') diagnostics = checkJavaScript(text, ctx);
    else if (mode === 'python') diagnostics = checkPython(text, ctx);
    else if (mode === 'bash') diagnostics = checkBash(text, ctx);
    else if (mode === 'powershell') diagnostics = checkPowerShell(text, ctx);
    else if (mode === 'css') diagnostics = checkCss(text, ctx);
    else if (mode === 'nginx') diagnostics = checkNginx(text, ctx);
    else if (mode === 'hcl') diagnostics = checkHcl(text, ctx);
    else if (mode === 'apache') diagnostics = checkApache(text, ctx);
    else if (mode === 'env') diagnostics = checkEnv(text, ctx);
    else if (mode === 'systemd' || mode === 'ini' || mode === 'desktop') diagnostics = checkKeyFile(text, ctx, mode);
    else if (mode === 'dockerfile') diagnostics = checkDockerfile(text, ctx);
    diagnostics = diagnostics.slice(0, MAX_DIAGNOSTICS);
  } catch (e) {
    diagnostics = [];
    console.error('validation', mode, e);
  }
  diagnostics.sort((a, b) => a.s - b.s);
  self.postMessage({ id, diagnostics });
};
