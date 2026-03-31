import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useAppStore } from '@/store/useAppStore';
import { GatewayCard } from '@/components/common/GatewayCard';
import { StatusIndicator } from '@/components/common/StatusIndicator';
import { wakeUpManager } from '@/services/wake/WakeUpManager';

export function HomeScreen({ navigation }: { navigation: any }) {
  const { config, activeGateway, gateways } = useAppStore();

  const handleActivate = async () => {
    try {
      await wakeUpManager.activate();
      // Navigate to session screen after successful activation
      navigation.navigate('Session' as never);
    } catch (error) {
      console.error('Activation failed:', error);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
      }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>
          🦞 MobileClaw
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings' as never)}>
          <Text style={{ color: '#888', fontSize: 18 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Status bar */}
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <StatusIndicator
          status={'disconnected'} // Will be wired to real connection status
          gatewayName={activeGateway?.name}
        />
      </View>

      {/* Gateway list */}
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
      >
        {gateways.length === 0 ? (
          /* Empty state */
          <View style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 60,
          }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🦞</Text>
            <Text style={{ color: '#888', fontSize: 16, textAlign: 'center' }}>
              暂无已配置的 Gateway{'\n'}
              点击右上角 ⚙️ 添加你的龙虾
            </Text>
          </View>
        ) : (
          gateways.map((gw) => (
            <GatewayCard
              key={gw.id}
              gateway={gw}
              isActive={activeGateway?.id === gw.id}
              isConnected={false}
              onPress={() => {
                useAppStore.getState().setActiveGateway(gw);
              }}
            />
          ))
        )}
      </ScrollView>

      {/* Big "Tap to Talk" button */}
      <View style={{
        paddingHorizontal: 20,
        paddingVertical: 20,
        paddingBottom: 40,
      }}>
        <TouchableOpacity
          onPress={handleActivate}
          activeOpacity={0.7}
          style={{
            backgroundColor: '#22c55e',
            borderRadius: 16,
            paddingVertical: 18,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#000', fontSize: 18, fontWeight: '700' }}>
            🎤 Tap to Talk
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
