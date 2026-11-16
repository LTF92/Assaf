import React from 'react';
import { Image, Text, View } from 'react-native';

import { avatarInk, avatarPalette } from '../lib/theme';
import type { AgentLook } from '../lib/types';

function pick(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return avatarPalette[Math.abs(h) % avatarPalette.length];
}

/** The agent's face: an emoji, a photo or its first letter on a flat brand-coloured squircle. */
export function Avatar({ label, seed, size = 52, look }: { label: string; seed: string; size?: number; look?: AgentLook }) {
  const bg = look?.bg ?? pick(seed);
  const r = Math.round(size * 0.3);
  if (look?.kind === 'photo' && look.photo) {
    return <Image source={{ uri: look.photo }} style={{ width: size, height: size, borderRadius: r }} resizeMode="cover" />;
  }
  const emoji = look?.kind === 'emoji' && look.emoji;
  const letter = Array.from((look?.name || label).trim())[0]?.toUpperCase() ?? '•';
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: avatarInk(bg), fontSize: size * (emoji ? 0.5 : 0.4), fontWeight: '700' }} allowFontScaling={false}>
        {emoji || letter}
      </Text>
    </View>
  );
}
