import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/Avatar';
import { CardView } from '../../components/CardView';
import { Composer, type ComposerHandle } from '../../components/Composer';
import { Icon } from '../../components/Icon';
import { MessageItem } from '../../components/MessageItem';
import { Appear, TypingDots } from '../../components/motion';
import { StatusDot } from '../../components/StatusDot';
import { ToolGroup } from '../../components/ToolGroup';
import { isRTL, t } from '../../lib/i18n';
import { markRead, splitTitle } from '../../lib/inbox';
import { httpBase } from '../../lib/pairing';
import { buildRows, type Row } from '../../lib/rows';
import { useSettings } from '../../lib/settings';
import { agentName, portOf, useChat, useConnections } from '../../lib/store';
import { guestLimits, scopeLabel, secondsLeft, spanText } from '../../lib/share';
import { colors, makeStyles, mono } from '../../lib/theme';
import type { ClientSnapshot } from '../../lib/client';
import type { Connection } from '../../lib/types';

function statusLabel(status: string) {
  return status === 'online' ? t.online : status === 'connecting' ? t.connecting : status === 'unauthorized' ? t.unauthorized : t.offline;
}

export default function ChatScreen() {
  const s = useStyles();
  const { id, reply: replyParam } = useLocalSearchParams<{ id: string; reply?: string }>();
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

  const name = conn ? agentName(conn, snap.profileLabel) : '';

  // Replying to a scheduled report from the main channel: the report goes along as a quote.
  const [replyId, setReplyId] = useState<string | undefined>(replyParam);
  useEffect(() => setReplyId(replyParam), [replyParam]);
  const replyMsg = replyId ? snap.messages.find((m) => m.id === replyId) : undefined;
  const replyTitle = replyMsg ? splitTitle(replyMsg.text).title || replyMsg.text.replace(/\s+/g, ' ').slice(0, 80) : '';
  useEffect(() => {
    if (replyMsg) setTimeout(() => composer.current?.focus(), 350);
  }, [replyMsg]);

  // Opening the chat counts as reading what the agent sent on its own.
  useEffect(() => {
    if (!conn) return;
    markRead(snap.messages.filter((m) => m.origin === 'scheduled').map((m) => `${conn.id}:${m.id}`));
  }, [conn, snap.messages]);

  const send = useCallback(
    (text: string, atts: Parameters<NonNullable<typeof client>['send']>[1]) => {
      if (!client) return;
      if (replyMsg && text && !text.startsWith('/')) {
        const quote = replyMsg.text.trim().slice(0, 500).split('\n').map((l) => `> ${l}`).join('\n');
        client.send(`${quote}\n\n${text}`, atts);
        setReplyId(undefined);
        router.setParams({ reply: undefined });
      } else client.send(text, atts);
    },
    [client, replyMsg],
  );

  const busy = snap.typing || snap.messages.some((m) => m.kind === 'tool' && m.tool?.status === 'running');

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
      else if (item.type === 'card') body = <CardView m={item.m} agentName={name} onAction={onAction} onOther={() => composer.current?.focus()} />;
      else body = <MessageItem m={item.m} baseUrl={baseUrl} headers={headers} onRetry={onRetry} />;
      // The list is inverted (each cell is flipped), so a negative offset rises from below.
      return (
        <Appear enabled={fresh} from={-16} scale={item.type === 'card' || mine}>
          {body}
        </Appear>
      );
    },
    [onAction, onRetry, baseUrl, headers, openedAt, name],
  );

  if (!conn) return <View style={s.screen} />;
  const title = name;

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <Pressable style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel={t.agents} hitSlop={4}>
          <Icon name="back" size={22} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Pressable onPress={() => router.push(`/connection/${conn.id}`)} style={s.titleWrap} accessibilityLabel={t.customize}>
          <Avatar label={name} seed={conn.profile + conn.url} look={conn.look} size={40} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text style={s.title} numberOfLines={1}>{name}</Text>
            <View style={s.statusLine}>
              <StatusDot status={snap.status} size={7} />
              <Text style={[s.status, snap.typing && { color: colors.link }]} numberOfLines={1}>
                {snap.typing ? t.typing : statusLabel(snap.status)}
              </Text>
              <Text style={conn.role === 'guest' ? s.status : s.port} numberOfLines={1}>· {conn.role === 'guest' ? t.agentOf(snap.ownerName || conn.invite?.from || '') : portOf(conn)}</Text>
            </View>
          </View>
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => client?.send('/new', [])} accessibilityLabel={t.newChat} hitSlop={4}>
          <Icon name="compose" size={22} color={colors.text} />
        </Pressable>
      </View>
      {conn.role === 'guest' && <GuestStrip conn={conn} snap={snap} />}
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
              <Avatar label={title} seed={conn.profile + conn.url} look={conn.look} size={72} />
              <Text style={s.emptyName}>{title}</Text>
              <Text style={s.emptyText}>{t.emptyChat}</Text>
            </Appear>
          </View>
        }
      />
      <View style={{ paddingBottom: insets.bottom }}>
        <Composer
          ref={composer}
          disabled={snap.status === 'unauthorized'}
          placeholder={t.writeTo(name)}
          busy={busy}
          reply={replyMsg ? { to: name, title: replyTitle, onCancel: () => { setReplyId(undefined); router.setParams({ reply: undefined }); } } : null}
          onSend={send}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** What a guest may do here: scope · topic · time left. */
function GuestStrip({ conn, snap }: { conn: Connection; snap: ClientSnapshot }) {
  const s = useStyles();
  const g = guestLimits(conn, snap);
  const left = secondsLeft(g.expires_at);
  const parts = [scopeLabel(g.scope), g.topic, left == null ? '' : left === 0 ? t.accessExpired : t.leftTime(spanText(left))].filter(Boolean);
  return (
    <View style={s.strip} accessibilityRole="text">
      <Icon name="lock" size={13} color={colors.textDim} />
      <Text style={s.stripText} numberOfLines={1}>{parts.join(' · ')}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => ({
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.surface },
  stripText: { color: colors.textDim, fontSize: fs(12), fontWeight: '600', flexShrink: 1 },
  screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: fs(17), fontWeight: '600', textAlign: isRTL ? 'right' : 'left' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  status: { color: colors.textDim, fontSize: fs(12) },
  port: { color: colors.textDim, fontSize: fs(12), fontFamily: mono },
  typingRow: { paddingHorizontal: 16, paddingVertical: 6, alignItems: 'flex-start' },
  typingBubble: { backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  empty: { padding: 40, paddingTop: 80, alignItems: 'center', transform: [{ scaleY: -1 }] },
  emptyName: { color: colors.text, fontSize: fs(18), fontWeight: '700' },
  emptyText: { color: colors.textDim },
}));
