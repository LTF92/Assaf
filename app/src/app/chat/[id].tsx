import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardView } from '../../components/CardView';
import { Composer, type ComposerHandle } from '../../components/Composer';
import { MessageItem } from '../../components/MessageItem';
import { StatusDot } from '../../components/StatusDot';
import { ToolGroup } from '../../components/ToolGroup';
import { t } from '../../lib/i18n';
import { httpBase } from '../../lib/pairing';
import { buildRows, type Row } from '../../lib/rows';
import { useChat, useConnections } from '../../lib/store';
import { colors } from '../../lib/theme';

function statusLabel(status: string) {
  return status === 'online' ? t.online : status === 'connecting' ? t.connecting : status === 'unauthorized' ? t.unauthorized : t.offline;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections } = useConnections();
  const conn = connections.find((c) => c.id === id);
  const { client, snap } = useChat(id);
  const insets = useSafeAreaInsets();
  const composer = useRef<ComposerHandle>(null);

  const rows = useMemo(() => buildRows(snap.messages).reverse(), [snap.messages]);
  const baseUrl = conn ? httpBase(conn) : '';
  const headers = useMemo(() => client?.mediaHeaders() ?? {}, [client]);

  const onAction = useCallback((messageId: string, value: string) => client?.act(messageId, value), [client]);
  const onRetry = useCallback((clientId: string) => client?.retrySend(clientId), [client]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.type === 'tools') return <ToolGroup items={item.items} />;
      if (item.type === 'card') return <CardView m={item.m} onAction={onAction} onOther={() => composer.current?.focus()} />;
      return <MessageItem m={item.m} baseUrl={baseUrl} headers={headers} onRetry={onRetry} />;
    },
    [onAction, onRetry, baseUrl, headers],
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
              <Text style={s.title} numberOfLines={1}>{title}</Text>
              <View style={s.statusLine}>
                <StatusDot status={snap.status} size={7} />
                <Text style={s.status}>{snap.typing ? t.typing : statusLabel(snap.status)}</Text>
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
        ListHeaderComponent={snap.typing ? <Text style={s.typing}>● ● ●</Text> : undefined}
        ListEmptyComponent={
          <View style={s.empty}><Text style={s.emptyText}>{t.emptyChat}</Text></View>
        }
      />
      <View style={{ paddingBottom: insets.bottom }}>
        <Composer ref={composer} disabled={snap.status === 'unauthorized'} onSend={(text, atts) => client?.send(text, atts)} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  titleWrap: { alignItems: 'center', maxWidth: 240 },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  status: { color: colors.textDim, fontSize: 12 },
  typing: { color: colors.accent, paddingHorizontal: 18, paddingVertical: 8, letterSpacing: 2 },
  empty: { padding: 40, alignItems: 'center', transform: [{ scaleY: -1 }] },
  emptyText: { color: colors.textFaint },
});
