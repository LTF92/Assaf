import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Button } from '../components/Form';
import { Icon } from '../components/Icon';
import { Appear } from '../components/motion';
import { isRTL, t } from '../lib/i18n';
import { httpBase, parsePairingLink } from '../lib/pairing';
import { scopeLabel, secondsLeft, spanText } from '../lib/share';
import { useConnections } from '../lib/store';
import { colors, makeStyles } from '../lib/theme';

/** A guest invite: who shares which agent, within what limits. Joining only happens on Accept. */
export default function JoinScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { link } = useLocalSearchParams<{ link?: string }>();
  const payload = useMemo(() => parsePairingLink(String(link || '')), [link]);
  const { add } = useConnections();
  const [reach, setReach] = useState<'checking' | 'ok' | 'down'>('checking');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!payload) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    fetch(`${httpBase(payload)}/health`, { signal: ctl.signal })
      .then((r) => setReach(r.ok ? 'ok' : 'down'))
      .catch(() => setReach('down'))
      .finally(() => clearTimeout(timer));
    return () => ctl.abort();
  }, [payload]);

  if (!payload) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={s.error}>{t.invalidLink}</Text>
        <Button kind="link" label={t.cancel} onPress={() => router.back()} />
      </View>
    );
  }

  const agent = payload.label;
  const left = secondsLeft(payload.exp);
  const can = payload.scope === 'chat' ? t.guestCanChat(agent) : payload.scope === 'read' ? t.guestCanRead(agent) : t.guestCanFull(agent);
  const cant = payload.scope === 'chat' ? t.guestCantChat : payload.scope === 'read' ? t.guestCantRead : t.guestCantFull;
  const details: [string, string][] = [
    [t.scope, scopeLabel(payload.scope)],
    ...(payload.topic ? [[t.topic, payload.topic] as [string, string]] : []),
    [t.accessEnds, left == null ? t.noExpiry : t.inTime(spanText(left))],
  ];

  const accept = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const conn = await add(payload);
      router.dismissTo(`/chat/${conn.id}`);
    } catch (e) {
      busy.current = false;
      setError(String(e));
    }
  };

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}>
        <Appear scale>
          <View style={s.hero}>
            <Avatar label={agent} seed={payload.url + payload.profile} size={88} />
            <Text style={s.h1}>{t.invitesYou(payload.from || '', agent)}</Text>
            <Text style={s.intro}>{t.guestIntro}</Text>
          </View>
        </Appear>
        <View style={s.dl}>
          {details.map(([k, v], i) => (
            <View key={k} style={[s.dlRow, i > 0 && s.divider]}>
              <Text style={s.dt}>{k}</Text>
              <Text style={s.dd} numberOfLines={1}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: 8, paddingHorizontal: 4 }}>
          <View style={s.li}><Icon name="check" size={16} color={colors.ok} strokeWidth={2.4} /><Text style={s.liText}>{can}</Text></View>
          <View style={s.li}><Icon name="x" size={16} color={colors.textDim} strokeWidth={2.4} /><Text style={s.liText}>{cant}</Text></View>
          <View style={s.li}><Icon name="x" size={16} color={colors.textDim} strokeWidth={2.4} /><Text style={s.liText}>{t.guestCantSee}</Text></View>
        </View>
        <View style={s.reach}>
          <Icon name="lock" size={18} color={colors.link} />
          <Text style={s.reachText}>{t.privateToOwner}</Text>
          {reach === 'checking' ? (
            <Text style={s.dim}>…</Text>
          ) : (
            <View style={s.status}>
              <View style={[s.dot, { backgroundColor: reach === 'ok' ? colors.okDot : colors.switchOff }]} />
              <Text style={[s.statusText, { color: reach === 'ok' ? colors.ok : colors.textDim }]}>{reach === 'ok' ? t.ready : t.offline}</Text>
            </View>
          )}
        </View>
        {reach === 'down' ? <Text style={s.dim}>{t.tailscaleNeeded}</Text> : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={{ gap: 8, marginTop: 10 }}>
          <Button label={t.acceptInvite} onPress={accept} style={{ height: 54 }} />
          <Button kind="link" label={t.decline} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <Text style={s.foot}>{t.ownerCanRevoke}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    content: { paddingHorizontal: 20, gap: 14 },
    hero: { alignItems: 'center', gap: 12 },
    h1: { color: colors.text, fontSize: fs(26), fontWeight: '700', lineHeight: fs(34), textAlign: 'center' },
    intro: { color: colors.textDim, fontSize: fs(15), lineHeight: fs(24), textAlign: 'center', maxWidth: 300 },
    dl: { borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
    divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
    dlRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, paddingHorizontal: 14 },
    dt: { color: colors.textDim, fontSize: fs(14) },
    dd: { color: colors.text, fontSize: fs(14), fontWeight: '600', flexShrink: 1 },
    li: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    liText: { color: colors.text, fontSize: fs(14), flex: 1, textAlign: start },
    reach: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.surface3 },
    reachText: { color: colors.text, fontSize: fs(14), flex: 1, textAlign: start },
    status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: fs(14), fontWeight: '600' },
    dim: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    error: { color: colors.danger, fontSize: fs(14), textAlign: 'center' },
    foot: { color: colors.textDim, fontSize: fs(13), lineHeight: fs(19), textAlign: 'center' },
  };
});
