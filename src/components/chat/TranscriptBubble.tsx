import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface TranscriptBubbleProps {
  text: string;
  isLive?: boolean;
  footerLabel?: string;
}

export function TranscriptBubble({ text, isLive, footerLabel }: TranscriptBubbleProps) {
  if (!text) return null;

  return (
    <View style={[styles.shell, isLive && styles.shellLive]}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>指令输入</Text>
        <Text style={[styles.headerState, isLive && styles.headerStateLive]}>
          {isLive ? '实时接收' : '已锁定'}
        </Text>
      </View>
      <Text style={styles.text}>
        {text}
        {isLive ? <Text style={styles.cursor}> ▊</Text> : null}
      </Text>
      {footerLabel ? <Text style={styles.footer}>{footerLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(8, 21, 34, 0.92)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.16)',
  },
  shellLive: {
    borderColor: 'rgba(89, 255, 209, 0.45)',
    backgroundColor: 'rgba(6, 28, 34, 0.96)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLabel: {
    color: '#83b9ca',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerState: {
    color: '#73f0ff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  headerStateLive: {
    color: '#59ffd1',
  },
  text: {
    color: '#d8f7ff',
    fontSize: 15,
    lineHeight: 22,
  },
  cursor: {
    color: '#59ffd1',
  },
  footer: {
    color: '#73f0ff',
    fontSize: 10,
    marginTop: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
});
