/**
 * Text direction detection for mixed Arabic / English content.
 *
 * Agent replies often mix scripts ("شغّل `npm install` ثم افتح Expo"), so the
 * direction is decided per block from the letters that are actually prose:
 * code, URLs and link targets are ignored because they are always LTR.
 */

export type Dir = 'rtl' | 'ltr';

// Arabic, Syriac, Thaana, NKo, Hebrew + Arabic presentation forms.
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/g;
const LTR_CHAR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g;
const FIRST_STRONG = /[֐-ࣿיִ-﷿ﹰ-﻿A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

// Share of RTL letters at which a block reads as RTL even if it starts with an English word.
const RTL_RATIO = 0.3;

function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, ' ') // fenced code (also an unfinished fence while streaming)
    .replace(/`[^`\n]*`/g, ' ') // inline code
    .replace(/\]\([^)]*\)/g, ']') // markdown link targets
    .replace(/\bhttps?:\/\/\S+/g, ' ') // bare URLs
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, ' '); // emails
}

/** Direction of a piece of text, or null when it has no letters (numbers, emoji, code only). */
export function detectDirection(text: string): Dir | null {
  const p = prose(text || '');
  const rtl = p.match(RTL_CHAR)?.length ?? 0;
  const ltr = p.match(LTR_CHAR)?.length ?? 0;
  if (rtl === 0 && ltr === 0) return null;
  if (rtl === 0) return 'ltr';
  if (ltr === 0) return 'rtl';
  const first = p.match(FIRST_STRONG)?.[0] ?? '';
  const startsRtl = /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(first);
  return startsRtl || rtl / (rtl + ltr) >= RTL_RATIO ? 'rtl' : 'ltr';
}

export interface DirBlock {
  dir: Dir;
  raw: string;
}

interface TokenLike {
  type: string;
  raw: string;
}

// Tokens that carry no prose of their own: they stay with the surrounding block.
const NEUTRAL = new Set(['space', 'code', 'hr', 'html']);

/**
 * Groups top-level markdown tokens into consecutive runs with the same direction, so
 * an English paragraph inside an Arabic answer is shown LTR and the rest stays RTL.
 * Lists and tables are single tokens, so they keep their numbering and layout.
 */
export function groupByDirection(tokens: TokenLike[], fallback: Dir): DirBlock[] {
  const blocks: DirBlock[] = [];
  let pending = ''; // neutral tokens seen before the first directional one
  for (const tok of tokens) {
    const dir = NEUTRAL.has(tok.type) ? null : detectDirection(tok.raw);
    const last = blocks[blocks.length - 1];
    if (dir === null) {
      if (last) last.raw += tok.raw;
      else pending += tok.raw;
    } else if (last && last.dir === dir) {
      last.raw += tok.raw;
    } else {
      blocks.push({ dir, raw: pending + tok.raw });
      pending = '';
    }
  }
  if (pending) blocks.push({ dir: fallback, raw: pending });
  return blocks;
}
