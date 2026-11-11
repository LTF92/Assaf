import * as Clipboard from 'expo-clipboard';
import React, { memo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '../lib/i18n';
import { colors, mono, radius } from '../lib/theme';
import type { Message } from '../lib/types';

const ICONS: Record<string, string> = {
  terminal: '⌨︎', execute_code: '⌨︎', web_search: '⌕', web_extract: '⌕', browser: '◍',
  read_file: '▤', write_file: '✎', patch: '✎', search_files: '⌕', memory: '◈', delegate_task: '⇆',
  progress: '•',
};

function statusDot(status?: string) {
  if (status === 'running') return <ActivityIndicator size="small" color={colors.accent} style={{ transform: [{ scale: 0.7 }] }} />;
  const color = status === 'error' ? colors.danger : status === 'ok' ? colors.ok : colors.textFaint;
  return <View style={[s.dot, { backgroundColor: color }]} />;
}

function ToolRow({ m }: { m: Message }) {
  const [open, setOpen] = useState(false);
  const tool = m.tool;
  const name = tool?.name === 'progress' ? '' : tool?.name ?? '';
  const label = m.text || name;
  const hasDetail = !!(tool?.args || tool?.output) || (tool?.name === 'progress' && m.text.length > 60);
  return (
    <View style={s.row}>
      <Pressable onPress={() => hasDetail && setOpen((v) => !v)} style={s.rowHead} hitSlop={6}>
        {statusDot(tool?.status)}
        <Text style={s.icon}>{ICONS[tool?.name ?? ''] ?? '⚙︎'}</Text>
        {name ? <Text style={s.toolName}>{name}</Text> : null}
        <Text style={s.summary} numberOfLines={open ? undefined : 1}>{label !== name ? label : ''}</Text>
        {tool?.duration_ms ? <Text style={s.duration}>{(tool.duration_ms / 1000).toFixed(1)}s</Text> : null}
      </Pressable>
      {open && (
        <View style={s.detail}>
          {tool?.args ? <Block title={t.args} body={tool.args} /> : null}
          {tool?.output ? <Block title={t.output} body={tool.output} error={tool.status === 'error'} /> : null}
        </View>
      )}
    </View>
  );
}

function Block({ title, body, error }: { title: string; body: string; error?: boolean }) {
  return (
    <View style={s.block}>
      <Pressable onLongPress={() => Clipboard.setStringAsync(body)}>
        <Text style={s.blockTitle}>{title}</Text>
      </Pressable>
      <ScrollView horizontal style={s.code} contentContainerStyle={{ padding: 10 }}>
        <Text selectable style={[s.codeText, error && { color: colors.danger }]}>{body}</Text>
      </ScrollView>
    </View>
  );
}

/** Consecutive tool calls collapsed into one line ("3 steps"); tap to see each command and its output. */
function ToolGroupImpl({ items }: { items: Message[] }) {
  const [open, setOpen] = useState(false);
  const running = items.some((m) => m.tool?.status === 'running');
  const failed = items.some((m) => m.tool?.status === 'error');
  const last = items[items.length - 1];
  const lastLabel = last.text || last.tool?.name || '';
  return (
    <View style={s.wrap}>
      <Pressable style={s.header} onPress={() => setOpen((v) => !v)} hitSlop={6}>
        {running ? statusDot('running') : statusDot(failed ? 'error' : 'ok')}
        <Text style={s.headerText}>{t.steps(items.length)}</Text>
        {!open && <Text style={s.headerLast} numberOfLines={1}>{running ? lastLabel : ''}</Text>}
        <Text style={s.chev}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open && items.map((m) => <ToolRow key={m.id} m={m} />)}
    </View>
  );
}

export const ToolGroup = memo(ToolGroupImpl);

const s = StyleSheet.create({
  wrap: { marginVertical: 4, marginHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  headerText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  headerLast: { color: colors.textFaint, fontSize: 12, flex: 1, fontFamily: mono },
  chev: { color: colors.textFaint, marginLeft: 'auto', fontSize: 13 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { borderTopWidth: 1, borderTopColor: colors.border },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  icon: { color: colors.textDim, fontSize: 13, width: 14, textAlign: 'center' },
  toolName: { color: colors.accent, fontSize: 12, fontFamily: mono },
  summary: { color: colors.textDim, fontSize: 12, fontFamily: mono, flex: 1 },
  duration: { color: colors.textFaint, fontSize: 11 },
  detail: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  block: { gap: 4 },
  blockTitle: { color: colors.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  code: { backgroundColor: colors.code, borderRadius: radius.sm, maxHeight: 260 },
  codeText: { color: '#D7DCE8', fontFamily: mono, fontSize: 12, lineHeight: 17 },
});
