import { haptic } from '../lib/haptics';
import React, { memo, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '../lib/i18n';
import { colors, mono, radius, makeStyles } from '../lib/theme';
import type { CardAction, Message } from '../lib/types';
import { Markdown } from './Markdown';
import { Appear, useLoop } from './motion';

interface Props {
  m: Message;
  onAction: (messageId: string, value: string) => void;
  onOther?: () => void;
}

/** Approval / question / confirmation with real buttons — no typing "/approve". */
function CardViewImpl({ m, onAction, onOther }: Props) {
  const s = useStyles();
  const card = m.card!;
  const [tapped, setTapped] = useState<string | null>(null);
  const pending = card.state === 'pending';
  const tone = card.type === 'approval' ? colors.warn : card.type === 'confirm' ? colors.warn : colors.accent;
  const glow = useLoop(1800, pending);
  const title = card.type === 'approval' ? (pending ? t.approvalNeeded : t.approval) : card.type === 'clarify' ? t.question : card.title || t.confirm;

  const press = (a: CardAction) => {
    if (!pending || tapped) return;
    haptic.press();
    if (a.value === 'other') onOther?.();
    setTapped(a.value);
    onAction(m.id, a.value);
    setTimeout(() => setTapped(null), 4000); // re-enable if the bridge never answered
  };

  return (
    <View style={[s.card, { borderColor: pending ? tone : colors.border }]}>
      {pending && (
        <Animated.View
          pointerEvents="none"
          style={[s.glow, { borderColor: tone, opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }]}
        />
      )}
      <View style={s.head}>
        <Animated.View
          style={[
            s.badge,
            { backgroundColor: pending ? tone : colors.surface2 },
            pending && { transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] },
          ]}
        />
        <Text style={[s.title, { color: pending ? tone : colors.textDim }]}>{title}</Text>
      </View>

      {card.type === 'approval' && card.command ? (
        <>
          {card.description ? <Text style={s.desc}>{card.description}</Text> : null}
          <ScrollView horizontal style={s.cmd} contentContainerStyle={{ padding: 10 }}>
            <Text selectable style={s.cmdText}>{card.command}</Text>
          </ScrollView>
        </>
      ) : (
        <Markdown text={m.text} />
      )}

      {pending ? (
        <View style={card.actions.length > 3 || card.type === 'clarify' ? s.actionsCol : s.actionsRow}>
          {card.actions.map((a) => {
            const primary = a.style === 'primary' || (card.type === 'clarify' && a.value !== 'other');
            const danger = a.style === 'danger' || a.value === 'deny';
            return (
              <Pressable
                key={a.value}
                onPress={() => press(a)}
                disabled={!!tapped}
                style={({ pressed }) => [
                  s.btn,
                  card.type !== 'clarify' && { flexGrow: 1 },
                  primary && s.btnPrimary,
                  danger && s.btnDanger,
                  pressed && { transform: [{ scale: 0.97 }] },
                  tapped === a.value && { opacity: 0.6 },
                ]}
              >
                <Text style={[s.btnText, primary && { color: colors.accentText }, danger && { color: colors.danger }]}>
                  {a.value === 'other' ? t.other : a.label}
                </Text>
              </Pressable>
            );
          })}
          {card.awaiting_text ? <Text style={s.hint}>{t.typeAnswer}</Text> : null}
        </View>
      ) : (
        <Appear scale from={4}>
          <Text style={[s.resolution, card.state === 'expired' && { color: colors.textFaint }]}>
            {card.state === 'expired' ? t.expired : `✓ ${card.resolution?.label ?? ''}${card.resolution?.by ? ` · ${card.resolution.by}` : ''}`}
          </Text>
        </Appear>
      )}
    </View>
  );
}

export const CardView = memo(CardViewImpl);

const useStyles = makeStyles((colors, fs) => ({
  card: { marginHorizontal: 14, marginVertical: 6, padding: 15, borderRadius: radius.lg, borderWidth: 1.5, backgroundColor: colors.surface, gap: 11 },
  glow: { position: 'absolute', left: -5, top: -5, right: -5, bottom: -5, borderRadius: radius.lg + 5, borderWidth: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: fs(13), fontWeight: '700', letterSpacing: 0.3 },
  desc: { color: colors.textDim, fontSize: fs(14) },
  cmd: { backgroundColor: colors.code, borderRadius: radius.sm, maxHeight: 220 },
  cmdText: { color: '#FFD58A', fontFamily: mono, fontSize: fs(13), lineHeight: fs(19) },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionsCol: { gap: 8 },
  btn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnDanger: { borderColor: colors.danger, backgroundColor: 'transparent' },
  btnText: { color: colors.text, fontSize: fs(15), fontWeight: '600' },
  resolution: { color: colors.ok, fontSize: fs(14), fontWeight: '600' },
  hint: { color: colors.textDim, fontSize: fs(13), textAlign: 'center' },
}));
