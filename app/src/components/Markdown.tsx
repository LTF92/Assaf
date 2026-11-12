import React, { Fragment, memo, useMemo } from 'react';
import { View } from 'react-native';
import { MarkedLexer, useMarkdown, type MarkedStyles } from 'react-native-marked';

import { detectDirection, groupByDirection, type Dir } from '../lib/direction';
import { isRTL } from '../lib/i18n';
import { current as settingsNow } from '../lib/settings';
import { colors, mono, useTheme, type Colors } from '../lib/theme';

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
  // The library's default quote bar is a physical left border; put the gold bar on the reading side instead.
  out.blockquote =
    dir === 'rtl'
      ? { backgroundColor: 'transparent', borderLeftWidth: 0, paddingLeft: 0, borderRightWidth: 3, borderRightColor: colors.accent, paddingRight: 10 }
      : { backgroundColor: 'transparent', borderRightWidth: 0, paddingRight: 0, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 10 };
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

function MarkdownImpl({ text }: { text: string }) {
  const { key, fs } = useTheme();
  const blocks = useMemo(() => {
    const src = text || '';
    // A fixed direction from the settings applies to the whole answer; "auto" goes paragraph by paragraph.
    const forced = settingsNow.textDirection !== 'auto' ? settingsNow.textDirection : null;
    const fallback = forced ?? detectDirection(src) ?? (isRTL ? 'rtl' : 'ltr');
    if (forced) return [{ dir: forced, raw: src }];
    try {
      return groupByDirection(MarkedLexer(src), fallback);
    } catch {
      return [{ dir: fallback, raw: src }];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, key]);
  return (
    <View>
      {blocks.map((b, i) => (
        <Block key={`${i}-${b.dir}`} text={b.raw} dir={b.dir} themeKey={key} fs={fs} />
      ))}
    </View>
  );
}

export const Markdown = memo(MarkdownImpl);
