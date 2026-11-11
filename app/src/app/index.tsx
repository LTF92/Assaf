import { Link, router, Stack } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusDot } from '../components/StatusDot';
import { t } from '../lib/i18n';
import { preview } from '../lib/rows';
import { useChat, useConnections } from '../lib/store';
import { colors, mono, radius } from '../lib/theme';
import type { Connection } from '../lib/types';

function timeLabel(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ConnectionRow({ conn }: { conn: Connection }) {
  const { snap } = useChat(conn.id);
  const last = preview(snap.messages);
  const pendingCards = snap.messages.filter((m) => m.card?.state === 'pending').length;
  const label = snap.profileLabel || conn.label;
  const lastText = last
    ? last.kind === 'card' ? `⚠︎ ${t.approvalNeeded}` : last.kind === 'media' ? `📎 ${last.media?.name ?? ''}` : last.text
    : '';
  return (
    <Pressable style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surface }]} onPress={() => router.push(`/chat/${conn.id}`)}>
      <View style={[s.avatar, { backgroundColor: conn.color || colors.accent }]}>
        <Text style={s.avatarText}>{label.slice(0, 1).toUpperCase()}</Text>
        <View style={s.dotWrap}><StatusDot status={snap.status} size={10} /></View>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.line}>
          <Text style={s.name} numberOfLines={1}>{label}</Text>
          <Text style={s.time}>{timeLabel(last?.ts)}</Text>
        </View>
        <View style={s.line}>
          <Text style={s.preview} numberOfLines={1}>
            {snap.typing ? t.typing : lastText.replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ')}
          </Text>
          {pendingCards > 0 && <View style={s.badge}><Text style={s.badgeText}>{pendingCards}</Text></View>}
        </View>
        <Text style={s.sub} numberOfLines={1}>{conn.role === 'guest' ? `${t.guest} · ` : ''}{conn.profile}</Text>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const { connections, ready } = useConnections();
  return (
    <View style={s.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/add" asChild>
              <Pressable hitSlop={10}><Text style={s.plus}>＋</Text></Pressable>
            </Link>
          ),
        }}
      />
      {ready && connections.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>{t.noConnections}</Text>
          <Text style={s.emptyHint}>{t.noConnectionsHint}</Text>
          <Text style={s.cmd}>hermes mobile pair</Text>
          <Pressable style={s.cta} onPress={() => router.push('/add')}>
            <Text style={s.ctaText}>{t.addConnection}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={connections}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ConnectionRow conn={item} />}
          ItemSeparatorComponent={() => <View style={s.sep} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  plus: { color: colors.accent, fontSize: 26, paddingHorizontal: 6 },
  row: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#141414', fontSize: 22, fontWeight: '800' },
  dotWrap: { position: 'absolute', right: 0, bottom: 0, padding: 2, borderRadius: 10, backgroundColor: colors.bg },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 },
  time: { color: colors.textFaint, fontSize: 12 },
  preview: { color: colors.textDim, fontSize: 14, flex: 1 },
  sub: { color: colors.textFaint, fontSize: 12 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: colors.accentText, fontSize: 12, fontWeight: '800' },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 82 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  emptyHint: { color: colors.textDim, fontSize: 15, textAlign: 'center' },
  cmd: { color: '#FFD58A', fontFamily: mono, backgroundColor: colors.code, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, overflow: 'hidden' },
  cta: { marginTop: 10, backgroundColor: colors.accent, paddingHorizontal: 22, paddingVertical: 13, borderRadius: radius.pill },
  ctaText: { color: colors.accentText, fontWeight: '800', fontSize: 16 },
});
