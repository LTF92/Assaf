import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { haptic } from '../lib/haptics';
import { makeStyles } from '../lib/theme';

/** The brand's segmented control: a lavender track with the chosen option filled violet. */
export function Segmented<V extends string | number>({ options, value, onChange, label, small }: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  label?: string;
  small?: boolean;
}) {
  const s = useStyles();
  return (
    <View style={s.track} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            style={[s.seg, on && s.segOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              if (!on) haptic.tap();
              onChange(o.value);
            }}
          >
            <Text style={[s.text, small && s.small, on && s.textOn]} numberOfLines={1} adjustsFontSizeToFit>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => ({
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: colors.surface },
  seg: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segOn: { backgroundColor: colors.accent },
  text: { color: colors.text, fontSize: fs(15), fontWeight: '500' },
  small: { fontSize: fs(13), fontWeight: '600' },
  textOn: { color: '#FFFFFF', fontWeight: '600' },
}));
