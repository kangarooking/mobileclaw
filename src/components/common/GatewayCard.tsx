import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { GatewayConfig } from '@/types/config';

interface GatewayCardProps {
  gateway: GatewayConfig;
  isActive: boolean;
  isConnected: boolean;
  onPress: () => void;
}

export function GatewayCard({
  gateway,
  isActive,
  isConnected,
  onPress,
}: GatewayCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: isActive ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)',
        borderRadius: 14,
        padding: 16,
        borderWidth: isActive ? 1 : 0,
        borderColor: isConnected ? '#22c55e' : '#333',
      }}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Avatar emoji */}
        <View style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: 'rgba(255,255,255,0.1)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Text style={{ fontSize: 22 }}>{gateway.avatarEmoji || '🦞'}</Text>
        </View>

        {/* Name + status */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
            {gateway.name}
          </Text>
          <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
            {gateway.wsUrl.replace(/^wss?:\/\//, '')}
          </Text>
        </View>

        {/* Connection dot */}
        <View style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: isConnected ? '#22c55e' : '#555',
        }} />
      </View>

      {/* Description */}
      {gateway.description ? (
        <Text style={{ color: '#888', fontSize: 13, marginTop: 8 }}>
          {gateway.description}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}
