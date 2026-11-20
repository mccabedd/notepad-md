/* Colours big files off the main thread, so the window never freezes while a multi-megabyte log is
 * coloured. Replies with html = null for a language it doesn't know (the page then colours it itself). */
importScripts('vendor/highlight/highlight.min.js', 'vendor/highlight/powershell.min.js', 'vendor/highlight/dos.min.js', 'log-grammar.js', 'config-grammars.js');
registerLogLanguage();
registerConfigLanguages();

self.onmessage = (e) => {
  const { id, text, lang } = e.data;
  let html = null;
  try {
    if (hljs.getLanguage(lang)) html = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
  } catch (err) {
    html = null;
  }
  self.postMessage({ id, html });
};
