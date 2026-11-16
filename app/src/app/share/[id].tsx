import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FieldLabel, ScreenHeader } from '../../components/Form';
import { Appear } from '../../components/motion';
import type { DeviceInfo } from '../../lib/client';
import { isRTL, t } from '../../lib/i18n';
import { initial, scopeLabel, secondsLeft, spanText } from '../../lib/share';
import { agentName, useChat, useConnections } from '../../lib/store';
import { timeLabel } from '../../lib/time';
import { avatarPalette, avatarInk, colors, makeStyles } from '../../lib/theme';

/** Owner-only: who this agent is shared with, their limits, and invites not used yet. */
export default function ShareManage() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections } = useConnections();
  const conn = connections.find((c) => c.id === id);
  const { client, snap } = useChat(id);
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const online = snap.status === 'online';

  const refresh = useCallback(async () => {
    if (!client || !online) return;
    try {
      setDevices(await client.devices());
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, [client, online]);

  useFocusEffect(useCallback(() => void refresh(), [refresh]));

  if (!conn || !client) return <View style={s.screen} />;
  const label = agentName(conn, snap.profileLabel);
  const guests = (devices ?? []).filter((d) => d.role === 'guest');
  const active = guests.filter((d) => d.last_seen != null);
  const pending = guests.filter((d) => d.last_seen == null);

  const revoke = (d: DeviceInfo, pendingInvite = false) =>
    Alert.alert(pendingInvite ? t.unusedInvite : d.name, pendingInvite ? undefined : t.revokeGuestQ(d.name), [
      { text: t.cancel, style: 'cancel' },
      { text: t.revokeAccess, style: 'destructive', onPress: async () => setDevices(await client.revokeDevice(d.id)) },
    ]);

  const invite = (device?: string) => router.push({ pathname: '/share/invite', params: device ? { id, device } : { id } });

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 }]}>
        <ScreenHeader title={t.shareTitle(label)} size={24} onPlus={online && snap.role === 'owner' ? () => invite() : undefined} plusLabel={t.invitePerson} />
        <Text style={s.intro}>{t.shareIntro}</Text>
        {snap.role !== 'owner' ? <Text style={s.error}>{t.ownerOnly}</Text> : null}
        {!online ? <Text style={s.error}>{t.needOnline}</Text> : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        {online && devices == null && !error ? <ActivityIndicator color={colors.link} style={{ marginTop: 30 }} /> : null}

        {devices != null && guests.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyText}>{t.noGuests}</Text>
            <Pressable style={s.emptyBtn} onPress={() => invite()} accessibilityRole="button">
              <Text style={s.emptyBtnText}>{t.invitePerson}</Text>
            </Pressable>
          </View>
        )}

        {active.length > 0 && <FieldLabel>{t.haveAccess}</FieldLabel>}
        {active.map((d, i) => {
          const left = secondsLeft(d.expires_at);
          const bg = avatarPalette[i % avatarPalette.length];
          const ends = d.expired ? t.accessExpired : left == null ? t.noExpiry : t.endsIn(spanText(left));
          const seen = d.online ? t.online : t.lastActive(timeLabel(d.last_seen ?? undefined));
          return (
            <Appear key={d.id} delay={i * 40}>
              <View style={s.card}>
                <View style={s.cardTop}>
                  <View style={[s.face, { backgroundColor: bg }]}><Text style={[s.faceText, { color: avatarInk(bg) }]}>{initial(d.name)}</Text></View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={s.name} numberOfLines={1}>{d.name}</Text>
                    <Text style={s.meta} numberOfLines={1}>{ends} · {seen}</Text>
                  </View>
                </View>
                <Text style={s.scope}>{scopeLabel(d.scope)} · {d.topic || t.noTopic}</Text>
                <View style={s.actions}>
                  <Pressable style={s.action} onPress={() => invite(d.id)} accessibilityRole="button">
                    <Text style={s.actionText}>{t.editScope}</Text>
                  </Pressable>
                  <Pressable style={s.action} onPress={() => revoke(d)} accessibilityRole="button">
                    <Text style={[s.actionText, { color: colors.danger }]}>{t.revokeAccess}</Text>
                  </Pressable>
                </View>
              </View>
            </Appear>
          );
        })}

        {pending.length > 0 && <FieldLabel>{t.pendingInvites}</FieldLabel>}
        {pending.map((d) => {
          const left = secondsLeft(d.expires_at);
          return (
            <View key={d.id} style={s.pending}>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={s.pendingTitle} numberOfLines={1}>{d.name && d.name !== t.guest ? `${t.unusedInvite} · ${d.name}` : t.unusedInvite}</Text>
                <Text style={s.meta}>{scopeLabel(d.scope)} · {left == null ? t.noExpiry : t.endsIn(spanText(left))}</Text>
              </View>
              <Pressable style={s.cancel} onPress={() => revoke(d, true)} accessibilityRole="button">
                <Text style={[s.actionText, { color: colors.danger }]}>{t.cancel}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    content: { paddingHorizontal: 20, gap: 12 },
    intro: { color: colors.textDim, fontSize: fs(14), lineHeight: fs(22), textAlign: start, marginBottom: 4 },
    error: { color: colors.danger, fontSize: fs(14), textAlign: start },
    card: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.surface },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    face: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    faceText: { fontSize: fs(17), fontWeight: '700' },
    name: { color: colors.text, fontSize: fs(16), fontWeight: '700', textAlign: start },
    meta: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    scope: { color: colors.text, fontSize: fs(14), fontWeight: '600', textAlign: start },
    actions: { flexDirection: 'row', gap: 8 },
    action: { flex: 1, height: 44, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: colors.text, fontSize: fs(14), fontWeight: '600' },
    pending: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingStart: 14, paddingEnd: 4, minHeight: 60, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B88CFF' },
    pendingTitle: { color: colors.text, fontSize: fs(15), fontWeight: '600', textAlign: start },
    cancel: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
    empty: { alignItems: 'center', gap: 12, padding: 22, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B88CFF' },
    emptyText: { color: colors.textDim, fontSize: fs(15), textAlign: 'center' },
    emptyBtn: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.accent, justifyContent: 'center' },
    emptyBtnText: { color: '#FFFFFF', fontSize: fs(15), fontWeight: '600' },
  };
});
