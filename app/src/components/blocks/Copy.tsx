import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { haptic } from '../../lib/haptics';
import { t } from '../../lib/i18n';
import { Icon } from '../Icon';

/** "نسخ" with an icon; flips to a check for a moment after copying. */
export function CopyButton({ text, color, size = 13 }: { text: string; color: string; size?: number }) {
  const [done, setDone] = useState(false);
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(text);
        haptic.tap();
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      accessibilityRole="button"
      accessibilityLabel={t.copy}
      hitSlop={6}
      style={{ height: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Icon name={done ? 'check' : 'copy'} size={16} color={color} />
      <Text style={{ color, fontSize: size, fontWeight: '600' }}>{done ? t.copiedShort : t.copy}</Text>
    </Pressable>
  );
}
