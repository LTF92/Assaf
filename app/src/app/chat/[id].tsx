import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/Avatar';
import { CardView } from '../../components/CardView';
import { Composer, type ComposerHandle } from '../../components/Composer';
import { MessageItem } from '../../components/MessageItem';
import { Appear, TypingDots } from '../../components/motion';
import { StatusDot } from '../../components/StatusDot';
import { ToolGroup } from '../../components/ToolGroup';
import { t } from '../../lib/i18n';
import { httpBase } from '../../lib/pairing';
import { buildRows, type Row } from '../../lib/rows';
import { useSettings } from '../../lib/settings';
import { useChat, useConnections } from '../../lib/store';
import { colors, radius, makeStyles } from '../../lib/theme';

function statusLabel(status: string) {
  return status === 'online' ? t.online : status === 'connecting' ? t.connecting : status === 'unauthorized' ? t.unauthorized : t.offline;
}

export default function ChatScreen() {
  const s = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections } = useConnections();
  const conn = connections.find((c) => c.id === id);
  const { client, snap } = useChat(id);
  const insets = useSafeAreaInsets();
  const composer = useRef<ComposerHandle>(null);

  const { settings } = useSettings();
  const hideTools = settings.toolSteps === 'hidden';
  const rows = useMemo(
    () => buildRows(snap.messages).filter((r) => !(hideTools && r.type === 'tools')).reverse(),
    [snap.messages, hideTools],
  );
  const baseUrl = conn ? httpBase(conn) : '';
  const headers = useMemo(() => client?.mediaHeaders() ?? {}, [client]);

  const onAction = useCallback((messageId: string, value: string) => client?.act(messageId, value), [client]);
  const onRetry = useCallback((clientId: string) => client?.retrySend(clientId), [client]);

  // Only rows that arrive while the chat is open animate in; history just appears.
  const [openedAt] = useState(() => Date.now() / 1000 - 1);
  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      const first = item.type === 'tools' ? item.items[0] : item.m;
      const fresh = (first?.ts ?? 0) > openedAt || !!first?.pending;
      const mine = item.type === 'message' && item.m.role === 'user';
      let body: React.ReactNode;
      if (item.type === 'tools') body = <ToolGroup items={item.items} />;
      else if (item.type === 'card') body = <CardView m={item.m} onAction={onAction} onOther={() => composer.current?.focus()} />;
      else body = <MessageItem m={item.m} baseUrl={baseUrl} headers={headers} onRetry={onRetry} />;
      // The list is inverted (each cell is flipped), so a negative offset rises from below.
      return (
        <Appear enabled={fresh} from={-16} scale={item.type === 'card' || mine}>
          {body}
        </Appear>
      );
    },
    [onAction, onRetry, baseUrl, headers, openedAt],
  );

  if (!conn) return <View style={s.screen} />;
  const title = snap.profileLabel || conn.label;

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={() => router.push(`/connection/${conn.id}`)} style={s.titleWrap}>
              <Avatar label={title} seed={conn.profile + conn.url} size={34} />
              <View style={{ flexShrink: 1 }}>
                <Text style={s.title} numberOfLines={1}>{title}</Text>
                <View style={s.statusLine}>
                  <StatusDot status={snap.status} size={7} />
                  <Text style={[s.status, snap.typing && { color: colors.accent }]}>{snap.typing ? t.typing : statusLabel(snap.status)}</Text>
                </View>
              </View>
            </Pressable>
          ),
        }}
      />
      <FlatList
        inverted
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 10 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onEndReached={() => snap.hasOlder && client?.loadOlder()}
        ListHeaderComponent={
          snap.typing ? (
            <Appear from={-10} style={s.typingRow}>
              <View style={s.typingBubble}><TypingDots color={colors.accent} /></View>
            </Appear>
          ) : undefined
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Appear scale from={-20} style={{ alignItems: 'center', gap: 12 }}>
              <Avatar label={title} seed={conn.profile + conn.url} size={64} />
              <Text style={s.emptyName}>{title}</Text>
              <Text style={s.emptyText}>{t.emptyChat}</Text>
            </Appear>
          </View>
        }
      />
      <View style={{ paddingBottom: insets.bottom }}>
        <Composer ref={composer} disabled={snap.status === 'unauthorized'} onSend={(text, atts) => client?.send(text, atts)} />
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors, fs) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 260 },
  title: { color: colors.text, fontSize: fs(16), fontWeight: '700' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  status: { color: colors.textDim, fontSize: fs(12) },
  typingRow: { paddingHorizontal: 16, paddingVertical: 6, alignItems: 'flex-start' },
  typingBubble: { backgroundColor: colors.surface, borderRadius: radius.lg, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  empty: { padding: 40, paddingTop: 80, alignItems: 'center', transform: [{ scaleY: -1 }] },
  emptyName: { color: colors.text, fontSize: fs(18), fontWeight: '700' },
  emptyText: { color: colors.textFaint },
}));
