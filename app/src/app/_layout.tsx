import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Alert, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '../components/AppLock';
import { InAppBanner } from '../components/Banner';
import { t } from '../lib/i18n';
import { parsePairingLink } from '../lib/pairing';
import { SettingsProvider, useSettings } from '../lib/settings';
import { ConnectionsProvider, useConnections } from '../lib/store';
import { useTheme } from '../lib/theme';

/** hermesmobile://pair?d=… opened from the camera app or a shared link pairs immediately. */
function DeepLinks() {
  const { add } = useConnections();
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (!url || !url.includes('pair')) return;
    const payload = parsePairingLink(url);
    if (!payload) return void Alert.alert(t.invalidLink);
    // A guest invite shows who shared what before joining.
    if (payload.role === 'guest') return void router.push({ pathname: '/join', params: { link: url } });
    void add(payload).then((conn) => router.replace(`/chat/${conn.id}`));
  }, [url, add]);

  return Platform.OS === 'web' ? null : <NotificationOpener />;
}

/** Tapping a push notification opens that profile's chat. */
function NotificationOpener() {
  const { connections } = useConnections();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    // Expo-style pushes carry it in content.data; a direct APNs push in the raw payload.
    const req = response?.notification.request;
    const raw = (req?.trigger as { payload?: { profile?: string } } | null | undefined)?.payload;
    const data = ((req?.content.data as { profile?: string } | undefined)?.profile ? req?.content.data : raw) as { profile?: string } | undefined;
    const target = data?.profile && connections.find((c) => c.profile === data.profile);
    if (target) router.push(`/chat/${target.id}`);
  }, [response, connections]);
  return null;
}

function Shell() {
  // Re-renders the navigator when the theme or language changes.
  const { colors: c } = useTheme();
  const { ready } = useSettings();
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  return (
    <ConnectionsProvider>
      <StatusBar style={c.statusBar} />
      <DeepLinks />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { color: c.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: t.appName, headerShown: false }} />
        <Stack.Screen name="inbox" options={{ title: t.inbox, headerShown: false }} />
        <Stack.Screen name="add" options={{ title: t.pairTitle, presentation: 'modal', headerShown: false }} />
        {/* iOS 26 turns on a back swipe from anywhere on the screen, which steals sideways swipes from
            tables and code blocks in messages. Chats keep the classic swipe from the screen edge. */}
        <Stack.Screen name="chat/[id]" options={{ title: '', headerShown: false, fullScreenGestureEnabled: false }} />
        <Stack.Screen name="connection/[id]" options={{ title: t.customize, presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="share/[id]" options={{ title: t.shareAgent, headerShown: false }} />
        <Stack.Screen name="share/invite" options={{ title: t.invitePerson, headerShown: false }} />
        <Stack.Screen name="jobs" options={{ title: t.jobsTitle, headerShown: false }} />
        <Stack.Screen name="job" options={{ title: t.editJob, presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="notifications" options={{ title: t.notifications, headerShown: false }} />
        <Stack.Screen name="models" options={{ title: t.favoriteModels, headerShown: false }} />
        <Stack.Screen name="join" options={{ title: t.acceptInvite, presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: t.appSettings, headerShown: false }} />
      </Stack>
      <InAppBanner />
      <AppLock />
    </ConnectionsProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <Shell />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
