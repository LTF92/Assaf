import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { current } from './settings';

/** Haptic taps that respect the "Haptic feedback" setting. */
export const haptic = {
  tap() {
    if (current.haptics && Platform.OS !== 'web') void Haptics.selectionAsync();
  },
  press() {
    if (current.haptics && Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  success() {
    if (current.haptics && Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};
