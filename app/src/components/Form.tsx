import { router } from 'expo-router';
import React from 'react';
import { Modal, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isRTL, t } from '../lib/i18n';
import { colors, makeStyles } from '../lib/theme';
import { Icon } from './Icon';
import { PressScale } from './motion';

/** Shared building blocks for the settings-style screens (settings, jobs, notifications, sharing). */

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  if ((Platform.OS as string) === 'web') {
    // react-native-web's Switch misplaces its thumb in RTL; draw the brand switch directly.
    return (
      <Pressable
        onPress={() => onChange(!value)}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={label}
        style={{ width: 52, height: 32, borderRadius: 16, padding: 3, backgroundColor: value ? colors.accent : colors.switchOff,
          flexDirection: 'row', direction: 'ltr', justifyContent: value !== isRTL ? 'flex-end' : 'flex-start' }}
      >
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF' }} />
      </Pressable>
    );
  }
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ true: colors.accent, false: colors.switchOff }}
      thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
      {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as object) : null)}
      ios_backgroundColor={colors.switchOff}
    />
  );
}

export function Section({ title, children, note }: { title?: string; children: React.ReactNode; note?: string }) {
  const s = useStyles();
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text style={s.h2} accessibilityRole="header">{title}</Text> : null}
      {children}
      {note ? <Text style={s.note}>{note}</Text> : null}
    </View>
  );
}

export function Group({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={s.group}>
      {items.map((c, i) => (
        <View key={i} style={i > 0 && s.divider}>{c}</View>
      ))}
    </View>
  );
}

export function Row({ label, hint, children, onPress, lead }: {
  label: string; hint?: string; children?: React.ReactNode; onPress?: () => void; lead?: React.ReactNode;
}) {
  const s = useStyles();
  const body = (
    <View style={[s.row, hint ? { minHeight: 62 } : null]}>
      {lead}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={s.label}>{label}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

export function Value({ text, lead, strong }: { text: string; lead?: React.ReactNode; strong?: boolean }) {
  const s = useStyles();
  return (
    <View style={s.valueWrap}>
      {lead}
      <Text style={[s.value, strong && s.valueStrong]}>{text}</Text>
      <Icon name="forward" size={16} color={colors.textDim} strokeWidth={2} />
    </View>
  );
}

/** A small label above a field ("الاسم", "التكرار"). */
export function FieldLabel({ children }: { children: string }) {
  const s = useStyles();
  return <Text style={s.fieldLabel}>{children}</Text>;
}

/** Back arrow, big title and an optional round violet plus. */
export function ScreenHeader({ title, onPlus, plusLabel, size = 28, onBack }: {
  title: string; onPlus?: () => void; plusLabel?: string; size?: number; onBack?: () => void;
}) {
  const s = useStyles();
  return (
    <View style={s.header}>
      <PressScale style={s.back} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} accessibilityLabel={t.cancel}>
        <Icon name="back" size={22} color={colors.text} strokeWidth={2} />
      </PressScale>
      <Text style={[s.h1, { fontSize: size }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      {onPlus ? (
        <PressScale haptic style={s.plus} onPress={onPlus} accessibilityLabel={plusLabel}>
          <Icon name="plus" size={20} color="#FFFFFF" strokeWidth={2.2} />
        </PressScale>
      ) : null}
    </View>
  );
}

/** Cancel · title · Save, for edit screens. */
export function EditHeader({ title, onCancel, onSave, saveLabel, busy }: {
  title: string; onCancel: () => void; onSave: () => void; saveLabel: string; busy?: boolean;
}) {
  const s = useStyles();
  return (
    <View style={s.editHeader}>
      <Pressable style={s.editBtn} onPress={onCancel} accessibilityRole="button" hitSlop={6}>
        <Text style={s.editCancel}>{t.cancel}</Text>
      </Pressable>
      <Text style={s.editTitle} accessibilityRole="header">{title}</Text>
      <Pressable style={[s.editBtn, { alignItems: 'flex-end' }]} onPress={onSave} disabled={busy} accessibilityRole="button" hitSlop={6}>
        <Text style={[s.editSave, busy && { opacity: 0.4 }]}>{saveLabel}</Text>
      </Pressable>
    </View>
  );
}

/** Bottom sheet over a violet scrim. */
export function Sheet({ visible, onClose, children, label }: { visible: boolean; onClose: () => void; children: React.ReactNode; label?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.sheetWrap}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityLabel={t.cancel} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} accessibilityViewIsModal accessibilityLabel={label}>
          <View style={s.grabber} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Flat button in the brand styles. */
export function Button({ label, onPress, kind = 'primary', icon, disabled, style }: {
  label: string; onPress: () => void; kind?: 'primary' | 'soft' | 'danger' | 'outlineDanger' | 'link' | 'outline';
  icon?: React.ComponentProps<typeof Icon>['name']; disabled?: boolean; style?: object;
}) {
  const s = useStyles();
  const fg = kind === 'primary' || kind === 'danger' ? '#FFFFFF' : kind === 'outlineDanger' ? colors.danger : kind === 'link' || kind === 'outline' ? colors.link : colors.text;
  return (
    <PressScale haptic style={[s.btn, s[`btn_${kind}`], disabled && { opacity: 0.45 }, style]} onPress={onPress} disabled={disabled} accessibilityRole="button">
      <View style={s.btnInner}>
        {icon ? <Icon name={icon} size={18} color={fg} strokeWidth={2} /> : null}
        <Text style={[s.btnText, { color: fg }]}>{label}</Text>
      </View>
    </PressScale>
  );
}

export const useFormStyles = () => useStyles();

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    h1: { color: colors.text, fontWeight: '700', flex: 1, textAlign: start },
    h2: { color: colors.textDim, fontSize: fs(13), fontWeight: '600', paddingHorizontal: 4, textAlign: start },
    note: { color: colors.textDim, fontSize: fs(13), lineHeight: fs(19), paddingHorizontal: 4, textAlign: start },
    group: { borderRadius: 18, backgroundColor: colors.surface, overflow: 'hidden' },
    divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8 },
    label: { color: colors.text, fontSize: fs(16), textAlign: start },
    hint: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    value: { color: colors.textDim, fontSize: fs(15) },
    valueStrong: { color: colors.text, fontSize: fs(16), fontWeight: '600' },
    fieldLabel: { color: colors.textDim, fontSize: fs(13), fontWeight: '600', paddingHorizontal: 4, textAlign: start },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginStart: -10 },
    back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    plus: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    editBtn: { minWidth: 60, height: 44, justifyContent: 'center' },
    editCancel: { color: colors.textDim, fontSize: fs(16), textAlign: start },
    editTitle: { color: colors.text, fontSize: fs(17), fontWeight: '600' },
    editSave: { color: colors.link, fontSize: fs(16), fontWeight: '700' },
    sheetWrap: { flex: 1, justifyContent: 'flex-end', direction: isRTL ? 'rtl' : 'ltr' },
    scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
    sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 10, paddingHorizontal: 20, gap: 14 },
    grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.track },
    btn: { height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
    btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btn_primary: { backgroundColor: colors.accent },
    btn_danger: { backgroundColor: '#B4232A' },
    btn_soft: { backgroundColor: colors.surface },
    btn_outlineDanger: { borderWidth: 1.5, borderColor: colors.surface3 },
    btn_outline: { borderWidth: 1.5, borderColor: colors.accent },
    btn_link: {},
    btnText: { fontSize: fs(16), fontWeight: '600' },
  };
});
