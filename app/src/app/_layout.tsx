import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { t } from '../lib/i18n';
import { parsePairingLink } from '../lib/pairing';
import { ConnectionsProvider, useConnections } from '../lib/store';
import { colors } from '../lib/theme';

/** hermesmobile://pair?d=… opened from the camera app or a shared link pairs immediately. */
function DeepLinks() {
  const { add } = useConnections();
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (!url || !url.includes('pair')) return;
    const payload = parsePairingLink(url);
    if (!payload) return void Alert.alert(t.invalidLink);
    void add(payload).then((conn) => router.replace(`/chat/${conn.id}`));
  }, [url, add]);

  return Platform.OS === 'web' ? null : <NotificationOpener />;
}

/** Tapping a push notification opens that profile's chat. */
function NotificationOpener() {
  const { connections } = useConnections();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = response?.notification.request.content.data as { profile?: string } | undefined;
    const target = data?.profile && connections.find((c) => c.profile === data.profile);
    if (target) router.push(`/chat/${target.id}`);
  }, [response, connections]);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ConnectionsProvider>
        <StatusBar style="light" />
        <DeepLinks />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: t.appName }} />
          <Stack.Screen name="add" options={{ title: t.addConnection, presentation: 'modal' }} />
          <Stack.Screen name="chat/[id]" options={{ title: '' }} />
          <Stack.Screen name="connection/[id]" options={{ title: t.settings }} />
          <Stack.Screen name="share/[id]" options={{ title: t.share }} />
        </Stack>
      </ConnectionsProvider>
    </SafeAreaProvider>
  );
}
