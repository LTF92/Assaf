import { router, Stack } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { Appear, PressScale } from '../components/motion';
import { isRTL, t } from '../lib/i18n';
import { markRead, useInbox, type InboxItem, type InboxKind } from '../lib/inbox';
import { agentName } from '../lib/store';
import { timeLabel } from '../lib/time';
import { colors, makeStyles, mono } from '../lib/theme';

type Filter = 'all' | InboxKind;

function Chip({ kind }: { kind: InboxKind }) {
  const s = useStyles();
  const color = kind === 'error' ? colors.danger : kind === 'approval' ? colors.link : colors.textDim;
  return (
    <View style={s.chip}>
      {kind === 'scheduled' && <Icon name="clock" size={12} color={color} strokeWidth={2.2} />}
      {kind === 'approval' && <Icon name="shield" size={12} color={color} strokeWidth={2.2} />}
      <Text style={[s.chipText, { color }]}>
        {kind === 'scheduled' ? t.scheduled : kind === 'approval' ? t.approval : t.jobFailed}
      </Text>
    </View>
  );
}

function Item({ item }: { item: InboxItem }) {
  const s = useStyles();
  const { conn, m, kind } = item;
  const name = agentName(conn);
  const open = () => {
    markRead([item.key]);
    router.push(`/chat/${conn.id}`);
  };
  const reply = () => {
    markRead([item.key]);
    router.push({ pathname: '/chat/[id]', params: { id: conn.id, reply: m.id } });
  };
  // Long reports are clipped here; the full text is one tap away in the chat.
  const body = item.body.length > 600 ? item.body.slice(0, 600).replace(/\s+\S*$/, '') + ' …' : item.body;
  return (
    <View style={s.item}>
      <Avatar label={name} seed={conn.profile + conn.url} look={conn.look} size={44} />
      <View style={s.itemBody}>
        <View style={s.meta}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Chip kind={kind} />
          <Text style={s.time}>{timeLabel(m.ts)}</Text>
          {item.unread && <View style={s.dot} accessibilityLabel="unread" />}
        </View>
        <Pressable onPress={kind === 'approval' ? open : reply} accessibilityRole="button">
          {item.title ? <Text style={s.title}>{item.title}</Text> : null}
          {kind === 'approval' ? (
            <Text style={s.cmd} numberOfLines={3}>{body}</Text>
          ) : (
            <View style={s.md}><Markdown text={body} /></View>
          )}
        </Pressable>
        <View style={s.actions}>
          {kind === 'approval' ? (
            <PressScale style={s.primary} onPress={open} accessibilityRole="button">
              <Icon name="shieldCheck" size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={s.primaryText}>{t.review}</Text>
            </PressScale>
          ) : (
            <PressScale style={s.primary} onPress={reply} accessibilityRole="button">
              <Icon name="reply" size={18} color="#FFFFFF" strokeWidth={2} />
              <Text style={s.primaryText}>{t.reply}</Text>
            </PressScale>
          )}
          <PressScale style={s.secondary} onPress={open} accessibilityRole="button">
            <Text style={s.secondaryText} numberOfLines={1}>{t.chatWith(name)}</Text>
          </PressScale>
          {item.unread && kind !== 'approval' && (
            <PressScale style={s.check} onPress={() => markRead([item.key])} accessibilityLabel={t.markRead}>
              <Icon name="check" size={20} color={colors.textDim} strokeWidth={2} />
            </PressScale>
          )}
        </View>
      </View>
    </View>
  );
}

export default function Inbox() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { items } = useInbox();
  const [filter, setFilter] = useState<Filter>('all');
  const shown = useMemo(() => (filter === 'all' ? items : items.filter((i) => i.kind === filter)), [items, filter]);
  const unreadKeys = items.filter((i) => i.unread && i.kind !== 'approval').map((i) => i.key);

  // Leaving the channel counts as having seen what was on screen.
  const seen = useRef<string[]>([]);
  seen.current = unreadKeys;
  useEffect(() => () => markRead(seen.current), []);

  const filters: [Filter, string][] = [['all', t.filterAll], ['scheduled', t.filterScheduled], ['approval', t.filterApprovals], ['error', t.filterErrors]];

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <PressScale style={s.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel={t.agents}>
          <Icon name="back" size={22} color={colors.text} strokeWidth={2} />
        </PressScale>
        <Text style={s.h1} accessibilityRole="header">{t.inbox}</Text>
        {unreadKeys.length > 0 && (
          <PressScale style={s.round} onPress={() => markRead(unreadKeys)} accessibilityLabel={t.markAllRead}>
            <Icon name="check" size={20} color={colors.text} strokeWidth={2} />
          </PressScale>
        )}
        <PressScale style={s.round} onPress={() => router.push('/settings')} accessibilityLabel={t.notifications}>
          <Icon name="bell" size={20} color={colors.text} />
        </PressScale>
      </View>
      <View style={s.tabs} accessibilityRole="tablist">
        {filters.map(([key, label]) => {
          const on = filter === key;
          return (
            <Pressable key={key} onPress={() => setFilter(key)} style={[s.tab, on && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[s.tabText, on && s.tabTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(i) => i.key}
        renderItem={({ item, index }) => (
          <Appear delay={Math.min(index, 6) * 40} from={10}><Item item={item} /></Appear>
        )}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}><Icon name="inbox" size={30} color={colors.link} /></View>
            <Text style={s.emptyTitle}>{t.inboxEmpty}</Text>
            <Text style={s.emptyHint}>{t.inboxEmptyHint}</Text>
          </View>
        }
      />
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingStart: 10, paddingEnd: 20, paddingBottom: 12 },
    back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    h1: { flex: 1, color: colors.text, fontSize: fs(26), fontWeight: '700', textAlign: start },
    round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
    tab: { height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.surface, justifyContent: 'center' },
    tabOn: { backgroundColor: colors.accent },
    tabText: { color: colors.text, fontSize: fs(14), fontWeight: '600' },
    tabTextOn: { color: '#FFFFFF' },

    item: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    itemBody: { flex: 1, minWidth: 0, gap: 8 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { color: colors.text, fontSize: fs(15), fontWeight: '700', flexShrink: 1 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.surface },
    chipText: { fontSize: fs(12), fontWeight: '600' },
    time: { marginStart: 'auto', color: colors.textDim, fontSize: fs(13) },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
    title: { color: colors.text, fontSize: fs(16), fontWeight: '700', textAlign: start, marginBottom: 2 },
    md: { marginTop: -4 },
    cmd: { color: colors.text, fontFamily: mono, fontSize: fs(13), backgroundColor: colors.surface, borderRadius: 12, padding: 10, overflow: 'hidden', textAlign: 'left', writingDirection: 'ltr' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    primary: { height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 8 },
    primaryText: { color: '#FFFFFF', fontSize: fs(14), fontWeight: '600' },
    secondary: { height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.surface, justifyContent: 'center', flexShrink: 1 },
    secondaryText: { color: colors.text, fontSize: fs(14), fontWeight: '600' },
    check: { width: 44, height: 44, marginStart: 'auto', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
    emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    emptyTitle: { color: colors.text, fontSize: fs(18), fontWeight: '700' },
    emptyHint: { color: colors.textDim, fontSize: fs(15), textAlign: 'center', lineHeight: fs(22) },
  };
});
