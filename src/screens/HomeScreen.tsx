import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, StyleSheet } from 'react-native';
import { useAppStore } from '@/store/useAppStore';
import type { GatewayConfig } from '@/types/config';
import { GatewayCard } from '@/components/common/GatewayCard';
import { StatusIndicator } from '@/components/common/StatusIndicator';
import { wakeUpManager } from '@/services/wake/WakeUpManager';

export function HomeScreen({ navigation }: { navigation: { navigate: (name: string) => void; goBack: () => void } }) {
  const { config, activeGateway } = useAppStore();
  const gateways = config.gateways;
  const [useCamera, setUseCamera] = useState(false);
  const [diagResult, setDiagResult] = useState('');
  const [diagRunning, setDiagRunning] = useState(false);

  const runDiagnostics = async () => {
    if (!activeGateway) {
      setDiagResult('没有已选网关');
      return;
    }
    setDiagRunning(true);
    setDiagResult('正在检测网关链路...\n');

    const url = activeGateway.wsUrl;
    const lines: string[] = [];
    const add = (line: string) => {
      lines.push(line);
      setDiagResult(lines.join('\n'));
    };

    try {
      add(`目标地址：${url}`);
      const ws = new WebSocket(url);
      add('已创建 WebSocket 对象');

      const openPromise = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 8000);
        ws.onopen = () => {
          clearTimeout(timer);
          resolve(true);
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });

      const opened = await openPromise;
      if (!opened) {
        add('8 秒内未建立连接');
        setDiagRunning(false);
        return;
      }

      add('连接已建立，等待网关返回数据');

      const msgPromise = new Promise<string | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 10000);
        ws.onmessage = (event) => {
          clearTimeout(timer);
          const raw = typeof event.data === 'string' ? event.data : '[二进制数据]';
          resolve(raw.slice(0, 200));
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        ws.onclose = (e) => {
          resolve(`[连接关闭 ${e.code}]`);
        };
      });

      const msg = await msgPromise;
      if (msg === null) {
        add('10 秒内没有收到数据');
      } else if (msg.startsWith('[连接关闭')) {
        add(msg);
      } else {
        add(`收到响应：${msg}`);
      }

      ws.close();
      add('诊断结束');
    } catch (error: any) {
      add(`诊断异常：${error?.message || String(error)}`);
    }

    setDiagRunning(false);
  };

  const handleActivate = async () => {
    try {
      await wakeUpManager.activate(undefined, { useCamera });
      navigation.navigate('Session');
    } catch (error: any) {
      const msg = error?.message || String(error);
      console.error('Activation failed:', msg);
      Alert.alert('启动失败', msg, [{ text: '知道了' }]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.haloTop} />
      <View style={styles.haloBottom} />

      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>系统入口</Text>
          <Text style={styles.title}>MobileClaw 控台</Text>
          <Text style={styles.subtitle}>语音、视觉与会话链路就绪后即可接入龙虾</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsButton}>
          <Text style={styles.settingsButtonText}>参数</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusRow}>
        <StatusIndicator status={'disconnected'} gatewayName={activeGateway?.name} />
        <View style={styles.modeTag}>
          <Text style={styles.modeTagText}>{useCamera ? '视觉 + 语音' : '仅语音'}</Text>
        </View>
      </View>

      <View style={styles.heroPanel}>
        <View style={styles.heroRingOuter} />
        <View style={styles.heroRingInner} />
        <Text style={styles.heroMain}>待命</Text>
        <Text style={styles.heroHint}>
          选择目标网关后，进入会话界面。中心视图保持纯净，控制信息放在边缘。
        </Text>
      </View>

      {diagResult || diagRunning ? (
        <View style={styles.diagPanel}>
          <Text style={styles.diagTitle}>链路诊断</Text>
          <Text style={styles.diagText}>{diagResult || '检测中...'}</Text>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {gateways.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>尚未配置网关</Text>
            <Text style={styles.emptyText}>先去参数页添加 OpenClaw 网关地址和令牌，再回来启动会话。</Text>
          </View>
        ) : (
          gateways.map((gw: GatewayConfig) => (
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

      <View style={styles.footer}>
        <View style={styles.cameraToggleRow}>
          <View>
            <Text style={styles.cameraToggleTitle}>摄像头接入</Text>
            <Text style={styles.cameraToggleHint}>开启后本轮语音可按需附带视觉帧</Text>
          </View>
          <Switch
            value={useCamera}
            onValueChange={setUseCamera}
            trackColor={{ false: '#173040', true: '#127f8d' }}
            thumbColor={useCamera ? '#73f0ff' : '#8aa5b0'}
          />
        </View>

        <TouchableOpacity
          onPress={runDiagnostics}
          disabled={diagRunning}
          activeOpacity={0.82}
          style={[styles.secondaryButton, diagRunning && styles.secondaryButtonDisabled]}
        >
          <Text style={styles.secondaryButtonText}>{diagRunning ? '正在诊断...' : '检测网关链路'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleActivate} activeOpacity={0.85} style={styles.primaryButton}>
          <Text style={styles.primaryButtonTitle}>{useCamera ? '启动视觉会话' : '启动语音会话'}</Text>
          <Text style={styles.primaryButtonHint}>进入对话主控台</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020a12',
    paddingHorizontal: 18,
    paddingTop: 58,
    paddingBottom: 22,
  },
  haloTop: {
    position: 'absolute',
    top: -40,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  haloBottom: {
    position: 'absolute',
    right: -70,
    bottom: 90,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 229, 255, 0.05)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  kicker: {
    color: '#73f0ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    marginTop: 6,
    color: '#e1faff',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 6,
    color: '#84afbf',
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 250,
  },
  settingsButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.26)',
    backgroundColor: 'rgba(7, 22, 34, 0.9)',
  },
  settingsButtonText: {
    color: '#73f0ff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modeTag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.18)',
    backgroundColor: 'rgba(7, 22, 34, 0.8)',
  },
  modeTagText: {
    color: '#cfefff',
    fontSize: 11,
    fontWeight: '700',
  },
  heroPanel: {
    height: 170,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.16)',
    backgroundColor: 'rgba(6, 18, 29, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  heroRingOuter: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.18)',
  },
  heroRingInner: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(115, 240, 255, 0.46)',
  },
  heroMain: {
    color: '#e1faff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  heroHint: {
    marginTop: 10,
    color: '#86aebb',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 28,
  },
  diagPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 84, 0.28)',
    backgroundColor: 'rgba(34, 24, 10, 0.82)',
    padding: 14,
    marginBottom: 14,
  },
  diagTitle: {
    color: '#ffb454',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  diagText: {
    color: '#f7e5cf',
    fontSize: 12,
    lineHeight: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 18,
  },
  emptyState: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.14)',
    backgroundColor: 'rgba(6, 18, 29, 0.94)',
    padding: 20,
  },
  emptyTitle: {
    color: '#d8f7ff',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 8,
    color: '#86aebb',
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    gap: 10,
    paddingTop: 10,
  },
  cameraToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.14)',
    backgroundColor: 'rgba(6, 18, 29, 0.94)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cameraToggleTitle: {
    color: '#d8f7ff',
    fontSize: 14,
    fontWeight: '800',
  },
  cameraToggleHint: {
    marginTop: 4,
    color: '#86aebb',
    fontSize: 12,
  },
  secondaryButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.18)',
    backgroundColor: 'rgba(8, 25, 39, 0.95)',
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryButtonDisabled: {
    opacity: 0.55,
  },
  secondaryButtonText: {
    color: '#73f0ff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  primaryButton: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.36)',
    backgroundColor: 'rgba(7, 30, 45, 0.98)',
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonTitle: {
    color: '#e1faff',
    fontSize: 18,
    fontWeight: '900',
  },
  primaryButtonHint: {
    marginTop: 4,
    color: '#73f0ff',
    fontSize: 12,
    fontWeight: '700',
  },
});
