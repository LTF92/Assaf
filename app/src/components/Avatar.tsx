import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { avatarPalette } from '../lib/theme';
import { Gradient } from './motion';

function pick(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return avatarPalette[Math.abs(h) % avatarPalette.length];
}

/** Round two-tone badge with the profile's first letter. */
export function Avatar({ label, seed, size = 52 }: { label: string; seed: string; size?: number }) {
  const pair = pick(seed);
  const letter = Array.from(label.trim())[0]?.toUpperCase() ?? '•';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <Gradient colors={pair} radius={size / 2} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }]} />
      <Text style={{ color: '#12100B', fontSize: size * 0.42, fontWeight: '800' }}>{letter}</Text>
    </View>
  );
}
