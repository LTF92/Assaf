import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  // In the foreground the chat itself shows the message; the bridge only pushes when no phone is active.
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

/**
 * Returns an Expo push token, or null when push is unavailable (simulator, Expo Go on Android,
 * no EAS projectId yet, or permission denied). The app works fine without it.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Hermes', importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}
