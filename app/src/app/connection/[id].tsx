import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { StatusDot } from '../../components/StatusDot';
import { isRTL, t } from '../../lib/i18n';
import { agentName, portOf, useChat, useConnections } from '../../lib/store';
import { avatarPalette, colors, makeStyles, mono } from '../../lib/theme';
import type { AgentLook } from '../../lib/types';

const EMOJIS = ['🦅', '🦊', '🦉', '🐝', '🤖', '🧠', '🚀', '🔧', '📚', '🧭', '🎯'];
const SWATCH_NAMES = ['violet', 'deep violet', 'lavender', 'light lavender'];

/** Customise how an agent looks on this phone, plus its connection details. */
export default function AgentScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { connections, remove, customize } = useConnections();
  const conn = connections.find((c) => c.id === id);
  const { snap } = useChat(id);
  const base = conn?.look;
  const [kind, setKind] = useState<AgentLook['kind']>(base?.kind ?? 'letter');
  const [emoji, setEmoji] = useState(base?.emoji ?? EMOJIS[0]);
  const [photo, setPhoto] = useState(base?.photo);
  const [bg, setBg] = useState(base?.bg ?? avatarPalette[0]);
  const [name, setName] = useState(base?.name ?? '');
  const [custom, setCustom] = useState('');
  if (!conn) return <View style={s.screen} />;

  const fallbackName = snap.profileLabel || conn.label;
  const look: AgentLook = { kind: kind === 'photo' && !photo ? 'letter' : kind, emoji, photo, bg, name: name.trim() || undefined };
  const shownName = agentName({ ...conn, look }, snap.profileLabel);

  const save = async () => {
    await customize(conn.id, look);
    router.back();
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    // Kept inline so the picture survives cache clean-ups and app updates.
    setPhoto(a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
    setKind('photo');
  };

  const confirmRemove = () =>
    Alert.alert(t.remove, t.removeConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.remove, style: 'destructive', onPress: async () => { await remove(conn.id); router.dismissTo('/'); } },
    ]);

  const kinds: [AgentLook['kind'], string][] = [['emoji', t.emoji], ['photo', t.photo], ['letter', t.letter]];

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} style={s.headerBtn} accessibilityRole="button">
          <Text style={s.cancel}>{t.cancel}</Text>
        </Pressable>
        <Text style={s.h1} accessibilityRole="header">{t.customize}</Text>
        <Pressable onPress={() => void save()} style={[s.headerBtn, { alignItems: 'flex-end' }]} accessibilityRole="button">
          <Text style={s.save}>{t.save}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <Avatar label={shownName} seed={conn.profile + conn.url} look={look} size={88} />
          <View style={s.heroName}>
            <Text style={s.name}>{shownName}</Text>
            <Text style={s.port}>{portOf(conn)}</Text>
          </View>
        </View>

        <View style={s.segment} accessibilityRole="radiogroup">
          {kinds.map(([k, label]) => {
            const on = kind === k;
            return (
              <Pressable key={k} style={[s.seg, on && s.segOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}
                onPress={() => (k === 'photo' && !photo ? void pickPhoto() : setKind(k))}>
                <Text style={[s.segText, on && s.segTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {kind === 'emoji' && (
          <View style={s.grid} accessibilityRole="radiogroup">
            {[...EMOJIS, ...(custom && !EMOJIS.includes(custom) ? [custom] : [])].map((e) => {
              const on = emoji === e;
              return (
                <Pressable key={e} style={[s.cell, on && s.cellOn]} onPress={() => setEmoji(e)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <Text style={s.cellEmoji}>{e}</Text>
                </Pressable>
              );
            })}
            <View style={s.cell}>
              <TextInput
                style={s.customInput}
                value=""
                placeholder="+"
                placeholderTextColor={colors.text}
                accessibilityLabel={t.more}
                onChangeText={(v) => {
                  const e = v.trim();
                  if (!e) return;
                  setCustom(e);
                  setEmoji(e);
                }}
              />
            </View>
          </View>
        )}

        {kind !== 'photo' && (
          <View style={{ gap: 8 }}>
            <Text style={s.label}>{t.bgColor}</Text>
            <View style={s.swatches} accessibilityRole="radiogroup">
              {avatarPalette.map((c, i) => {
                const on = bg === c;
                return (
                  <Pressable key={c} onPress={() => setBg(c)} accessibilityRole="radio" accessibilityLabel={SWATCH_NAMES[i]} accessibilityState={{ checked: on }}
                    style={[s.swatchRing, on && { borderColor: colors.accent }]}>
                    <View style={[s.swatch, { backgroundColor: c }, (c === '#16004A' || c === '#EDE3FF') && { borderWidth: 1, borderColor: '#B88CFF' }]} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Text style={s.label}>{t.displayName}</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder={fallbackName} placeholderTextColor={colors.textDim} returnKeyType="done" />
        </View>

        <View style={s.twoBtns}>
          <Pressable style={[s.wide, { flex: 1 }]} onPress={() => void pickPhoto()} accessibilityRole="button">
            <Icon name="image" size={18} color={colors.text} />
            <Text style={s.wideText}>{t.fromAlbum}</Text>
          </Pressable>
          {snap.role === 'owner' && (
            <Pressable style={[s.wide, { flex: 1 }]} onPress={() => router.push(`/share/${conn.id}`)} accessibilityRole="button">
              <Icon name="people" size={18} color={colors.text} />
              <Text style={s.wideText}>{t.shareAgent}</Text>
            </Pressable>
          )}
        </View>

        <View style={{ gap: 8, marginTop: 8 }}>
          <Text style={s.label}>{t.connectionInfo}</Text>
          <View style={s.card}>
            <Row label={t.profile} value={conn.profile} mono />
            <Row label={t.role} value={(conn.role === 'guest' ? t.guest : t.owner) + (snap.deviceName ? ` · ${snap.deviceName}` : '')} />
            <Pressable onLongPress={() => void Clipboard.setStringAsync(conn.url)} style={s.row}>
              <Text style={s.rowLabel}>{t.address}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                <StatusDot status={snap.status} size={8} />
                <Text style={[s.rowValue, { fontFamily: mono, fontSize: 13 }]} numberOfLines={1}>{conn.url.replace(/^wss?:\/\//, '')}</Text>
              </View>
            </Pressable>
          </View>
          {snap.lastError ? <Text style={s.err}>{snap.lastError}</Text> : null}
        </View>

        <Pressable style={s.remove} onPress={confirmRemove} accessibilityRole="button">
          <Icon name="trash" size={18} color={colors.danger} />
          <Text style={s.removeText}>{t.remove}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, mono: isMono }: { label: string; value: string; mono?: boolean }) {
  const s = useStyles();
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, isMono && { fontFamily: mono, fontSize: 13 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 6 },
    headerBtn: { minWidth: 60, height: 44, justifyContent: 'center' },
    cancel: { color: colors.textDim, fontSize: fs(16) },
    save: { color: colors.link, fontSize: fs(16), fontWeight: '700' },
    h1: { color: colors.text, fontSize: fs(17), fontWeight: '600' },
    content: { paddingHorizontal: 20, gap: 16 },
    hero: { alignItems: 'center', gap: 8, paddingTop: 4 },
    heroName: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    name: { color: colors.text, fontSize: fs(20), fontWeight: '700' },
    port: { color: colors.textDim, fontSize: fs(13), fontFamily: mono },
    segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: colors.surface },
    seg: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    segOn: { backgroundColor: colors.accent },
    segText: { color: colors.text, fontSize: fs(15), fontWeight: '500' },
    segTextOn: { color: '#FFFFFF', fontWeight: '600' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cell: { width: '14.6%', height: 48, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
    cellOn: { borderColor: colors.accent },
    cellEmoji: { fontSize: 24 },
    customInput: { width: '100%', height: '100%', textAlign: 'center', fontSize: 20, color: colors.text, padding: 0 },
    label: { color: colors.textDim, fontSize: fs(13), fontWeight: '600', paddingHorizontal: 4, textAlign: start },
    swatches: { flexDirection: 'row', gap: 12, paddingHorizontal: 4 },
    swatchRing: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
    swatch: { width: 40, height: 40, borderRadius: 20 },
    input: { height: 52, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.surface, color: colors.text, fontSize: fs(16), textAlign: start },
    twoBtns: { flexDirection: 'row', gap: 8 },
    wide: { height: 52, borderRadius: 16, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    wideText: { color: colors.text, fontSize: fs(15), fontWeight: '600' },
    card: { borderRadius: 18, backgroundColor: colors.surface, paddingHorizontal: 16 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 50, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLabel: { color: colors.textDim, fontSize: fs(15) },
    rowValue: { color: colors.text, fontSize: fs(15), flexShrink: 1 },
    err: { color: colors.danger, fontSize: fs(13), paddingHorizontal: 4 },
    remove: { height: 52, borderRadius: 16, backgroundColor: colors.dangerSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
    removeText: { color: colors.danger, fontSize: fs(15), fontWeight: '600' },
  };
});
