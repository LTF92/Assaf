import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '../lib/i18n';
import { parsePairingLink } from '../lib/pairing';
import { useConnections } from '../lib/store';
import { colors, radius } from '../lib/theme';

export default function AddConnection() {
  const { add } = useConnections();
  const [permission, requestPermission] = useCameraPermissions();
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const pair = async (raw: string) => {
    if (busy.current) return;
    const payload = parsePairingLink(raw);
    if (!payload) {
      setError(t.invalidLink);
      return;
    }
    busy.current = true;
    const conn = await add(payload);
    router.dismissTo(`/chat/${conn.id}`);
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.title}>{t.scanQr}</Text>
      <View style={s.cameraBox}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => void pair(data)}
          />
        ) : (
          <View style={s.permission}>
            <Text style={s.permText}>{t.cameraNeeded}</Text>
            <Pressable style={s.btn} onPress={requestPermission}>
              <Text style={s.btnText}>{t.allowCamera}</Text>
            </Pressable>
          </View>
        )}
      </View>
      <Text style={s.or}>{t.pasteLink}</Text>
      <TextInput
        style={s.input}
        value={link}
        onChangeText={(v) => {
          setLink(v);
          setError(null);
        }}
        placeholder="hermesmobile://pair?d=…"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable style={[s.btn, !link && { opacity: 0.4 }]} disabled={!link} onPress={() => pair(link)}>
        <Text style={s.btnText}>{t.connect}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 14 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  cameraBox: { aspectRatio: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 },
  permText: { color: colors.textDim, textAlign: 'center' },
  or: { color: colors.textDim, marginTop: 6 },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  error: { color: colors.danger },
  btn: { backgroundColor: colors.accent, paddingVertical: 13, paddingHorizontal: 22, borderRadius: radius.pill, alignItems: 'center' },
  btnText: { color: colors.accentText, fontWeight: '800', fontSize: 16 },
});
