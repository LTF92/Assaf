import { router, usePathname } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '../lib/haptics';
import { isRTL, t } from '../lib/i18n';
import { splitTitle, useAllChats } from '../lib/inbox';
import { current } from '../lib/settings';
import { agentName } from '../lib/store';
import { makeStyles } from '../lib/theme';
import type { Connection, Message } from '../lib/types';
import { Avatar } from './Avatar';

interface Shown { key: string; conn: Connection; name: string; kind: string; title: string; to: string }

const VISIBLE_MS = 4500;

/** A message landed in a chat you're not looking at: show it on top for a few seconds. */
export function InAppBanner() {
  const chats = useAllChats();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const since = useRef(Date.now() / 1000);
  const seen = useRef(new Set<string>());
  const [item, setItem] = useState<Shown | null>(null);
  const y = useRef(new Animated.Value(-160)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    for (const { conn, snap } of chats) {
      if (!snap) continue;
      const open = path === `/chat/${conn.id}`;
      const m = [...snap.messages].reverse().find((x) => x.role === 'assistant' && !x.interim && !x.deleted);
      if (!m || m.ts < since.current) continue;
      const key = `${conn.id}:${m.id}`;
      if (seen.current.has(key)) continue;
      const approval = m.kind === 'card' && m.card?.state === 'pending' && m.card.type === 'approval';
      const done = approval || m.kind === 'media' || (m.kind === 'text' && !!m.text && !snap.typing);
      if (!done) continue;
      seen.current.add(key);
      if (open || path === '/inbox') continue;
      const name = agentName(conn, snap.profileLabel);
      const scheduled = m.origin === 'scheduled';
      setItem({
        key, conn, name,
        kind: approval ? t.approvalNeeded : scheduled ? t.scheduledMessage : '',
        title: approval ? m.card?.title || m.card?.command || t.needsApprovalRow : titleOf(m),
        to: `/chat/${conn.id}`,
      });
    }
  }, [chats, path]);

  useEffect(() => {
    if (!item) return;
    haptic.tap();
    Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 8, tension: 70 }).start();
    clearTimeout(timer.current);
    timer.current = setTimeout(hide, VISIBLE_MS);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const hide = () => {
    if (!current.animations) return setItem(null);
    Animated.timing(y, { toValue: -160, duration: 200, useNativeDriver: true }).start(() => setItem(null));
  };

  if (!item) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[s.wrap, { top: insets.top + 6, transform: [{ translateY: y }] }]}>
      <Pressable
        style={s.banner}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        onPress={() => {
          hide();
          router.push(item.to as never);
        }}
      >
        <Avatar label={item.name} seed={item.conn.profile + item.conn.url} look={item.conn.look} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.sub} numberOfLines={1}>{item.kind ? `${item.name} · ${item.kind}` : item.name}</Text>
          <Text style={s.title} numberOfLines={1}>{item.title}</Text>
        </View>
        <Text style={s.view}>{t.view2}</Text>
      </Pressable>
    </Animated.View>
  );
}

function titleOf(m: Message): string {
  if (m.kind === 'media') return `📎 ${m.media?.name ?? ''}`;
  const { title, body } = splitTitle(m.text);
  return (title || body).replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
}

const useStyles = makeStyles((_c, fs) => ({
  wrap: { position: 'absolute', left: 10, right: 10, zIndex: 100 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 22, borderWidth: 1, borderColor: '#3A2380', backgroundColor: '#16004A', direction: isRTL ? 'rtl' : 'ltr',
  },
  sub: { color: '#C9BEEA', fontSize: fs(13), textAlign: isRTL ? 'right' : 'left' },
  title: { color: '#FFFFFF', fontSize: fs(15), fontWeight: '600', textAlign: isRTL ? 'right' : 'left' },
  view: { color: '#B88CFF', fontSize: fs(14), fontWeight: '700' },
}));
