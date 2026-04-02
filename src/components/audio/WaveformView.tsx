/**
 * WaveformView — Real-time audio waveform visualization
 *
 * Renders animated bars that respond to microphone volume level.
 * Uses React Native's built-in Animated API (reanimated temporarily disabled for old-arch compat).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface WaveformViewProps {
  /** Volume level 0.0 (silent) to 1.0 (loudest) */
  volumeLevel: number;
  /** Number of waveform bars */
  barCount?: number;
  active?: boolean;
  style?: Record<string, unknown>;
}

/** Generate symmetric bar heights around center (tallest in middle) */
function generateBarHeights(count: number, volume: number, phase: number, active: boolean): number[] {
  const heights: number[] = [];
  const mid = count / 2;
  for (let i = 0; i < count; i++) {
    const dist = Math.abs(i - mid) / mid;
    const activity = active ? Math.max(volume, 0.06) : Math.max(volume * 0.25, 0.02);
    const baseHeight = 6 + (1 - dist) * activity * 48;
    const shimmer = Math.sin(phase * 1.4 + i * 0.62) * 0.55;
    const echo = Math.cos(phase * 0.9 - i * 0.48) * 0.35;
    const jitter = 1 + shimmer * 0.32 + echo * 0.18;
    heights.push(Math.max(4, baseHeight * jitter));
  }
  return heights;
}

export function WaveformView({
  volumeLevel,
  barCount = 24,
  active = false,
  style,
}: WaveformViewProps) {
  // Use standard RN Animated.Value for each bar
  const barAnims = useRef<Animated.Value[]>(
    Array.from({ length: barCount }, () => new Animated.Value(4)),
  ).current;
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase((value) => value + 0.32);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const targetHeights = generateBarHeights(barCount, volumeLevel, phase, active);
    targetHeights.forEach((h, i) => {
      Animated.timing(barAnims[i], {
        toValue: h,
        duration: 70,
        useNativeDriver: false,
      }).start();
    });
  }, [active, barCount, barAnims, phase, volumeLevel]);

  const bars = useMemo(
    () => Array.from({ length: barCount }, (_, i) => i),
    [barCount],
  );

  return (
    <View style={[styles.container, style]}>
      {bars.map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: barAnims[i],
              opacity: active ? 0.95 : 0.45,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: 56,
    paddingHorizontal: 6,
  },
  bar: {
    width: 4,
    minHeight: 4,
    borderRadius: 999,
    backgroundColor: '#73f0ff',
  },
});

export default WaveformView;
