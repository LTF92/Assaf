import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../lib/i18n';
import { useSettings } from '../lib/settings';
import { colors, makeStyles } from '../lib/theme';
import { Icon } from './Icon';
import { Appear, PressScale } from './motion';

/** True when the phone has some way to unlock (Face ID, fingerprint or at least a passcode). */
export async function canLock(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export async function authenticate(): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: t.unlock, disableDeviceFallback: false });
    return res.success;
  } catch {
    return false;
  }
}

/**
 * Covers the app with a lock screen when "App lock" is on: at launch, and when
 * the app comes back after being away longer than the chosen delay.
 */
export function AppLock() {
  const { settings, ready } = useSettings();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [locked, setLocked] = useState(false);
  const leftAt = useRef<number | null>(null);
  const booted = useRef(false);
  const busy = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const ok = await authenticate();
    busy.current = false;
    if (ok) setLocked(false);
  }, []);

  // lock at launch
  useEffect(() => {
    if (!ready || booted.current) return;
    booted.current = true;
    if (settings.appLock && Platform.OS !== 'web') setLocked(true);
  }, [ready, settings.appLock]);

  // lock again after time away
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!settings.appLock || Platform.OS === 'web') return;
      if (state === 'background') leftAt.current = Date.now();
      if (state === 'active' && leftAt.current !== null) {
        const away = Date.now() - leftAt.current;
        leftAt.current = null;
        if (away >= settings.lockAfterMin * 60_000) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [settings.appLock, settings.lockAfterMin]);

  // ask straight away when the lock screen shows
  useEffect(() => {
    if (locked) void unlock();
  }, [locked, unlock]);

  if (!locked) return null;
  return (
    <View style={[StyleSheet.absoluteFill, s.screen]}>
      <Appear scale from={20} style={s.center}>
        <Image source={require('../../assets/logo.png')} style={s.logo} accessibilityLabel={t.appName} />
        <Text style={s.title}>{t.appName}</Text>
        <View style={s.sub}>
          <Icon name="lock" size={15} color={colors.textDim} strokeWidth={2} />
          <Text style={s.subText}>{t.locked}</Text>
        </View>
      </Appear>
      <PressScale haptic style={[s.btn, { bottom: insets.bottom + 40 }]} onPress={unlock} accessibilityRole="button">
        <Text style={s.btnText}>{t.unlock}</Text>
      </PressScale>
    </View>
  );
}

const useStyles = makeStyles((colors, fs) => ({
  screen: { backgroundColor: colors.bg, zIndex: 100, elevation: 100, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: 14 },
  logo: { width: 112, height: 112, borderRadius: 30 },
  title: { color: colors.text, fontSize: fs(34), fontWeight: '700', marginTop: 10 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subText: { color: colors.textDim, fontSize: fs(15) },
  btn: { position: 'absolute', left: 24, right: 24, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: fs(17), fontWeight: '600' },
}));
