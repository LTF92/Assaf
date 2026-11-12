import React from 'react';
import { Animated, View } from 'react-native';

import { colors } from '../lib/theme';
import type { ConnStatus } from '../lib/types';
import { useLoop } from './motion';

export function statusColor(status: ConnStatus) {
  return status === 'online' ? colors.ok : status === 'connecting' ? colors.warn : status === 'unauthorized' ? colors.danger : colors.textFaint;
}

/** Connection light. While connecting it breathes, so a stuck connection is obvious at a glance. */
export function StatusDot({ status, size = 8 }: { status: ConnStatus; size?: number }) {
  const color = statusColor(status);
  const pulse = useLoop(1300, status === 'connecting');
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {status === 'connecting' && (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
          }}
        />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}
