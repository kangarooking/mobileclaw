import React from 'react';
import { View, Text } from 'react-native';
import type { ConnectionStatus } from '@/types/session';

interface StatusIndicatorProps {
  status: ConnectionStatus;
  gatewayName?: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
  disconnected: { color: '#666', label: '未连接' },
  connecting: { color: '#f59e0b', label: '连接中...' },
  connected: { color: '#22c55e', label: '已连接' },
  reconnecting: { color: '#f59e0b', label: '重连中...' },
  error: { color: '#ef4444', label: '错误' },
};

export function StatusIndicator({ status, gatewayName }: StatusIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderRadius: 12,
    }}>
      <View style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: config.color,
      }} />
      <Text style={{ color: '#ccc', fontSize: 12 }}>
        {gatewayName ? `${gatewayName} · ` : ''}{config.label}
      </Text>
    </View>
  );
}
