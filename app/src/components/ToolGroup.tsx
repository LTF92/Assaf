import * as Clipboard from 'expo-clipboard';
import React, { memo, useState } from 'react';
import { Animated, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { isRTL, t } from '../lib/i18n';
import { colors, mono, radius, makeStyles } from '../lib/theme';
import { current } from '../lib/settings';
import type { Message } from '../lib/types';
import { Icon } from './Icon';
import { Appear, useLoop } from './motion';

const smooth = () => current.animations && LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));

function StatusIcon({ status }: { status?: string }) {
  if (status === 'running') return <Spinner />;
  if (status === 'error') return <Icon name="alert" size={18} color={colors.danger} strokeWidth={2} />;
  if (status === 'ok') return <Icon name="check" size={18} color={colors.ok} strokeWidth={2.2} />;
  return <View style={{ width: 18, alignItems: 'center' }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textDim }} /></View>;
}

/** A thin ring that turns while a tool runs. */
function Spinner() {
  const spin = useLoop(900);
  return (
    <Animated.View
      style={{
        width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: colors.track, borderTopColor: colors.accent,
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
      }}
    />
  );
}

function ToolRow({ m }: { m: Message }) {
  const s = useStyles();
  const [open, setOpen] = useState(false);
  const tool = m.tool;
  const name = tool?.name === 'progress' ? '' : tool?.name ?? '';
  const label = m.text || name;
  const hasDetail = !!(tool?.args || tool?.output) || (tool?.name === 'progress' && m.text.length > 60);
  return (
    <View style={s.row}>
      <Pressable onPress={() => { if (!hasDetail) return; smooth(); setOpen((v) => !v); }} style={s.rowHead} hitSlop={4}>
        <StatusIcon status={tool?.status} />
        <View style={s.rowText}>
          {name ? <Text style={s.toolName}>{name}</Text> : null}
          {label !== name ? <Text style={s.summary} numberOfLines={open ? undefined : 1}>{label}</Text> : null}
        </View>
        {tool?.status === 'running' ? <Text style={s.duration}>{t.toolRunning}</Text>
          : tool?.duration_ms ? <Text style={s.duration}>{(tool.duration_ms / 1000).toFixed(1)}s</Text> : null}
      </Pressable>
      {open && (
        <Appear from={6} style={s.detail}>
          {tool?.args ? <Block title={t.args} body={tool.args} /> : null}
          {tool?.output ? <Block title={t.output} body={tool.output} error={tool.status === 'error'} /> : null}
        </Appear>
      )}
    </View>
  );
}

function Block({ title, body, error }: { title: string; body: string; error?: boolean }) {
  const s = useStyles();
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

/** Consecutive tool calls in one card ("Used 3 tools"); tap a tool to see its command and output. */
function ToolGroupImpl({ items }: { items: Message[] }) {
  const s = useStyles();
  const running = items.some((m) => m.tool?.status === 'running');
  const [open, setOpen] = useState(current.toolSteps === 'expanded' || running);
  return (
    <View style={s.wrap}>
      <Pressable style={s.header} onPress={() => { smooth(); setOpen((v) => !v); }} hitSlop={4}>
        <Icon name="wrench" size={16} color={colors.link} strokeWidth={2} />
        <Text style={s.headerText}>{t.usedTools(items.length)}</Text>
        {!open && running ? <Spinner /> : null}
        <Icon name={open ? 'chevUp' : 'chevDown'} size={16} color={colors.textDim} strokeWidth={2} />
      </Pressable>
      {open && items.map((m, i) => <Appear key={m.id} delay={i * 35} from={8}><ToolRow m={m} /></Appear>)}
    </View>
  );
}

export const ToolGroup = memo(ToolGroupImpl);

const useStyles = makeStyles((colors, fs) => ({
  wrap: { marginVertical: 6, marginHorizontal: 16, alignSelf: 'stretch', borderRadius: 18, backgroundColor: colors.surface, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 44 },
  headerText: { color: colors.text, fontSize: fs(14), fontWeight: '600', flex: 1, textAlign: isRTL ? 'right' : 'left' },
  row: { borderTopWidth: 1, borderTopColor: colors.borderStrong },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  rowText: { flex: 1, gap: 1, direction: 'ltr' },
  toolName: { color: colors.text, fontSize: fs(13), fontWeight: '600', fontFamily: mono, textAlign: 'left' },
  summary: { color: colors.textDim, fontSize: fs(12), fontFamily: mono, textAlign: 'left' },
  duration: { color: colors.textDim, fontSize: fs(12) },
  detail: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  block: { gap: 4 },
  blockTitle: { color: colors.textDim, fontSize: fs(12), fontWeight: '600' },
  code: { backgroundColor: colors.code, borderRadius: 12, maxHeight: 260, direction: 'ltr' },
  codeText: { color: colors.codeText, fontFamily: mono, fontSize: fs(12), lineHeight: fs(18) },
}));
