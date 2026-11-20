/* More syntax checks for validate-worker.js (loaded into the worker with importScripts).
 *
 *   javascript : acorn (vendor/acorn.js, MIT): a complete JavaScript parser.
 *   python, bash, powershell, css, nginx, hcl, apache :
 *       STRUCTURE checks only: brackets, quotes, strings, comments, here-documents, block keywords
 *       (and indentation for Python). They read the text the way the language's own tokenizer does,
 *       but they are not full parsers, so they say "structure check" and never claim more.
 *   compose : YAML, then the Docker Compose file structure (services, ports, volumes, networks...)
 *   env, systemd, ini, desktop, dockerfile : the line formats of those files.
 *
 * Every function takes (text, ctx) where ctx = { loc, name } and returns diagnostics made with
 * diag() from validate-worker.js. Nothing here runs or loads the text. */

/* ---------- small shared helpers ---------- */

function lineTextAt(text, loc, line) {
  const s = loc.starts[line];
  const e = line + 1 < loc.starts.length ? loc.starts[line + 1] - 1 : text.length;
  return text.slice(s, e);
}

const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = { ')': '(', ']': '[', '}': '{' };

/** Bracket bookkeeping shared by the structure checks. */
function bracketTracker(loc, out, title) {
  const stack = [];
  return {
    stack,
    open(ch, pos, kind) {
      stack.push({ ch, pos, kind: kind || ch });
    },
    close(ch, pos) {
      const want = CLOSERS[ch];
      const top = stack[stack.length - 1];
      if (!top) {
        out.push(diag(loc, pos, pos + 1, 'error', title, 'This ' + ch + ' has no matching ' + want + ' before it.'));
        return false;
      }
      if (top.ch !== want) {
        const at = loc.at(top.pos);
        out.push(diag(loc, pos, pos + 1, 'error', title, 'Expected ' + OPENERS[top.ch] + ' to close the ' + top.kind + ' on line ' + (at.line + 1) + ', but found ' + ch + '.'));
        return false;
      }
      stack.pop();
      return true;
    },
    finish(n) {
      for (const b of stack.slice(0, 3)) {
        const at = loc.at(b.pos);
        out.push(diag(loc, b.pos, b.pos + b.kind.length, 'error', title, 'The ' + b.kind + ' on line ' + (at.line + 1) + ' is never closed.'));
      }
      void n;
    },
  };
}

/* ---------- JavaScript (acorn) ---------- */

function checkJavaScript(text, ctx) {
  const { loc, name } = ctx;
  const looksModule = /\.mjs$/.test(name) || (!/\.cjs$/.test(name) && /^\s*(?:import\s*[\w{*'"]|export\s)/m.test(text));
  const opts = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: false, allowAwaitOutsideFunction: looksModule, locations: true };
  let err = null;
  for (const sourceType of looksModule ? ['module', 'script'] : ['script', 'module']) {
    try {
      acorn.parse(text, { ...opts, sourceType });
      return [];
    } catch (e) {
      if (!err) err = e;
      if (!(e instanceof SyntaxError) || !/import|export/.test(e.message)) break;
    }
  }
  if (!err || typeof err.pos !== 'number') return [];
  let msg = String(err.message).replace(/\s*\(\d+:\d+\)$/, '');
  const MAP = [
    [/^Unterminated string constant/, 'This string is not closed: a quote is missing.'],
    [/^Unterminated template/, 'This template string (`...`) is not closed.'],
    [/^Unterminated comment/, 'This /* comment is never closed with */.'],
    [/^Unterminated regular expression/, 'This regular expression is not closed with /.'],
    [/^Unexpected token$/, 'Unexpected character here: something before it is missing (a comma, a bracket, an operator or a semicolon?).'],
    [/^Unexpected character '(.)'/, (m) => 'Unexpected character ' + m[1] + '.'],
    [/^Identifier '(.+)' has already been declared/, (m) => '“' + m[1] + '” is declared twice in the same scope.'],
    [/^'return' outside of function/, 'return can only be used inside a function.'],
    [/^Unexpected keyword '(\w+)'/, (m) => 'The keyword “' + m[1] + '” cannot be used here.'],
    [/^Assigning to rvalue/, 'This cannot be assigned to (did you mean == or ===?).'],
  ];
  for (const [re, f] of MAP) {
    const m = re.exec(msg);
    if (m) {
      msg = typeof f === 'function' ? f(m) : f;
      break;
    }
  }
  if (!/[.!?)]$/.test(msg)) msg += '.';
  const s = Math.min(err.pos, text.length);
  return [diag(loc, s, Math.min(text.length, s + 1), 'error', 'JavaScript syntax error', msg)];
}

/* ---------- Python: the tokenizer's checks (brackets, strings, indentation) ---------- */

function checkPython(text, ctx) {
  const { loc } = ctx;
  const title = 'Python structure check';
  const out = [];
  const br = bracketTracker(loc, out, title);
  const n = text.length;
  let i = 0;
  const indents = [{ col: 0, alt: 0 }];
  let atLineStart = true;
  let lastSignificant = ''; // last token character of the previous logical line
  let expectIndent = -1; // line that ended with ':' (a block must follow)

  function readString(start) {
    // start points at the prefix (or quote). Returns the index after the string, or -1 when it never ends.
    let p = start;
    let prefix = '';
    while (/[rRbBuUfFtT]/.test(text[p])) prefix += text[p++];
    const q = text[p];
    const triple = text.substr(p, 3) === q.repeat(3);
    const raw = /[rR]/.test(prefix);
    const fmt = /[fFtT]/.test(prefix);
    p += triple ? 3 : 1;
    while (p < n) {
      const c = text[p];
      if (c === '\\' && !raw) {
        p += 2;
        continue;
      }
      if (c === '\\' && raw) {
        p += 2; // a raw string still can't end in an odd backslash before the quote
        continue;
      }
      if (fmt && c === '{') {
        if (text[p + 1] === '{') {
          p += 2;
          continue;
        }
        p = readFExpr(p + 1);
        if (p < 0) return -1;
        continue;
      }
      if (!triple && c === '\n') return -1;
      if (triple ? text.substr(p, 3) === q.repeat(3) : c === q) return p + (triple ? 3 : 1);
      p++;
    }
    return -1;
  }

  function readFExpr(p) {
    // Inside {...} of an f-string: brackets and nested strings (Python 3.12 allows any quotes here).
    let depth = 0;
    while (p < n) {
      const c = text[p];
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === '}') {
        if (depth === 0) return p + 1;
        depth--;
      } else if (c === '"' || c === "'") {
        const e = readString(p);
        if (e < 0) return -1;
        p = e;
        continue;
      } else if (c === '#') return -1;
      p++;
    }
    return -1;
  }

  while (i < n) {
    if (atLineStart && br.stack.length === 0) {
      // Indentation of a new logical line (blank and comment-only lines don't count).
      let col = 0;
      let alt = 0;
      let p = i;
      while (text[p] === ' ' || text[p] === '\t' || text[p] === '\f') {
        if (text[p] === '\t') {
          col = (Math.floor(col / 8) + 1) * 8;
          alt += 1;
        } else if (text[p] === ' ') {
          col++;
          alt++;
        }
        p++;
      }
      const c = text[p];
      if (c !== '\n' && c !== '#' && c !== '\r' && p < n) {
        const top = indents[indents.length - 1];
        if (expectIndent >= 0 && col <= top.col) {
          out.push(diag(loc, p, p + 1, 'error', title, 'Expected an indented block after the line ending with “:” (line ' + (expectIndent + 1) + ').'));
          return out;
        }
        if (col > top.col) {
          if (expectIndent < 0 && lastSignificant !== '\\') {
            out.push(diag(loc, i, p, 'error', title, 'Unexpected indent: this line is indented more than the one before it, but that line does not end with “:”.'));
            return out;
          }
          if (alt <= top.alt) {
            out.push(diag(loc, i, p, 'error', title, 'Inconsistent use of tabs and spaces in the indentation.', 'Use only spaces (or only tabs) for indentation.'));
            return out;
          }
          indents.push({ col, alt });
        } else if (col < top.col) {
          while (indents.length > 1 && indents[indents.length - 1].col > col) indents.pop();
          const now = indents[indents.length - 1];
          if (now.col !== col) {
            out.push(diag(loc, i, p, 'error', title, 'This line’s indentation does not match any outer block.', 'Line it up with one of the lines that start the blocks above.'));
            return out;
          }
          if (now.alt !== alt) {
            out.push(diag(loc, i, p, 'error', title, 'Inconsistent use of tabs and spaces in the indentation.', 'Use only spaces (or only tabs) for indentation.'));
            return out;
          }
        } else if (top.alt !== alt) {
          out.push(diag(loc, i, p, 'error', title, 'Inconsistent use of tabs and spaces in the indentation.', 'Use only spaces (or only tabs) for indentation.'));
          return out;
        }
        expectIndent = -1;
      }
      atLineStart = false;
      i = p;
      continue;
    }
    const c = text[i];
    if (c === '#') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '\n') {
      if (br.stack.length === 0) {
        if (lastSignificant === ':') expectIndent = loc.at(i).line;
        if (lastSignificant !== '\\') atLineStart = true;
        if (lastSignificant !== '\\') lastSignificant = '';
        else lastSignificant = 'cont';
      }
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f') {
      i++;
      continue;
    }
    if (c === '\\' && text[i + 1] === '\n') {
      lastSignificant = '\\';
      i += 2;
      continue;
    }
    // Strings (with an optional prefix such as r, b, f, rb).
    const pm = /^[rRbBuUfFtT]{0,2}(['"])/.exec(text.slice(i, i + 4));
    if (pm && (i === 0 || !/[\w]/.test(text[i - 1]))) {
      const e = readString(i);
      if (e < 0) {
        const q = pm[1];
        const triple = text.substr(i + pm[0].length - 1, 3) === q.repeat(3);
        out.push(diag(loc, i, Math.min(n, (text.indexOf('\n', i) + 1 || n + 1) - 1), 'error', title, triple ? 'This triple-quoted string is never closed.' : 'This string is not closed before the end of the line.'));
        return out;
      }
      i = e;
      lastSignificant = 'x';
      continue;
    }
    if (OPENERS[c]) br.open(c, i);
    else if (CLOSERS[c]) {
      if (!br.close(c, i)) return out;
    }
    lastSignificant = c === ':' ? ':' : 'x';
    if (/[A-Za-z0-9_]/.test(c)) {
      while (i < n && /[\w]/.test(text[i])) i++;
      continue;
    }
    i++;
  }
  br.finish(n);
  if (!out.length && expectIndent >= 0) {
    const e = Math.max(0, n - 1);
    out.push(diag(loc, e, n, 'error', title, 'Expected an indented block after the line ending with “:” (line ' + (expectIndent + 1) + '), but the file ends.'));
  }
  return out;
}

/* ---------- Bash / sh: quotes, substitutions, here-documents, block keywords ---------- */

function checkBash(text, ctx) {
  const { loc } = ctx;
  const title = 'Shell structure check';
  const out = [];
  const n = text.length;
  const blocks = []; // { kw, pos } for if/case/do/{ and ( subshells
  const heredocs = []; // delimiters waiting for the end of the current line
  let i = 0;
  let cmdStart = true;
  let caseState = 0; // 1: after "case WORD", expecting "in"; 2: in a pattern (before ")")
  const CLOSE_KW = { fi: 'if', esac: 'case', done: 'do', '}': '{' };
  const fail = (s, e, msg, hint) => {
    out.push(diag(loc, s, e, 'error', title, msg, hint));
  };
  const lineOfPos = (p) => loc.at(p).line + 1;

  function skipQuoted(p) {
    // p at a quote character; returns the index after the closing one, or -1.
    const q = text[p];
    if (q === "'") {
      const e = text.indexOf("'", p + 1);
      return e < 0 ? -1 : e + 1;
    }
    if (q === '`') {
      for (let k = p + 1; k < n; k++) {
        if (text[k] === '\\') k++;
        else if (text[k] === '`') return k + 1;
      }
      return -1;
    }
    // double quotes: \ escapes, $(...), ${...}, `...` inside
    let k = p + 1;
    while (k < n) {
      const c = text[k];
      if (c === '\\') k += 2;
      else if (c === '"') return k + 1;
      else if (c === '$' && (text[k + 1] === '(' || text[k + 1] === '{')) {
        const e = skipDollar(k);
        if (e < 0) return -1;
        k = e;
      } else if (c === '`') {
        const e = skipQuoted(k);
        if (e < 0) return -1;
        k = e;
      } else k++;
    }
    return -1;
  }

  function skipDollar(p) {
    // p at $ followed by ( or {: $( ), $(( )), ${ }. Returns the index after it, or -1.
    const open = text[p + 1];
    const close = open === '(' ? ')' : '}';
    let depth = 0;
    let k = p + 1;
    while (k < n) {
      const c = text[k];
      if (c === '\\') {
        k += 2;
        continue;
      }
      if (c === "'" && open === '(') {
        const e = skipQuoted(k);
        if (e < 0) return -1;
        k = e;
        continue;
      }
      if (c === '"' || c === '`') {
        const e = skipQuoted(k);
        if (e < 0) return -1;
        k = e;
        continue;
      }
      if (c === '#' && open === '(' && /\s/.test(text[k - 1] || ' ')) {
        while (k < n && text[k] !== '\n') k++;
        continue;
      }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return k + 1;
      }
      k++;
    }
    return -1;
  }

  function word(p) {
    // (a function definition "name()" is handled where the ( is read)
    let k = p;
    while (k < n && /[^\s;&|()<>'"`$\\]/.test(text[k])) k++;
    return text.slice(p, k);
  }

  while (i < n) {
    const c = text[i];
    if (c === '\n') {
      // Here-documents start on the next line.
      i++;
      while (heredocs.length) {
        const h = heredocs.shift();
        let found = false;
        while (i < n) {
          let e = text.indexOf('\n', i);
          if (e < 0) e = n;
          let l = text.slice(i, e).replace(/\r$/, '');
          if (h.strip) l = l.replace(/^\t+/, '');
          i = e + 1;
          if (l === h.delim) {
            found = true;
            break;
          }
        }
        if (!found) {
          fail(h.pos, h.pos + 2, 'The here-document started on line ' + lineOfPos(h.pos) + ' never ends: no line with just “' + h.delim + '” follows.');
          return out;
        }
      }
      cmdStart = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '\\') {
      i += 2;
      cmdStart = false;
      continue;
    }
    if (c === '#' && (i === 0 || /[\s;&|()]/.test(text[i - 1]))) {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const e = skipQuoted(i);
      if (e < 0) {
        fail(i, i + 1, (c === '`' ? 'This backtick (`)' : 'This ' + (c === '"' ? 'double' : 'single') + ' quote') + ' on line ' + lineOfPos(i) + ' is never closed.');
        return out;
      }
      i = e;
      cmdStart = false;
      continue;
    }
    if (c === '$' && (text[i + 1] === '(' || text[i + 1] === '{')) {
      const e = skipDollar(i);
      if (e < 0) {
        fail(i, i + 2, 'This ' + text.substr(i, text[i + 2] === '(' ? 3 : 2) + ' on line ' + lineOfPos(i) + ' is never closed.');
        return out;
      }
      i = e;
      cmdStart = false;
      continue;
    }
    if (c === '$' && text[i + 1] === "'") {
      let k = i + 2;
      while (k < n && text[k] !== "'") k += text[k] === '\\' ? 2 : 1;
      if (k >= n) {
        fail(i, i + 2, "This $'...' string on line " + lineOfPos(i) + ' is never closed.');
        return out;
      }
      i = k + 1;
      continue;
    }
    if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      // here-document: <<WORD, <<-WORD, <<'WORD', <<"WORD"
      let k = i + 2;
      const strip = text[k] === '-';
      if (strip) k++;
      while (text[k] === ' ' || text[k] === '\t') k++;
      let delim = '';
      if (text[k] === "'" || text[k] === '"') {
        const q = text[k];
        const e = text.indexOf(q, k + 1);
        if (e > 0) {
          delim = text.slice(k + 1, e);
          k = e + 1;
        }
      } else {
        const m = /^\\?([A-Za-z0-9_.-]+)/.exec(text.slice(k, k + 80));
        if (m) {
          delim = m[1];
          k += m[0].length;
        }
      }
      if (delim) heredocs.push({ delim, strip, pos: i });
      i = k;
      continue;
    }
    if (c === '(' && text[i + 1] === '(' && cmdStart) {
      // (( arithmetic ))
      const e = text.indexOf('))', i + 2);
      if (e < 0) {
        fail(i, i + 2, 'This (( on line ' + lineOfPos(i) + ' is never closed with )).');
        return out;
      }
      i = e + 2;
      cmdStart = false;
      continue;
    }
    if (c === '(' && text[i + 1] === ')') {
      // name() { ... }: a function definition; the body follows at a command position
      i += 2;
      cmdStart = true;
      continue;
    }
    if (c === '(') {
      if (caseState === 2 && cmdStart) {
        i++; // optional ( before a case pattern
        continue;
      }
      blocks.push({ kw: '(', pos: i });
      i++;
      cmdStart = true;
      continue;
    }
    if (c === ')') {
      if (caseState === 2) {
        caseState = 3; // end of a case pattern: commands follow
        i++;
        cmdStart = true;
        continue;
      }
      const top = blocks[blocks.length - 1];
      if (!top || top.kw !== '(') {
        fail(i, i + 1, 'This ) has no matching ( before it.');
        return out;
      }
      blocks.pop();
      i++;
      cmdStart = false;
      continue;
    }
    if (c === ';' || c === '&' || c === '|') {
      if (c === ';' && text[i + 1] === ';') {
        if (blocks.length && blocks[blocks.length - 1].kw === 'case') caseState = 2; // next pattern
        i += text[i + 2] === '&' ? 3 : 2;
        cmdStart = true;
        continue;
      }
      if (c === ';' && text[i + 1] === '&' && blocks.length && blocks[blocks.length - 1].kw === 'case') {
        caseState = 2;
        i += 2;
        cmdStart = true;
        continue;
      }
      i++;
      cmdStart = true;
      continue;
    }
    if (c === '<' || c === '>') {
      i++;
      continue;
    }
    // A word.
    const w = word(i);
    if (!w) {
      i++;
      continue;
    }
    const wStart = i;
    i += w.length;
    if (caseState === 1) {
      if (w === 'in') caseState = 2;
      cmdStart = true;
      continue;
    }
    if (caseState === 2) {
      if (w === 'esac' && cmdStart) {
        // empty case or esac straight after ;;
      } else {
        continue; // part of a pattern
      }
    }
    if (!cmdStart) continue;
    if (w === 'if' || w === 'case' || w === '{' || w === 'while' || w === 'until' || w === 'for' || w === 'select') {
      if (w === 'if' || w === 'case' || w === '{') blocks.push({ kw: w, pos: wStart });
      if (w === 'case') caseState = 1;
      else if (w === 'for' || w === 'select' || w === 'while' || w === 'until') blocks.push({ kw: 'loop', pos: wStart, name: w });
      cmdStart = w === '{' || w === 'if' || w === 'while' || w === 'until';
      if (w === 'for' || w === 'select') cmdStart = false;
      continue;
    }
    if (w === 'do') {
      const top = blocks[blocks.length - 1];
      if (!top || top.kw !== 'loop') {
        fail(wStart, i, '“do” without a for, while, until or select before it.');
        return out;
      }
      top.kw = 'do';
      cmdStart = true;
      continue;
    }
    if (w === 'then' || w === 'else' || w === 'elif') {
      const top = blocks[blocks.length - 1];
      if (!top || top.kw !== 'if') {
        fail(wStart, i, '“' + w + '” without an if before it.');
        return out;
      }
      cmdStart = true;
      continue;
    }
    if (CLOSE_KW[w]) {
      const want = CLOSE_KW[w];
      const top = blocks[blocks.length - 1];
      if (!top || top.kw !== want) {
        const opener = { if: 'if', case: 'case', do: 'do (for / while)', '{': '{' }[want];
        fail(wStart, i, '“' + w + '” without a matching ' + opener + (top ? ' (the ' + (top.kw === 'loop' ? top.name : top.kw) + ' on line ' + lineOfPos(top.pos) + ' is still open)' : '') + '.');
        return out;
      }
      blocks.pop();
      if (w === 'esac') caseState = 0;
      if (caseState === 3 && blocks.length && blocks[blocks.length - 1].kw === 'case') caseState = 3;
      cmdStart = false;
      continue;
    }
    if (w === 'function' || w === '!' || w === 'time' || /^[A-Za-z_][\w]*=/.test(w)) continue; // still at a command position
    cmdStart = false;
  }
  if (heredocs.length) {
    const h = heredocs[0];
    fail(h.pos, h.pos + 2, 'The here-document started on line ' + lineOfPos(h.pos) + ' never ends: no line with just “' + h.delim + '” follows.');
    return out;
  }
  for (const b of blocks.slice(-1)) {
    const what = { if: ['if', 'fi'], case: ['case', 'esac'], do: ['do', 'done'], loop: [b.name, 'do ... done'], '{': ['{', '}'], '(': ['(', ')'] }[b.kw];
    fail(b.pos, b.pos + what[0].length, 'The ' + what[0] + ' on line ' + lineOfPos(b.pos) + ' is never closed with ' + what[1] + '.');
  }
  return out;
}

/* ---------- PowerShell: strings, here-strings, comments, brackets ---------- */

function checkPowerShell(text, ctx) {
  const { loc } = ctx;
  const title = 'PowerShell structure check';
  const out = [];
  const br = bracketTracker(loc, out, title);
  const n = text.length;
  let i = 0;
  const lineOfPos = (p) => loc.at(p).line + 1;

  function skipString(p) {
    const q = text[p];
    let k = p + 1;
    while (k < n) {
      const c = text[k];
      if (q === "'" && c === "'") {
        if (text[k + 1] === "'") {
          k += 2;
          continue;
        }
        return k + 1;
      }
      if (q === '"') {
        if (c === '`') {
          k += 2;
          continue;
        }
        if (c === '"') {
          if (text[k + 1] === '"') {
            k += 2;
            continue;
          }
          return k + 1;
        }
        if (c === '$' && text[k + 1] === '(') {
          const e = skipSub(k + 1);
          if (e < 0) return -1;
          k = e;
          continue;
        }
      }
      k++;
    }
    return -1;
  }

  function skipSub(p) {
    // p at ( of $( ... ) inside a string
    let depth = 0;
    let k = p;
    while (k < n) {
      const c = text[k];
      if (c === "'" || c === '"') {
        const e = skipString(k);
        if (e < 0) return -1;
        k = e;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return k + 1;
      }
      k++;
    }
    return -1;
  }

  while (i < n) {
    const c = text[i];
    if (c === '#') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '<' && text[i + 1] === '#') {
      const e = text.indexOf('#>', i + 2);
      if (e < 0) {
        out.push(diag(loc, i, i + 2, 'error', title, 'This <# comment on line ' + lineOfPos(i) + ' is never closed with #>.'));
        return out;
      }
      i = e + 2;
      continue;
    }
    if (c === '@' && (text[i + 1] === '"' || text[i + 1] === "'") && /^[ \t]*\r?\n/.test(text.slice(i + 2, i + 40))) {
      // here-string: @" ... "@ with the closing at the start of a line
      const q = text[i + 1];
      const re = new RegExp('\\n' + q + '@', 'g');
      re.lastIndex = i + 2;
      const m = re.exec(text);
      if (!m) {
        out.push(diag(loc, i, i + 2, 'error', title, 'This here-string (@' + q + ') on line ' + lineOfPos(i) + ' is never closed with ' + q + '@ at the start of a line.'));
        return out;
      }
      i = m.index + 3;
      continue;
    }
    if (c === '`') {
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const e = skipString(i);
      if (e < 0) {
        out.push(diag(loc, i, i + 1, 'error', title, 'This ' + (c === '"' ? 'double' : 'single') + '-quoted string on line ' + lineOfPos(i) + ' is never closed.'));
        return out;
      }
      i = e;
      continue;
    }
    if (OPENERS[c]) br.open(c, i);
    else if (CLOSERS[c]) {
      if (!br.close(c, i)) return out;
    }
    i++;
  }
  br.finish(n);
  return out;
}

/* ---------- CSS: comments, strings, blocks; missing colons and semicolons are warnings ---------- */

function checkCss(text, ctx) {
  const { loc } = ctx;
  const title = 'CSS structure check';
  const out = [];
  const br = bracketTracker(loc, out, title);
  const n = text.length;
  let i = 0;
  let segStart = 0;
  const lineOfPos = (p) => loc.at(p).line + 1;

  function checkSegment(s, e, ender) {
    // A declaration (ends with ; or }) inside a block: property: value
    const seg = text.slice(s, e).replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
    const trimmed = seg.trim();
    if (!trimmed || br.stack.length === 0 && ender === ';' && trimmed.startsWith('@')) return;
    if (ender === '{') return; // a selector or an at-rule prelude
    if (br.stack.length === 0 && ender === ';') {
      if (!trimmed.startsWith('@')) out.push(diag(loc, s + seg.indexOf(trimmed), e, 'warning', title, 'A declaration outside of any { } block.'));
      return;
    }
    if (trimmed.startsWith('@') || trimmed.startsWith('--') && trimmed.includes(':')) return;
    const off = s + seg.indexOf(trimmed);
    if (!trimmed.includes(':')) {
      out.push(diag(loc, off, off + trimmed.length, 'warning', title, 'This declaration has no colon: write property: value;'));
      return;
    }
    // "color: red\n  background: blue" — a semicolon is probably missing at the end of the first line.
    const m = /\n[ \t]*[a-z-]+[ \t]*:[^:]/i.exec(trimmed);
    if (m && /^[a-z-]+\s*:/i.test(trimmed)) {
      const firstEnd = off + trimmed.indexOf('\n');
      let p = firstEnd;
      while (p > off && /\s/.test(text[p - 1])) p--;
      out.push(diag(loc, p, p, 'warning', title, 'A semicolon seems to be missing at the end of this declaration.', null, { s: p, e: p, text: ';', label: 'Insert ;', expect: '' }));
    }
  }

  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      if (e < 0) {
        out.push(diag(loc, i, i + 2, 'error', title, 'This /* comment on line ' + lineOfPos(i) + ' is never closed with */.'));
        return out;
      }
      i = e + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && text[k] !== c && text[k] !== '\n') k += text[k] === '\\' ? 2 : 1;
      if (k >= n || text[k] === '\n') {
        out.push(diag(loc, i, Math.min(k, n), 'error', title, 'This string is not closed before the end of the line.'));
        return out;
      }
      i = k + 1;
      continue;
    }
    if (c === '{' || c === '}' || c === ';') {
      if (c === '{') {
        checkSegment(segStart, i, '{');
        br.open('{', i);
      } else {
        if (c === '}' && br.stack.length && br.stack[br.stack.length - 1].ch !== '{') {
          if (!br.close('}', i)) return out;
        }
        checkSegment(segStart, i, c);
        if (c === '}' && !br.close('}', i)) return out;
      }
      segStart = i + 1;
      i++;
      continue;
    }
    if (c === '(' || c === '[') br.open(c, i);
    else if (c === ')' || c === ']') {
      if (!br.close(c, i)) return out;
    }
    i++;
  }
  br.finish(n);
  return out;
}

/* ---------- NGINX: blocks, quotes and the ; at the end of each directive ---------- */

function checkNginx(text, ctx) {
  const { loc } = ctx;
  const title = 'NGINX structure check';
  const out = [];
  const br = bracketTracker(loc, out, title);
  const n = text.length;
  let i = 0;
  let stmtStart = -1; // first character of the directive being read
  let stmtEnd = -1; // end of its last word
  let stmtName = '';
  const lineOfPos = (p) => loc.at(p).line + 1;
  const missingSemi = () => {
    out.push(diag(loc, stmtEnd, stmtEnd, 'error', title, 'The directive “' + stmtName + '” (line ' + lineOfPos(stmtStart) + ') does not end with ;', 'Every directive ends with ; and every block directive opens with {.', { s: stmtEnd, e: stmtEnd, text: ';', label: 'Insert ;', expect: '' }));
  };
  while (i < n) {
    const c = text[i];
    if (c === '#') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && text[k] !== c) k += text[k] === '\\' ? 2 : 1;
      if (k >= n) {
        out.push(diag(loc, i, i + 1, 'error', title, 'This quote on line ' + lineOfPos(i) + ' is never closed.'));
        return out;
      }
      if (stmtStart < 0) {
        stmtStart = i;
        stmtName = text.slice(i, k + 1);
      }
      i = k + 1;
      stmtEnd = i;
      continue;
    }
    if (c === ';') {
      stmtStart = -1;
      i++;
      continue;
    }
    if (c === '{') {
      br.open('{', i, stmtName ? stmtName + ' {' : '{');
      // *_by_lua_block { ... } holds Lua code: skip it whole.
      if (/_by_lua_block$/.test(stmtName)) {
        let depth = 1;
        let k = i + 1;
        while (k < n && depth) {
          if (text[k] === '{') depth++;
          else if (text[k] === '}') depth--;
          k++;
        }
        br.stack.pop();
        i = k;
        stmtStart = -1;
        continue;
      }
      stmtStart = -1;
      i++;
      continue;
    }
    if (c === '}') {
      if (stmtStart >= 0) {
        missingSemi();
        return out;
      }
      if (!br.close('}', i)) return out;
      i++;
      continue;
    }
    // a word
    let k = i;
    while (k < n && !/[\s;{}"'#]/.test(text[k])) {
      if (text[k] === '$' && text[k + 1] === '{') {
        const e = text.indexOf('}', k);
        k = e < 0 ? n : e + 1;
        continue;
      }
      k++;
    }
    if (k === i) k++;
    if (stmtStart < 0) {
      stmtStart = i;
      stmtName = text.slice(i, k);
    } else if (text.slice(stmtEnd, i).includes('\n') && /^[a-z_][a-z0-9_]*$/.test(text.slice(i, k)) && /^[a-z_][a-z0-9_]*$/.test(stmtName) && stmtName !== 'if') {
      // A new line that starts like a directive while the previous one never ended.
      const rest = text.slice(i, text.indexOf('\n', i) < 0 ? n : text.indexOf('\n', i));
      if (/[;{]\s*(?:#.*)?$/.test(rest)) {
        missingSemi();
        return out;
      }
    }
    i = k;
    stmtEnd = i;
  }
  if (stmtStart >= 0) {
    missingSemi();
    return out;
  }
  br.finish(n);
  return out;
}

/* ---------- HCL / Terraform: brackets, strings with ${ }, heredocs, comments ---------- */

function checkHcl(text, ctx) {
  const { loc } = ctx;
  const title = 'HCL structure check';
  const out = [];
  const br = bracketTracker(loc, out, title);
  const n = text.length;
  let i = 0;
  const lineOfPos = (p) => loc.at(p).line + 1;

  function skipString(p) {
    // p at "; template sequences ${ } and %{ } can hold nested strings
    let k = p + 1;
    while (k < n) {
      const c = text[k];
      if (c === '\\') {
        k += 2;
        continue;
      }
      if (c === '\n') return -1;
      if (c === '"') return k + 1;
      if ((c === '$' || c === '%') && text[k + 1] === '{' && text[k - 1] !== c) {
        let depth = 0;
        let m = k + 1;
        while (m < n) {
          if (text[m] === '"') {
            const e = skipString(m);
            if (e < 0) return -1;
            m = e;
            continue;
          }
          if (text[m] === '{') depth++;
          else if (text[m] === '}') {
            depth--;
            if (depth === 0) break;
          }
          m++;
        }
        if (m >= n) return -1;
        k = m + 1;
        continue;
      }
      k++;
    }
    return -1;
  }

  while (i < n) {
    const c = text[i];
    if (c === '#' || (c === '/' && text[i + 1] === '/')) {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      if (e < 0) {
        out.push(diag(loc, i, i + 2, 'error', title, 'This /* comment on line ' + lineOfPos(i) + ' is never closed with */.'));
        return out;
      }
      i = e + 2;
      continue;
    }
    if (c === '<' && text[i + 1] === '<') {
      const m = /^<<-?([A-Za-z_][\w]*)[ \t]*\r?\n/.exec(text.slice(i, i + 100));
      if (m) {
        const re = new RegExp('^[ \\t]*' + m[1] + '[ \\t]*\\r?$', 'm');
        const rest = text.slice(i + m[0].length);
        const e = re.exec(rest);
        if (!e) {
          out.push(diag(loc, i, i + m[0].trimEnd().length, 'error', title, 'This heredoc (<<' + m[1] + ') on line ' + lineOfPos(i) + ' never ends: no line with just “' + m[1] + '” follows.'));
          return out;
        }
        i = i + m[0].length + e.index + e[0].length;
        continue;
      }
    }
    if (c === '"') {
      const e = skipString(i);
      if (e < 0) {
        out.push(diag(loc, i, i + 1, 'error', title, 'This string on line ' + lineOfPos(i) + ' is not closed before the end of the line.'));
        return out;
      }
      i = e;
      continue;
    }
    if (OPENERS[c]) br.open(c, i);
    else if (CLOSERS[c]) {
      if (!br.close(c, i)) return out;
    }
    i++;
  }
  br.finish(n);
  return out;
}

/* ---------- Apache (.htaccess, httpd.conf): <Section> ... </Section> pairs and quotes ---------- */

function checkApache(text, ctx) {
  const { loc } = ctx;
  const title = 'Apache structure check';
  const out = [];
  const stack = [];
  for (let l = 0; l < loc.starts.length; l++) {
    const raw = lineTextAt(text, loc, l);
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    const s = loc.starts[l] + raw.indexOf(t);
    let m;
    if ((m = /^<\/([A-Za-z]+)\s*>$/.exec(t))) {
      const top = stack[stack.length - 1];
      if (!top || top.name.toLowerCase() !== m[1].toLowerCase()) {
        out.push(diag(loc, s, s + t.length, 'error', title, top ? '</' + m[1] + '> does not match the open <' + top.name + '> on line ' + (top.line + 1) + '.' : '</' + m[1] + '> has no matching <' + m[1] + '> before it.'));
        return out;
      }
      stack.pop();
      continue;
    }
    if ((m = /^<([A-Za-z]+)(\s[^>]*)?>$/.exec(t))) {
      stack.push({ name: m[1], line: l, s });
      continue;
    }
    if (/^</.test(t) && !/>$/.test(t)) {
      out.push(diag(loc, s, s + t.length, 'error', title, 'This section tag is missing its closing >.'));
      return out;
    }
    const quotes = (t.replace(/\\./g, '').match(/"/g) || []).length;
    if (quotes % 2 && !/\\$/.test(t)) out.push(diag(loc, s, s + t.length, 'warning', title, 'This line has an unpaired double quote.'));
  }
  for (const b of stack.slice(-1)) out.push(diag(loc, b.s, b.s + b.name.length + 1, 'error', title, 'The <' + b.name + '> on line ' + (b.line + 1) + ' is never closed with </' + b.name + '>.'));
  return out;
}

/* ---------- .env files ---------- */

const ENV_INVISIBLE = /[​-‏⁠﻿  ­]/g;

function checkEnv(text, ctx) {
  const { loc, eol } = ctx;
  const title = '.env check';
  const out = [];
  const seen = new Map();
  if (eol === 'crlf' && text.includes('\n')) {
    out.push(diag(loc, 0, Math.min(text.length, lineTextAt(text, loc, 0).length || 1), 'warning', title, 'This file has Windows (CRLF) line endings: on Linux (Docker, a NAS) the hidden \\r becomes part of every value.', 'Save it with LF line endings (Unix) before copying it to Linux.'));
  }
  for (let l = 0; l < loc.starts.length; l++) {
    const raw = lineTextAt(text, loc, l);
    const ls = loc.starts[l];
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    ENV_INVISIBLE.lastIndex = 0;
    let inv;
    while ((inv = ENV_INVISIBLE.exec(raw))) {
      const code = inv[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
      out.push(diag(loc, ls + inv.index, ls + inv.index + 1, 'warning', title, 'An invisible character (U+' + code + ') is in this line: it will be part of the name or value.', null, { s: ls + inv.index, e: ls + inv.index + 1, text: '', label: 'Remove it', expect: inv[0] }));
    }
    const m = /^(\s*)(export\s+)?([^=\s]*)(\s*)=(\s*)(.*)$/.exec(raw);
    if (!m) {
      out.push(diag(loc, ls, ls + raw.length, 'error', title, 'Each line must be NAME=value (or a # comment).'));
      continue;
    }
    const [, lead, exp, name, sp1, sp2, value] = m;
    const nameAt = ls + lead.length + (exp ? exp.length : 0);
    if (!name) {
      out.push(diag(loc, nameAt, nameAt + 1, 'error', title, 'The name before = is missing.'));
      continue;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) out.push(diag(loc, nameAt, nameAt + name.length, 'warning', title, '“' + name + '” is not a valid shell variable name (letters, digits and _, not starting with a digit).'));
    if (sp1 || sp2) out.push(diag(loc, nameAt + name.length, nameAt + name.length + sp1.length + 1 + sp2.length, 'warning', title, 'Spaces around = : many tools (and shells) then read a different name or value.', null, { s: nameAt + name.length, e: nameAt + name.length + sp1.length + 1 + sp2.length, text: '=', label: 'Remove the spaces', expect: sp1 + '=' + sp2 }));
    if (seen.has(name)) out.push(diag(loc, nameAt, nameAt + name.length, 'warning', title, '“' + name + '” is already set on line ' + (seen.get(name) + 1) + ': the later value wins.'));
    else seen.set(name, l);
    const valAt = ls + raw.length - value.length;
    const q = value[0];
    if (q === '"' || q === "'") {
      // Quoted: may span lines (double quotes); must be closed.
      let k = valAt + 1;
      let closed = -1;
      while (k < text.length) {
        if (text[k] === '\\' && q === '"') {
          k += 2;
          continue;
        }
        if (text[k] === q) {
          closed = k;
          break;
        }
        if (text[k] === '\n' && q === "'") break;
        k++;
      }
      if (closed < 0) {
        out.push(diag(loc, valAt, valAt + 1, 'error', title, 'The quote that starts this value is never closed.'));
        return out;
      }
      const after = text.slice(closed + 1, text.indexOf('\n', closed) < 0 ? text.length : text.indexOf('\n', closed));
      if (after.trim() && !/^\s+#/.test(after)) out.push(diag(loc, closed + 1, closed + 1 + after.length, 'warning', title, 'Text after the closing quote.'));
      const endLine = loc.at(closed).line;
      if (endLine > l) l = endLine;
      continue;
    }
    const tail = /[ \t]+$/.exec(value);
    if (tail && !/\s#/.test(value)) {
      const s = ls + raw.length - tail[0].length;
      out.push(diag(loc, s, ls + raw.length, 'warning', title, 'Spaces at the end of this value become part of it (an API key or password would then be wrong).', null, { s, e: ls + raw.length, text: '', label: 'Remove the trailing spaces', expect: tail[0] }));
    }
  }
  return out;
}

/* ---------- systemd units, INI, desktop entries ---------- */

const SYSTEMD_SECTIONS = new Set(['Unit', 'Install', 'Service', 'Socket', 'Timer', 'Mount', 'Automount', 'Swap', 'Path', 'Slice', 'Scope', 'Match', 'Link', 'NetDev', 'Network', 'Address', 'Route', 'DHCP', 'DHCPv4', 'DHCPv6', 'DHCPServer', 'IPv6AcceptRA', 'IPv6SendRA', 'IPv6Prefix', 'Bridge', 'BridgeVLAN', 'Bond', 'VLAN', 'MACVLAN', 'IPVLAN', 'VXLAN', 'Tunnel', 'WireGuard', 'WireGuardPeer', 'Peer', 'Tun', 'Tap', 'VRF', 'Container']);

function checkKeyFile(text, ctx, kind) {
  const { loc, name } = ctx;
  const title = { systemd: 'systemd unit check', desktop: 'Desktop entry check', ini: 'INI check' }[kind];
  const out = [];
  let section = null;
  let firstSection = true;
  let cont = false;
  const seenSections = new Map();
  const props = /\.properties$/.test(name);
  const gitcfg = /(^|[\\/])\.git(config|modules)$/.test(name) || name === '.gitconfig' || name === '.gitmodules';
  for (let l = 0; l < loc.starts.length; l++) {
    const raw = lineTextAt(text, loc, l).replace(/\r$/, '');
    const ls = loc.starts[l];
    const t = raw.trim();
    if (cont) {
      cont = /\\$/.test(raw);
      continue;
    }
    if (!t || t.startsWith('#') || t.startsWith(';') || (props && t.startsWith('!'))) continue;
    const off = ls + raw.indexOf(t);
    if (t.startsWith('[')) {
      const m = /^\[([^\]]*)\]\s*(?:[#;].*)?$/.exec(t);
      if (!m) {
        out.push(diag(loc, off, off + t.length, 'error', title, 'This section header is not closed with ].'));
        continue;
      }
      section = m[1].trim();
      if (kind === 'desktop' && firstSection && section !== 'Desktop Entry') out.push(diag(loc, off, off + t.length, 'error', title, 'The first group of a .desktop file must be [Desktop Entry].'));
      firstSection = false;
      if (kind === 'systemd' && !SYSTEMD_SECTIONS.has(section) && !/^X-/.test(section)) out.push(diag(loc, off, off + t.length, 'warning', title, '[' + section + '] is not a systemd section name (they are case-sensitive, e.g. [Unit], [Service], [Install]).'));
      if (kind !== 'ini' || !gitcfg) {
        if (seenSections.has(section) && kind !== 'systemd') out.push(diag(loc, off, off + t.length, 'warning', title, '[' + section + '] already appears on line ' + (seenSections.get(section) + 1) + '.'));
        else seenSections.set(section, l);
      }
      continue;
    }
    if (props) continue; // key value, key=value and key:value are all valid in .properties
    if (kind === 'ini') {
      if (!/[=:]/.test(t) && !gitcfg) out.push(diag(loc, off, off + t.length, 'warning', title, 'This line is not a [section], a key = value line or a comment.'));
      continue;
    }
    const m = /^([A-Za-z0-9_.@\-]+(?:\[[^\]]+\])?)\s*=/.exec(t);
    if (!m) {
      out.push(diag(loc, off, off + t.length, 'error', title, kind === 'systemd' ? 'Each line must be Key=Value, a [Section] or a comment.' : 'Each line must be Key=Value, a [Group] or a comment.'));
      continue;
    }
    if (!section) out.push(diag(loc, off, off + m[1].length, 'error', title, kind === 'systemd' ? 'Settings must come after a section such as [Unit] or [Service].' : 'Keys must come after the [Desktop Entry] group.'));
    cont = kind === 'systemd' && /\\$/.test(raw);
  }
  return out;
}

/* ---------- Dockerfile ---------- */

const DOCKER_INSTRUCTIONS = ['FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'];

function editDistance(a, b) {
  const d = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function closest(word, list, max = 2) {
  let best = null;
  let bestD = max + 1;
  let ties = 0;
  for (const w of list) {
    const dd = editDistance(word.toLowerCase(), w.toLowerCase());
    if (dd < bestD) {
      best = w;
      bestD = dd;
      ties = 0;
    } else if (dd === bestD) ties++;
  }
  return bestD <= max && !ties ? best : null;
}

function checkDockerfile(text, ctx) {
  const { loc } = ctx;
  const title = 'Dockerfile check';
  const out = [];
  let escape = '\\';
  let seenFrom = false;
  let directivesOver = false;
  for (let l = 0; l < loc.starts.length; l++) {
    const raw = lineTextAt(text, loc, l).replace(/\r$/, '');
    const ls = loc.starts[l];
    const t = raw.trim();
    if (!directivesOver) {
      const d = /^#\s*(escape|syntax|check)\s*=\s*(\S+)/i.exec(t);
      if (d) {
        if (d[1].toLowerCase() === 'escape') escape = d[2][0];
        continue;
      }
      if (t.startsWith('#') || !t) {
        if (!t.startsWith('#')) directivesOver = true;
        continue;
      }
      directivesOver = true;
    }
    if (!t || t.startsWith('#')) continue;
    const off = ls + raw.indexOf(t);
    const m = /^(\S+)(\s+([\s\S]*))?$/.exec(t);
    const word = m[1];
    const instr = word.toUpperCase();
    let args = (m[3] || '').trim();
    // Join continuation lines (ending with the escape character), skipping comment lines in between.
    let last = l;
    let lineText = t;
    while (lineText.endsWith(escape) && last + 1 < loc.starts.length) {
      last++;
      lineText = lineTextAt(text, loc, last).replace(/\r$/, '').trim();
      if (lineText.startsWith('#')) {
        lineText = escape;
        continue;
      }
      args += ' ' + lineText;
    }
    // BuildKit here-documents: RUN <<EOF ... EOF
    const hd = /<<-?(["']?)([A-Za-z_][\w]*)\1/.exec(args);
    if (hd && /^(RUN|COPY|ADD)$/.test(instr)) {
      let k = last + 1;
      while (k < loc.starts.length && lineTextAt(text, loc, k).replace(/\r$/, '').trim() !== hd[2]) k++;
      if (k >= loc.starts.length) out.push(diag(loc, off, off + t.length, 'error', title, 'The here-document <<' + hd[2] + ' never ends: no line with just “' + hd[2] + '” follows.'));
      last = k;
    }
    l = last;
    if (!DOCKER_INSTRUCTIONS.includes(instr)) {
      const guess = closest(instr, DOCKER_INSTRUCTIONS);
      out.push(diag(loc, off, off + word.length, 'error', title, '“' + word + '” is not a Dockerfile instruction.', guess ? 'Did you mean ' + guess + '?' : null, guess ? { s: off, e: off + word.length, text: guess, label: 'Change it to ' + guess, expect: word } : null));
      continue;
    }
    if (!seenFrom && instr !== 'ARG' && instr !== 'FROM') {
      out.push(diag(loc, off, off + word.length, 'error', title, 'A Dockerfile must start with FROM (only ARG may come before it).'));
      seenFrom = true;
    }
    if (instr === 'FROM') seenFrom = true;
    if (!args && instr !== 'HEALTHCHECK') out.push(diag(loc, off, off + word.length, 'error', title, instr + ' needs an argument.'));
    if (/^(CMD|ENTRYPOINT|RUN|SHELL|VOLUME|COPY|ADD)$/.test(instr) && args.startsWith('[')) {
      try {
        const v = JSON.parse(args);
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error('x');
      } catch (e) {
        const hint = /'/.test(args) ? 'The exec form is JSON: use double quotes, e.g. ["npm", "start"].' : 'The exec form is a JSON array of strings, e.g. ["npm", "start"].';
        out.push(diag(loc, off + word.length, off + t.length, 'warning', title, 'This is not a valid JSON array, so Docker will run it as a shell command instead.', hint));
      }
    }
    if (instr === 'MAINTAINER') out.push(diag(loc, off, off + word.length, 'info', title, 'MAINTAINER is deprecated: use LABEL maintainer="..." instead.'));
  }
  if (!seenFrom && text.trim()) out.push(diag(loc, 0, 1, 'error', title, 'There is no FROM instruction.'));
  return out;
}

/* ---------- Docker Compose: the file's structure (after the YAML itself is valid) ---------- */

const COMPOSE_TOP = ['version', 'name', 'services', 'networks', 'volumes', 'secrets', 'configs', 'include', 'models'];
const COMPOSE_SERVICE = ['annotations', 'attach', 'blkio_config', 'build', 'cap_add', 'cap_drop', 'cgroup', 'cgroup_parent', 'command', 'configs', 'container_name', 'cpu_count', 'cpu_percent', 'cpu_period', 'cpu_quota', 'cpu_rt_period', 'cpu_rt_runtime', 'cpu_shares', 'cpus', 'cpuset', 'credential_spec', 'depends_on', 'deploy', 'develop', 'device_cgroup_rules', 'devices', 'dns', 'dns_opt', 'dns_search', 'domainname', 'driver_opts', 'entrypoint', 'env_file', 'environment', 'expose', 'extends', 'external_links', 'extra_hosts', 'gpus', 'group_add', 'healthcheck', 'hostname', 'image', 'init', 'ipc', 'isolation', 'labels', 'label_file', 'links', 'logging', 'mac_address', 'mem_limit', 'mem_reservation', 'mem_swappiness', 'memswap_limit', 'models', 'network_mode', 'networks', 'oom_kill_disable', 'oom_score_adj', 'pid', 'pids_limit', 'platform', 'ports', 'post_start', 'pre_stop', 'privileged', 'profiles', 'provider', 'pull_policy', 'read_only', 'restart', 'runtime', 'scale', 'secrets', 'security_opt', 'shm_size', 'stdin_open', 'stop_grace_period', 'stop_signal', 'storage_opt', 'sysctls', 'tmpfs', 'tty', 'ulimits', 'use_api_socket', 'user', 'userns_mode', 'uts', 'volumes', 'volumes_from', 'working_dir'];

/** Finds the line of a key path (e.g. ['services', 'web', 'ports', 1]) in block-style YAML. */
function yamlPathRange(text, loc, path) {
  let from = 0;
  let to = loc.starts.length;
  let indent = -1;
  let found = null;
  for (const key of path) {
    let hit = null;
    if (typeof key === 'number') {
      let count = -1;
      for (let l = from; l < to; l++) {
        const raw = lineTextAt(text, loc, l);
        const m = /^(\s*)- ?/.exec(raw);
        if (!m || /^\s*#/.test(raw)) continue;
        if (m[1].length <= indent) break;
        if (count >= 0 && m[1].length !== found.ind) continue;
        count++;
        if (count === 0) found = { ind: m[1].length };
        if (count === key) {
          hit = { line: l, col: m[0].length, ind: m[1].length, len: raw.trim().length - (m[0].length - m[1].length) };
          break;
        }
      }
    } else {
      let childIndent = -1;
      for (let l = from; l < to; l++) {
        const raw = lineTextAt(text, loc, l);
        if (!raw.trim() || /^\s*#/.test(raw)) continue;
        const m = /^(\s*)(?:- )?(["']?)([^"':#]+?)\2\s*:(?:\s|$)/.exec(raw);
        const ind = /^\s*/.exec(raw)[0].length;
        if (ind <= indent && l > from) break;
        if (!m) continue;
        const kInd = m[1].length;
        if (childIndent < 0) childIndent = kInd;
        if (kInd !== childIndent) continue;
        if (m[3] === String(key)) {
          hit = { line: l, col: m[1].length + m[2].length, ind: kInd, len: m[3].length };
          break;
        }
      }
    }
    if (!hit) return found && found.line !== undefined ? found : null;
    found = hit;
    from = hit.line + 1;
    indent = hit.ind;
    to = loc.starts.length;
  }
  return found;
}

function checkComposeStructure(text, ctx, doc) {
  const { loc } = ctx;
  const title = 'Docker Compose structure';
  const out = [];
  const at = (path, sev, msg, hint, fix) => {
    const r = yamlPathRange(text, loc, path);
    const s = r && r.line !== undefined ? loc.starts[r.line] + r.col : 0;
    const e = r && r.line !== undefined ? s + Math.max(1, r.len) : 1;
    out.push(diag(loc, s, e, sev, title, msg, hint, fix));
  };
  const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const typeName = (v) => (v === null ? 'empty' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'a mapping' : typeof v === 'string' ? 'text' : typeof v);
  if (!isMap(doc)) {
    if (doc !== null && doc !== undefined) at([], 'error', 'A Compose file must be a mapping (keys such as services:), not ' + typeName(doc) + '.');
    return out;
  }
  for (const k of Object.keys(doc)) {
    if (k.startsWith('x-') || COMPOSE_TOP.includes(k)) continue;
    const g = closest(k, COMPOSE_TOP);
    const r = yamlPathRange(text, loc, [k]);
    const fix = g && r ? { s: loc.starts[r.line] + r.col, e: loc.starts[r.line] + r.col + k.length, text: g, label: 'Change it to ' + g, expect: k } : null;
    at([k], 'warning', '“' + k + '” is not a top-level Compose key.' + (g ? ' Did you mean “' + g + '”?' : ''), 'Top-level keys are services, networks, volumes, secrets, configs, include, name (and x-... for your own).', fix);
  }
  if (doc.version !== undefined) at(['version'], 'info', '“version” is obsolete: Docker Compose ignores it.');
  const services = doc.services;
  if (services === undefined) {
    if (!doc.include) at([], 'warning', 'There is no services: section.');
    return out;
  }
  if (!isMap(services)) {
    at(['services'], 'error', 'services must be a mapping of service names, not ' + typeName(services) + '.');
    return out;
  }
  const topNets = isMap(doc.networks) ? doc.networks : {};
  const topVols = isMap(doc.volumes) ? doc.volumes : {};
  const names = Object.keys(services);
  for (const name of names) {
    const svc = services[name];
    const p = ['services', name];
    if (!isMap(svc)) {
      at(p, 'error', 'The service “' + name + '” must be a mapping of settings (image:, ports: ...), not ' + typeName(svc) + '.');
      continue;
    }
    for (const k of Object.keys(svc)) {
      if (k.startsWith('x-') || COMPOSE_SERVICE.includes(k)) continue;
      const g = closest(k, COMPOSE_SERVICE);
      const r = yamlPathRange(text, loc, [...p, k]);
      const fix = g && r ? { s: loc.starts[r.line] + r.col, e: loc.starts[r.line] + r.col + k.length, text: g, label: 'Change it to ' + g, expect: k } : null;
      at([...p, k], 'warning', '“' + k + '” is not a Compose service setting.' + (g ? ' Did you mean “' + g + '”?' : ''), null, fix);
    }
    if (svc.image === undefined && svc.build === undefined && svc.extends === undefined && svc.provider === undefined) at(p, 'warning', 'The service “' + name + '” has neither image: nor build:, so there is nothing to run.');
    if (svc.restart !== undefined && !/^(no|always|unless-stopped|on-failure(:\d+)?)$/.test(String(svc.restart))) at([...p, 'restart'], 'error', 'restart must be no, always, on-failure[:max-retries] or unless-stopped.');
    if (svc.image !== undefined && typeof svc.image !== 'string') at([...p, 'image'], 'error', 'image must be text, e.g. nginx:1.27.');
    if (svc.ports !== undefined) {
      if (!Array.isArray(svc.ports)) at([...p, 'ports'], 'error', 'ports must be a list (each item on its own line starting with -).');
      else
        svc.ports.forEach((v, idx) => {
          if (typeof v === 'number') return;
          if (typeof v === 'string') {
            if (v.includes('${')) return;
            if (!/^(?:(?:\[[0-9a-fA-F:.]+\]|\d+\.\d+\.\d+\.\d+):)?(?:\d+(?:-\d+)?:)?\d+(?:-\d+)?(?:\/(?:tcp|udp|sctp))?$/.test(v)) at([...p, 'ports', idx], 'error', 'Port mapping “' + v + '” is not valid: use "HOST:CONTAINER" (e.g. "8080:80"), optionally with an IP and /tcp or /udp.');
            return;
          }
          if (isMap(v)) {
            if (v.target === undefined) at([...p, 'ports', idx], 'error', 'A long-form port needs target: (the container port).');
            return;
          }
          at([...p, 'ports', idx], 'error', 'Each port must be text such as "8080:80", a number, or a mapping with target:.');
        });
    }
    if (svc.environment !== undefined) {
      const env = svc.environment;
      if (Array.isArray(env)) {
        env.forEach((v, idx) => {
          if (typeof v !== 'string') at([...p, 'environment', idx], 'error', 'In the list form each environment item is text: NAME=value.');
        });
      } else if (isMap(env)) {
        for (const [k, v] of Object.entries(env)) if (v !== null && typeof v === 'object') at([...p, 'environment', k], 'error', 'The value of ' + k + ' must be text, a number or true/false, not ' + typeName(v) + '.');
      } else at([...p, 'environment'], 'error', 'environment must be a list (- NAME=value) or a mapping (NAME: value).');
    }
    const deps = svc.depends_on;
    if (deps !== undefined) {
      const list = Array.isArray(deps) ? deps : isMap(deps) ? Object.keys(deps) : null;
      if (!list) at([...p, 'depends_on'], 'error', 'depends_on must be a list of service names, or a mapping of service names to conditions.');
      else
        list.forEach((d, idx) => {
          if (!names.includes(d)) at(Array.isArray(deps) ? [...p, 'depends_on', idx] : [...p, 'depends_on', d], 'error', 'depends_on refers to “' + d + '”, which is not a service in this file.');
        });
    }
    const nets = svc.networks;
    if (nets !== undefined && svc.network_mode === undefined) {
      const list = Array.isArray(nets) ? nets : isMap(nets) ? Object.keys(nets) : null;
      if (!list) at([...p, 'networks'], 'error', 'networks must be a list of network names or a mapping.');
      else
        list.forEach((d, idx) => {
          if (d !== 'default' && !(d in topNets)) at(Array.isArray(nets) ? [...p, 'networks', idx] : [...p, 'networks', d], 'error', 'The network “' + d + '” is not defined under the top-level networks:.');
        });
    }
    if (svc.volumes !== undefined) {
      if (!Array.isArray(svc.volumes)) at([...p, 'volumes'], 'error', 'volumes must be a list.');
      else
        svc.volumes.forEach((v, idx) => {
          if (isMap(v)) {
            if (v.target === undefined) at([...p, 'volumes', idx], 'error', 'A long-form volume needs target: (the path in the container).');
            return;
          }
          if (typeof v !== 'string') return at([...p, 'volumes', idx], 'error', 'Each volume must be text such as "./data:/data" or a mapping.');
          if (v.includes('${')) return;
          const parts = v.replace(/^[A-Za-z]:\\/, 'X').split(':');
          const src = parts.length > 1 ? parts[0] : null;
          if (src && !/^[.~/\\]|^X/.test(src) && !src.includes('/') && !(src in topVols)) at([...p, 'volumes', idx], 'error', 'The named volume “' + src + '” is not defined under the top-level volumes:.', 'Add it under volumes: at the end of the file, or use a path such as ./' + src + ' for a folder.');
          if (parts.length > 3) at([...p, 'volumes', idx], 'warning', 'Volume “' + v + '” has too many : parts (source:target:mode).');
        });
    }
  }
  return out;
}
