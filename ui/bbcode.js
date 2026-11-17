/* BBCode support: a highlight.js grammar (editor colours) and a renderer for the read-only preview.
 * The renderer escapes all text first and only ever emits a fixed set of tags, so a document can
 * never inject its own HTML or script. Links are limited to http(s)/mailto. */

if (window.hljs) {
  hljs.registerLanguage('bbcode', () => ({
    name: 'BBCode',
    case_insensitive: true,
    contains: [
      {
        // [code]...[/code]: contents shown as code, not parsed for tags
        className: 'code',
        begin: /\[code(?:=[^\]\n]*)?\]/,
        end: /\[\/code\]/,
        returnBegin: false,
      },
      {
        className: 'tag',
        begin: /\[\/?(?=(?:[a-z][a-z0-9]*|\*)(?:=[^\]\n]*)?\])/,
        end: /\]/,
        contains: [
          { className: 'name', begin: /[a-z][a-z0-9]*|\*/, relevance: 0 },
          { className: 'string', begin: /=/, end: /(?=\])/, excludeBegin: true, relevance: 0 },
        ],
      },
    ],
  }));
}

const BBCODE_SAFE_URL = /^(https?:\/\/|mailto:)[^\s"'<>]+$/i;
const BBCODE_SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;

function bbUnescapeAttr(s) {
  return s.trim().replace(/^["']|["']$/g, '');
}

function bbSize(v) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return null;
  // Classic forum sizes 1-7 map to font scale; larger numbers are treated as percent (vBulletin/phpBB style) or px.
  if (n >= 1 && n <= 7) return ['0.63em', '0.82em', '1em', '1.13em', '1.5em', '2em', '3em'][n - 1];
  if (/%$/.test(v.trim()) || n > 30) return Math.min(Math.max(n, 50), 300) + '%';
  return Math.min(Math.max(n, 8), 48) + 'px';
}

/** Converts BBCode to safe HTML. Unknown tags are left as literal text. */
function renderBBCode(src) {
  let h = src.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Protect [code] blocks from further parsing.
  const codes = [];
  h = h.replace(/\[code(?:=[^\]\n]*)?\]\n?([\s\S]*?)\[\/code\]/gi, (_, c) => {
    codes.push(c);
    return '\u0000' + (codes.length - 1) + '\u0000';
  });

  const simple = {
    b: ['<strong>', '</strong>'],
    i: ['<em>', '</em>'],
    u: ['<u>', '</u>'],
    s: ['<s>', '</s>'],
    strike: ['<s>', '</s>'],
    sub: ['<sub>', '</sub>'],
    sup: ['<sup>', '</sup>'],
    center: ['<div style="text-align:center">', '</div>'],
    left: ['<div style="text-align:left">', '</div>'],
    right: ['<div style="text-align:right">', '</div>'],
    justify: ['<div style="text-align:justify">', '</div>'],
    h1: ['<h1>', '</h1>'],
    h2: ['<h2>', '</h2>'],
    h3: ['<h3>', '</h3>'],
    table: ['<table>', '</table>'],
    tr: ['<tr>', '</tr>'],
    td: ['<td>', '</td>'],
    th: ['<th>', '</th>'],
    indent: ['<div style="margin-left:2em">', '</div>'],
  };

  // Repeat so nested tags of the same kind are handled from the inside out.
  for (let pass = 0; pass < 12; pass++) {
    const before = h;
    for (const [tag, [open, close]] of Object.entries(simple)) {
      h = h.replace(new RegExp('\\[' + tag + '\\]((?:(?!\\[' + tag + '\\])[\\s\\S])*?)\\[\\/' + tag + '\\]', 'gi'), open + '$1' + close);
    }
    h = h.replace(/\[url\]((?:(?!\[url)[\s\S])*?)\[\/url\]/gi, (m, u) =>
      BBCODE_SAFE_URL.test(u.trim()) ? '<a href="' + u.trim() + '">' + u.trim() + '</a>' : m
    );
    h = h.replace(/\[url=([^\]\n]+)\]((?:(?!\[url)[\s\S])*?)\[\/url\]/gi, (m, u, t) => {
      u = bbUnescapeAttr(u.replace(/&quot;/g, '"'));
      return BBCODE_SAFE_URL.test(u) ? '<a href="' + u + '">' + t + '</a>' : m;
    });
    h = h.replace(/\[email\]([^\[\s]+@[^\[\s]+)\[\/email\]/gi, '<a href="mailto:$1">$1</a>');
    h = h.replace(/\[img(?:=[^\]\n]*)?\]([^\[\s]+)\[\/img\]/gi, (m, u) =>
      /^https?:\/\//i.test(u) ? '<img src="' + u + '" alt="">' : m
    );
    h = h.replace(/\[color=([^\]\n]+)\]((?:(?!\[color)[\s\S])*?)\[\/color\]/gi, (m, c, t) => {
      c = bbUnescapeAttr(c.replace(/&quot;/g, '"'));
      return BBCODE_SAFE_COLOR.test(c) ? '<span style="color:' + c + '">' + t + '</span>' : m;
    });
    h = h.replace(/\[size=([^\]\n]+)\]((?:(?!\[size)[\s\S])*?)\[\/size\]/gi, (m, v, t) => {
      const size = bbSize(bbUnescapeAttr(v.replace(/&quot;/g, '"')));
      return size ? '<span style="font-size:' + size + '">' + t + '</span>' : m;
    });
    h = h.replace(/\[font=([^\]\n]+)\]((?:(?!\[font)[\s\S])*?)\[\/font\]/gi, (m, f, t) => {
      f = bbUnescapeAttr(f.replace(/&quot;/g, '"'));
      return /^[\w \-]{1,40}$/.test(f) ? '<span style="font-family:\'' + f + '\'">' + t + '</span>' : m;
    });
    h = h.replace(/\[quote(?:=([^\]\n]+))?\]((?:(?!\[quote)[\s\S])*?)\[\/quote\]/gi, (_, who, t) =>
      '<blockquote>' + (who ? '<div class="bb-cite">' + bbUnescapeAttr(who.replace(/&quot;/g, '"')) + ' wrote:</div>' : '') + t + '</blockquote>'
    );
    h = h.replace(/\[spoiler(?:=([^\]\n]+))?\]((?:(?!\[spoiler)[\s\S])*?)\[\/spoiler\]/gi, (_, title, t) =>
      '<details><summary>' + (title ? bbUnescapeAttr(title.replace(/&quot;/g, '"')) : 'Spoiler') + '</summary>' + t + '</details>'
    );
    h = h.replace(/\[list(?:=([1aAiI]))?\]((?:(?!\[list)[\s\S])*?)\[\/list\]/gi, (_, type, body) => {
      const items = body.split(/\[\*\]/).slice(1).map((it) => '<li>' + it.replace(/^\s+|\s+$/g, '') + '</li>').join('');
      return type ? '<ol type="' + type + '">' + items + '</ol>' : '<ul>' + items + '</ul>';
    });
    if (h === before) break;
  }
  h = h.replace(/\[hr\]/gi, '<hr>');

  // Line breaks: drop the newline right after/before block-level tags, turn the rest into <br>.
  h = h.replace(/\n?(<\/?(?:div|blockquote|ul|ol|li|table|tr|td|th|h[1-3]|details|summary|hr)[^>]*>)\n?/g, '$1');
  h = h.replace(/\n/g, '<br>');

  h = h.replace(/\u0000(\d+)\u0000/g, (_, i) => '<pre><code>' + codes[Number(i)] + '</code></pre>');
  return h;
}
