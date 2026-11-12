import { router, Stack } from 'expo-router';
import React from 'react';
import { Animated, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Appear, Gradient, PressScale, TypingDots, useLoop } from '../components/motion';
import { StatusDot } from '../components/StatusDot';
import { textDir } from '../lib/settings';
import { t } from '../lib/i18n';
import { preview } from '../lib/rows';
import { useChat, useConnections } from '../lib/store';
import { colors, mono, radius, shadow, makeStyles } from '../lib/theme';
import type { Connection } from '../lib/types';

function timeLabel(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ConnectionRow({ conn, index }: { conn: Connection; index: number }) {
  const s = useStyles();
  const { snap } = useChat(conn.id);
  const last = preview(snap.messages);
  const pendingCards = snap.messages.filter((m) => m.card?.state === 'pending').length;
  const label = snap.profileLabel || conn.label;
  const lastText = last
    ? last.kind === 'card' ? `⚠︎ ${t.approvalNeeded}` : last.kind === 'media' ? `📎 ${last.media?.name ?? ''}` : last.text
    : '';
  const previewText = lastText.replace(/[-:|]{3,}/g, ' ').replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
  const dir = textDir(previewText);
  return (
    <Appear delay={index * 60} from={18}>
      <PressScale style={s.row} to={0.98} onPress={() => router.push(`/chat/${conn.id}`)}>
        <View>
          <Avatar label={label} seed={conn.profile + conn.url} />
          <View style={s.dotWrap}><StatusDot status={snap.status} size={11} /></View>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={s.line}>
            <Text style={s.name} numberOfLines={1}>{label}</Text>
            <Text style={[s.time, pendingCards > 0 && { color: colors.accent }]}>{timeLabel(last?.ts)}</Text>
          </View>
          <View style={s.line}>
            {snap.typing ? (
              <View style={{ flex: 1 }}><TypingDots color={colors.accent} size={6} /></View>
            ) : (
              <Text style={[s.preview, { writingDirection: dir, textAlign: dir === 'rtl' ? 'right' : 'left' }]} numberOfLines={1}>
                {previewText || t.emptyChat}
              </Text>
            )}
            {pendingCards > 0 && (
              <Appear scale from={0}>
                <View style={s.badge}><Text style={s.badgeText}>{pendingCards}</Text></View>
              </Appear>
            )}
          </View>
          <View style={s.tags}>
            {conn.role === 'guest' && <Text style={s.tag}>{t.guest}</Text>}
            <Text style={s.sub} numberOfLines={1}>{conn.profile}</Text>
          </View>
        </View>
      </PressScale>
    </Appear>
  );
}

/** A slowly breathing gold mark for the empty state. */
function Mark() {
  const s = useStyles();
  const glow = useLoop(2600);
  return (
    <View style={s.markWrap}>
      <Animated.View
        style={[
          s.markGlow,
          {
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }],
          },
        ]}
      />
      <View style={s.mark}>
        <Gradient colors={[colors.accent, colors.accent2]} radius={36} />
        <Text style={s.markText}>H</Text>
      </View>
    </View>
  );
}

function AddButton({ bottom }: { bottom: number }) {
  const s = useStyles();
  return (
    <Appear delay={200} from={30} scale style={[s.fabWrap, shadow, { bottom: bottom + 18 }]}>
      <PressScale haptic style={s.fab} to={0.92} onPress={() => router.push('/add')}>
        <Gradient colors={[colors.accent, colors.accent2]} radius={radius.pill} />
        <Text style={s.fabPlus}>＋</Text>
        <Text style={s.fabText}>{t.addConnection}</Text>
      </PressScale>
    </Appear>
  );
}

export default function Home() {
  const s = useStyles();
  const { connections, ready } = useConnections();
  const insets = useSafeAreaInsets();
  return (
    <View style={s.screen}>
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerTransparent: false,
          headerRight: () => (
            <PressScale haptic to={0.85} hitSlop={10} onPress={() => router.push('/settings')} style={s.gear}>
              <Text style={s.gearText}>⚙︎</Text>
            </PressScale>
          ),
        }}
      />
      {ready && connections.length === 0 ? (
        <View style={s.empty}>
          <Appear scale from={24}><Mark /></Appear>
          <Appear delay={120}><Text style={s.emptyTitle}>{t.noConnections}</Text></Appear>
          <Appear delay={200}><Text style={s.emptyHint}>{t.noConnectionsHint}</Text></Appear>
          <Appear delay={280}><Text style={s.cmd}>hermes mobile pair</Text></Appear>
        </View>
      ) : (
        <FlatList
          data={connections}
          keyExtractor={(c) => c.id}
          renderItem={({ item, index }) => <ConnectionRow conn={item} index={index} />}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 100 }}
          contentInsetAdjustmentBehavior="automatic"
        />
      )}
      {ready && <AddButton bottom={insets.bottom} />}
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  gear: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  gearText: { color: colors.text, fontSize: fs(19) },
  row: {
    flexDirection: 'row', gap: 14, paddingHorizontal: 14, paddingVertical: 14, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
  },
  dotWrap: { position: 'absolute', right: -1, bottom: -1, padding: 3, borderRadius: 12, backgroundColor: colors.surface },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.text, fontSize: fs(17), fontWeight: '700', flex: 1, letterSpacing: 0.1 },
  time: { color: colors.textFaint, fontSize: fs(12), fontVariant: ['tabular-nums'] },
  preview: { color: colors.textDim, fontSize: fs(14), flex: 1 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { color: colors.accent, backgroundColor: colors.accentSoft, fontSize: fs(11), fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  sub: { color: colors.textFaint, fontSize: fs(12), fontFamily: mono },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: colors.accentText, fontSize: fs(12), fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  markWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  markGlow: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: colors.accentGlow },
  mark: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  markText: { color: colors.accentText, fontSize: fs(34), fontWeight: '900' },
  emptyTitle: { color: colors.text, fontSize: fs(22), fontWeight: '800', textAlign: 'center' },
  emptyHint: { color: colors.textDim, fontSize: fs(15), textAlign: 'center', lineHeight: fs(22) },
  cmd: { color: '#FFD58A', fontFamily: mono, backgroundColor: colors.code, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  fabWrap: { position: 'absolute', alignSelf: 'center', borderRadius: radius.pill },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, height: 54, borderRadius: radius.pill, overflow: 'hidden' },
  fabPlus: { color: colors.accentText, fontSize: fs(22), fontWeight: '800' },
  fabText: { color: colors.accentText, fontSize: fs(16), fontWeight: '800' },
}));
