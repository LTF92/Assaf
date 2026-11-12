import React, { Fragment, memo, useMemo } from 'react';
import { View } from 'react-native';
import { MarkedLexer, useMarkdown, type MarkedStyles } from 'react-native-marked';

import { detectDirection, groupByDirection, type Dir } from '../lib/direction';
import { isRTL } from '../lib/i18n';
import { colors, mono } from '../lib/theme';

// Text alignment is left to `auto`: it follows `writingDirection` (iOS) and the container's
// `direction` (Android), so the same styles right-align Arabic and left-align English.
const base: MarkedStyles = {
  text: { color: colors.text, fontSize: 16, lineHeight: 24 },
  paragraph: { marginVertical: 4, paddingVertical: 0 },
  strong: { fontWeight: '700', color: colors.text },
  link: { color: colors.accent, textDecorationLine: 'underline' },
  codespan: { fontFamily: mono, backgroundColor: colors.surface2, color: '#FFD58A', fontSize: 14 },
  code: { backgroundColor: colors.code, borderRadius: 10, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: colors.border, direction: 'ltr' },
  // code is always read left-to-right, whatever the surrounding language
  codeText: { fontFamily: mono, fontSize: 13, color: '#D7DCE8', lineHeight: 19, writingDirection: 'ltr', textAlign: 'left' },
  h1: { color: colors.text, fontSize: 22, fontWeight: '700', marginVertical: 6 },
  h2: { color: colors.text, fontSize: 19, fontWeight: '700', marginVertical: 6 },
  h3: { color: colors.text, fontSize: 17, fontWeight: '700', marginVertical: 4 },
  li: { color: colors.text, fontSize: 16, lineHeight: 24 },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: 10 },
  table: { borderColor: colors.border },
  tableCell: { borderColor: colors.border, padding: 6 },
};

const TEXT_KEYS = ['text', 'strong', 'em', 'link', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'strikethrough'] as const;

function stylesFor(dir: Dir): MarkedStyles {
  const out: MarkedStyles = { ...base };
  for (const k of TEXT_KEYS) out[k] = { ...(base[k] as object), writingDirection: dir };
  // The library's default quote bar is a physical left border; put the gold bar on the reading side instead.
  out.blockquote =
    dir === 'rtl'
      ? { backgroundColor: 'transparent', borderLeftWidth: 0, paddingLeft: 0, borderRightWidth: 3, borderRightColor: colors.accent, paddingRight: 10 }
      : { backgroundColor: 'transparent', borderRightWidth: 0, paddingRight: 0, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 10 };
  return out;
}

const STYLES: Record<Dir, MarkedStyles> = { rtl: stylesFor('rtl'), ltr: stylesFor('ltr') };
const THEME = { colors: { code: colors.code, link: colors.accent, text: colors.text, border: colors.border } };

function Block({ text, dir }: { text: string; dir: Dir }) {
  const elements = useMarkdown(text, { colorScheme: 'dark', styles: STYLES[dir], theme: THEME });
  return (
    <View style={{ direction: dir }}>
      {elements.map((el, i) => (
        <Fragment key={i}>{el}</Fragment>
      ))}
    </View>
  );
}

function MarkdownImpl({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const src = text || '';
    const fallback = detectDirection(src) ?? (isRTL ? 'rtl' : 'ltr');
    try {
      return groupByDirection(MarkedLexer(src), fallback);
    } catch {
      return [{ dir: fallback, raw: src }];
    }
  }, [text]);
  return (
    <View>
      {blocks.map((b, i) => (
        <Block key={`${i}-${b.dir}`} text={b.raw} dir={b.dir} />
      ))}
    </View>
  );
}

export const Markdown = memo(MarkdownImpl);
