import Constants from 'expo-constants';
import React from 'react';
import { Alert, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authenticate, canLock } from '../components/AppLock';
import { Markdown } from '../components/Markdown';
import { Appear, Gradient, PressScale } from '../components/motion';
import { isRTL, t } from '../lib/i18n';
import { textDir, useSettings, type Settings } from '../lib/settings';
import { ACCENTS, colors, makeStyles, radius, type AccentName } from '../lib/theme';

type Opt<V> = { value: V; label: string };

/** A row of pill buttons; the chosen one is filled with the accent colour. */
function Choice<V extends string | number>({ options, value, onChange }: { options: Opt<V>[]; value: V; onChange: (v: V) => void }) {
  const s = useStyles();
  return (
    <View style={s.choices}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressScale key={String(o.value)} haptic to={0.94} style={[s.choice, on && s.choiceOn]} onPress={() => onChange(o.value)}>
            <Text style={[s.choiceText, on && s.choiceTextOn]}>{o.label}</Text>
          </PressScale>
        );
      })}
    </View>
  );
}

function Row({ label, hint, children, column }: { label: string; hint?: string; children: React.ReactNode; column?: boolean }) {
  const s = useStyles();
  return (
    <View style={[s.row, column && s.rowColumn]}>
      <View style={{ flex: column ? undefined : 1, gap: 2 }}>
        <Text style={s.label}>{label}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: colors.accent, false: colors.surface3 }}
      thumbColor={Platform.OS === 'android' ? (value ? colors.accentText : colors.textDim) : undefined}
      ios_backgroundColor={colors.surface3}
    />
  );
}

function Section({ title, children, index }: { title: string; children: React.ReactNode; index: number }) {
  const s = useStyles();
  return (
    <Appear delay={index * 50} from={14}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.section}>{children}</View>
    </Appear>
  );
}

/** Live sample of the chat with the current theme, size and direction. */
function Preview() {
  const s = useStyles();
  const dir = textDir(t.previewUser);
  return (
    <View style={s.preview}>
      <View style={s.previewUserRow}>
        <View style={s.previewBubble}>
          <Text style={[s.previewUserText, { writingDirection: dir }]}>{t.previewUser}</Text>
        </View>
      </View>
      <Markdown text={t.previewAgent} />
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, set, reset } = useSettings();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const up = <K extends keyof Settings>(k: K) => (v: Settings[K]) => set(k, v);

  const toggleLock = async (on: boolean) => {
    if (!on) return set('appLock', false);
    if (!(await canLock())) return Alert.alert(t.appLock, t.lockUnavailable);
    if (await authenticate()) set('appLock', true);
  };

  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Section title={t.preview} index={0}>
        <Preview />
      </Section>

      <Section title={t.appearance} index={1}>
        <Row label={t.theme} column>
          <Choice
            value={settings.theme}
            onChange={up('theme')}
            options={[
              { value: 'system', label: t.themeSystem },
              { value: 'dark', label: t.themeDark },
              { value: 'black', label: t.themeBlack },
              { value: 'light', label: t.themeLight },
            ]}
          />
        </Row>
        <Row label={t.accentColor} column>
          <View style={s.swatches}>
            {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
              const on = settings.accent === name;
              return (
                <PressScale key={name} haptic to={0.88} onPress={() => set('accent', name)} style={[s.swatchRing, on && { borderColor: ACCENTS[name][0] }]}>
                  <View style={s.swatch}>
                    <Gradient colors={[ACCENTS[name][0], ACCENTS[name][1]]} radius={17} />
                    {on ? <Text style={[s.check, { color: ACCENTS[name][2] }]}>✓</Text> : null}
                  </View>
                </PressScale>
              );
            })}
          </View>
        </Row>
        <Row label={t.textSize} column>
          <Choice
            value={settings.fontScale}
            onChange={up('fontScale')}
            options={[
              { value: 0.9, label: t.sizeSmall },
              { value: 1, label: t.sizeNormal },
              { value: 1.12, label: t.sizeLarge },
              { value: 1.25, label: t.sizeXL },
            ]}
          />
        </Row>
      </Section>

      <Section title={t.language} index={2}>
        <Row label={t.language} column>
          <Choice
            value={settings.language}
            onChange={up('language')}
            options={[
              { value: 'system', label: t.langSystem },
              { value: 'ar', label: 'العربية' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Row>
        <Row label={t.textDirection} hint={settings.textDirection === 'auto' ? t.dirAutoHint : undefined} column>
          <Choice
            value={settings.textDirection}
            onChange={up('textDirection')}
            options={[
              { value: 'auto', label: t.dirAuto },
              { value: 'rtl', label: t.dirRtl },
              { value: 'ltr', label: t.dirLtr },
            ]}
          />
        </Row>
      </Section>

      <Section title={t.chat} index={3}>
        <Row label={t.toolSteps} column>
          <Choice
            value={settings.toolSteps}
            onChange={up('toolSteps')}
            options={[
              { value: 'collapsed', label: t.toolsCollapsed },
              { value: 'expanded', label: t.toolsExpanded },
              { value: 'hidden', label: t.toolsHidden },
            ]}
          />
        </Row>
        <Row label={t.timestamps}>
          <Toggle value={settings.timestamps} onChange={up('timestamps')} />
        </Row>
        <Row label={t.sendOnEnter} hint={t.sendOnEnterHint}>
          <Toggle value={settings.sendOnEnter} onChange={up('sendOnEnter')} />
        </Row>
      </Section>

      <Section title={t.feel} index={4}>
        <Row label={t.animations}>
          <Toggle value={settings.animations} onChange={up('animations')} />
        </Row>
        <Row label={t.haptics}>
          <Toggle value={settings.haptics} onChange={up('haptics')} />
        </Row>
      </Section>

      <Section title={t.privacy} index={5}>
        <Row label={t.appLock} hint={t.appLockHint}>
          <Toggle value={settings.appLock} onChange={toggleLock} />
        </Row>
        {settings.appLock && (
          <Row label={t.lockAfter} column>
            <Choice
              value={settings.lockAfterMin}
              onChange={up('lockAfterMin')}
              options={[
                { value: 0, label: t.lockNow },
                { value: 1, label: t.lockMinutes(1) },
                { value: 5, label: t.lockMinutes(5) },
                { value: 15, label: t.lockMinutes(15) },
              ]}
            />
          </Row>
        )}
        <Row label={t.notifications} hint={t.notificationsHint}>
          <Toggle value={settings.notifications} onChange={up('notifications')} />
        </Row>
      </Section>

      <Section title={t.about} index={6}>
        <Row label={t.version}>
          <Text style={s.value}>{version}</Text>
        </Row>
        <PressScale
          style={s.reset}
          onPress={() =>
            Alert.alert(t.resetSettings, t.resetConfirm, [
              { text: t.cancel, style: 'cancel' },
              { text: t.resetSettings, style: 'destructive', onPress: reset },
            ])
          }
        >
          <Text style={s.resetText}>{t.resetSettings}</Text>
        </PressScale>
      </Section>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors, fs) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  sectionTitle: { color: colors.textFaint, fontSize: fs(13), fontWeight: '700', letterSpacing: 0.4, marginTop: 14, marginBottom: 8, marginHorizontal: 6 },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowColumn: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  label: { color: colors.text, fontSize: fs(16), fontWeight: '600' },
  hint: { color: colors.textDim, fontSize: fs(13), lineHeight: fs(18) },
  value: { color: colors.textDim, fontSize: fs(15) },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  choiceOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { color: colors.text, fontSize: fs(14), fontWeight: '600' },
  choiceTextOn: { color: colors.accentText },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: fs(16), fontWeight: '900' },
  preview: { padding: 14, gap: 8, backgroundColor: colors.bg, direction: 'ltr' },
  previewUserRow: { alignItems: 'flex-end' },
  previewBubble: { backgroundColor: colors.userBubble, borderRadius: radius.xl, borderBottomRightRadius: 8, paddingHorizontal: 15, paddingVertical: 10, maxWidth: '85%' },
  previewUserText: { color: colors.userText, fontSize: fs(16), fontWeight: '500' },
  reset: { paddingVertical: 14, alignItems: 'center' },
  resetText: { color: colors.danger, fontSize: fs(15), fontWeight: '700' },
}));

