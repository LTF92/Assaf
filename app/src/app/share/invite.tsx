import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/Avatar';
import { Button, FieldLabel, ScreenHeader } from '../../components/Form';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/Segmented';
import type { DeviceInfo, GuestScope } from '../../lib/client';
import { haptic } from '../../lib/haptics';
import { isRTL, t } from '../../lib/i18n';
import { buildPairingLink } from '../../lib/pairing';
import { DURATIONS, durationKeyFor, scopeLabel, secondsLeft, spanText, type DurationKey } from '../../lib/share';
import { agentName, useChat, useConnections } from '../../lib/store';
import { colors, makeStyles, mono } from '../../lib/theme';

const SCOPES: { value: GuestScope; title: () => string; hint: () => string }[] = [
  { value: 'chat', title: () => t.scopeChat, hint: () => t.scopeChatHint },
  { value: 'read', title: () => t.scopeRead, hint: () => t.scopeReadHint },
  { value: 'full', title: () => t.scopeFull, hint: () => t.scopeFullHint },
];

/** Invite someone to one agent with a scope, topic and expiry, or edit an existing guest's limits. */
export default function InviteScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { id, device } = useLocalSearchParams<{ id: string; device?: string }>();
  const { connections } = useConnections();
  const conn = connections.find((c) => c.id === id);
  const { client, snap } = useChat(id);
  const [guest, setGuest] = useState<DeviceInfo | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<GuestScope>('read');
  const [topic, setTopic] = useState('');
  const [dur, setDur] = useState<DurationKey>('7d');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<{ link: string; expiresAt: number | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!device || !client) return;
    client.devices().then((list) => {
      const d = list.find((x) => x.id === device);
      if (!d) return;
      setGuest(d);
      setName(d.name);
      setScope(d.scope ?? 'full');
      setTopic(d.topic ?? '');
      setDur(durationKeyFor(d.expires_at));
    }).catch((e) => setError(String((e as Error).message)));
  }, [device, client]);

  if (!conn || !client) return <View style={s.screen} />;
  const label = agentName(conn, snap.profileLabel);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const limits = { scope, topic: topic.trim(), expires_in: DURATIONS[dur] };
    try {
      if (guest) {
        await client.updateGuest(guest.id, limits);
        router.back();
        return;
      }
      const inv = await client.invite(name.trim() || t.guest, limits);
      const expiresAt = inv.device.expires_at ?? null;
      const link = buildPairingLink({
        v: 1, url: conn.url, token: inv.token, profile: conn.profile, label, role: 'guest',
        scope, topic: limits.topic, exp: expiresAt, from: snap.ownerName || inv.profile?.owner || '',
      });
      haptic.success();
      setReady({ link, expiresAt });
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (ready) {
    const left = secondsLeft(ready.expiresAt);
    const details: [string, string][] = [
      [t.agent, label],
      [t.scope, scopeLabel(scope)],
      ...(topic.trim() ? [[t.topic, topic.trim()] as [string, string]] : []),
      [t.accessEnds, left == null ? t.noExpiry : t.inTime(spanText(left))],
    ];
    return (
      <View style={s.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
          <ScreenHeader title={t.inviteReady} size={24} />
          <View style={s.qr} accessibilityLabel={t.inviteReady}>
            <QRCode value={ready.link} size={176} backgroundColor="#FFFFFF" color="#16004A" />
          </View>
          <Text style={s.center}>{t.inviteScanHint}</Text>
          <View style={s.dl}>
            {details.map(([k, v], i) => (
              <View key={k} style={[s.dlRow, i > 0 && s.divider]}>
                <Text style={s.dt}>{k}</Text>
                <Text style={s.dd} numberOfLines={1}>{v}</Text>
              </View>
            ))}
          </View>
          <View style={s.linkRow}>
            <Text style={s.link} numberOfLines={1}>{ready.link}</Text>
            <Pressable style={s.copy} accessibilityLabel={t.copyLink} onPress={async () => {
              await Clipboard.setStringAsync(ready.link);
              haptic.tap();
              setCopied(true);
            }}>
              <Icon name={copied ? 'check' : 'copy'} size={18} color={colors.link} />
            </Pressable>
          </View>
          <Button icon="share" label={t.shareLink} onPress={() => void Share.share({ message: ready.link })} style={{ height: 54, marginTop: 8 }} />
          <Text style={s.center}>{t.inviteOnce}</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={guest ? t.editAccess : t.invitePerson} size={24} />
        <View style={s.agentCard}>
          <Avatar label={label} seed={conn.id} look={conn.look} size={44} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={s.agentName}>{label}</Text>
            <Text style={s.hint}>{t.agentOnly}</Text>
          </View>
        </View>

        {!guest && (
          <View style={s.field}>
            <FieldLabel>{t.guestName}</FieldLabel>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t.guestName} placeholderTextColor={colors.textDim} maxLength={40} />
          </View>
        )}

        <View style={s.field}>
          <FieldLabel>{t.scopeLabel}</FieldLabel>
          <View style={s.group} accessibilityRole="radiogroup">
            {SCOPES.map((o, i) => {
              const on = scope === o.value;
              return (
                <Pressable key={o.value} style={[s.radioRow, i > 0 && s.divider]} onPress={() => { haptic.tap(); setScope(o.value); }}
                  accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={s.radioTitle}>{o.title()}</Text>
                    <Text style={s.hint}>{o.hint()}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={s.field}>
          <FieldLabel>{t.topicLabel}</FieldLabel>
          <TextInput style={s.input} value={topic} onChangeText={setTopic} placeholder={t.topicPh} placeholderTextColor={colors.textDim} maxLength={120} />
        </View>

        <View style={s.field}>
          <FieldLabel>{t.duration}</FieldLabel>
          <Segmented label={t.duration} value={dur} onChange={setDur}
            options={[{ value: '24h', label: t.dur24h }, { value: '7d', label: t.dur7d }, { value: 'none', label: t.durNone }]} />
        </View>

        <View style={{ gap: 6, paddingHorizontal: 4 }}>
          {[t.promiseNoChats, t.promiseApprovals, t.promiseRevoke].map((p) => (
            <View key={p} style={s.promise}>
              <Icon name="check" size={16} color={colors.ok} strokeWidth={2.4} />
              <Text style={s.promiseText}>{p}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}
        <Button label={guest ? t.save : t.createInviteBtn} onPress={submit} disabled={busy || snap.status !== 'online'} style={{ height: 54, marginTop: 6 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    content: { paddingHorizontal: 20, gap: 12 },
    agentCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface },
    agentName: { color: colors.text, fontSize: fs(16), fontWeight: '700', textAlign: start },
    hint: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    field: { gap: 6 },
    input: { height: 48, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, fontSize: fs(16), textAlign: start },
    group: { borderRadius: 18, backgroundColor: colors.surface, overflow: 'hidden' },
    divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
    radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.switchOff, alignItems: 'center', justifyContent: 'center' },
    radioOn: { borderColor: colors.accent },
    radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
    radioTitle: { color: colors.text, fontSize: fs(16), fontWeight: '600', textAlign: start },
    promise: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    promiseText: { color: colors.text, fontSize: fs(14), flex: 1, textAlign: start },
    error: { color: colors.danger, fontSize: fs(14), textAlign: start },
    qr: { alignSelf: 'center', padding: 16, borderRadius: 28, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.surface3 },
    center: { color: colors.textDim, fontSize: fs(14), lineHeight: fs(21), textAlign: 'center' },
    dl: { borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden' },
    dlRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11, paddingHorizontal: 14 },
    dt: { color: colors.textDim, fontSize: fs(14) },
    dd: { color: colors.text, fontSize: fs(14), fontWeight: '600', flexShrink: 1 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingStart: 14, paddingEnd: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.surface3 },
    link: { flex: 1, color: colors.textDim, fontFamily: mono, fontSize: fs(13), writingDirection: 'ltr', textAlign: 'left' },
    copy: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  };
});
