import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { audioManager } from '@/services/audio/AudioManager';
import { SecureStorage } from '@/services/storage/SecureStorage';
import { useAppStore } from '@/store/useAppStore';

export function OnboardingScreen({ navigation }: { navigation: any }) {
  const importGatewaySetup = useAppStore((state) => state.importGatewaySetup);
  const markFirstLaunchComplete = useAppStore((state) => state.markFirstLaunchComplete);
  const gateways = useAppStore((state) => state.config.gateways);

  const [permissionsReady, setPermissionsReady] = useState(false);
  const [name, setName] = useState('我的龙虾');
  const [wsUrl, setWsUrl] = useState('');
  const [token, setToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const hasGateway = gateways.length > 0;
  const gatewaySummary = useMemo(() => gateways[0]?.name || gateways[0]?.wsUrl || '', [gateways]);

  const requestPermissions = async () => {
    try {
      const camera = await Camera.requestCameraPermission();
      await audioManager.ensureMicrophonePermission();
      setPermissionsReady(camera === 'granted');
      Alert.alert('权限已准备', '相机和麦克风权限已经就绪。');
    } catch (error: any) {
      Alert.alert('权限未完成', error?.message || String(error));
    }
  };

  const finishOnboarding = async () => {
    await markFirstLaunchComplete();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };

  const handleManualSave = async () => {
    if (!wsUrl.trim()) {
      Alert.alert('还差一步', '请先填写 Gateway 地址。');
      return;
    }
    setIsSaving(true);
    try {
      await importGatewaySetup({
        name: name.trim() || '我的龙虾',
        wsUrl: wsUrl.trim(),
        token: token.trim() || undefined,
      });
      await finishOnboarding();
    } catch (error: any) {
      Alert.alert('保存失败', error?.message || String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.brandRow}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.brandTextWrap}>
      <Text style={styles.kicker}>首次引导</Text>
      <Text style={styles.title}>先把 MobileClaw 接到你的龙虾</Text>
      <Text style={styles.subtitle}>
        普通用户首次打开只需要做三件事：授权、导入 Gateway、开始对话。手填入口仍然保留。
      </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. 授权设备</Text>
        <Text style={styles.sectionHint}>建议先把相机和麦克风权限一次性授权完，后面进入会话就不会再被打断。</Text>
        <TouchableOpacity onPress={requestPermissions} style={styles.primaryButton} activeOpacity={0.84}>
          <Text style={styles.primaryButtonText}>{permissionsReady ? '权限已就绪' : '授权相机和麦克风'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. 导入 Gateway</Text>
        <Text style={styles.sectionHint}>推荐扫码导入。OpenClaw 所在机器执行 `openclaw qr` 即可生成二维码。</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('GatewayQrScanner')}
          style={[styles.primaryButton, styles.scanButton]}
          activeOpacity={0.84}
        >
          <Text style={styles.primaryButtonText}>扫码导入</Text>
        </TouchableOpacity>

        <View style={styles.manualWrap}>
          <Text style={styles.manualTitle}>也可以手动填写</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="实例名称"
            placeholderTextColor="#537388"
            style={styles.input}
          />
          <TextInput
            value={wsUrl}
            onChangeText={setWsUrl}
            placeholder="Gateway 地址，例如 ws://192.168.1.6:18789"
            placeholderTextColor="#537388"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TextInput
            value={token}
            onChangeText={setToken}
            placeholder="Gateway token"
            placeholderTextColor="#537388"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={styles.input}
          />
          <Text style={styles.manualHint}>如果刚通过扫码导入成功，这里可以不再填写。</Text>
          <TouchableOpacity onPress={handleManualSave} disabled={isSaving} style={styles.secondaryButton} activeOpacity={0.84}>
            <Text style={styles.secondaryButtonText}>{isSaving ? '正在保存...' : '保存并完成引导'}</Text>
          </TouchableOpacity>
        </View>

        {hasGateway ? (
          <View style={styles.importedCard}>
            <Text style={styles.importedTitle}>已检测到 Gateway</Text>
            <Text style={styles.importedValue}>{gatewaySummary}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. 开始使用</Text>
        <Text style={styles.sectionHint}>引导完成后，你仍然可以在参数页继续修改 Gateway 地址、token、唤醒词和视觉参数。</Text>
        <TouchableOpacity
          onPress={finishOnboarding}
          style={[styles.primaryButton, !hasGateway && styles.disabledButton]}
          disabled={!hasGateway}
          activeOpacity={0.84}
        >
          <Text style={styles.primaryButtonText}>进入首页</Text>
        </TouchableOpacity>
        {!hasGateway ? <Text style={styles.manualHint}>请先扫码或手动填写一个可用的 Gateway。</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020a12',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 18,
    paddingBottom: 36,
    gap: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  brandTextWrap: {
    flex: 1,
  },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.22)',
    backgroundColor: 'rgba(7, 20, 30, 0.96)',
  },
  kicker: {
    color: '#73f0ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    marginTop: 6,
    color: '#e1faff',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 8,
    color: '#8fb0bf',
    fontSize: 14,
    lineHeight: 21,
  },
  section: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.16)',
    backgroundColor: 'rgba(7, 20, 30, 0.92)',
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    color: '#dffbff',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionHint: {
    color: '#87a9b8',
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    borderRadius: 18,
    backgroundColor: '#0fa9b6',
    paddingVertical: 15,
    alignItems: 'center',
  },
  scanButton: {
    backgroundColor: '#067b8a',
  },
  primaryButtonText: {
    color: '#031017',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.24)',
    backgroundColor: 'rgba(8, 28, 41, 0.95)',
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#73f0ff',
    fontSize: 15,
    fontWeight: '700',
  },
  manualWrap: {
    marginTop: 4,
    gap: 10,
  },
  manualTitle: {
    color: '#dffbff',
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.16)',
    backgroundColor: 'rgba(6, 18, 28, 0.94)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#e8fbff',
    fontSize: 15,
  },
  manualHint: {
    color: '#7393a2',
    fontSize: 13,
    lineHeight: 19,
  },
  importedCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.14)',
  },
  importedTitle: {
    color: '#73f0ff',
    fontSize: 13,
    fontWeight: '700',
  },
  importedValue: {
    marginTop: 4,
    color: '#dcfbff',
    fontSize: 15,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.45,
  },
});
