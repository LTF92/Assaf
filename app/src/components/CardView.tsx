import React, { memo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '../lib/haptics';
import { isRTL, t } from '../lib/i18n';
import { colors, mono, makeStyles } from '../lib/theme';
import type { CardAction, Message } from '../lib/types';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { Appear, PressScale } from './motion';

interface Props {
  m: Message;
  agentName?: string;
  onAction: (messageId: string, value: string) => void;
  onOther?: () => void;
}

/** Localised label for the bridge's standard approval values. */
function actionLabel(a: CardAction) {
  return a.value === 'once' ? t.allowOnce : a.value === 'deny' ? t.deny : a.value === 'session' ? t.allowSession
    : a.value === 'always' ? t.allowAlways : a.value === 'other' ? t.other : a.label;
}

function useTap(m: Message, onAction: Props['onAction'], onOther?: () => void) {
  const [tapped, setTapped] = useState<string | null>(null);
  const press = (a: CardAction) => {
    if (m.card?.state !== 'pending' || tapped) return;
    haptic.press();
    if (a.value === 'other') onOther?.();
    setTapped(a.value);
    onAction(m.id, a.value);
    setTimeout(() => setTapped(null), 4000); // re-enable if the bridge never answered
  };
  return { tapped, press };
}

/** The approval sheet: what will run, and three plain answers. */
function ApprovalSheet({ m, agentName, visible, onClose, onAction }: Props & { visible: boolean; onClose: () => void }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const card = m.card!;
  const { tapped, press } = useTap(m, (id, v) => { onAction(id, v); onClose(); });
  const by = (v: string) => card.actions.find((a) => a.value === v);
  const once = by('once') ?? card.actions.find((a) => a.style === 'primary') ?? card.actions[0];
  const deny = by('deny') ?? card.actions.find((a) => a.style === 'danger');
  const extra = card.actions.filter((a) => a !== once && a !== deny);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel={t.cancel} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 20, direction: isRTL ? 'rtl' : 'ltr' }]}>
        <View style={s.handle} />
        <View style={s.sheetHead}>
          <View style={s.sheetIcon}><Icon name="shield" size={24} color={colors.link} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.sheetTitle}>{t.approvalAsks(agentName || '')}</Text>
            <Text style={s.sheetSub}>{t.approvalSub}</Text>
          </View>
        </View>
        {card.command ? (
          <ScrollView style={s.cmd} contentContainerStyle={{ padding: 14 }}>
            <Text selectable style={s.cmdText}><Text style={{ color: '#B88CFF' }}>$ </Text>{card.command}</Text>
          </ScrollView>
        ) : <Markdown text={m.text} />}
        {card.description ? (
          <View style={s.dl}>
            <Text style={s.dt}>{t.details}</Text>
            <Text style={s.dd}>{card.description}</Text>
          </View>
        ) : null}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {once ? (
              <PressScale style={[s.bigBtn, s.primary, tapped === once.value && { opacity: 0.6 }]} onPress={() => press(once)}>
                <Text style={s.primaryText}>{actionLabel(once)}</Text>
              </PressScale>
            ) : null}
            {deny ? (
              <PressScale style={[s.bigBtn, s.outline, tapped === deny.value && { opacity: 0.6 }]} onPress={() => press(deny)}>
                <Text style={s.dangerText}>{actionLabel(deny)}</Text>
              </PressScale>
            ) : null}
          </View>
          {extra.map((a) => (
            <PressScale key={a.value} style={s.textBtn} onPress={() => press(a)}>
              <Text style={s.linkText}>{actionLabel(a)}</Text>
            </PressScale>
          ))}
        </View>
      </View>
    </Modal>
  );
}

/** Approval / question / confirmation with real buttons, no typing "/approve". */
function CardViewImpl({ m, agentName, onAction, onOther }: Props) {
  const s = useStyles();
  const card = m.card!;
  const pending = card.state === 'pending';
  const [sheet, setSheet] = useState(false);
  const { tapped, press } = useTap(m, onAction, onOther);

  if (card.type === 'approval') {
    if (!pending) {
      return (
        <Appear scale from={4} style={s.doneRow}>
          <Icon name={card.state === 'expired' ? 'clock' : card.resolution?.value === 'deny' ? 'close' : 'shieldCheck'} size={18} color={colors.textDim} />
          <Text style={s.doneText} numberOfLines={1}>
            {card.state === 'expired' ? t.expired : `${card.resolution?.label ?? ''}${card.resolution?.by ? ` · ${card.resolution.by}` : ''}`}
          </Text>
          {card.command ? <Text style={s.doneCmd} numberOfLines={1}>{card.command}</Text> : null}
        </Appear>
      );
    }
    return (
      <>
        <PressScale style={s.reviewRow} onPress={() => setSheet(true)} haptic>
          <Icon name="shield" size={20} color={colors.link} />
          <Text style={s.reviewText}>{t.needsApprovalRow}</Text>
          <Text style={s.reviewLink}>{t.review}</Text>
        </PressScale>
        <ApprovalSheet m={m} agentName={agentName} visible={sheet} onClose={() => setSheet(false)} onAction={onAction} />
      </>
    );
  }

  const title = card.type === 'clarify' ? t.question : card.title || t.confirm;
  return (
    <View style={[s.card, pending && { borderColor: colors.accent }]}>
      <View style={s.head}>
        <Icon name={card.type === 'clarify' ? 'chat' : 'shield'} size={18} color={pending ? colors.link : colors.textDim} />
        <Text style={[s.title, !pending && { color: colors.textDim }]}>{title}</Text>
      </View>
      <Markdown text={m.text} />
      {pending ? (
        <View style={s.actions}>
          {card.actions.map((a) => {
            const primary = a.style === 'primary' || (card.type === 'clarify' && a.value !== 'other');
            const danger = a.style === 'danger' || a.value === 'deny' || a.value === 'cancel';
            return (
              <PressScale
                key={a.value}
                onPress={() => press(a)}
                disabled={!!tapped}
                style={[s.btn, primary && s.primary, danger && s.outline, tapped === a.value && { opacity: 0.6 }]}
              >
                <Text style={[s.btnText, primary && s.primaryText, danger && s.dangerText]}>{actionLabel(a)}</Text>
              </PressScale>
            );
          })}
          {card.awaiting_text ? <Text style={s.hint}>{t.typeAnswer}</Text> : null}
        </View>
      ) : (
        <Text style={s.resolution}>
          {card.state === 'expired' ? t.expired : `${card.resolution?.label ?? ''}${card.resolution?.by ? ` · ${card.resolution.by}` : ''}`}
        </Text>
      )}
    </View>
  );
}

export const CardView = memo(CardViewImpl);

const useStyles = makeStyles((colors, fs) => ({
  reviewRow: { marginHorizontal: 16, marginVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.link },
  reviewText: { flex: 1, color: colors.text, fontSize: fs(15), fontWeight: '600', textAlign: isRTL ? 'right' : 'left' },
  reviewLink: { color: colors.link, fontSize: fs(15), fontWeight: '600' },
  doneRow: { marginHorizontal: 16, marginVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface },
  doneText: { color: colors.textDim, fontSize: fs(14), fontWeight: '600' },
  doneCmd: { flex: 1, color: colors.textDim, fontSize: fs(12), fontFamily: mono, textAlign: 'left', direction: 'ltr' },
  card: { marginHorizontal: 16, marginVertical: 6, padding: 14, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.link, fontSize: fs(14), fontWeight: '700' },
  actions: { gap: 8 },
  btn: { minHeight: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.text, fontSize: fs(16), fontWeight: '600' },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: '#FFFFFF', fontSize: fs(17), fontWeight: '600' },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.borderStrong },
  dangerText: { color: colors.danger, fontSize: fs(17), fontWeight: '600' },
  resolution: { color: colors.ok, fontSize: fs(14), fontWeight: '600' },
  hint: { color: colors.textDim, fontSize: fs(13), textAlign: 'center' },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, gap: 18 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { color: colors.text, fontSize: fs(20), fontWeight: '700', textAlign: isRTL ? 'right' : 'left' },
  sheetSub: { color: colors.textDim, fontSize: fs(14), textAlign: isRTL ? 'right' : 'left' },
  cmd: { maxHeight: 200, borderRadius: 16, backgroundColor: colors.code, direction: 'ltr' },
  cmdText: { color: '#FFFFFF', fontFamily: mono, fontSize: fs(14), lineHeight: fs(22) },
  dl: { borderRadius: 16, backgroundColor: colors.surface, padding: 14, gap: 4 },
  dt: { color: colors.textDim, fontSize: fs(13), textAlign: isRTL ? 'right' : 'left' },
  dd: { color: colors.text, fontSize: fs(15), fontWeight: '600', textAlign: isRTL ? 'right' : 'left' },
  bigBtn: { flex: 1, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  textBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: colors.link, fontSize: fs(15), fontWeight: '600' },
}));
