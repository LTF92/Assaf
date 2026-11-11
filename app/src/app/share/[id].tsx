import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import type { DeviceInfo } from '../../lib/client';
import { t } from '../../lib/i18n';
import { buildPairingLink } from '../../lib/pairing';
import { useChat, useConnections } from '../../lib/store';
import { colors, radius } from '../../lib/theme';

/** Owner-only: give someone access to THIS profile (guest QR), and see / revoke paired devices. */
export default function ShareProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections } = useConnections();
  const conn = connections.find((c) => c.id === id);
  const { client, snap } = useChat(id);
  const [name, setName] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const online = snap.status === 'online';

  const refresh = useCallback(async () => {
    if (!client || !online) return;
    try {
      setDevices(await client.devices());
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, [client, online]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!conn || !client) return <View style={s.screen} />;
  if (snap.role !== 'owner') return <View style={s.screen}><Text style={s.hint}>{t.ownerOnly}</Text></View>;

  const create = async () => {
    setError(null);
    try {
      const inv = await client.invite(name.trim() || t.guest);
      setLink(buildPairingLink({ v: 1, url: conn.url, token: inv.token, profile: conn.profile,
        label: snap.profileLabel || conn.label, role: 'guest' }));
      setName('');
      void refresh();
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  const revoke = (d: DeviceInfo) =>
    Alert.alert(d.name, t.revokeConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.revoke, style: 'destructive', onPress: async () => setDevices(await client.revokeDevice(d.id)) },
    ]);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text style={s.hint}>{t.shareHint}</Text>
      {!online ? <Text style={s.error}>{t.needOnline}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[s.input, { flex: 1 }]} value={name} onChangeText={setName} placeholder={t.guestName}
          placeholderTextColor={colors.textFaint} />
        <Pressable style={[s.btn, !online && { opacity: 0.4 }]} disabled={!online} onPress={create}>
          <Text style={s.btnText}>{t.createInvite}</Text>
        </Pressable>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {link ? (
        <View style={s.qrBox}>
          <View style={s.qrBg}><QRCode value={link} size={220} backgroundColor="#FFFFFF" color="#0B0D12" /></View>
          <Pressable style={s.btnOutline} onPress={() => Share.share({ message: link })}>
            <Text style={s.btnOutlineText}>{t.shareLink}</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={s.section}>{t.devices}</Text>
      {devices.map((d) => (
        <View key={d.id} style={s.device}>
          <View style={[s.dot, { backgroundColor: d.online ? colors.ok : colors.textFaint }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.devName}>{d.name}{d.me ? ` (${t.thisDevice})` : ''}</Text>
            <Text style={s.devMeta}>{d.role === 'guest' ? t.guest : t.owner}</Text>
          </View>
          {!d.me ? (
            <Pressable onPress={() => revoke(d)} hitSlop={8}><Text style={s.revoke}>{t.revoke}</Text></Pressable>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hint: { color: colors.textDim, fontSize: 14, lineHeight: 20, padding: 4 },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: 'center' },
  btnText: { color: colors.accentText, fontWeight: '800' },
  btnOutline: { borderWidth: 1, borderColor: colors.accent, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 22 },
  btnOutlineText: { color: colors.accent, fontWeight: '700' },
  error: { color: colors.danger },
  qrBox: { alignItems: 'center', gap: 14, paddingVertical: 8 },
  qrBg: { padding: 14, backgroundColor: '#FFFFFF', borderRadius: radius.md },
  section: { color: colors.textFaint, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  device: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  devName: { color: colors.text, fontSize: 16 },
  devMeta: { color: colors.textFaint, fontSize: 12 },
  revoke: { color: colors.danger, fontWeight: '600' },
});
