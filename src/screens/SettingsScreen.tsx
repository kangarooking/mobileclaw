import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, StyleSheet } from 'react-native';
import { useAppStore } from '@/store/useAppStore';
import { SecureStorage } from '@/services/storage/SecureStorage';

export function SettingsScreen() {
  const { config, addGateway, removeGateway, updateConfig } = useAppStore();
  const [newGwName, setNewGwName] = useState('');
  const [newGwUrl, setNewGwUrl] = useState('');
  const [newGwToken, setNewGwToken] = useState('');

  // ASR credential fields
  const [asrAppId, setAsrAppId] = useState('');
  const [asrAccessToken, setAsrAccessToken] = useState('');

  /** Save ASR credentials to SecureStorage and update config */
  const handleSaveASRCredentials = async () => {
    if (asrAppId.trim()) {
      await SecureStorage.setASRAppId(asrAppId.trim());
    }
    if (asrAccessToken.trim()) {
      await SecureStorage.setASRAccessToken(asrAccessToken.trim());
    }
    // Update config reference so WakeUpManager can read them
    updateConfig({
      asr: {
        ...config.asr,
        appId: asrAppId.trim() || undefined,
        accessToken: asrAccessToken.trim() || undefined,
      },
    });
  };

  const handleAddGateway = async () => {
    if (!newGwName.trim() || !newGwUrl.trim()) return;

    const id = addGateway({
      name: newGwName.trim(),
      wsUrl: newGwUrl.trim(),
      description: '',
      isActive: true,
      avatarEmoji: '🦞',
    });

    if (newGwToken.trim()) {
      await SecureStorage.setGatewayToken(id, newGwToken.trim());
    }

    setNewGwName('');
    setNewGwUrl('');
    setNewGwToken('');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>设置</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ─── Gateways Section ─── */}
        <Text style={styles.sectionTitle}>GATEWAYS（OpenClaw 实例）</Text>

        {config.gateways.map((gw) => (
          <View key={gw.id} style={styles.gatewayCard}>
            <View style={styles.gatewayRow}>
              <Text style={styles.gatewayName}>{gw.avatarEmoji} {gw.name}</Text>
              <TouchableOpacity onPress={() => removeGateway(gw.id)}>
                <Text style={styles.deleteButton}>删除</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.gatewayUrl}>{gw.wsUrl}</Text>
          </View>
        ))}

        {/* Add new gateway form */}
        <View style={styles.addForm}>
          <TextInput
            placeholder="名称 (如 Home)"
            placeholderTextColor="#555"
            value={newGwName}
            onChangeText={setNewGwName}
            style={styles.input}
          />
          <TextInput
            placeholder="WebSocket URL (ws://... 或 wss://...)"
            placeholderTextColor="#555"
            value={newGwUrl}
            onChangeText={setNewGwUrl}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TextInput
            placeholder="Auth Token"
            placeholderTextColor="#555"
            value={newGwToken}
            onChangeText={setNewGwToken}
            secureTextEntry
            style={styles.input}
          />
          <TouchableOpacity onPress={handleAddGateway} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ 添加 Gateway</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Voice Settings ─── */}
        <Text style={styles.sectionTitle}>语音设置</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>唤醒词</Text>
            <Text style={styles.settingValue}>{config.wakeWord}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>ASR 提供者</Text>
            <Text style={styles.settingValue}>{config.asr.type}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>TTS 提供者</Text>
            <Text style={styles.settingValue}>{config.tts.type}</Text>
          </View>
        </View>

        {/* ─── Doubao ASR Credentials ─── */}
        {config.asr.type === 'doubao' && (
          <>
            <Text style={styles.sectionTitle}>豆包 ASR 凭证（火山引擎）</Text>
            <View style={styles.addForm}>
              <TextInput
                placeholder="App ID (如 7628583300)"
                placeholderTextColor="#555"
                value={asrAppId}
                onChangeText={setAsrAppId}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <TextInput
                placeholder="Access Token"
                placeholderTextColor="#555"
                value={asrAccessToken}
                onChangeText={setAsrAccessToken}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <TouchableOpacity onPress={handleSaveASRCredentials} style={[styles.addButton, { backgroundColor: '#3b82f6' }]}>
                <Text style={styles.addButtonText}>保存 ASR 凭证</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ─── Video Settings ─── */}
        <Text style={styles.sectionTitle}>视频设置</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>分辨率</Text>
            <Text style={styles.settingValue}>{config.video.resolution}</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>帧率</Text>
            <Text style={styles.settingValue}>{config.video.fps} fps</Text>
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>JPEG 质量</Text>
            <Text style={styles.settingValue}>{Math.round(config.video.jpegQuality * 100)}%</Text>
          </View>
        </View>

        {/* ─── Feishu Settings ─── */}
        <Text style={styles.sectionTitle}>历史记录（飞书）</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>启用推送</Text>
            <Switch
              value={config.feishu.enabled}
              onValueChange={(v) => updateConfig({ feishu: { ...config.feishu, enabled: v } })}
              trackColor={{ false: '#333', true: '#22c55e' }}
            />
          </View>
          {config.feishu.webhookUrl && (
            <Text style={styles.webhookHint}>
              Webhook: {config.feishu.webhookUrl.slice(0, 40)}...
            </Text>
          )}
        </View>

        {/* ─── About ─── */}
        <View style={styles.aboutSection}>
          <Text style={styles.aboutText}>
            MobileClaw v1.0.0 · Made with 🦞 by 袋鼠帝
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  gatewayCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  gatewayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gatewayName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    color: '#ef4444',
    fontSize: 14,
  },
  gatewayUrl: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  addForm: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    gap: 10,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    color: '#ccc',
    fontSize: 14,
  },
  settingValue: {
    color: '#888',
    fontSize: 13,
  },
  webhookHint: {
    color: '#555',
    fontSize: 11,
    marginTop: 4,
  },
  aboutSection: {
    alignItems: 'center',
    marginTop: 32,
  },
  aboutText: {
    color: '#444',
    fontSize: 12,
  },
});
