import React, { Fragment, memo } from 'react';
import { View } from 'react-native';
import { useMarkdown, type MarkedStyles } from 'react-native-marked';

import { colors, mono } from '../lib/theme';

const styles: MarkedStyles = {
  text: { color: colors.text, fontSize: 16, lineHeight: 24, writingDirection: 'auto' },
  paragraph: { marginVertical: 4, paddingVertical: 0 },
  strong: { fontWeight: '700', color: colors.text },
  link: { color: colors.accent, textDecorationLine: 'underline' },
  codespan: { fontFamily: mono, backgroundColor: colors.surface2, color: '#FFD58A', fontSize: 14 },
  code: { backgroundColor: colors.code, borderRadius: 10, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: colors.border },
  codeText: { fontFamily: mono, fontSize: 13, color: '#D7DCE8', lineHeight: 19 },
  blockquote: { borderLeftColor: colors.accent, borderLeftWidth: 3, paddingLeft: 10, backgroundColor: 'transparent' },
  h1: { color: colors.text, fontSize: 22, fontWeight: '700', marginVertical: 6 },
  h2: { color: colors.text, fontSize: 19, fontWeight: '700', marginVertical: 6 },
  h3: { color: colors.text, fontSize: 17, fontWeight: '700', marginVertical: 4 },
  li: { color: colors.text, fontSize: 16, lineHeight: 24 },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: 10 },
  table: { borderColor: colors.border },
  tableCell: { borderColor: colors.border, padding: 6 },
};

function MarkdownImpl({ text }: { text: string }) {
  const elements = useMarkdown(text || '', {
    colorScheme: 'dark',
    styles,
    theme: { colors: { code: colors.code, link: colors.accent, text: colors.text, border: colors.border } },
  });
  return (
    <View>
      {elements.map((el, i) => (
        <Fragment key={i}>{el}</Fragment>
      ))}
    </View>
  );
}

export const Markdown = memo(MarkdownImpl);
