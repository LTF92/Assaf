import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { HermesClient, ModelCatalog } from '../lib/client';
import { haptic } from '../lib/haptics';
import { isRTL, t } from '../lib/i18n';
import { modelCommand, modelLabel, sameModel } from '../lib/models';
import { useSettings, type FavoriteModel } from '../lib/settings';
import { colors, makeStyles } from '../lib/theme';
import { Button, Group, Row, Sheet } from './Form';
import { Icon } from './Icon';

/** A small square with the provider's first letter, so models from different providers tell apart. */
export function ProviderBadge({ provider }: { provider: string }) {
  const s = useStyles();
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>{(provider || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

/** The brain button's sheet: the user's favorite models, a tick on the one this chat uses. */
export function ModelMenu({ visible, onClose, connId, client }: { visible: boolean; onClose: () => void; connId: string; client?: HermesClient }) {
  const s = useStyles();
  const { settings, set } = useSettings();
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  useEffect(() => {
    if (!visible || !client) return;
    client.models().then(setCatalog, () => {});
  }, [visible, client]);

  const favs = settings.favoriteModels;
  const current: FavoriteModel | null = settings.chosenModel[connId] ?? (catalog ? { id: catalog.current.model, provider: catalog.current.provider } : null);
  const providerName = (slug: string) => catalog?.providers.find((p) => p.slug === slug)?.name ?? slug;

  const pick = (m: FavoriteModel) => {
    haptic.tap();
    onClose();
    if (sameModel(m, current)) return;
    set('chosenModel', { ...settings.chosenModel, [connId]: m });
    client?.send(modelCommand(m), []);
  };
  const edit = () => {
    onClose();
    router.push('/models');
  };

  return (
    <Sheet visible={visible} onClose={onClose} label={t.modelMenu}>
      <View style={s.head}>
        <View style={s.headIcon}><Icon name="brain" size={20} color={colors.link} /></View>
        <Text style={s.title}>{t.modelMenu}</Text>
      </View>
      {favs.length ? (
        <>
          <Group>
            {favs.map((m) => {
              const on = sameModel(m, current);
              return (
                <Row key={`${m.provider}/${m.id}`} label={modelLabel(m.id)} hint={`${m.id} · ${providerName(m.provider)}`}
                  lead={<ProviderBadge provider={providerName(m.provider)} />} onPress={() => pick(m)}>
                  {on ? <Icon name="check" size={20} color={colors.link} strokeWidth={2.4} /> : null}
                </Row>
              );
            })}
          </Group>
          {current && !favs.some((m) => sameModel(m, current)) ? (
            <Text style={s.now}>{t.currentModel}: {modelLabel(current.id)}</Text>
          ) : null}
          <Button kind="link" label={t.editFavorites} onPress={edit} />
        </>
      ) : (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>{t.noFavorites}</Text>
          <Text style={s.emptyHint}>{t.noFavoritesHint}</Text>
          <Button label={t.pickFavorites} onPress={edit} style={{ alignSelf: 'stretch', marginTop: 6 }} />
        </View>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles((colors, fs) => {
  const start = isRTL ? 'right' : 'left';
  return {
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.text, fontSize: fs(18), fontWeight: '700', textAlign: start, flex: 1 },
    badge: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: colors.link, fontSize: fs(14), fontWeight: '700' },
    now: { color: colors.textDim, fontSize: fs(13), textAlign: start },
    empty: { alignItems: 'center', gap: 6, paddingVertical: 10 },
    emptyTitle: { color: colors.text, fontSize: fs(16), fontWeight: '700', textAlign: 'center' },
    emptyHint: { color: colors.textDim, fontSize: fs(14), lineHeight: fs(21), textAlign: 'center' },
  };
});
