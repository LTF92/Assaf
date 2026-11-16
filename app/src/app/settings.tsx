import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authenticate, canLock } from '../components/AppLock';
import { Group, Row, Section, Toggle, Value } from '../components/Form';
import { Icon } from '../components/Icon';
import { PressScale } from '../components/motion';
import { Segmented } from '../components/Segmented';
import { isRTL, t } from '../lib/i18n';
import { useAllChats } from '../lib/inbox';
import { useSettings, type Settings } from '../lib/settings';
import { useConnections } from '../lib/store';
import { colors, makeStyles } from '../lib/theme';

export default function SettingsScreen() {
  const { settings, set, reset } = useSettings();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const chats = useAllChats();
  const { remove } = useConnections();
  const up = <K extends keyof Settings>(k: K) => (v: Settings[K]) => set(k, v);

  const toggleLock = async (on: boolean) => {
    if (!on) return set('appLock', false);
    if (!(await canLock())) return Alert.alert(t.appLock, t.lockUnavailable);
    if (await authenticate()) set('appLock', true);
  };

  const online = chats.filter((c) => c.snap?.status === 'online').length;
  const host = chats.find((c) => c.snap?.hostName)?.snap?.hostName || t.connection;
  const theme = settings.theme === 'black' ? 'dark' : settings.theme;

  const unpairAll = () =>
    Alert.alert(t.unpairMac, t.unpairConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.unpairMac, style: 'destructive',
        onPress: async () => {
          for (const c of chats) await remove(c.conn.id);
          router.dismissTo('/');
        },
      },
    ]);

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 }]}>
        <View style={s.header}>
          <PressScale style={s.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel={t.agents}>
            <Icon name="back" size={22} color={colors.text} strokeWidth={2} />
          </PressScale>
          <Text style={s.h1} accessibilityRole="header">{t.appSettings}</Text>
        </View>

        <Section title={t.appearance}>
          <Segmented
            label={t.appearance}
            value={theme}
            onChange={up('theme')}
            options={[{ value: 'system', label: t.themeAuto }, { value: 'light', label: t.themeLight }, { value: 'dark', label: t.themeDark }]}
          />
          <Segmented
            label={t.textSize}
            value={settings.fontScale}
            onChange={up('fontScale')}
            options={[{ value: 0.9, label: t.sizeSmall }, { value: 1, label: t.sizeNormal }, { value: 1.12, label: t.sizeLarge }, { value: 1.25, label: t.sizeXL }]}
          />
        </Section>

        <Section title={t.langDir}>
          <Segmented
            label={t.uiLanguage}
            value={settings.language}
            onChange={up('language')}
            options={[{ value: 'system', label: t.langSystem }, { value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]}
          />
          <Group>
            <Row label={t.autoDir} hint={t.autoDirHint}>
              <Toggle
                label={t.autoDir}
                value={settings.textDirection === 'auto'}
                onChange={(on) => set('textDirection', on ? 'auto' : isRTL ? 'rtl' : 'ltr')}
              />
            </Row>
          </Group>
        </Section>

        <Section title={t.toolsApprovals}>
          <Group>
            <Row label={t.showTools}>
              <Toggle label={t.showTools} value={settings.toolSteps !== 'hidden'} onChange={(on) => set('toolSteps', on ? 'collapsed' : 'hidden')} />
            </Row>
            <Row label={t.notifications} hint={t.notificationsHint}>
              <Toggle label={t.notifications} value={settings.notifications} onChange={up('notifications')} />
            </Row>
            {settings.notifications && (
              <Row label={t.notifyWhen} onPress={() => router.push('/notifications')}>
                <Value text="" />
              </Row>
            )}
            <Row label={t.timestamps}>
              <Toggle label={t.timestamps} value={settings.timestamps} onChange={up('timestamps')} />
            </Row>
            <Row label={t.sendOnEnter} hint={t.sendOnEnterHint}>
              <Toggle label={t.sendOnEnter} value={settings.sendOnEnter} onChange={up('sendOnEnter')} />
            </Row>
          </Group>
        </Section>

        <Section title={t.privacy}>
          <Group>
            <Row label={t.appLock} hint={t.appLockHint}>
              <Toggle label={t.appLock} value={settings.appLock} onChange={toggleLock} />
            </Row>
            {settings.appLock && (
              <View style={{ padding: 8 }}>
                <Segmented
                  label={t.lockAfter}
                  value={settings.lockAfterMin}
                  onChange={up('lockAfterMin')}
                  options={[{ value: 0, label: t.lockNow }, { value: 1, label: t.lockMinutes(1) }, { value: 5, label: t.lockMinutes(5) }, { value: 15, label: t.lockMinutes(15) }]}
                />
              </View>
            )}
            <Row label={t.animations}>
              <Toggle label={t.animations} value={settings.animations} onChange={up('animations')} />
            </Row>
            <Row label={t.haptics}>
              <Toggle label={t.haptics} value={settings.haptics} onChange={up('haptics')} />
            </Row>
          </Group>
        </Section>

        {chats.length > 0 && (
          <Section title={t.connection}>
            <Group>
              <Row label={host}>
                <View style={s.valueWrap}>
                  <View style={[s.dot, { backgroundColor: online ? colors.okDot : colors.switchOff }]} />
                  <Text style={[s.status, { color: online ? colors.ok : colors.textDim }]}>
                    {online ? t.agentsOnline(online) : t.offline}
                  </Text>
                </View>
              </Row>
              <Row label={t.agentsPorts} onPress={() => router.dismissTo('/')}>
                <Value text={t.agentsCount(chats.length)} />
              </Row>
              <Row label={t.addAgent} onPress={() => router.push('/add')}>
                <Icon name="plus" size={20} color={colors.link} strokeWidth={2} />
              </Row>
            </Group>
          </Section>
        )}

        <Section title={t.about}>
          <Group>
            <Row label={t.version}><Text style={s.value}>{Constants.expoConfig?.version ?? ''}</Text></Row>
            <Row
              label={t.resetSettings}
              onPress={() =>
                Alert.alert(t.resetSettings, t.resetConfirm, [
                  { text: t.cancel, style: 'cancel' },
                  { text: t.resetSettings, style: 'destructive', onPress: reset },
                ])
              }
            />
          </Group>
        </Section>

        {chats.length > 0 && (
          <Pressable style={s.danger} onPress={unpairAll} accessibilityRole="button">
            <Text style={s.dangerText}>{t.unpairMac}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    content: { paddingHorizontal: 20, gap: 22 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginStart: -10 },
    back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    h1: { color: colors.text, fontSize: fs(28), fontWeight: '700' },
    h2: { color: colors.textDim, fontSize: fs(13), fontWeight: '600', paddingHorizontal: 4, textAlign: start },
    group: { borderRadius: 18, backgroundColor: colors.surface, overflow: 'hidden' },
    divider: { borderTopWidth: 1, borderTopColor: colors.surface3 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8 },
    label: { color: colors.text, fontSize: fs(16), textAlign: start },
    hint: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    value: { color: colors.textDim, fontSize: fs(15) },
    dot: { width: 8, height: 8, borderRadius: 4 },
    status: { fontSize: fs(14), fontWeight: '600' },
    danger: { height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: colors.danger, fontSize: fs(16), fontWeight: '600' },
  };
});
