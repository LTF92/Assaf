import { Stack } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Group, Row, ScreenHeader, Section } from '../components/Form';
import { Icon } from '../components/Icon';
import { ProviderBadge } from '../components/ModelMenu';
import type { ModelCatalog } from '../lib/client';
import { haptic } from '../lib/haptics';
import { isRTL, t } from '../lib/i18n';
import { useAllChats } from '../lib/inbox';
import { modelLabel, sameModel } from '../lib/models';
import { useSettings, type FavoriteModel } from '../lib/settings';
import { useConnections } from '../lib/store';
import { colors, makeStyles } from '../lib/theme';

type Provider = ModelCatalog['providers'][number];

/** Settings → Favorite models: star the models the chat's brain menu should offer. */
export default function ModelsScreen() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { settings, set } = useSettings();
  const { client } = useConnections();
  const chats = useAllChats();
  const owners = chats.filter(({ conn, snap }) => conn.role !== 'guest' && snap?.status === 'online').map(({ conn }) => conn.id);
  const key = owners.join(',');
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');

  // Every online agent's catalog, merged by provider (agents on one Mac usually share most of it).
  useEffect(() => {
    if (!owners.length) return;
    let live = true;
    Promise.allSettled(owners.map((id) => client(id)?.models() ?? Promise.reject(new Error('offline')))).then((res) => {
      if (!live) return;
      const merged = new Map<string, Provider>();
      for (const r of res) {
        if (r.status !== 'fulfilled') continue;
        for (const p of r.value.providers) {
          const have = merged.get(p.slug) ?? { ...p, models: [] };
          for (const m of p.models) if (!have.models.includes(m)) have.models.push(m);
          merged.set(p.slug, have);
        }
      }
      setFailed(!merged.size && res.every((r) => r.status === 'rejected'));
      setProviders([...merged.values()]);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const favs = settings.favoriteModels;
  const isFav = (m: FavoriteModel) => favs.some((f) => sameModel(f, m));
  const toggle = (m: FavoriteModel) => {
    haptic.tap();
    set('favoriteModels', isFav(m) ? favs.filter((f) => !sameModel(f, m)) : [...favs, m]);
  };
  const nameOf = (slug: string) => providers?.find((p) => p.slug === slug)?.name ?? slug;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!providers) return [];
    return providers
      .map((p) => ({ ...p, models: needle ? p.models.filter((m) => `${m} ${modelLabel(m)} ${p.name}`.toLowerCase().includes(needle)) : p.models }))
      .filter((p) => p.models.length);
  }, [providers, q]);

  const star = (m: FavoriteModel) => {
    const on = isFav(m);
    return (
      <Pressable onPress={() => toggle(m)} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={t.favAdd(modelLabel(m.id))}>
        <Icon name="star" size={22} color={on ? colors.accent : colors.textFaint} fill={on ? colors.accent : undefined} strokeWidth={1.8} />
      </Pressable>
    );
  };

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={t.favoriteModels} />
        <Text style={s.lead}>{t.favoriteModelsHint}</Text>

        {favs.length > 0 && (
          <Section title={t.favoriteModels}>
            <Group>
              {favs.map((m) => (
                <Row key={`${m.provider}/${m.id}`} label={modelLabel(m.id)} hint={`${m.id} · ${nameOf(m.provider)}`} lead={<ProviderBadge provider={nameOf(m.provider)} />} onPress={() => toggle(m)}>
                  {star(m)}
                </Row>
              ))}
            </Group>
          </Section>
        )}

        {!owners.length ? (
          <Text style={s.state}>{t.modelsNeedOnline}</Text>
        ) : !providers ? (
          <ActivityIndicator color={colors.link} style={{ marginTop: 20 }} />
        ) : failed ? (
          <Text style={s.state}>{t.modelsLoadFailed}</Text>
        ) : (
          <>
            <View style={s.search}>
              <Icon name="search" size={18} color={colors.textDim} />
              <TextInput style={s.searchInput} value={q} onChangeText={setQ} placeholder={t.searchModels} placeholderTextColor={colors.textDim} autoCapitalize="none" autoCorrect={false} />
            </View>
            {shown.map((p) => (
              <Section key={p.slug} title={p.name}>
                <Group>
                  {p.models.map((id) => {
                    const m = { id, provider: p.slug };
                    return (
                      <Row key={id} label={modelLabel(id)} hint={id} onPress={() => toggle(m)}>
                        {star(m)}
                      </Row>
                    );
                  })}
                </Group>
              </Section>
            ))}
          </>
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
    lead: { color: colors.textDim, fontSize: fs(15), lineHeight: fs(22), textAlign: start, marginTop: -10 },
    state: { color: colors.textDim, fontSize: fs(15), textAlign: 'center', marginTop: 20 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 14 },
    searchInput: { flex: 1, color: colors.text, fontSize: fs(16), textAlign: start, height: 48 },
  };
});
