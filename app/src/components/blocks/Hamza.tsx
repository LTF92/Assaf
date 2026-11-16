import React, { useState } from 'react';
import { Image, Linking, Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import type { HamzaBlock, StepStatus, Tone } from '../../lib/blocks';
import { useBlockActions } from '../../lib/blockActions';
import { detectDirection } from '../../lib/direction';
import { haptic } from '../../lib/haptics';
import { isRTL, lang, t } from '../../lib/i18n';
import { colors, makeStyles } from '../../lib/theme';
import { Icon } from '../Icon';
import { Segmented } from '../Segmented';

const LAVENDER = '#B88CFF';
const DEEP = '#16004A';
const num = (n: number | string) => (typeof n === 'number' ? n.toLocaleString(lang === 'ar' ? 'ar' : 'en') : n);
const open = (url?: string) => url && void Linking.openURL(url).catch(() => {});

/** One block from a ```hamza fence, drawn exactly as the design's Blocks pages show it. */
export function HamzaView({ block }: { block: HamzaBlock }) {
  switch (block.type) {
    case 'progress': return <Progress b={block} />;
    case 'stats': return <Stats b={block} />;
    case 'chart': return <Chart b={block} />;
    case 'link': return <LinkCard b={block} />;
    case 'location': return <Location b={block} />;
    case 'images': return <Images b={block} />;
    case 'file': return <FileCard b={block} />;
    case 'audio': return <Audio b={block} />;
    case 'video': return <Video b={block} />;
    case 'choices': return <Choices b={block} />;
    case 'form': return <Form b={block} />;
    case 'checklist': return <Checklist b={block} />;
    default: return null;
  }
}

/** Two equal columns, like the design's grids; an odd last item keeps its half width. */
function Pairs({ children }: { children: React.ReactNode[] }) {
  const rows: React.ReactNode[][] = [];
  children.forEach((c, i) => (i % 2 ? rows[rows.length - 1].push(c) : rows.push([c])));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          {r.map((c, j) => <View key={j} style={{ flex: 1 }}>{c}</View>)}
          {r.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

const small = (b: HamzaBlock) => b.type === 'chart' && (b.kind === 'line' || b.kind === 'pie');

/** All blocks of one fence; small charts (line, pie) sit side by side as in the design. */
export function HamzaList({ blocks }: { blocks: HamzaBlock[] }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    if (small(blocks[i]) && i + 1 < blocks.length && small(blocks[i + 1])) {
      out.push(<Pairs key={i}>{[<HamzaView key="a" block={blocks[i]} />, <HamzaView key="b" block={blocks[i + 1]} />]}</Pairs>);
      i++;
    } else out.push(<HamzaView key={i} block={blocks[i]} />);
  }
  return <View style={{ gap: 8, marginVertical: 6 }}>{out}</View>;
}

type B<K extends HamzaBlock['type']> = Extract<HamzaBlock, { type: K }>;

function StepIcon({ status }: { status: StepStatus }) {
  const s = useStyles();
  if (status === 'done') return <Icon name="check" size={18} color={colors.ok} strokeWidth={2.2} />;
  if (status === 'failed') return <Icon name="x" size={18} color={colors.danger} strokeWidth={2.2} />;
  if (status === 'running') return <View style={s.spinner} />;
  return <View style={s.waiting} />;
}

function Progress({ b }: { b: B<'progress'> }) {
  const s = useStyles();
  const steps = b.steps ?? [];
  const pct = Math.max(0, Math.min(100, b.percent ?? (steps.length ? (100 * steps.filter((x) => x.status === 'done').length) / steps.length : 0)));
  const label = { done: t.stepDone, running: t.stepRunning, waiting: t.stepWaiting, failed: t.stepFailed };
  return (
    <View style={[s.card, { gap: 12, paddingHorizontal: 16 }]}>
      <View style={s.between}>
        <Text style={s.title16}>{b.title}</Text>
        <Text style={s.pct}>{num(Math.round(pct))}٪</Text>
      </View>
      <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={{ now: pct, min: 0, max: 100 }}>
        <View style={[s.barFill, { width: `${pct}%` }]} />
      </View>
      {steps.length > 0 && (
        <View style={{ gap: 2 }}>
          {steps.map((st, i) => {
            const status = st.status ?? 'waiting';
            return (
              <View key={i} style={s.step}>
                <StepIcon status={status} />
                <Text style={[s.stepText, status === 'waiting' && { color: colors.textDim }]}>{st.label}</Text>
                <Text style={s.small}>{label[status]}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const toneColor = (tone?: Tone) => (tone === 'good' ? colors.ok : tone === 'bad' ? colors.danger : colors.textDim);

function Stats({ b }: { b: B<'stats'> }) {
  const s = useStyles();
  return (
    <Pairs>
      {b.items.map((it, i) => (
        <View key={i} style={[s.card, { borderRadius: 16, gap: 2 }]}>
          <Text style={s.dim13}>{it.label}</Text>
          <Text style={[s.kpi, it.tone === 'bad' && { color: colors.danger }]}>{num(it.value)}</Text>
          {it.note ? <Text style={[s.note, { color: toneColor(it.tone) }]}>{it.note}</Text> : null}
        </View>
      ))}
    </Pairs>
  );
}

function Chart({ b }: { b: B<'chart'> }) {
  const s = useStyles();
  const values = b.values ?? [];
  const max = Math.max(...values, 1);
  const unit = b.unit ? ` ${b.unit}` : '';
  if (b.kind === 'pie') {
    const total = values.reduce((a, v) => a + v, 0) || 1;
    const C = 2 * Math.PI * 28;
    const palette = [colors.accent, LAVENDER, colors.statusBar === 'light' ? '#F4F1FA' : DEEP, '#D9C8FA', '#5B4F80'];
    let off = 0;
    return (
      <View style={[s.card, { gap: 8 }]}>
        <Text style={s.title14}>{b.title}</Text>
        <View style={{ alignSelf: 'center', transform: [{ rotate: '-90deg' }] }}>
          <Svg width={64} height={64} viewBox="0 0 72 72">
            {values.map((v, i) => {
              const len = (v / total) * C;
              const el = <Circle key={i} cx={36} cy={36} r={28} fill="none" stroke={palette[i % palette.length]} strokeWidth={12} strokeDasharray={`${len} ${C}`} strokeDashoffset={-off} />;
              off += len;
              return el;
            })}
          </Svg>
        </View>
        <View style={{ gap: 3 }}>
          {values.map((v, i) => (
            <View key={i} style={s.legend}>
              <View style={[s.swatch, { backgroundColor: palette[i % palette.length] }]} />
              <Text style={s.legendText} numberOfLines={1}>{b.labels?.[i] ?? ''}</Text>
              <Text style={s.legendVal}>{num(Math.round((100 * v) / total))}٪</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }
  if (b.kind === 'line') {
    const W = 280, H = 70;
    const min = Math.min(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [4 + (i * (W - 8)) / Math.max(1, values.length - 1), 6 + (H - 14) * (1 - (v - min) / span)]);
    const last = pts[pts.length - 1] ?? [0, 0];
    return (
      <View style={[s.card, { gap: 8 }]}>
        <Text style={s.title14}>{b.title}</Text>
        <View style={{ direction: 'ltr' }}>
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <Line x1={0} y1={H - 1} x2={W} y2={H - 1} stroke="#D9C8FA" strokeWidth={1} />
            <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={last[0]} cy={last[1]} r={4} fill={colors.accent} />
          </Svg>
        </View>
        <View style={[s.between, { direction: 'ltr' }]}>
          <Text style={s.small}>{num(values[0] ?? 0)}{unit}</Text>
          <Text style={[s.small, { color: colors.text, fontWeight: '600' }]}>{num(values[values.length - 1] ?? 0)}{unit}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.card, { gap: 12 }]}>
      <View style={s.between}>
        <Text style={s.title14}>{b.title}</Text>
        {b.subtitle ? <Text style={s.small}>{b.subtitle}</Text> : null}
      </View>
      <View style={s.bars} accessibilityRole="image" accessibilityLabel={b.title}>
        {values.map((v, i) => (
          <View key={i} style={s.barCol}>
            <Text style={s.barVal}>{num(v)}</Text>
            <View style={[s.barRect, { height: Math.max(4, (80 * v) / max), backgroundColor: i === values.length - 1 ? colors.accent : LAVENDER }]} />
            <Text style={s.barLbl} numberOfLines={1}>{b.labels?.[i] ?? num(i + 1)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Placeholder({ height, label, uri }: { height: number; label?: string; uri?: string }) {
  const s = useStyles();
  if (uri) {
    return (
      <View style={[s.ph, { height }]}>
        <Icon name="image" size={22} color={colors.statusBar === 'light' ? colors.textDim : DEEP} />
        <Image source={{ uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" accessibilityLabel={label} />
      </View>
    );
  }
  return (
    <View style={[s.ph, { height }]}>
      <Icon name="image" size={22} color={colors.statusBar === 'light' ? colors.textDim : DEEP} />
      {label ? <Text style={s.phText}>{label}</Text> : null}
    </View>
  );
}

function LinkCard({ b }: { b: B<'link'> }) {
  const s = useStyles();
  const site = b.site || b.url.replace(/^https?:\/\//, '').split('/')[0];
  return (
    <Pressable style={s.outline} onPress={() => open(b.url)} accessibilityRole="link">
      {b.image ? <Placeholder height={120} uri={b.image} label={b.title} /> : null}
      <View style={{ gap: 3, paddingVertical: 12, paddingHorizontal: 14 }}>
        <Text style={[s.small, { writingDirection: 'ltr', textAlign: isRTL ? 'right' : 'left' }]}>{site}</Text>
        <Text style={s.title15}>{b.title}</Text>
        {b.description ? <Text style={s.dim13} numberOfLines={1}>{b.description}</Text> : null}
      </View>
    </Pressable>
  );
}

function Location({ b }: { b: B<'location'> }) {
  const s = useStyles();
  const q = b.lat != null && b.lng != null ? `${b.lat},${b.lng}` : encodeURIComponent(b.address || b.title);
  const url = `https://maps.apple.com/?q=${encodeURIComponent(b.title)}&ll=${b.lat != null ? q : ''}${b.lat == null ? `&address=${q}` : ''}`;
  return (
    <View style={s.outline}>
      <View style={s.map} accessibilityLabel={b.title}>
        <View style={[s.road, { left: -20, right: -20, top: 58, height: 12, transform: [{ rotate: '-8deg' }] }]} />
        <View style={[s.road, { top: -20, bottom: -20, left: 110, width: 12, transform: [{ rotate: '14deg' }] }]} />
        <View style={[s.road, { top: -20, bottom: -20, right: 70, width: 8, transform: [{ rotate: '-20deg' }] }]} />
        <View style={s.pin}><Icon name="pin" size={22} color="#FFFFFF" /></View>
      </View>
      <View style={[s.rowCenter, { paddingStart: 14, paddingEnd: 4 }]}>
        <View style={{ flex: 1, gap: 2, paddingVertical: 10 }}>
          <Text style={s.title15}>{b.title}</Text>
          {b.address ? <Text style={s.dim13}>{b.address}</Text> : null}
        </View>
        <Pressable style={s.textBtn} onPress={() => open(url)} accessibilityRole="link">
          <Text style={s.textBtnText}>{t.openInMaps}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Images({ b }: { b: B<'images'> }) {
  const s = useStyles();
  const [first, ...rest] = b.images;
  if (!first) return null;
  if (!rest.length) {
    return (
      <Pressable style={s.imgRound} onPress={() => open(first)}><Placeholder height={170} uri={first} label={b.caption} /></Pressable>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Pressable style={s.imgRound} onPress={() => open(first)}><Placeholder height={170} uri={first} label={b.caption} /></Pressable>
      <View style={s.grid3}>
        {(rest.length > 3 ? rest.slice(0, 3) : rest).map((u, i, arr) => {
          const extra = b.images.length - 1 - arr.length;
          const last = i === arr.length - 1 && extra > 0;
          return (
            <Pressable key={u + i} style={[s.imgRound, s.third]} onPress={() => open(u)}>
              {last ? (
                <View style={s.more}><Text style={s.moreText}>{t.morePhotos(extra + 1)}</Text></View>
              ) : (
                <Placeholder height={104} uri={u} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FileCard({ b }: { b: B<'file'> }) {
  const s = useStyles();
  const ext = (b.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4);
  const pdf = ext === 'PDF';
  return (
    <View style={[s.card, s.rowCenter, { paddingVertical: 10, paddingHorizontal: 12, gap: 12 }]}>
      <View style={[s.fileBadge, { backgroundColor: pdf ? colors.accent : DEEP }]}><Text style={s.fileExt}>{ext}</Text></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={s.title15} numberOfLines={1}>{b.name}</Text>
        {b.size || b.meta ? <Text style={s.dim13}>{[b.size, b.meta].filter(Boolean).join(' · ')}</Text> : null}
      </View>
      {b.url ? (
        <>
          <Pressable style={s.roundBtn} onPress={() => open(b.url)} accessibilityLabel={`${t.previewFile} ${b.name}`}><Icon name="eye" size={20} color={colors.text} /></Pressable>
          <Pressable style={s.roundBtn} onPress={() => open(b.url)} accessibilityLabel={`${t.download} ${b.name}`}><Icon name="download" size={20} color={colors.text} /></Pressable>
        </>
      ) : null}
    </View>
  );
}

const WAVE = [10, 18, 26, 14, 30, 22, 12, 28, 20, 32, 16, 24, 10, 28, 18, 30, 14, 22, 26, 12, 20, 16, 24, 10];

function Audio({ b }: { b: B<'audio'> }) {
  const s = useStyles();
  return (
    <View style={[s.card, s.rowCenter, { paddingVertical: 10, paddingHorizontal: 12, gap: 12 }]}>
      <Pressable style={s.play} onPress={() => open(b.url)} accessibilityLabel={t.playAudio}><Icon name="play" size={18} color="#FFFFFF" fill="#FFFFFF" /></Pressable>
      <View style={s.wave}>
        {WAVE.map((h, i) => <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i < 9 ? colors.accent : LAVENDER }} />)}
      </View>
      {b.duration ? <Text style={s.small}>{b.duration}</Text> : null}
    </View>
  );
}

function Video({ b }: { b: B<'video'> }) {
  const s = useStyles();
  return (
    <Pressable style={s.video} onPress={() => open(b.url)} accessibilityLabel={t.playVideo}>
      {b.poster ? <Image source={{ uri: b.poster }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" /> : null}
      <View style={s.videoPlay}><Icon name="play" size={24} color={DEEP} fill={DEEP} /></View>
      {b.duration ? <Text style={s.videoDur}>{b.duration}</Text> : null}
    </Pressable>
  );
}

function Choices({ b }: { b: B<'choices'> }) {
  const s = useStyles();
  const { reply, enabled } = useBlockActions();
  const [picked, setPicked] = useState<string | null>(null);
  const opts = b.options.map((o) => (typeof o === 'string' ? { label: o, value: o, primary: true } : { value: o.label, primary: true, ...o }));
  return (
    <View style={{ gap: 10 }}>
      {b.question ? <Text style={s.q}>{b.question}</Text> : null}
      <View style={s.chips}>
        {opts.map((o, i) => {
          const on = picked === o.label;
          const primary = o.primary !== false;
          return (
            <Pressable
              key={i}
              disabled={!enabled || picked != null}
              onPress={() => { haptic.tap(); setPicked(o.label); reply(o.value ?? o.label); }}
              style={[s.choice, { borderColor: primary ? colors.accent : colors.borderStrong }, on && { backgroundColor: colors.accent }, picked != null && !on && { opacity: 0.45 }]}
              accessibilityRole="button"
            >
              <Text style={[s.choiceText, { color: on ? '#FFFFFF' : primary ? colors.link : colors.text }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Form({ b }: { b: B<'form'> }) {
  const s = useStyles();
  const { reply, enabled } = useBlockActions();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(b.fields.map((f) => [f.name, f.value ?? (f.type === 'choice' ? f.options?.[0] ?? '' : '')])));
  const [sent, setSent] = useState(false);
  const submit = () => {
    setSent(true);
    reply(`${b.title}\n${b.fields.map((f) => `- ${f.label}: ${vals[f.name] || '—'}`).join('\n')}`);
  };
  return (
    <View style={[s.card, { gap: 14, padding: 16 }]}>
      <Text style={s.title16}>{b.title}</Text>
      {b.fields.map((f) => (
        <View key={f.name} style={{ gap: 6 }}>
          <Text style={s.label}>{f.label}</Text>
          {f.type === 'choice' && f.options?.length ? (
            <Segmented value={vals[f.name]} onChange={(v) => setVals({ ...vals, [f.name]: v })} options={f.options.map((o) => ({ value: o, label: o }))} />
          ) : (
            <TextInput
              style={s.input}
              value={vals[f.name]}
              editable={!sent}
              onChangeText={(v) => setVals({ ...vals, [f.name]: v })}
              placeholder={f.type === 'date' ? 'YYYY-MM-DD' : ''}
              placeholderTextColor={colors.textDim}
            />
          )}
        </View>
      ))}
      <Pressable style={[s.submit, (sent || !enabled) && { opacity: 0.5 }]} disabled={sent || !enabled} onPress={submit} accessibilityRole="button">
        <Text style={s.submitText}>{sent ? t.sentToAgent : b.submit || t.sendToAgent}</Text>
      </Pressable>
    </View>
  );
}

function Checklist({ b }: { b: B<'checklist'> }) {
  const s = useStyles();
  const { reply, enabled } = useBlockActions();
  const [done, setDone] = useState(() => b.items.map((i) => !!i.done));
  const [dirty, setDirty] = useState(false);
  const count = done.filter(Boolean).length;
  const toggle = (i: number) => {
    haptic.tap();
    setDone((d) => d.map((x, j) => (j === i ? !x : x)));
    setDirty(true);
  };
  const send = () => {
    setDirty(false);
    reply(`${t.checklistUpdate(b.title)}\n${b.items.map((it, i) => `- [${done[i] ? 'x' : ' '}] ${it.label}`).join('\n')}`);
  };
  return (
    <View style={[s.card, { gap: 4, paddingHorizontal: 16 }]}>
      <View style={[s.between, { paddingBottom: 4 }]}>
        <Text style={s.title16}>{b.title}</Text>
        <Text style={s.dim13}>{t.ofCount(count, b.items.length)}</Text>
      </View>
      {b.items.map((it, i) => (
        <Pressable key={i} style={s.check} onPress={() => toggle(i)} accessibilityRole="checkbox" accessibilityState={{ checked: done[i] }}>
          <View style={[s.box, done[i] && s.boxOn]}>{done[i] ? <Icon name="check" size={15} color="#FFFFFF" strokeWidth={3} /> : null}</View>
          <Text style={[s.checkText, done[i] && s.checkDone]}>{it.label}</Text>
        </Pressable>
      ))}
      {dirty && enabled ? (
        <Pressable style={[s.submit, { marginTop: 6 }]} onPress={send} accessibilityRole="button">
          <Text style={s.submitText}>{t.sendToAgent}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Direction for a block: from its own text, else the app language. */
export function blockDir(block: HamzaBlock): 'rtl' | 'ltr' {
  return detectDirection(JSON.stringify(block).replace(/"(type|kind|url|image|poster|status|tone|name|label|value|title|items|steps|values|labels|options|fields|question|description|address|site|duration|size|meta|percent|unit|subtitle|images|caption|submit|done|primary|lat|lng)"/g, '')) ?? (isRTL ? 'rtl' : 'ltr');
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  const dark = colors.statusBar === 'light';
  const phBg = dark ? colors.surface3 : '#EDE3FF';
  return {
    card: { padding: 14, borderRadius: 18, backgroundColor: colors.surface },
    outline: { borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden' },
    between: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    rowCenter: { flexDirection: 'row', alignItems: 'center' },
    title16: { color: colors.text, fontSize: fs(16), fontWeight: '700', flexShrink: 1 },
    title15: { color: colors.text, fontSize: fs(15), fontWeight: '600', textAlign: start },
    title14: { color: colors.text, fontSize: fs(14), fontWeight: '600', textAlign: start },
    pct: { color: colors.link, fontSize: fs(15), fontWeight: '700' },
    bar: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: 'hidden', flexDirection: 'row' },
    barFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
    step: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
    stepText: { color: colors.text, fontSize: fs(15), flex: 1 },
    small: { color: colors.textDim, fontSize: fs(12) },
    spinner: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: '#D9C8FA', borderTopColor: colors.accent },
    waiting: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.switchOff },
    dim13: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    kpi: { color: colors.text, fontSize: fs(28), fontWeight: '700', lineHeight: fs(34), textAlign: start },
    note: { fontSize: fs(12), fontWeight: '600', textAlign: start },
    legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    swatch: { width: 10, height: 10, borderRadius: 3 },
    legendText: { color: colors.text, fontSize: fs(12), flex: 1, writingDirection: 'ltr', textAlign: start },
    legendVal: { color: colors.text, fontSize: fs(12), fontWeight: '600' },
    bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 124, direction: 'ltr' },
    barCol: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
    barVal: { color: colors.text, fontSize: fs(11), fontWeight: '600' },
    barRect: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
    barLbl: { color: colors.textDim, fontSize: fs(11) },
    ph: { backgroundColor: phBg, alignItems: 'center', justifyContent: 'center', gap: 6 },
    phText: { color: dark ? colors.textDim : DEEP, fontSize: fs(12) },
    map: { height: 150, backgroundColor: phBg, overflow: 'hidden' },
    road: { position: 'absolute', backgroundColor: dark ? colors.surface : '#FFFFFF' },
    pin: { position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, marginLeft: -22, marginTop: -34, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    textBtn: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
    textBtnText: { color: colors.link, fontSize: fs(14), fontWeight: '600' },
    imgRound: { borderRadius: 14, overflow: 'hidden' },
    grid3: { flexDirection: 'row', gap: 6 },
    third: { flex: 1 },
    more: { height: 104, backgroundColor: DEEP, alignItems: 'center', justifyContent: 'center' },
    moreText: { color: '#FFFFFF', fontSize: fs(22), fontWeight: '700' },
    fileBadge: { width: 44, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    fileExt: { color: '#FFFFFF', fontSize: fs(11), fontWeight: '700' },
    roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 36, direction: 'ltr', overflow: 'hidden' },
    video: { height: 190, borderRadius: 16, backgroundColor: DEEP, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    videoPlay: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    videoDur: { position: 'absolute', end: 12, bottom: 10, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#0D0029', color: '#FFFFFF', fontSize: fs(12), fontWeight: '600', overflow: 'hidden' },
    q: { color: colors.text, fontSize: fs(16), lineHeight: fs(26), textAlign: start },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: { height: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, backgroundColor: colors.bg, justifyContent: 'center' },
    choiceText: { fontSize: fs(15), fontWeight: '600' },
    label: { color: colors.textDim, fontSize: fs(13), fontWeight: '600', textAlign: start },
    input: { height: 48, borderRadius: 12, backgroundColor: colors.bg, color: colors.text, paddingHorizontal: 14, fontSize: fs(16), textAlign: start },
    submit: { height: 50, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    submitText: { color: '#FFFFFF', fontSize: fs(16), fontWeight: '600' },
    check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.switchOff, alignItems: 'center', justifyContent: 'center' },
    boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkText: { color: colors.text, fontSize: fs(16), flex: 1, textAlign: start },
    checkDone: { color: colors.textDim, textDecorationLine: 'line-through' },
  };
});
