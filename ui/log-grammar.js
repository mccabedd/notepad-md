/* Log file colouring (log.txt, or View > Language > Log File) for highlight.js. Loaded by the page and by
 * highlight-worker.js (which colours big files off the main thread), so it only uses the global hljs. */

function registerLogLanguage() {
  if (typeof hljs === "undefined" || hljs.getLanguage("logfile")) return;
  hljs.registerLanguage('logfile', () => {
    const level = (cls, words) => ({ className: cls, begin: '\\b(?:' + words + ')\\b', relevance: 0 });
    const ERROR = level('logerror', 'error|errors|err|fatal|critical|crit|severe|alert|emerg|panic|failed|failure|fail|exception|[\\w.$]*(?:exception|error)');
    const WARN = level('logwarn', 'warning|warn|wrn|caution|timeout|timed out|retrying|retry');
    const INFO = level('loginfo', 'info|inf|information|notice');
    const DEBUG = level('logdebug', 'debug|dbg|trace|trc|verbose|vrb|fine|finer|finest');
    const OK = level('logok', 'ok|success|successful|successfully|succeeded|passed|completed|done|started|connected');
    const TIME = {
      className: 'logtime',
      relevance: 0,
      variants: [
        { begin: '\\b\\d{4}-\\d{2}-\\d{2}(?:[ T]\\d{2}:\\d{2}(?::\\d{2}(?:[.,]\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?\\b' },
        { begin: '\\b\\d{4}\\d{2}\\d{2}T\\d{6}(?:[.,]\\d+)?\\b' },
        { begin: '\\b\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4}(?: \\d{1,2}:\\d{2}(?::\\d{2}(?:[.,]\\d+)?)?(?: ?[AP]M)?)?\\b' },
        { begin: '\\b\\d{1,2}:\\d{2}:\\d{2}(?:[.,]\\d+)?\\b' },
      ],
    };
    const GUID = { className: 'number', begin: '\\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\b', relevance: 0 };
    // numbers, also with a unit stuck on (512MB, 30s, 250ms, 99%)
    const NUMBER = { className: 'number', begin: '\\b(?:0x[0-9a-f]+|\\d+(?:\\.\\d+)*(?:[kmgt]?b|ms|s|%)?)(?![\\w.])', relevance: 0 };
    const STRING = { className: 'string', variants: [{ begin: '"', end: '"', illegal: '\\n' }, { begin: "'(?=[^'\\n]{1,200}')", end: "'", illegal: '\\n' }], relevance: 0 };
    // key=value or key:value (no space after the colon, so "space low: free" stays plain text)
    const KEY = { className: 'attr', begin: '\\b[A-Za-z_][\\w.-]*(?=(?:\\s?=\\s?|:)[^\\s/])', relevance: 0 };
    const PATH = { className: 'logpath', begin: '\\b[a-z]:\\\\[^\\s"\'<>|]*', relevance: 0 };
    const BRACKET = { className: 'meta', begin: '\\[', end: '\\]', illegal: '\\n', contains: [ERROR, WARN, INFO, DEBUG, OK, TIME, NUMBER], relevance: 0 };
    const STACK = { className: 'comment', begin: '^\\s+at\\s', end: '$', relevance: 0 };
    return {
      name: 'Log file',
      case_insensitive: true,
      contains: [STACK, TIME, GUID, BRACKET, STRING, PATH, ERROR, WARN, INFO, DEBUG, OK, KEY, NUMBER],
    };
  });
}

