import React from 'react';
import { View } from 'react-native';

import { colors } from '../lib/theme';
import type { ConnStatus } from '../lib/types';

export function statusColor(status: ConnStatus) {
  return status === 'online' ? colors.ok : status === 'connecting' ? colors.warn : status === 'unauthorized' ? colors.danger : colors.textFaint;
}

export function StatusDot({ status, size = 8 }: { status: ConnStatus; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: statusColor(status) }} />;
}
