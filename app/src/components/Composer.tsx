import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { t } from '../lib/i18n';
import { colors, radius } from '../lib/theme';
import type { Attachment } from '../lib/types';

export interface ComposerHandle {
  focus: () => void;
}

interface Props {
  disabled?: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
}

const COMMANDS = [
  { cmd: '/new', label: () => t.newChat },
  { cmd: '/stop', label: () => t.stop },
  { cmd: '/retry', label: () => t.retry },
  { cmd: '/model', label: () => t.model },
  { cmd: '/help', label: () => t.help },
];

export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ disabled, onSend }, ref) {
  const [text, setText] = useState('');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState<'none' | 'attach' | 'commands'>('none');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const canSend = !disabled && (text.trim().length > 0 || atts.length > 0);

  const send = (value = text) => {
    if (disabled || (!value.trim() && atts.length === 0)) return;
    onSend(value.trim(), atts);
    setText('');
    setAtts([]);
    setMenu('none');
  };

  const pickImage = async (camera: boolean) => {
    setMenu('none');
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.7 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return;
    const picked = res.assets
      .filter((a) => a.base64)
      .map((a) => ({ name: a.fileName || 'photo.jpg', mime: a.mimeType || 'image/jpeg', data: a.base64!, uri: a.uri }));
    setAtts((prev) => [...prev, ...picked].slice(0, 6));
  };

  const pickFile = async () => {
    setMenu('none');
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled) return;
    const a = res.assets[0];
    const data = await new File(a.uri).base64();
    setAtts((prev) => [...prev, { name: a.name, mime: a.mimeType || 'application/octet-stream', data }].slice(0, 6));
  };

  return (
    <View style={s.wrap}>
      {menu === 'commands' && (
        <ScrollView horizontal style={s.menu} contentContainerStyle={s.menuInner} keyboardShouldPersistTaps="handled">
          {COMMANDS.map((c) => (
            <Pressable key={c.cmd} style={s.chip} onPress={() => send(c.cmd)}>
              <Text style={s.chipCmd}>{c.cmd}</Text>
              <Text style={s.chipLabel}>{c.label()}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {menu === 'attach' && (
        <View style={[s.menu, s.menuInner]}>
          <Pressable style={s.chip} onPress={() => pickImage(false)}><Text style={s.chipLabel}>{t.photo}</Text></Pressable>
          <Pressable style={s.chip} onPress={() => pickImage(true)}><Text style={s.chipLabel}>{t.camera}</Text></Pressable>
          <Pressable style={s.chip} onPress={pickFile}><Text style={s.chipLabel}>{t.file}</Text></Pressable>
        </View>
      )}
      {atts.length > 0 && (
        <ScrollView horizontal contentContainerStyle={s.atts}>
          {atts.map((a, i) => (
            <Pressable key={i} onPress={() => setAtts((p) => p.filter((_, j) => j !== i))} style={s.att}>
              {a.uri ? <Image source={{ uri: a.uri }} style={s.attImg} /> : <Text style={s.attName} numberOfLines={2}>{a.name}</Text>}
              <Text style={s.attX}>×</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={s.row}>
        <Pressable style={s.iconBtn} onPress={() => setMenu((m) => (m === 'attach' ? 'none' : 'attach'))} hitSlop={8}>
          <Text style={s.icon}>＋</Text>
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => setMenu((m) => (m === 'commands' ? 'none' : 'commands'))} hitSlop={8}>
          <Text style={[s.icon, { fontSize: 18 }]}>/</Text>
        </Pressable>
        <TextInput
          ref={input}
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder={t.messagePlaceholder}
          placeholderTextColor={colors.textFaint}
          multiline
          textAlignVertical="center"
        />
        <Pressable style={[s.send, !canSend && { opacity: 0.35 }]} onPress={() => send()} disabled={!canSend}>
          <Text style={s.sendIcon}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  iconBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.textDim, fontSize: 22 },
  input: { flex: 1, minHeight: 40, maxHeight: 140, color: colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: colors.accentText, fontSize: 20, fontWeight: '800' },
  menu: { marginBottom: 8 },
  menuInner: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 6, alignItems: 'center' },
  chipCmd: { color: colors.accent, fontWeight: '700' },
  chipLabel: { color: colors.text },
  atts: { gap: 8, paddingBottom: 8 },
  att: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  attImg: { width: 64, height: 64 },
  attName: { color: colors.textDim, fontSize: 10, padding: 4 },
  attX: { position: 'absolute', top: 0, right: 4, color: colors.text, fontSize: 16, fontWeight: '700' },
});
