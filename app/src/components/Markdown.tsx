import React, { Fragment, memo, useMemo } from 'react';
import { View } from 'react-native';
import { MarkedLexer, useMarkdown, type MarkedStyles } from 'react-native-marked';

import { isHamzaLang, parseBlocks, type HamzaBlock } from '../lib/blocks';
import { detectDirection, groupByDirection, type Dir } from '../lib/direction';
import { isRTL } from '../lib/i18n';
import { current as settingsNow } from '../lib/settings';
import { colors, mono, useTheme, type Colors } from '../lib/theme';
import { CodeBlock } from './blocks/Code';
import { HamzaList } from './blocks/Hamza';
import { Table, type TableData } from './blocks/Table';

// Text alignment is left to `auto`: it follows `writingDirection` (iOS) and the container's
// `direction` (Android), so the same styles right-align Arabic and left-align English.
function baseStyles(colors: Colors, fs: (n: number) => number): MarkedStyles {
  return {
    text: { color: colors.text, fontSize: fs(16), lineHeight: fs(24) },
    paragraph: { marginVertical: 4, paddingVertical: 0 },
    strong: { fontWeight: '700', color: colors.text },
    link: { color: colors.accent, textDecorationLine: 'underline' },
    codespan: { fontFamily: mono, backgroundColor: colors.surface2, color: colors.codeInline, fontSize: fs(14) },
    code: { backgroundColor: colors.code, borderRadius: 10, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: colors.border, direction: 'ltr' },
    // code is always read left-to-right, whatever the surrounding language
    codeText: { fontFamily: mono, fontSize: fs(13), color: colors.codeText, lineHeight: fs(19), writingDirection: 'ltr', textAlign: 'left' },
    h1: { color: colors.text, fontSize: fs(22), fontWeight: '700', marginVertical: 6 },
    h2: { color: colors.text, fontSize: fs(19), fontWeight: '700', marginVertical: 6 },
    h3: { color: colors.text, fontSize: fs(17), fontWeight: '700', marginVertical: 4 },
    li: { color: colors.text, fontSize: fs(16), lineHeight: fs(24) },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 10 },
    table: { borderColor: colors.border },
    tableCell: { borderColor: colors.border, padding: 6 },
  };
}

const TEXT_KEYS = ['text', 'strong', 'em', 'link', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'strikethrough'] as const;

function stylesFor(dir: Dir, colors: Colors, fs: (n: number) => number): MarkedStyles {
  const base = baseStyles(colors, fs);
  const out: MarkedStyles = { ...base };
  for (const k of TEXT_KEYS) out[k] = { ...(base[k] as object), writingDirection: dir };
  // Quotes as in the design: a soft surface card, dimmer text, no side bar.
  out.blockquote = {
    backgroundColor: colors.surface2, borderLeftWidth: 0, borderRightWidth: 0, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14, marginVertical: 6,
  };
  return out;
}

// Styles are rebuilt only when the theme or text size changes.
let cacheKey = '';
let cache: { styles: Record<Dir, MarkedStyles>; theme: object; scheme: 'dark' | 'light' } | null = null;
function stylesForTheme(key: string, fs: (n: number) => number) {
  if (cacheKey !== key || !cache) {
    cacheKey = key;
    cache = {
      styles: { rtl: stylesFor('rtl', colors, fs), ltr: stylesFor('ltr', colors, fs) },
      theme: { colors: { code: colors.code, link: colors.accent, text: colors.text, border: colors.border } },
      scheme: colors.statusBar === 'dark' ? 'light' : 'dark',
    };
  }
  return cache;
}

function Block({ text, dir, themeKey, fs }: { text: string; dir: Dir; themeKey: string; fs: (n: number) => number }) {
  const t = stylesForTheme(themeKey, fs);
  const elements = useMarkdown(text, { colorScheme: t.scheme, styles: t.styles[dir], theme: t.theme as never });
  return (
    <View style={{ direction: dir }}>
      {elements.map((el, i) => (
        <Fragment key={i}>{el}</Fragment>
      ))}
    </View>
  );
}

type Segment =
  | { kind: 'md'; dir: Dir; raw: string }
  | { kind: 'table'; data: TableData }
  | { kind: 'code'; code: string; lang?: string }
  | { kind: 'hamza'; blocks: HamzaBlock[] }
  | { kind: 'pending' };

interface Tok {
  type: string;
  raw: string;
  text?: string;
  lang?: string;
  header?: { text: string }[];
  rows?: { text: string }[][];
  align?: (string | null)[];
}

/** Tables, code and hamza blocks become native components; everything else stays markdown. */
function segment(src: string, fallback: Dir, forced: Dir | null): Segment[] {
  const toks = MarkedLexer(src) as unknown as Tok[];
  const out: Segment[] = [];
  let buf: Tok[] = [];
  const flush = () => {
    if (!buf.length) return;
    if (buf.every((b) => b.type === 'space')) { buf = []; return; }
    if (forced) out.push({ kind: 'md', dir: forced, raw: buf.map((b) => b.raw).join('') });
    else for (const g of groupByDirection(buf, fallback)) out.push({ kind: 'md', ...g });
    buf = [];
  };
  for (const tok of toks) {
    if (tok.type === 'table' && tok.header && tok.rows) {
      flush();
      out.push({ kind: 'table', data: { header: tok.header.map((h) => h.text), rows: tok.rows.map((r) => r.map((c) => c.text)), align: tok.align } });
    } else if (tok.type === 'code') {
      flush();
      if (isHamzaLang(tok.lang)) {
        const blocks = parseBlocks(tok.text || '');
        if (blocks) out.push({ kind: 'hamza', blocks });
        else if (/```\s*$/.test(tok.raw)) out.push({ kind: 'code', code: tok.text || '', lang: 'json' });
        else out.push({ kind: 'pending' }); // still streaming in
      } else out.push({ kind: 'code', code: tok.text || '', lang: tok.lang });
    } else buf.push(tok);
  }
  flush();
  return out;
}

function MarkdownImpl({ text }: { text: string }) {
  const { key, fs } = useTheme();
  const segs = useMemo<Segment[]>(() => {
    const src = text || '';
    // A fixed direction from the settings applies to the whole answer; "auto" goes paragraph by paragraph.
    const forced = settingsNow.textDirection !== 'auto' ? settingsNow.textDirection : null;
    const fallback = forced ?? detectDirection(src) ?? (isRTL ? 'rtl' : 'ltr');
    try {
      return segment(src, fallback, forced);
    } catch {
      return [{ kind: 'md', dir: fallback, raw: src }];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, key]);
  return (
    <View>
      {segs.map((g, i) => {
        switch (g.kind) {
          case 'md':
            return <Block key={`${i}-md-${g.dir}`} text={g.raw} dir={g.dir} themeKey={key} fs={fs} />;
          case 'table':
            return <Table key={`${i}-t`} data={g.data} />;
          case 'code':
            return <CodeBlock key={`${i}-c`} code={g.code} lang={g.lang} />;
          case 'hamza':
            return <HamzaList key={`${i}-h`} blocks={g.blocks} />;
          default:
            return <View key={`${i}-p`} style={{ height: 64, borderRadius: 14, backgroundColor: colors.surface2, marginVertical: 6, opacity: 0.6 }} />;
        }
      })}
    </View>
  );
}

export const Markdown = memo(MarkdownImpl);
