/* Spellcheck worker: loads a Hunspell dictionary with typo.js off the UI thread.
 *
 * Messages in:
 *   { type: 'load', lang }                    lang is 'en_GB' or 'en_US'
 *   { type: 'check', id, lang, words: [...] }
 *   { type: 'suggest', id, lang, word }
 * Messages out:
 *   { type: 'ready', lang } | { type: 'error', lang, message }
 *   { type: 'checked', id, lang, results: { word: true|false } }
 *   { type: 'suggestions', id, lang, word, list: [...] }
 */
importScripts('vendor/typo.js');

const dictionaries = {}; // lang -> Promise<Typo>

function load(lang) {
  if (!dictionaries[lang]) {
    dictionaries[lang] = Promise.all([
      fetch('vendor/dict/' + lang + '.aff').then((r) => r.text()),
      fetch('vendor/dict/' + lang + '.dic').then((r) => r.text()),
    ]).then(([aff, dic]) => new Typo(lang, aff, dic));
  }
  return dictionaries[lang];
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    const dict = await load(msg.lang);
    if (msg.type === 'load') {
      self.postMessage({ type: 'ready', lang: msg.lang });
    } else if (msg.type === 'check') {
      const results = {};
      for (const w of msg.words) results[w] = dict.check(w);
      self.postMessage({ type: 'checked', id: msg.id, lang: msg.lang, results });
    } else if (msg.type === 'suggest') {
      const list = dict.suggest(msg.word, 6);
      self.postMessage({ type: 'suggestions', id: msg.id, lang: msg.lang, word: msg.word, list });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, lang: msg.lang, message: String(err) });
  }
};
