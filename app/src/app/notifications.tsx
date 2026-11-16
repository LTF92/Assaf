import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Button, FieldLabel, Group, Row, ScreenHeader, Section, Sheet, Toggle } from '../components/Form';
import { isRTL, lang, t } from '../lib/i18n';
import { useAllChats } from '../lib/inbox';
import { useSettings, type Settings } from '../lib/settings';
import { agentName, useConnections } from '../lib/store';
import { makeStyles } from '../lib/theme';

type Notify = Settings['notify'];

function hourLabel(h: number): string {
  return new Date(2026, 0, 1, h, 0).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en', { hour: 'numeric' });
}

/** What reaches the lock screen: kinds, per-agent mutes, quiet hours. */
export default function NotificationsScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { settings, set } = useSettings();
  const { setMuted } = useConnections();
  const chats = useAllChats();
  const [quietSheet, setQuietSheet] = useState(false);
  const n = settings.notify;
  const put = (patch: Partial<Notify>) => set('notify', { ...n, ...patch });
  const putQuiet = (patch: Partial<Notify['quiet']>) => put({ quiet: { ...n.quiet, ...patch } });

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 }]}>
        <ScreenHeader title={t.notifications} />

        {!settings.notifications && (
          <Pressable style={s.off} onPress={() => set('notifications', true)} accessibilityRole="button">
            <Text style={s.offText}>{t.notificationsOff}</Text>
          </Pressable>
        )}

        <Section title={t.notifyWhen}>
          <Group>
            <Row label={t.nApproval}><Toggle label={t.nApproval} value={n.approval} onChange={(v) => put({ approval: v })} /></Row>
            <Row label={t.nScheduled}><Toggle label={t.nScheduled} value={n.scheduled} onChange={(v) => put({ scheduled: v })} /></Row>
            <Row label={t.nErrors}><Toggle label={t.nErrors} value={n.errors} onChange={(v) => put({ errors: v })} /></Row>
            <Row label={t.nReplies}><Toggle label={t.nReplies} value={n.replies} onChange={(v) => put({ replies: v })} /></Row>
          </Group>
        </Section>

        {chats.length > 0 && (
          <Section title={t.perAgent}>
            <Group>
              {chats.map(({ conn, snap }) => {
                const label = agentName(conn, snap?.profileLabel);
                return (
                  <Row key={conn.id} label={label} lead={<Avatar label={label} seed={conn.id} look={conn.look} size={32} />}>
                    <Toggle label={label} value={!conn.muted} onChange={(on) => setMuted(conn.id, !on)} />
                  </Row>
                );
              })}
            </Group>
          </Section>
        )}

        <Section title={t.quietHours} note={t.quietNote}>
          <Group>
            <Row label={t.quietRange(hourLabel(n.quiet.start), hourLabel(n.quiet.end))} hint={t.quietHint} onPress={() => setQuietSheet(true)}>
              <Toggle label={t.quietHours} value={n.quiet.on} onChange={(on) => putQuiet({ on })} />
            </Row>
          </Group>
        </Section>
      </ScrollView>

      <Sheet visible={quietSheet} onClose={() => setQuietSheet(false)} label={t.quietHours}>
        <Text style={s.sheetTitle}>{t.quietHours}</Text>
        <HourPicker label={t.from} value={n.quiet.start} onChange={(h) => putQuiet({ start: h, on: true })} />
        <HourPicker label={t.to} value={n.quiet.end} onChange={(h) => putQuiet({ end: h, on: true })} />
        <Button label={t.done} onPress={() => setQuietSheet(false)} />
      </Sheet>
    </View>
  );
}

function HourPicker({ label, value, onChange }: { label: string; value: number; onChange: (h: number) => void }) {
  const s = useStyles();
  return (
    <View style={{ gap: 6 }}>
      <FieldLabel>{label}</FieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {Array.from({ length: 24 }, (_, h) => (h + 18) % 24).map((h) => (
          <Pressable key={h} style={[s.hour, h === value && s.hourOn]} onPress={() => onChange(h)}
            accessibilityRole="radio" accessibilityState={{ checked: h === value }}>
            <Text style={[s.hourText, h === value && s.hourTextOn]}>{hourLabel(h)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    content: { paddingHorizontal: 20, gap: 22 },
    off: { padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.surface3 },
    offText: { color: colors.text, fontSize: fs(14), textAlign: start },
    sheetTitle: { color: colors.text, fontSize: fs(18), fontWeight: '700', textAlign: start },
    hour: { height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    hourOn: { backgroundColor: colors.accent },
    hourText: { color: colors.text, fontSize: fs(15), fontWeight: '600' },
    hourTextOn: { color: '#FFFFFF' },
  };
});
