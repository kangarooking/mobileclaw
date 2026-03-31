/**
 * WaveformView — Real-time audio waveform visualization
 *
 * Renders animated bars that respond to microphone volume level.
 * Uses react-native-reanimated for smooth 60fps animation.
 */

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

interface WaveformViewProps {
  /** Volume level 0.0 (silent) to 1.0 (loudest) */
  volumeLevel: number;
  /** Number of waveform bars */
  barCount?: number;
  style?: Record<string, unknown>;
}

/** Generate symmetric bar heights around center (tallest in middle) */
function generateBarHeights(count: number, volume: number): number[] {
  const heights: number[] = [];
  const mid = count / 2;
  for (let i = 0; i < count; i++) {
    const dist = Math.abs(i - mid) / mid;
    const baseHeight = 4 + (1 - dist) * volume * 40;
    const jitter = (Math.sin(i * 2.3 + volume * 10) * 0.15 + 1);
    heights.push(Math.max(3, baseHeight * jitter));
  }
  return heights;
}

export function WaveformView({
  volumeLevel,
  barCount = 24,
  style,
}: WaveformViewProps) {
  // Shared value array holding current height of each bar
  const barValues = useSharedValue(
    Array.from({ length: barCount }, () => 3),
  );

  // Animate to new heights when volume changes
  useEffect(() => {
    const targetHeights = generateBarHeights(barCount, volumeLevel);
    barValues.value = targetHeights.map((h) =>
      withTiming(h, { duration: 50 }),
    );
  }, [volumeLevel, barCount, barValues]);

  const bars = useMemo(
    () => Array.from({ length: barCount }, (_, i) => i),
    [barCount],
  );

  return (
    <View style={[styles.container, style]}>
      {bars.map((i) => {
        const animatedStyle = useAnimatedStyle(() => {
          const h = barValues.value[i] ?? 3;
          return {
            height: withTiming(h, { duration: 50 }),
            opacity: 0.6 + (h / 44) * 0.4,
          };
        });
        return <Animated.View key={i} style={[styles.bar, animatedStyle]} />;
      })}
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
    height: 48,
    paddingHorizontal: 8,
  },
  bar: {
    width: 3,
    minHeight: 3,
    borderRadius: 1.5,
    backgroundColor: '#3b82f6',
  },
});

export default WaveformView;
