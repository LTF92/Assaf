import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { PressScale } from '../components/motion';
import { isRTL, t } from '../lib/i18n';
import { parsePairingLink } from '../lib/pairing';
import { useConnections } from '../lib/store';
import { colors, makeStyles, mono } from '../lib/theme';

/** Pair a Hermes profile: scan the QR the Mac shows, or paste the link copied there. */
export default function AddConnection() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { paste } = useLocalSearchParams<{ paste?: string }>();
  const { add } = useConnections();
  const [permission, requestPermission] = useCameraPermissions();
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const pair = async (raw: string) => {
    if (busy.current) return;
    const payload = parsePairingLink(raw.trim());
    if (!payload) {
      setError(t.invalidLink);
      return;
    }
    busy.current = true;
    try {
      const conn = await add(payload);
      router.dismissTo(`/chat/${conn.id}`); // stay busy: the camera keeps firing until unmount
    } catch (e) {
      busy.current = false;
      setError(String(e));
    }
  };

  // Copy the link on the Mac, paste here (Universal Clipboard): pairs straight away.
  const pasteFromClipboard = async () => {
    const text = ((await Clipboard.getStringAsync()) || '').trim();
    if (!parsePairingLink(text)) {
      setError(t.clipboardNoLink);
      return;
    }
    setLink(text);
    setError(null);
    await pair(text);
  };

  useEffect(() => {
    if (paste) void pasteFromClipboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paste]);

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 14 : insets.top + 8 }]}>
        <Text style={s.h1} accessibilityRole="header">{t.pairTitle}</Text>
        <PressScale style={s.close} onPress={() => router.back()} accessibilityLabel={t.cancel}>
          <Icon name="close" size={20} color={colors.text} strokeWidth={2} />
        </PressScale>
      </View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={s.cameraBox} accessibilityLabel={t.cameraPreview}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => void pair(data)}
            />
          ) : (
            <View style={s.permission}>
              <Icon name="qr" size={40} color="#B88CFF" />
              <Text style={s.permText}>{t.cameraNeeded}</Text>
              <PressScale style={s.permBtn} onPress={requestPermission}>
                <Text style={s.permBtnText}>{t.allowCamera}</Text>
              </PressScale>
            </View>
          )}
          {/* viewfinder corners */}
          <View pointerEvents="none" style={s.frame}>
            <View style={[s.corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 }]} />
            <View style={[s.corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 }]} />
            <View style={[s.corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 }]} />
            <View style={[s.corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 }]} />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.title}>{t.pointCamera}</Text>
          <Text style={s.hint}>{t.pointCameraHint}</Text>
        </View>

        <View style={s.card}>
          <View style={s.cardHead}>
            <View style={s.cardIcon}><Icon name="clipboard" size={18} color={colors.link} /></View>
            <Text style={s.cardTitle}>{t.clipboardCheck}</Text>
          </View>
          <PressScale haptic style={s.primary} onPress={() => void pasteFromClipboard()} accessibilityRole="button">
            <Text style={s.primaryText}>{t.pasteAndPair}</Text>
          </PressScale>
          <TextInput
            style={s.input}
            value={link}
            onChangeText={(v) => {
              setLink(v);
              setError(null);
            }}
            onSubmitEditing={() => link && void pair(link)}
            returnKeyType="go"
            placeholder="hermesmobile://pair?d=…"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {link ? (
            <Pressable style={s.secondary} onPress={() => void pair(link)} accessibilityRole="button">
              <Text style={s.secondaryText}>{t.connect}</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={s.error}>{error}</Text> : null}
        </View>

        <View style={s.note}>
          <Icon name="lock" size={14} color={colors.textDim} />
          <Text style={s.noteText}>{t.linkOnce}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
    h1: { color: colors.text, fontSize: fs(22), fontWeight: '700' },
    close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: 20, gap: 18, paddingTop: 8 },
    cameraBox: { aspectRatio: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: '#16004A' },
    permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
    permText: { color: '#FFFFFF', textAlign: 'center', fontSize: fs(15) },
    permBtn: { backgroundColor: '#FFFFFF', height: 44, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center' },
    permBtnText: { color: '#16004A', fontWeight: '600', fontSize: fs(15) },
    frame: { position: 'absolute', top: '18%', left: '18%', right: '18%', bottom: '18%' },
    corner: { position: 'absolute', width: 44, height: 44, borderColor: '#FFFFFF' },
    title: { color: colors.text, fontSize: fs(18), fontWeight: '700', textAlign: start },
    hint: { color: colors.textDim, fontSize: fs(15), lineHeight: fs(22), textAlign: start },
    card: { borderRadius: 20, backgroundColor: colors.surface, padding: 14, gap: 12 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { color: colors.text, fontSize: fs(16), fontWeight: '600', flex: 1, textAlign: start },
    primary: { height: 50, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: '#FFFFFF', fontSize: fs(16), fontWeight: '600' },
    input: { height: 46, borderRadius: 14, backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 14, fontSize: fs(13), fontFamily: mono, textAlign: 'left', writingDirection: 'ltr' },
    secondary: { height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: colors.link, fontSize: fs(15), fontWeight: '600' },
    error: { color: colors.danger, fontSize: fs(14), textAlign: start },
    note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    noteText: { color: colors.textDim, fontSize: fs(13), textAlign: 'center' },
  };
});
