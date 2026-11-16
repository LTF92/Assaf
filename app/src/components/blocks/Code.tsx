import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { CODE_COLORS, highlight } from '../../lib/highlight';
import { makeStyles, mono } from '../../lib/theme';
import { CopyButton } from './Copy';

/** Fenced code: language label, copy, light highlighting, sideways scroll. Always left to right. */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const s = useStyles();
  const lines = highlight(code.replace(/\n$/, ''), lang);
  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <Text style={s.lang}>{lang || 'code'}</Text>
        <CopyButton text={code} color="#FFFFFF" />
      </View>
      <ScrollView horizontal bounces={false} contentContainerStyle={s.body}>
        <Text selectable style={s.code}>
          {lines.map((ln, i) => (
            <Text key={i}>
              {ln.map((sp, j) => <Text key={j} style={{ color: CODE_COLORS[sp.kind] }}>{sp.text}</Text>)}
              {i < lines.length - 1 ? '\n' : ''}
            </Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => ({
  wrap: { borderRadius: 16, backgroundColor: colors.code, overflow: 'hidden', marginVertical: 8, direction: 'ltr', borderWidth: colors.statusBar === 'light' ? 1 : 0, borderColor: colors.borderStrong },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 14, paddingRight: 4 },
  lang: { fontFamily: mono, fontSize: fs(12), color: '#C9BEEA' },
  body: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 },
  code: { fontFamily: mono, fontSize: fs(13), lineHeight: fs(22), color: '#FFFFFF', writingDirection: 'ltr', textAlign: 'left' },
}));
