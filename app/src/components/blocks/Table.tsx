import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { detectDirection } from '../../lib/direction';
import { isRTL, t } from '../../lib/i18n';
import { colors, makeStyles } from '../../lib/theme';
import { CopyButton } from './Copy';

export interface TableData {
  title?: string;
  header: string[];
  rows: string[][];
  align?: (string | null)[];
}

/** Strip inline markdown for cell text (bold, code, links). */
export function plain(s: string): string {
  return (s || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .trim();
}

function width(texts: string[]): number {
  const longest = Math.max(...texts.map((x) => Math.max(...x.split('\n').map((l) => l.length))), 2);
  return Math.min(260, Math.max(76, Math.round(longest * 8.2 + 30)));
}

/**
 * A table that never squeezes: each column gets the width its content needs, the whole table
 * scrolls sideways, and the reading direction decides which side the first column sits on.
 */
export function Table({ data }: { data: TableData }) {
  const s = useStyles();
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);
  const [box, setBox] = useState(0);
  const all = [...data.rows.map((r) => r.join(' ')), data.header.join(' ')].join(' ');
  const rtl = (detectDirection(all) ?? (isRTL ? 'rtl' : 'ltr')) === 'rtl';
  const cols = data.header.length;
  const widths = useMemo(() => {
    const w = Array.from({ length: cols }, (_, c) => width([data.header[c] ?? '', ...data.rows.map((r) => r[c] ?? '')]));
    const total = w.reduce((a, b) => a + b, 0);
    return box > total ? w.map((x) => (x * box) / total) : w; // fill the bubble when it fits
  }, [data, cols, box]);
  const overflow = widths.reduce((a, b) => a + b, 0) > box + 1;
  const order = Array.from({ length: cols }, (_, i) => i);
  if (rtl) order.reverse(); // first column on the right; the row itself is laid out left to right
  const tsv = [data.header, ...data.rows].map((r) => r.map(plain).join('\t')).join('\n');

  const cell = (text: string, c: number, head: boolean, key: string) => {
    const a = data.align?.[c];
    const textAlign = a === 'center' ? 'center' : a === 'right' ? 'right' : a === 'left' ? 'left' : rtl ? 'right' : 'left';
    return (
      <View key={key} style={[s.cell, { width: widths[c] }]}>
        <Text style={[head ? s.th : s.td, { textAlign, writingDirection: detectDirection(plain(text)) ?? (rtl ? 'rtl' : 'ltr') }]} selectable>{plain(text)}</Text>
      </View>
    );
  };

  return (
    <View style={s.wrap} onLayout={(e) => setBox(Math.floor(e.nativeEvent.layout.width) - 2)}>
      <View style={[s.top, { flexDirection: rtl ? 'row-reverse' : 'row', direction: 'ltr' }]}>
        <Text style={[s.title, { textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>{data.title ?? ''}</Text>
        <CopyButton text={tsv} color={colors.link} />
      </View>
      <ScrollView
        ref={scroll as never}
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={overflow}
        style={s.scroll}
        onContentSizeChange={() => rtl && scroll.current?.scrollToEnd({ animated: false })}
      >
        <View style={{ direction: 'ltr' }}>
          <View style={[s.row, s.head]}>{order.map((c) => cell(data.header[c] ?? '', c, true, `h${c}`))}</View>
          {data.rows.map((r, i) => (
            <View key={i} style={[s.row, s.bodyRow]}>{order.map((c) => cell(r[c] ?? '', c, false, `${i}:${c}`))}</View>
          ))}
        </View>
      </ScrollView>
      {overflow ? <Text style={[s.hint, { textAlign: rtl ? 'right' : 'left' }]}>{t.swipeTable}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => ({
  wrap: { borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden', marginVertical: 8 },
  top: { alignItems: 'center', justifyContent: 'space-between', paddingStart: 14, paddingEnd: 4, minHeight: 44, gap: 8 },
  title: { color: colors.text, fontSize: fs(14), fontWeight: '600', flex: 1 },
  scroll: { borderTopWidth: 1, borderTopColor: colors.borderStrong },
  row: { flexDirection: 'row' },
  head: { backgroundColor: colors.surface },
  bodyRow: { borderTopWidth: 1, borderTopColor: colors.borderStrong },
  cell: { paddingVertical: 10, paddingHorizontal: 14, justifyContent: 'center' },
  th: { color: colors.textDim, fontSize: fs(14), fontWeight: '600', lineHeight: fs(20) },
  td: { color: colors.text, fontSize: fs(14), lineHeight: fs(21) },
  hint: { color: colors.textDim, fontSize: fs(12), paddingVertical: 8, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.borderStrong },
}));
