import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Button, EditHeader, FieldLabel, Group, Row, Sheet, Value } from '../components/Form';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import type { Job, JobSchedule, JobShow } from '../lib/client';
import { haptic } from '../lib/haptics';
import { isRTL, t } from '../lib/i18n';
import { clockLabel } from '../lib/jobs';
import { agentName, useConnections } from '../lib/store';
import { colors, makeStyles } from '../lib/theme';

type Freq = JobSchedule['freq'];

/** Create or edit one scheduled job. */
export default function JobEditScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ conn?: string; id?: string }>();
  const { connections, client } = useConnections();
  const owners = connections.filter((c) => c.role === 'owner');
  const editing = !!params.id;

  const [connId, setConnId] = useState(params.conn || owners[0]?.id || '');
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(editing);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [freq, setFreq] = useState<Freq>('daily');
  const [time, setTime] = useState('08:00');
  const [days, setDays] = useState<number[]>([0]);
  const [dom, setDom] = useState(1);
  const [show, setShow] = useState<JobShow>('inbox');
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'agent' | 'time' | 'delete'>(null);

  const conn = connections.find((c) => c.id === connId);
  const api = conn ? client(conn.id) : undefined;
  const label = conn ? agentName(conn) : '';

  useEffect(() => {
    if (!editing || !api) return;
    let live = true;
    api.jobs().then((list) => {
      if (!live) return;
      const j = list.find((x) => x.id === params.id);
      if (!j) return router.back();
      setJob(j);
      setName(j.name);
      setPrompt(j.prompt);
      setShow(j.show);
      if (j.schedule) {
        setFreq(j.schedule.freq);
        setTime(j.schedule.time);
        if (j.schedule.days?.length) setDays(j.schedule.days);
        if (j.schedule.dom) setDom(j.schedule.dom);
      } else setCustom(true);
      setLoading(false);
    }).catch((e) => {
      setError(String((e as Error).message));
      setLoading(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, params.id, !!api]);

  const schedule = useMemo<JobSchedule>(() => (
    freq === 'weekly' ? { freq, time, days } : freq === 'monthly' ? { freq, time, dom } : { freq, time }
  ), [freq, time, days, dom]);

  const save = async () => {
    if (!api) return;
    if (!prompt.trim()) return setError(t.needPrompt);
    if (!custom && freq === 'weekly' && days.length === 0) return setError(t.needDays);
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim(), prompt: prompt.trim(), show };
      if (!custom) body.schedule = schedule;
      if (editing) await api.jobOp('update', { id: params.id, ...body });
      else await api.jobOp('create', body);
      haptic.success();
      router.back();
    } catch (e) {
      setError(`${t.saveFailed}: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  const runNow = async () => {
    if (!api || !params.id) return;
    try {
      await api.jobOp('run', { id: params.id });
      Alert.alert(t.runNow, t.runStarted);
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  const remove = async () => {
    if (!api || !params.id) return;
    setSheet(null);
    try {
      await api.deleteJob(params.id);
      router.back();
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  const pause = async () => {
    if (!api || !params.id) return;
    setSheet(null);
    try {
      await api.jobOp('pause', { id: params.id });
      router.back();
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  const toggleDay = (d: number) => {
    haptic.tap();
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const showHint = show === 'inbox' ? t.showInboxHint(label) : show === 'chat' ? t.showChatHint(label) : t.showSilentHint;

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <EditHeader title={editing ? t.editJob : t.newJobTitle} onCancel={() => router.back()} onSave={save} saveLabel={t.save} busy={busy || loading || !api} />
        {loading ? <ActivityIndicator color={colors.link} style={{ marginTop: 40 }} /> : (
          <>
            <View style={s.field}>
              <FieldLabel>{t.jobName}</FieldLabel>
              <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t.jobNamePh} placeholderTextColor={colors.textDim} maxLength={80} />
            </View>

            <Group>
              <Row
                label={t.agent}
                onPress={editing || owners.length < 2 ? undefined : () => setSheet('agent')}
              >
                {conn ? (
                  <View style={s.valueWrap}>
                    <Avatar label={label} seed={conn.id} look={conn.look} size={28} />
                    <Text style={s.strong}>{label}</Text>
                    {!editing && owners.length > 1 ? <Icon name="forward" size={16} color={colors.textDim} strokeWidth={2} /> : null}
                  </View>
                ) : null}
              </Row>
              {!custom && (
                <Row label={t.time} onPress={() => setSheet('time')}>
                  <Value text={clockLabel(time)} strong />
                </Row>
              )}
            </Group>

            <View style={s.field}>
              <FieldLabel>{t.frequency}</FieldLabel>
              {custom ? (
                <View style={s.custom}>
                  <Icon name="clock" size={16} color={colors.textDim} strokeWidth={2} />
                  <Text style={s.customText}>{job?.schedule_display} · {t.customSchedule}</Text>
                </View>
              ) : (
                <>
                  <Segmented
                    label={t.frequency}
                    value={freq}
                    onChange={setFreq}
                    options={[{ value: 'daily', label: t.freqDaily }, { value: 'weekly', label: t.freqWeekly }, { value: 'monthly', label: t.freqMonthly }]}
                  />
                  {freq === 'weekly' && (
                    <View style={s.days} accessibilityLabel={t.weekdays}>
                      {t.dayShort.map((d, i) => {
                        const on = days.includes(i);
                        return (
                          <Pressable key={i} style={[s.day, on && s.dayOn]} onPress={() => toggleDay(i)}
                            accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={t.dayNames[i]}>
                            <Text style={[s.dayText, on && s.dayTextOn]}>{d}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  {freq === 'monthly' && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityLabel={t.dayOfMonth}>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <Pressable key={d} style={[s.day, s.dom, dom === d && s.dayOn]} onPress={() => setDom(d)}
                          accessibilityRole="radio" accessibilityState={{ checked: dom === d }}>
                          <Text style={[s.dayText, dom === d && s.dayTextOn]}>{d}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                </>
              )}
            </View>

            <View style={s.field}>
              <FieldLabel>{t.jobPrompt}</FieldLabel>
              <TextInput style={[s.input, s.area]} value={prompt} onChangeText={setPrompt} placeholder={t.jobPromptPh} placeholderTextColor={colors.textDim} multiline />
            </View>

            <View style={s.field}>
              <FieldLabel>{t.showWhere}</FieldLabel>
              <Segmented
                small
                label={t.showWhere}
                value={show}
                onChange={setShow}
                options={[{ value: 'inbox', label: t.showInbox }, { value: 'chat', label: t.showChat }, { value: 'silent', label: t.showSilent }]}
              />
              <Text style={s.hint}>{showHint}</Text>
            </View>

            {error ? <Text style={s.error}>{error}</Text> : null}

            {editing && (
              <View style={s.actions}>
                <Button kind="soft" icon="play" label={t.runNow} onPress={runNow} style={{ flex: 1 }} />
                <Button kind="outlineDanger" icon="trash" label={t.deleteJob} onPress={() => setSheet('delete')} style={{ flex: 1 }} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Sheet visible={sheet === 'agent'} onClose={() => setSheet(null)} label={t.agent}>
        <Text style={s.sheetTitle}>{t.agent}</Text>
        <Group>
          {owners.map((c) => (
            <Row key={c.id} label={agentName(c)} lead={<Avatar label={agentName(c)} seed={c.id} look={c.look} size={32} />}
              onPress={() => { setConnId(c.id); setSheet(null); }}>
              {c.id === connId ? <Icon name="check" size={20} color={colors.link} strokeWidth={2.4} /> : null}
            </Row>
          ))}
        </Group>
      </Sheet>

      <TimeSheet visible={sheet === 'time'} value={time} onClose={() => setSheet(null)} onChange={setTime} />

      <Sheet visible={sheet === 'delete'} onClose={() => setSheet(null)} label={t.deleteJob}>
        <View style={s.delHead}>
          <View style={s.delIcon}><Icon name="trash" size={24} color={colors.danger} strokeWidth={1.8} /></View>
          <Text style={s.delTitle}>{t.deleteJobQ(name || job?.name || '')}</Text>
        </View>
        <Text style={s.delBody}>{t.deleteJobBody(label)}</Text>
        <View style={{ gap: 8 }}>
          <Button kind="danger" label={t.deleteJob} onPress={remove} style={{ height: 54 }} />
          {job?.enabled ? <Button kind="soft" label={t.pauseInstead} onPress={pause} /> : null}
          <Button kind="link" label={t.cancel} onPress={() => setSheet(null)} />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

/** Hour (1–12), AM/PM and 5-minute steps: quicker on a phone than a wheel, and works on web. */
function TimeSheet({ visible, value, onClose, onChange }: { visible: boolean; value: string; onClose: () => void; onChange: (v: string) => void }) {
  const s = useStyles();
  const [h24, m] = value.split(':').map(Number);
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const set = (h: number, min: number, isPm: boolean) => {
    const hh = (h % 12) + (isPm ? 12 : 0);
    onChange(`${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  };
  return (
    <Sheet visible={visible} onClose={onClose} label={t.pickTime}>
      <View style={s.timeHead}>
        <Text style={s.sheetTitle}>{t.pickTime}</Text>
        <Text style={s.timeNow}>{clockLabel(value)}</Text>
      </View>
      <Segmented value={pm ? 'pm' : 'am'} onChange={(v) => set(h12, m, v === 'pm')} options={[{ value: 'am', label: t.am }, { value: 'pm', label: t.pm }]} />
      <FieldLabel>{t.hour}</FieldLabel>
      <View style={s.grid}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <Pressable key={h} style={[s.cell, h === h12 && s.dayOn]} onPress={() => set(h, m, pm)} accessibilityRole="radio" accessibilityState={{ checked: h === h12 }}>
            <Text style={[s.dayText, h === h12 && s.dayTextOn]}>{h}</Text>
          </Pressable>
        ))}
      </View>
      <FieldLabel>{t.minute}</FieldLabel>
      <View style={s.grid}>
        {Array.from({ length: 12 }, (_, i) => i * 5).map((min) => (
          <Pressable key={min} style={[s.cell, min === m && s.dayOn]} onPress={() => set(h12, min, pm)} accessibilityRole="radio" accessibilityState={{ checked: min === m }}>
            <Text style={[s.dayText, min === m && s.dayTextOn]}>{String(min).padStart(2, '0')}</Text>
          </Pressable>
        ))}
      </View>
      <Button label={t.done} onPress={onClose} />
    </Sheet>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    content: { paddingHorizontal: 20, gap: 14 },
    field: { gap: 6 },
    input: { minHeight: 48, borderRadius: 14, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, fontSize: fs(16), textAlign: start },
    area: { minHeight: 78, paddingTop: 12, paddingBottom: 12, fontSize: fs(15), lineHeight: fs(24), textAlignVertical: 'top' },
    valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    strong: { color: colors.text, fontSize: fs(16), fontWeight: '600' },
    custom: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 14, backgroundColor: colors.surface },
    customText: { color: colors.text, fontSize: fs(14), flex: 1, textAlign: start },
    days: { flexDirection: 'row', gap: 6 },
    day: { flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    dom: { flex: 0, width: 44 },
    dayOn: { backgroundColor: colors.accent },
    dayText: { color: colors.text, fontSize: fs(15), fontWeight: '600' },
    dayTextOn: { color: '#FFFFFF' },
    hint: { color: colors.textDim, fontSize: fs(13), lineHeight: fs(19), paddingHorizontal: 4, textAlign: start },
    error: { color: colors.danger, fontSize: fs(14), textAlign: start },
    actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    sheetTitle: { color: colors.text, fontSize: fs(18), fontWeight: '700', textAlign: start },
    timeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    timeNow: { color: colors.link, fontSize: fs(18), fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    cell: { width: '15%', flexGrow: 1, height: 44, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    delHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    delIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    delTitle: { color: colors.text, fontSize: fs(20), fontWeight: '700', lineHeight: fs(27), flex: 1, textAlign: start },
    delBody: { color: colors.textDim, fontSize: fs(15), lineHeight: fs(25), textAlign: start },
  };
});
