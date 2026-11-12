import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Image, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { current, textDir } from '../lib/settings';
import { t } from '../lib/i18n';
import { colors, radius, makeStyles } from '../lib/theme';
import type { Attachment } from '../lib/types';
import { Appear, Gradient, PressScale } from './motion';

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
  const s = useStyles();
  const [text, setText] = useState('');
  // follow the language being typed; empty input follows the app language
  const inputDir = textDir(text);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState<'none' | 'attach' | 'commands'>('none');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const canSend = !disabled && (text.trim().length > 0 || atts.length > 0);
  const ready = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(ready, { toValue: canSend ? 1 : 0, damping: 14, stiffness: 260, useNativeDriver: true }).start();
  }, [canSend, ready]);
  const toggleMenu = (which: 'attach' | 'commands') => {
    if (current.animations) LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    setMenu((m) => (m === which ? 'none' : which));
  };

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
        <ScrollView horizontal style={s.menu} contentContainerStyle={s.menuInner} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
          {COMMANDS.map((c, i) => (
            <Appear key={c.cmd} delay={i * 40} from={10}>
              <PressScale style={s.chip} haptic onPress={() => send(c.cmd)}>
                <Text style={s.chipCmd}>{c.cmd}</Text>
                <Text style={s.chipLabel}>{c.label()}</Text>
              </PressScale>
            </Appear>
          ))}
        </ScrollView>
      )}
      {menu === 'attach' && (
        <View style={[s.menu, s.menuInner]}>
          {[
            { label: t.photo, icon: '🖼', go: () => pickImage(false) },
            { label: t.camera, icon: '📷', go: () => pickImage(true) },
            { label: t.file, icon: '📄', go: pickFile },
          ].map((o, i) => (
            <Appear key={o.label} delay={i * 40} from={10}>
              <PressScale style={s.chip} haptic onPress={o.go}>
                <Text>{o.icon}</Text>
                <Text style={s.chipLabel}>{o.label}</Text>
              </PressScale>
            </Appear>
          ))}
        </View>
      )}
      {atts.length > 0 && (
        <ScrollView horizontal contentContainerStyle={s.atts}>
          {atts.map((a, i) => (
            <Appear key={i} scale from={6}>
              <Pressable onPress={() => setAtts((p) => p.filter((_, j) => j !== i))} style={s.att}>
                {a.uri ? <Image source={{ uri: a.uri }} style={s.attImg} /> : <Text style={s.attName} numberOfLines={2}>{a.name}</Text>}
                <View style={s.attXWrap}><Text style={s.attX}>×</Text></View>
              </Pressable>
            </Appear>
          ))}
        </ScrollView>
      )}
      <View style={s.row}>
        <PressScale style={[s.iconBtn, menu === 'attach' && s.iconBtnOn]} to={0.88} onPress={() => toggleMenu('attach')} hitSlop={8}>
          <Text style={[s.icon, menu === 'attach' && { color: colors.accent, transform: [{ rotate: '45deg' }] }]}>＋</Text>
        </PressScale>
        <PressScale style={[s.iconBtn, menu === 'commands' && s.iconBtnOn]} to={0.88} onPress={() => toggleMenu('commands')} hitSlop={8}>
          <Text style={[s.icon, { fontSize: 18 }, menu === 'commands' && { color: colors.accent }]}>/</Text>
        </PressScale>
        <TextInput
          ref={input}
          style={[s.input, { textAlign: inputDir === 'rtl' ? 'right' : 'left', writingDirection: inputDir }]}
          value={text}
          onChangeText={setText}
          placeholder={t.messagePlaceholder}
          placeholderTextColor={colors.textFaint}
          multiline
          submitBehavior={current.sendOnEnter ? 'submit' : 'newline'}
          returnKeyType={current.sendOnEnter ? 'send' : 'default'}
          onSubmitEditing={() => current.sendOnEnter && send()}
          textAlignVertical="center"
        />
        <Pressable onPress={() => send()} disabled={!canSend} hitSlop={6}>
          <Animated.View
            style={[
              s.send,
              {
                opacity: ready.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                transform: [
                  { scale: ready.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
                ],
              },
            ]}
          >
            <Gradient colors={[colors.accent, colors.accent2]} radius={20} />
            <Text style={s.sendIcon}>↑</Text>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
});

const useStyles = makeStyles((colors, fs) => ({
  wrap: { backgroundColor: colors.bg, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 5 },
  iconBtn: { width: 38, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBtnOn: { backgroundColor: colors.accentSoft },
  icon: { color: colors.textDim, fontSize: fs(22) },
  input: { flex: 1, minHeight: 40, maxHeight: 140, color: colors.text, fontSize: fs(16), paddingHorizontal: 8, paddingVertical: 9, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) } as object,
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sendIcon: { color: colors.accentText, fontSize: fs(20), fontWeight: '800' },
  menu: { marginBottom: 8 },
  menuInner: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 6, alignItems: 'center' },
  chipCmd: { color: colors.accent, fontWeight: '700' },
  chipLabel: { color: colors.text },
  atts: { gap: 8, paddingBottom: 8 },
  att: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  attImg: { width: 64, height: 64 },
  attName: { color: colors.textDim, fontSize: fs(10), padding: 4 },
  attXWrap: { position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  attX: { color: '#fff', fontSize: fs(14), fontWeight: '700', lineHeight: fs(16) },
}));
