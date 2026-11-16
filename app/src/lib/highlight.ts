/** A small, dependency-free code highlighter: keywords, strings, comments, numbers. Good enough for chat. */

export type Span = { text: string; kind: 'plain' | 'kw' | 'str' | 'com' | 'num' | 'fn' };

const KEYWORDS = new Set((
  'def class return if elif else for while in not and or is import from as with try except finally raise ' +
  'lambda yield pass break continue None True False self async await ' +
  'function const let var new this typeof instanceof export default extends interface type enum implements ' +
  'public private protected static readonly null undefined true false void switch case throw catch ' +
  'fn pub mut impl struct match use mod crate func package go defer chan select range map ' +
  'echo then fi do done esac local sudo SELECT FROM WHERE INSERT INTO UPDATE DELETE JOIN ON GROUP BY ORDER LIMIT AND OR AS'
).split(' '));

const HASH_COMMENT = new Set(['python', 'py', 'bash', 'sh', 'shell', 'zsh', 'ruby', 'rb', 'yaml', 'yml', 'toml', 'r', 'perl', 'dockerfile', 'make', 'conf', 'ini']);

export function highlight(code: string, lang = ''): Span[][] {
  const hash = HASH_COMMENT.has(lang.toLowerCase());
  const slash = !hash || lang === '';
  const re = new RegExp(
    [
      slash ? '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)' : '(\\0\\0)', // 1 comment (C-like)
      hash || lang === '' ? '((?:^|\\s)#[^\\n]*)' : '(\\0\\0)', // 2 comment (#)
      '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)', // 3 string
      '(\\b\\d+(?:\\.\\d+)?\\b)', // 4 number
      '([A-Za-z_$][\\w$]*)(?=\\s*\\()', // 5 call
      '([A-Za-z_$][\\w$]*)', // 6 word
    ].join('|'),
    'g',
  );
  const spans: Span[] = [];
  let last = 0;
  for (const m of code.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) spans.push({ text: code.slice(last, i), kind: 'plain' });
    const [all, c1, c2, s, n, call, word] = m;
    if (c1 || c2) spans.push({ text: all, kind: 'com' });
    else if (s) spans.push({ text: all, kind: 'str' });
    else if (n) spans.push({ text: all, kind: 'num' });
    else if (call) spans.push({ text: all, kind: KEYWORDS.has(call) ? 'kw' : 'fn' });
    else if (word) spans.push({ text: all, kind: KEYWORDS.has(word) ? 'kw' : 'plain' });
    else spans.push({ text: all, kind: 'plain' });
    last = i + all.length;
  }
  if (last < code.length) spans.push({ text: code.slice(last), kind: 'plain' });
  // split into lines so long code scrolls sideways line by line
  const lines: Span[][] = [[]];
  for (const sp of spans) {
    const parts = sp.text.split('\n');
    parts.forEach((p, j) => {
      if (j > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, kind: sp.kind });
    });
  }
  return lines;
}

export const CODE_COLORS: Record<Span['kind'], string> = {
  plain: '#FFFFFF', kw: '#B88CFF', str: '#6FE7AC', com: '#C9BEEA', num: '#FFC66B', fn: '#FFFFFF',
};
