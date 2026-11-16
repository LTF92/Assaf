import { router, Stack } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Appear, PressScale } from '../components/motion';
import { isRTL, t } from '../lib/i18n';
import { useAllChats, useInbox } from '../lib/inbox';
import { preview } from '../lib/rows';
import { agentName, portOf, useConnections } from '../lib/store';
import { timeLabel } from '../lib/time';
import { colors, makeStyles, mono } from '../lib/theme';
import type { ClientSnapshot } from '../lib/client';
import type { Connection } from '../lib/types';
import { guestLimits, scopeLabel, secondsLeft, spanText } from '../lib/share';

const LOGO = require('../../assets/logo.png');

function lastLine(snap: ClientSnapshot | undefined): { text: string; waiting: boolean; busy: boolean } {
  if (!snap) return { text: '', waiting: false, busy: false };
  const waiting = snap.messages.some((m) => m.card?.state === 'pending');
  if (waiting) return { text: t.waitingApproval, waiting, busy: snap.typing };
  if (snap.typing) return { text: t.typing, waiting, busy: true };
  const last = preview(snap.messages);
  const raw = !last ? '' : last.kind === 'media' ? `📎 ${last.media?.name ?? ''}` : last.text;
  const text = raw.replace(/[-:|]{3,}/g, ' ').replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
  return { text: text || t.emptyChat, waiting, busy: false };
}

function AgentRow({ conn, snap, index, first }: { conn: Connection; snap?: ClientSnapshot; index: number; first: boolean }) {
  const s = useStyles();
  const name = agentName(conn, snap?.profileLabel);
  const line = lastLine(snap);
  const last = snap ? preview(snap.messages) : undefined;
  return (
    <Appear delay={index * 50} from={12}>
      {!first && <View style={s.sep} />}
      <PressScale style={s.row} to={0.98} onPress={() => router.push(`/chat/${conn.id}`)} accessibilityRole="button" accessibilityLabel={name}>
        <View>
          <Avatar label={name} seed={conn.profile + conn.url} look={conn.look} size={52} />
          {snap?.status !== 'online' && <View style={s.offDot} />}
        </View>
        <View style={s.rowBody}>
          <View style={s.line}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            <Text style={s.time}>{timeLabel(last?.ts)}</Text>
          </View>
          <View style={s.line}>
            <Text style={[s.preview, line.busy && !line.waiting && { color: colors.link }]} numberOfLines={1}>{line.text}</Text>
            {line.waiting && <View style={s.dot} accessibilityLabel={t.approvalNeeded} />}
          </View>
          <Text style={s.port}>{portOf(conn)}</Text>
        </View>
      </PressScale>
    </Appear>
  );
}

function StatusCard({ chats }: { chats: { conn: Connection; snap?: ClientSnapshot }[] }) {
  const s = useStyles();
  const owners = chats.filter((c) => c.conn.role !== 'guest');
  const guests = chats.filter((c) => c.conn.role === 'guest');
  const online = owners.filter((c) => c.snap?.status === 'online').length;
  const host = chats.find((c) => c.snap?.hostName)?.snap?.hostName;
  const ts = chats.some((c) => /\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(c.conn.url) || c.conn.url.includes('.ts.net'));
  const allUp = online === chats.length;
  return (
    <View style={s.status}>
      <View style={s.statusIcon}><Icon name="laptop" color={colors.link} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={s.statusTitle} numberOfLines={1}>{host || t.agentsCount(chats.length)}</Text>
        <Text style={s.statusSub} numberOfLines={1}>{(ts ? t.viaTailscale : t.viaNetwork)}</Text>
      </View>
      <View style={s.pill}>
        <View style={[s.pillDot, { backgroundColor: online === 0 ? colors.switchOff : allUp ? colors.okDot : colors.link }]} />
        <Text style={[s.pillText, { color: online === 0 ? colors.textDim : allUp ? colors.ok : colors.link }]}>
          {online === 0 ? t.offline : allUp ? t.online : t.agentsOnline(online)}
        </Text>
      </View>
    </View>
  );
}

function GuestCard({ conn, snap, index }: { conn: Connection; snap?: ClientSnapshot; index: number }) {
  const s = useStyles();
  const name = agentName(conn, snap?.profileLabel);
  const limits = guestLimits(conn, snap);
  const from = snap?.ownerName || conn.invite?.from || '';
  const on = snap?.status === 'online';
  const left = secondsLeft(limits.expires_at);
  const chips = [scopeLabel(limits.scope), limits.topic || '', left == null ? '' : t.endsIn(spanText(left))].filter(Boolean);
  return (
    <Appear delay={index * 50} from={12}>
      <PressScale style={s.guestCard} to={0.98} onPress={() => router.push(`/chat/${conn.id}`)} accessibilityRole="button" accessibilityLabel={name}>
        <View style={s.guestTop}>
          <Avatar label={name} seed={conn.profile + conn.url} look={conn.look} size={52} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            <Text style={s.preview} numberOfLines={1}>{from ? t.sharedBy(from) : t.sharedAgent}</Text>
          </View>
          <View style={s.guestStatus}>
            <View style={[s.pillDot, { backgroundColor: on ? colors.okDot : colors.switchOff }]} />
            <Text style={[s.pillText, { color: on ? colors.ok : colors.textDim }]}>{on ? t.online : t.offline}</Text>
          </View>
        </View>
        <View style={s.chips}>
          {chips.map((c) => <View key={c} style={s.chip}><Text style={s.chipText} numberOfLines={1}>{c}</Text></View>)}
        </View>
      </PressScale>
    </Appear>
  );
}

function GuestSection({ guests, alone }: { guests: { conn: Connection; snap?: ClientSnapshot }[]; alone: boolean }) {
  const s = useStyles();
  return (
    <>
      <Text style={[s.h2, { marginBottom: -6 }]}>{t.sharedWithYou}</Text>
      {guests.map(({ conn, snap }, i) => <GuestCard key={conn.id} conn={conn} snap={snap} index={i} />)}
      {alone && (
        <View style={s.ownCard}>
          <Text style={s.ownTitle}>{t.haveOwnAgents}</Text>
          <Text style={s.ownHint}>{t.haveOwnHint}</Text>
          <PressScale style={s.ownBtn} onPress={() => router.push('/add')} accessibilityRole="button">
            <Text style={s.ownBtnText}>{t.pairMyDevice}</Text>
          </PressScale>
        </View>
      )}
    </>
  );
}

function Welcome() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const feats: [Parameters<typeof Icon>[0]['name'], string][] = [['lock', t.feat1], ['chat', t.feat2], ['shieldCheck', t.feat3]];
  return (
    <View style={[s.screen, s.welcome, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      <View style={s.welcomeMain}>
        <Appear scale from={16}><Image source={LOGO} style={{ width: 112, height: 112, borderRadius: 30 }} /></Appear>
        <Appear delay={80} style={{ alignItems: 'center', gap: 12 }}>
          <Text style={s.welcomeTitle}>{t.welcomeTitle}</Text>
          <Text style={s.welcomeBody}>{t.welcomeBody}</Text>
        </Appear>
        <Appear delay={160} style={{ alignSelf: 'stretch', gap: 14 }}>
          {feats.map(([icon, text]) => (
            <View key={icon} style={s.feat}>
              <View style={s.featIcon}><Icon name={icon} size={18} color={colors.link} /></View>
              <Text style={s.featText}>{text}</Text>
            </View>
          ))}
        </Appear>
      </View>
      <Appear delay={240} style={{ gap: 12 }}>
        <PressScale haptic style={s.primary} onPress={() => router.push('/add')} accessibilityRole="button">
          <Icon name="qr" size={20} color="#FFFFFF" strokeWidth={2} />
          <Text style={s.primaryText}>{t.scanFromMac}</Text>
        </PressScale>
        <PressScale style={s.secondary} onPress={() => router.push('/add?paste=1')} accessibilityRole="button">
          <Icon name="clipboard" size={20} color={colors.text} />
          <Text style={s.secondaryText}>{t.pastePairLink}</Text>
        </PressScale>
        <Text style={s.note}>{t.tailscaleNeeded}</Text>
      </Appear>
    </View>
  );
}

export default function Home() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const chats = useAllChats();
  const { unread } = useInbox();
  const { ready } = useConnections();

  if (!ready) return <View style={s.screen} />;
  if (chats.length === 0) {
    return (<><Stack.Screen options={{ headerShown: false }} /><Welcome /></>);
  }
  const owners = chats.filter((c) => c.conn.role !== 'guest');
  const guests = chats.filter((c) => c.conn.role === 'guest');
  const online = owners.filter((c) => c.snap?.status === 'online').length;

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={s.header}>
          <View style={s.brand}>
            <Image source={LOGO} style={s.logo} accessibilityLabel={t.appName} />
            <Text style={s.h1} accessibilityRole="header">{t.appName}</Text>
          </View>
          <View style={s.headerBtns}>
            <PressScale haptic to={0.9} style={s.roundBtn} onPress={() => router.push('/add')} accessibilityLabel={t.addAgent}>
              <Icon name="plus" size={22} color={colors.text} />
            </PressScale>
            <PressScale haptic to={0.9} style={s.roundBtn} onPress={() => router.push('/settings')} accessibilityLabel={t.appSettings}>
              <Icon name="settings" size={22} color={colors.text} fill={colors.surface} />
            </PressScale>
          </View>
        </View>

        {owners.length > 0 && (
          <>
            <StatusCard chats={owners} />

            <PressScale to={0.98} style={s.inbox} onPress={() => router.push('/inbox')} accessibilityRole="button" accessibilityLabel={t.inboxOpen}>
              <Icon name="inbox" size={26} color="#FFFFFF" />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={s.inboxTitle}>{t.inbox}</Text>
                <Text style={s.inboxSub} numberOfLines={1}>{t.inboxHint}</Text>
              </View>
              {unread > 0 && (
                <View style={s.badge} accessibilityLabel={t.newUpdates(unread)}>
                  <Text style={s.badgeText}>{unread.toLocaleString(isRTL ? 'ar' : 'en')}</Text>
                </View>
              )}
            </PressScale>

            <View style={s.sectionHead}>
              <Text style={s.h2}>{t.agents}</Text>
              <Text style={s.sectionMeta}>{t.agentsOnline(online)}</Text>
            </View>

            <View style={{ marginTop: -8 }}>
              {owners.map(({ conn, snap }, i) => (
                <AgentRow key={conn.id} conn={conn} snap={snap} index={i} first={i === 0} />
              ))}
            </View>
          </>
        )}

        {guests.length > 0 && <GuestSection guests={guests} alone={owners.length === 0} />}

        <View style={s.footer}>
          <Icon name="lock" size={16} color={colors.textDim} />
          <Text style={s.footerText}>{owners.length ? t.privateFooter : t.guestFooter}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const dir = isRTL ? 'rtl' : 'ltr';
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: dir },
    content: { paddingHorizontal: 20, gap: 20, flexGrow: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    logo: { width: 40, height: 40, borderRadius: 11 },
    h1: { color: colors.text, fontSize: fs(30), fontWeight: '700' },
    headerBtns: { flexDirection: 'row', gap: 8 },
    roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },

    status: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.surface },
    guestCard: { gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.surface },
    guestTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    guestStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.bg, maxWidth: '100%' },
    chipText: { color: colors.text, fontSize: fs(13), fontWeight: '600' },
    ownCard: { alignItems: 'center', gap: 10, paddingVertical: 22, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B88CFF' },
    ownTitle: { color: colors.text, fontSize: fs(15), fontWeight: '600', textAlign: 'center' },
    ownHint: { color: colors.textDim, fontSize: fs(14), lineHeight: fs(22), textAlign: 'center' },
    ownBtn: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.bg, justifyContent: 'center' },
    ownBtnText: { color: colors.text, fontSize: fs(15), fontWeight: '600' },
    statusIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    statusTitle: { color: colors.text, fontSize: fs(16), fontWeight: '600', textAlign: start },
    statusSub: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.bg },
    pillDot: { width: 8, height: 8, borderRadius: 4 },
    pillText: { fontSize: fs(13), fontWeight: '600' },

    inbox: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.accent },
    inboxTitle: { color: '#FFFFFF', fontSize: fs(17), fontWeight: '600', textAlign: start },
    inboxSub: { color: '#EFE6FF', fontSize: fs(13), textAlign: start },
    badge: { minWidth: 26, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: '#16004A', fontSize: fs(14), fontWeight: '700' },

    sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 },
    h2: { color: colors.textDim, fontSize: fs(14), fontWeight: '600' },
    sectionMeta: { color: colors.textDim, fontSize: fs(13) },

    sep: { height: 1, backgroundColor: colors.border, marginStart: 70 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 4, minHeight: 64 },
    rowBody: { flex: 1, minWidth: 0, gap: 3 },
    line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    name: { color: colors.text, fontSize: fs(17), fontWeight: '600', flexShrink: 1, textAlign: start },
    time: { color: colors.textDim, fontSize: fs(13) },
    preview: { color: colors.textDim, fontSize: fs(14), flex: 1, textAlign: start },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
    port: { alignSelf: 'flex-start', color: colors.textDim, fontSize: fs(12), fontFamily: mono, writingDirection: 'ltr' },
    offDot: { position: 'absolute', bottom: -2, end: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.switchOff, borderWidth: 2.5, borderColor: colors.bg },

    footer: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 12 },
    footerText: { color: colors.textDim, fontSize: fs(13), textAlign: 'center', flexShrink: 1 },

    welcome: { paddingHorizontal: 24 },
    welcomeMain: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 },
    welcomeTitle: { color: colors.text, fontSize: fs(34), fontWeight: '700', textAlign: 'center', lineHeight: fs(42) },
    welcomeBody: { color: colors.textDim, fontSize: fs(17), lineHeight: fs(27), textAlign: 'center', maxWidth: 300 },
    feat: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    featIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    featText: { color: colors.text, fontSize: fs(15), flex: 1, textAlign: start },
    primary: { height: 56, borderRadius: 18, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    primaryText: { color: '#FFFFFF', fontSize: fs(17), fontWeight: '600' },
    secondary: { height: 56, borderRadius: 18, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    secondaryText: { color: colors.text, fontSize: fs(17), fontWeight: '600' },
    note: { color: colors.textDim, fontSize: fs(13), textAlign: 'center', marginTop: 4 },
  };
});
