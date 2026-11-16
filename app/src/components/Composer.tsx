import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Image, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { current, textDir } from '../lib/settings';
import { t } from '../lib/i18n';
import { colors, radius, makeStyles } from '../lib/theme';
import type { Attachment } from '../lib/types';
import { Icon } from './Icon';
import { Appear, PressScale } from './motion';

export interface ComposerHandle {
  focus: () => void;
}

interface Props {
  disabled?: boolean;
  placeholder?: string;
  /** The agent is working: an empty composer shows a stop button. */
  busy?: boolean;
  /** Replying to a scheduled message: shown as a chip above the input. */
  reply?: { to: string; title: string; onCancel: () => void } | null;
  onSend: (text: string, attachments: Attachment[]) => void;
}

const COMMANDS = [
  { cmd: '/new', label: () => t.newChat },
  { cmd: '/stop', label: () => t.stop },
  { cmd: '/retry', label: () => t.retry },
  { cmd: '/model', label: () => t.model },
  { cmd: '/help', label: () => t.help },
];

export const Composer = forwardRef<ComposerHandle, Props>(function Composer({ disabled, placeholder, busy, reply, onSend }, ref) {
  const s = useStyles();
  const [text, setText] = useState('');
  // follow the language being typed; empty input follows the app language
  const inputDir = textDir(text);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState<'none' | 'attach'>('none');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  const canSend = !disabled && (text.trim().length > 0 || atts.length > 0);
  const ready = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(ready, { toValue: canSend ? 1 : 0, damping: 14, stiffness: 260, useNativeDriver: true }).start();
  }, [canSend, ready]);
  const toggleMenu = (which: 'attach') => {
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
      {menu === 'attach' && (
        <View style={[s.menu, s.menuInner]}>
          {[
            { label: t.photo, icon: 'image' as const, go: () => pickImage(false) },
            { label: t.camera, icon: 'qr' as const, go: () => pickImage(true) },
            { label: t.file, icon: 'clipboard' as const, go: pickFile },
          ].map((o, i) => (
            <Appear key={o.label} delay={i * 40} from={10}>
              <PressScale style={s.chip} haptic onPress={o.go}>
                <Icon name={o.icon} size={18} color={colors.link} />
                <Text style={s.chipLabel}>{o.label}</Text>
              </PressScale>
            </Appear>
          ))}
        </View>
      )}
      {menu === 'attach' && (
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
      {reply ? (
        <View style={s.reply}>
          <Icon name="reply" size={18} color={colors.link} strokeWidth={2} />
          <View style={{ flex: 1, paddingVertical: 8 }}>
            <Text style={s.replyTo}>{t.replyingTo(reply.to)}</Text>
            <Text style={s.replyTitle} numberOfLines={1}>{reply.title}</Text>
          </View>
          <PressScale onPress={reply.onCancel} style={s.replyX} accessibilityLabel={t.cancelReply} hitSlop={6}>
            <Icon name="close" size={18} color={colors.textDim} strokeWidth={2} />
          </PressScale>
        </View>
      ) : null}
      <View style={s.row}>
        <PressScale style={[s.iconBtn, menu === 'attach' && s.iconBtnOn]} to={0.88} onPress={() => toggleMenu('attach')} hitSlop={6} accessibilityLabel={t.file}>
          <View style={menu === 'attach' ? { transform: [{ rotate: '45deg' }] } : undefined}>
            <Icon name="plus" size={20} color={menu === 'attach' ? '#FFFFFF' : colors.text} strokeWidth={2} />
          </View>
        </PressScale>
        <TextInput
          ref={input}
          style={[s.input, { textAlign: inputDir === 'rtl' ? 'right' : 'left', writingDirection: inputDir }]}
          value={text}
          onChangeText={setText}
          placeholder={placeholder ?? t.messagePlaceholder}
          placeholderTextColor={colors.textDim}
          multiline
          submitBehavior={current.sendOnEnter ? 'submit' : 'newline'}
          returnKeyType={current.sendOnEnter ? 'send' : 'default'}
          onSubmitEditing={() => current.sendOnEnter && send()}
          textAlignVertical="center"
        />
        {busy && !canSend ? (
          <PressScale style={s.send} to={0.9} haptic onPress={() => onSend('/stop', [])} accessibilityLabel={t.stop}>
            <Icon name="stop" size={16} color="#FFFFFF" />
          </PressScale>
        ) : (
          <Pressable onPress={() => send()} disabled={!canSend} hitSlop={6} accessibilityLabel={t.reply}>
            <Animated.View style={[s.send, { opacity: ready.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }), transform: [{ scale: ready.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
              <Icon name="send" size={20} color="#FFFFFF" strokeWidth={2.2} />
            </Animated.View>
          </Pressable>
        )}
      </View>
    </View>
  );
});

const useStyles = makeStyles((colors, fs) => ({
  wrap: { marginHorizontal: 12, marginTop: 6, marginBottom: 8, padding: 6, borderRadius: 28, backgroundColor: colors.surface, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.onSurface },
  iconBtnOn: { backgroundColor: colors.accent },
  input: { flex: 1, minHeight: 44, maxHeight: 140, color: colors.text, fontSize: fs(16), paddingHorizontal: 4, paddingVertical: 11, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) } as object,
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  menu: { paddingHorizontal: 4, paddingTop: 4 },
  menuInner: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, height: 40, borderRadius: radius.pill, backgroundColor: colors.onSurface, flexDirection: 'row', gap: 6, alignItems: 'center' },
  chipCmd: { color: colors.link, fontWeight: '700' },
  chipLabel: { color: colors.text, fontSize: fs(14) },
  atts: { gap: 8, paddingHorizontal: 4, paddingTop: 4 },
  att: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surface2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  attImg: { width: 64, height: 64 },
  attName: { color: colors.textDim, fontSize: fs(10), padding: 4 },
  attXWrap: { position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  attX: { color: '#fff', fontSize: fs(14), fontWeight: '700', lineHeight: fs(16) },
  reply: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingStart: 14, borderRadius: 22, backgroundColor: colors.onSurface },
  replyTo: { color: colors.link, fontSize: fs(12), fontWeight: '600' },
  replyTitle: { color: colors.text, fontSize: fs(14) },
  replyX: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
}));
