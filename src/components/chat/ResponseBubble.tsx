import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface ResponseBubbleProps {
  text: string;
  isSpeaking?: boolean;
  footerLabel?: string;
}

export function ResponseBubble({ text, isSpeaking, footerLabel }: ResponseBubbleProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isSpeaking) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 420, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isSpeaking, pulse]);

  if (!text) return null;

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>系统回传</Text>
        <Text style={styles.headerState}>{isSpeaking ? '语音播报' : '文本返回'}</Text>
      </View>
      <Text style={styles.text}>{text}</Text>
      {footerLabel ? <Text style={styles.footer}>{footerLabel}</Text> : null}
      {isSpeaking ? (
        <View style={styles.audioRow}>
          {[0, 1, 2, 3].map((index) => {
            const height = pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [8 + index * 2, 18 + index * 4],
            });
            return <Animated.View key={index} style={[styles.audioBar, { height }]} />;
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(15, 30, 42, 0.96)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 141, 77, 0.24)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLabel: {
    color: '#ffb17b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerState: {
    color: '#ffd2b5',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  text: {
    color: '#f1fbff',
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    color: '#ffb17b',
    fontSize: 10,
    marginTop: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  audioRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 9,
    alignItems: 'flex-end',
  },
  audioBar: {
    width: 4,
    borderRadius: 999,
    backgroundColor: '#ff8d4d',
  },
});
