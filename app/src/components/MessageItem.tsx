import * as Clipboard from 'expo-clipboard';
import { haptic } from '../lib/haptics';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { textDir, useSettings } from '../lib/settings';
import { t } from '../lib/i18n';
import { colors, radius, makeStyles } from '../lib/theme';
import type { Message } from '../lib/types';
import { Markdown } from './Markdown';
import { MediaView } from './MediaView';

interface Props {
  m: Message;
  baseUrl: string;
  headers: Record<string, string>;
  onRetry: (clientId: string) => void;
}

function copy(text: string) {
  haptic.tap();
  void Clipboard.setStringAsync(text);
}

function clock(ts?: number) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MessageItemImpl({ m, baseUrl, headers, onRetry }: Props) {
  const s = useStyles();
  const { settings } = useSettings();
  const time = settings.timestamps && !m.pending ? <Text style={[s.meta, m.role === 'user' ? null : s.metaStart]}>{clock(m.ts)}</Text> : null;
  if (m.role === 'user') {
    const dir = textDir(m.text);
    return (
      <View style={s.userRow}>
        <Pressable
          onLongPress={() => copy(m.text)}
          onPress={() => m.pending === 'failed' && m.client_id && onRetry(m.client_id)}
          style={[s.userBubble, { direction: dir }, m.pending && { opacity: 0.6 }, m.pending === 'failed' && { borderColor: colors.danger, borderWidth: 1 }]}
        >
          {m.attachments?.length ? (
            <Text style={s.attLine}>{m.attachments.map((a) => `📎 ${a.name}`).join('\n')}</Text>
          ) : null}
          {m.text ? <Text style={[s.userText, { writingDirection: dir }]} selectable>{m.text}</Text> : null}
        </Pressable>
        {m.pending ? <Text style={[s.meta, m.pending === 'failed' && { color: colors.danger }]}>{m.pending === 'failed' ? t.failed : t.sending}</Text> : null}
        {time}
      </View>
    );
  }

  if (m.kind === 'media' && m.media) {
    return (
      <View style={s.assistant}>
        <MediaView media={m.media} baseUrl={baseUrl} headers={headers} />
        {m.text ? <Markdown text={m.text} /> : null}
        {time}
      </View>
    );
  }

  if (m.interim) {
    return (
      <View style={s.assistant}>
        <Text style={[s.interim, { writingDirection: textDir(m.text) }]}>{m.text}</Text>
      </View>
    );
  }

  return (
    <Pressable style={s.assistant} onLongPress={() => copy(m.text)} delayLongPress={350}>
      <Markdown text={m.text} />
      {time}
    </Pressable>
  );
}

export const MessageItem = memo(MessageItemImpl, (a, b) => a.m === b.m && a.baseUrl === b.baseUrl);

const useStyles = makeStyles((colors, fs) => ({
  userRow: { alignItems: 'flex-end', paddingHorizontal: 14, marginVertical: 6 },
  userBubble: { maxWidth: '85%', backgroundColor: colors.userBubble, borderRadius: radius.xl, borderBottomRightRadius: 8, paddingHorizontal: 15, paddingVertical: 10 },
  userText: { color: colors.userText, fontSize: fs(16), lineHeight: fs(22), fontWeight: '500' },
  attLine: { color: colors.userText, opacity: 0.7, fontSize: fs(13), marginBottom: 4 },
  meta: { color: colors.textFaint, fontSize: fs(11), marginTop: 3 },
  metaStart: { alignSelf: 'flex-start' },
  assistant: { paddingHorizontal: 18, marginVertical: 6 },
  interim: { color: colors.textDim, fontSize: fs(14), fontStyle: 'italic' },
}));
