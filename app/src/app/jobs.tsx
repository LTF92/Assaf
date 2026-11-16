import { router, Stack, useFocusEffect } from 'expo-router';
import React, { useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { Button, ScreenHeader, Toggle } from '../components/Form';
import { Icon } from '../components/Icon';
import { Appear } from '../components/motion';
import { isRTL, t } from '../lib/i18n';
import { nextRunLabel, scheduleLabel, useJobs, type JobRow } from '../lib/jobs';
import { agentName, useConnections } from '../lib/store';
import { colors, makeStyles } from '../lib/theme';

/** Every scheduled job across the owner's agents: pause/resume in place, tap to edit. */
export default function JobsScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { client, connections } = useConnections();
  const { rows, loading, failed, refresh, setRows } = useJobs();
  const owners = connections.filter((c) => c.role === 'owner');

  useFocusEffect(useCallback(() => void refresh(), [refresh]));

  const toggle = async (row: JobRow, on: boolean) => {
    setRows((prev) => prev.map((r) => (r.job.id === row.job.id && r.conn.id === row.conn.id ? { ...r, job: { ...r.job, enabled: on, state: on ? 'scheduled' : 'paused' } } : r)));
    try {
      const job = await client(row.conn.id)?.jobOp(on ? 'resume' : 'pause', { id: row.job.id });
      if (job) setRows((prev) => prev.map((r) => (r.job.id === job.id && r.conn.id === row.conn.id ? { ...r, job } : r)));
    } catch {
      void refresh();
    }
  };

  const active = rows.filter((r) => r.job.enabled).length;
  const open = (row?: JobRow) =>
    router.push(row ? { pathname: '/job', params: { conn: row.conn.id, id: row.job.id } } : '/job');

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 }]}>
        <ScreenHeader title={t.jobsTitle} size={26} onPlus={owners.length ? () => open() : undefined} plusLabel={t.newJob} />
        {rows.length > 0 && <Text style={s.summary}>{t.jobsSummary(rows.length, active)}</Text>}
        {failed.length > 0 && !loading && (
          <View style={s.warn}>
            <Icon name="alert" size={16} color={colors.danger} />
            <Text style={s.warnText}>{t.jobsUnreachable(failed.map((c) => agentName(c)).join('، '))}</Text>
          </View>
        )}
        {loading && rows.length === 0 ? <ActivityIndicator color={colors.link} style={{ marginTop: 40 }} /> : null}
        {!loading && rows.length === 0 && (
          <View style={s.empty}>
            <View style={s.emptyIcon}><Icon name="calendar" size={30} color={colors.link} /></View>
            <Text style={s.emptyTitle}>{t.jobsEmpty}</Text>
            <Text style={s.emptyHint}>{owners.length ? t.jobsEmptyHint : t.noOwnerAgents}</Text>
            {owners.length > 0 && <Button label={t.newJob} icon="plus" onPress={() => open()} style={{ alignSelf: 'stretch', marginTop: 8 }} />}
          </View>
        )}
        {rows.map((row, i) => <JobCard key={`${row.conn.id}:${row.job.id}`} row={row} index={i} onToggle={toggle} onOpen={open} />)}
      </ScrollView>
    </View>
  );
}

function JobCard({ row, index, onToggle, onOpen }: { row: JobRow; index: number; onToggle: (r: JobRow, on: boolean) => void; onOpen: (r: JobRow) => void }) {
  const s = useStyles();
  const { job, conn } = row;
  const label = agentName(conn);
  const failed = job.last_status && job.last_status !== 'ok' && job.last_status !== 'success';
  const status = !job.enabled
    ? { text: t.jobPaused, color: colors.textDim }
    : !job.last_run_at
      ? { text: t.notRunYet, color: colors.textDim }
      : failed
        ? { text: t.lastRunFailed, color: colors.danger }
        : { text: t.lastRunOk, color: colors.ok };
  const next = job.enabled ? nextRunLabel(job.next_run_at) : '';
  return (
    <Appear delay={Math.min(index, 8) * 40}>
      <View style={s.card}>
        <View style={s.cardTop}>
          <Avatar label={label} seed={conn.id} look={conn.look} size={40} />
          <Pressable style={s.cardTitle} onPress={() => onOpen(row)} accessibilityRole="button">
            <Text style={s.name} numberOfLines={1}>{job.name || job.prompt.slice(0, 40)}</Text>
            <Text style={s.agent} numberOfLines={1}>{label}</Text>
          </Pressable>
          <Toggle label={job.name} value={job.enabled} onChange={(on) => onToggle(row, on)} />
        </View>
        <Pressable onPress={() => onOpen(row)} style={{ gap: 10 }}>
          <View style={s.schedRow}>
            <Icon name="clock" size={16} color={colors.textDim} strokeWidth={2} />
            <Text style={s.sched} numberOfLines={1}>{scheduleLabel(job.schedule, job.schedule_display)}</Text>
            <Text style={[s.status, { color: status.color }]}>{status.text}</Text>
          </View>
          <Text style={s.next}>{job.enabled ? (next ? t.nextRun(next) : '') : t.pausedHint}</Text>
        </Pressable>
      </View>
    </Appear>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    screen: { flex: 1, backgroundColor: colors.bg, direction: isRTL ? 'rtl' : 'ltr' },
    content: { paddingHorizontal: 20, gap: 12 },
    summary: { color: colors.textDim, fontSize: fs(14), textAlign: start },
    warn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.surface3 },
    warnText: { color: colors.text, fontSize: fs(14), flex: 1, textAlign: start },
    card: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: colors.surface },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardTitle: { flex: 1, minHeight: 44, justifyContent: 'center', gap: 1 },
    name: { color: colors.text, fontSize: fs(16), fontWeight: '700', textAlign: start },
    agent: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    schedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sched: { color: colors.text, fontSize: fs(14), fontWeight: '600', flexShrink: 1, textAlign: start },
    status: { marginStart: 'auto', fontSize: fs(13), fontWeight: '600' },
    next: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    empty: { alignItems: 'center', gap: 8, paddingTop: 60, paddingHorizontal: 12 },
    emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    emptyTitle: { color: colors.text, fontSize: fs(18), fontWeight: '700' },
    emptyHint: { color: colors.textDim, fontSize: fs(15), lineHeight: fs(22), textAlign: 'center' },
  };
});
