import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';
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
  void Haptics.selectionAsync();
  void Clipboard.setStringAsync(text);
}

function MessageItemImpl({ m, baseUrl, headers, onRetry }: Props) {
  if (m.role === 'user') {
    return (
      <View style={s.userRow}>
        <Pressable
          onLongPress={() => copy(m.text)}
          onPress={() => m.pending === 'failed' && m.client_id && onRetry(m.client_id)}
          style={[s.userBubble, m.pending && { opacity: 0.6 }, m.pending === 'failed' && { borderColor: colors.danger, borderWidth: 1 }]}
        >
          {m.attachments?.length ? (
            <Text style={s.attLine}>{m.attachments.map((a) => `📎 ${a.name}`).join('\n')}</Text>
          ) : null}
          {m.text ? <Text style={s.userText} selectable>{m.text}</Text> : null}
        </Pressable>
        {m.pending ? <Text style={[s.meta, m.pending === 'failed' && { color: colors.danger }]}>{m.pending === 'failed' ? t.failed : t.sending}</Text> : null}
      </View>
    );
  }

  if (m.kind === 'media' && m.media) {
    return (
      <View style={s.assistant}>
        <MediaView media={m.media} baseUrl={baseUrl} headers={headers} />
        {m.text ? <Markdown text={m.text} /> : null}
      </View>
    );
  }

  if (m.interim) {
    return (
      <View style={s.assistant}>
        <Text style={s.interim}>{m.text}</Text>
      </View>
    );
  }

  return (
    <Pressable style={s.assistant} onLongPress={() => copy(m.text)} delayLongPress={350}>
      <Markdown text={m.text} />
    </Pressable>
  );
}

export const MessageItem = memo(MessageItemImpl, (a, b) => a.m === b.m && a.baseUrl === b.baseUrl);

const s = StyleSheet.create({
  userRow: { alignItems: 'flex-end', paddingHorizontal: 14, marginVertical: 6 },
  userBubble: { maxWidth: '85%', backgroundColor: colors.userBubble, borderRadius: radius.lg, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { color: colors.text, fontSize: 16, lineHeight: 22, writingDirection: 'auto' },
  attLine: { color: colors.textDim, fontSize: 13, marginBottom: 4 },
  meta: { color: colors.textFaint, fontSize: 11, marginTop: 3 },
  assistant: { paddingHorizontal: 16, marginVertical: 6 },
  interim: { color: colors.textDim, fontSize: 14, fontStyle: 'italic' },
});
