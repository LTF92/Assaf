/**
 * Small animation building blocks on React Native's built-in Animated API
 * (no extra native modules, so it runs in Expo Go as is).
 */
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const native = true;

/** Fades and slides its children in once, when mounted. `from` is the starting offset in px. */
export function Appear({
  children,
  style,
  delay = 0,
  from = 14,
  axis = 'y',
  scale = false,
  enabled = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  from?: number;
  axis?: 'x' | 'y';
  scale?: boolean;
  enabled?: boolean;
}) {
  const v = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  useEffect(() => {
    if (!enabled) return;
    Animated.spring(v, { toValue: 1, delay, damping: 18, stiffness: 180, mass: 0.9, useNativeDriver: native }).start();
  }, [enabled, delay, v]);
  const offset = v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  const transform: any[] = [axis === 'y' ? { translateY: offset } : { translateX: offset }];
  if (scale) transform.push({ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) });
  return <Animated.View style={[style, { opacity: v, transform }]}>{children}</Animated.View>;
}

/** Pressable that shrinks a little under the finger, with an optional light haptic tap. */
export function PressScale({
  children,
  style,
  to = 0.96,
  haptic = false,
  onPress,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; to?: number; haptic?: boolean; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  const go = (toValue: number) => Animated.spring(v, { toValue, damping: 15, stiffness: 320, useNativeDriver: native }).start();
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => { go(to); rest.onPressIn?.(e); }}
      onPressOut={(e) => { go(1); rest.onPressOut?.(e); }}
      onPress={(e) => {
        if (haptic) void Haptics.selectionAsync();
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Looping 0 → 1 → 0 value, for pulses and glows. */
export function useLoop(duration = 1400, active = true) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      v.stopAnimation();
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, duration, v]);
  return v;
}

/** Three dots bouncing one after another: the agent is writing. */
export function TypingDots({ color, size = 7 }: { color: string; size?: number }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(d, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(d, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: native }),
          Animated.delay((2 - i) * 140 + 220),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.7, alignItems: 'center', height: size * 2.6 }}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.7] }) }],
          }}
        />
      ))}
    </View>
  );
}

/** Rotating value for a chevron: 0 closed, 1 open. */
export function useToggle(open: boolean) {
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: open ? 1 : 0, damping: 16, stiffness: 220, useNativeDriver: native }).start();
  }, [open, v]);
  return v;
}

let gid = 0;
/** Diagonal two-colour fill (SVG, so it works everywhere without a native gradient module). */
export function Gradient({ colors, style, radius = 0 }: { colors: string[]; style?: StyleProp<ViewStyle>; radius?: number }) {
  const id = useRef(`g${++gid}`).current;
  return (
    <View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: radius, overflow: 'hidden' }, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1] ?? colors[0]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
