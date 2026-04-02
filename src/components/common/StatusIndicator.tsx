import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ConnectionStatus } from '@/types/session';

interface StatusIndicatorProps {
  status: ConnectionStatus;
  gatewayName?: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
  disconnected: { color: '#5c7785', label: '未连接' },
  connecting: { color: '#ffb454', label: '连接中' },
  connected: { color: '#59ffd1', label: '已连接' },
  reconnecting: { color: '#ffb454', label: '重连中' },
  error: { color: '#ff6b6b', label: '异常' },
};

export function StatusIndicator({ status, gatewayName }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <View style={styles.shell}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={styles.text}>
        {gatewayName ? `${gatewayName} · ` : ''}
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.18)',
    backgroundColor: 'rgba(5, 16, 27, 0.88)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  text: {
    color: '#cfefff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

