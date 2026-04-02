import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
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
      activeOpacity={0.82}
      style={[styles.card, isActive && styles.cardActive]}
    >
      <View style={styles.topRow}>
        <View style={styles.leftCluster}>
          <View style={styles.avatarRing}>
            <Text style={styles.avatarText}>{gateway.avatarEmoji || '🦞'}</Text>
          </View>
          <View style={styles.textCluster}>
            <Text style={styles.name}>{gateway.name}</Text>
            <Text style={styles.url} numberOfLines={1}>
              {gateway.wsUrl.replace(/^wss?:\/\//, '')}
            </Text>
          </View>
        </View>

        <View style={styles.badgeCluster}>
          <Text style={styles.badgeLabel}>{isActive ? '当前目标' : '可用目标'}</Text>
          <View style={[styles.dot, { backgroundColor: isConnected ? '#59ffd1' : '#5c7785' }]} />
        </View>
      </View>

      {gateway.description ? <Text style={styles.description}>{gateway.description}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.14)',
    backgroundColor: 'rgba(6, 19, 31, 0.96)',
    padding: 15,
    overflow: 'hidden',
  },
  cardActive: {
    borderColor: 'rgba(115, 240, 255, 0.45)',
    backgroundColor: 'rgba(8, 27, 42, 0.98)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  leftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarRing: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.24)',
    backgroundColor: 'rgba(115, 240, 255, 0.08)',
  },
  avatarText: {
    fontSize: 22,
  },
  textCluster: {
    flex: 1,
  },
  name: {
    color: '#d8f7ff',
    fontSize: 16,
    fontWeight: '800',
  },
  url: {
    color: '#80b8ca',
    fontSize: 12,
    marginTop: 3,
  },
  badgeCluster: {
    alignItems: 'flex-end',
    gap: 8,
  },
  badgeLabel: {
    color: '#73f0ff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  description: {
    marginTop: 10,
    color: '#8eafbc',
    fontSize: 12,
    lineHeight: 18,
  },
});

