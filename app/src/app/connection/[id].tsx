import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { StatusDot } from '../../components/StatusDot';
import { t } from '../../lib/i18n';
import { useChat, useConnections } from '../../lib/store';
import { colors, mono, radius, makeStyles } from '../../lib/theme';

export default function ConnectionSettings() {
  const s = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections, remove, rename } = useConnections();
  const conn = connections.find((c) => c.id === id);
  const { snap } = useChat(id);
  const [label, setLabel] = useState(conn?.label ?? '');
  if (!conn) return <View style={s.screen} />;

  const confirmRemove = () =>
    Alert.alert(t.remove, t.removeConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.remove, style: 'destructive', onPress: async () => { await remove(conn.id); router.dismissTo('/'); } },
    ]);

  return (
    <View style={s.screen}>
      <Field label={t.rename}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[s.input, { flex: 1 }]} value={label} onChangeText={setLabel} />
          <Pressable style={s.save} onPress={() => rename(conn.id, label.trim() || conn.label)}>
            <Text style={s.saveText}>{t.save}</Text>
          </Pressable>
        </View>
      </Field>
      <Field label={t.profile}><Text style={s.value}>{conn.profile}</Text></Field>
      <Field label={t.role}><Text style={s.value}>{conn.role === 'guest' ? t.guest : t.owner}{snap.deviceName ? ` · ${snap.deviceName}` : ''}</Text></Field>
      <Field label={t.address}>
        <Pressable onLongPress={() => Clipboard.setStringAsync(conn.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StatusDot status={snap.status} />
          <Text style={[s.value, { fontFamily: mono }]}>{conn.url}</Text>
        </Pressable>
        {snap.lastError ? <Text style={s.err}>{snap.lastError}</Text> : null}
      </Field>
      {snap.role === 'owner' ? (
        <Pressable style={s.share} onPress={() => router.push(`/share/${conn.id}`)}>
          <Text style={s.shareText}>{t.share}</Text>
        </Pressable>
      ) : null}
      <Pressable style={s.remove} onPress={confirmRemove}>
        <Text style={s.removeText}>{t.remove}</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => ({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 20 },
  label: { color: colors.textFaint, fontSize: fs(12), textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { color: colors.text, fontSize: fs(16) },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: fs(16) },
  save: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 16, justifyContent: 'center' },
  saveText: { color: colors.accentText, fontWeight: '800' },
  err: { color: colors.danger, fontSize: fs(13) },
  share: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 13, alignItems: 'center' },
  shareText: { color: colors.accentText, fontWeight: '800', fontSize: fs(16) },
  remove: { marginTop: 'auto', borderWidth: 1, borderColor: colors.danger, borderRadius: radius.pill, paddingVertical: 13, alignItems: 'center' },
  removeText: { color: colors.danger, fontWeight: '700', fontSize: fs(16) },
}));
