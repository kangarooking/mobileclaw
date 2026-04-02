import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useSessionStore } from '@/store/useSessionStore';
import { useAppStore } from '@/store/useAppStore';
import { ChatLogList } from '@/components/chat/ChatLogList';
import { StatusIndicator } from '@/components/common/StatusIndicator';
import CameraPreview from '@/components/camera/CameraPreview';
import { wakeUpManager } from '@/services/wake/WakeUpManager';
import { audioManager } from '@/services/audio/AudioManager';
import { useGateway } from '@/hooks/useGateway';
const HUD = {
  bg: '#01060c',
  panel: 'rgba(3, 14, 24, 0.9)',
  panelSoft: 'rgba(4, 18, 30, 0.68)',
  line: 'rgba(0, 229, 255, 0.2)',
  lineStrong: 'rgba(0, 229, 255, 0.62)',
  text: '#d9fbff',
  textMuted: '#7fb2c4',
  accent: '#00e5ff',
  accentSoft: 'rgba(0, 229, 255, 0.1)',
  success: '#72ffd4',
  alert: '#ffb24d',
  danger: '#ff6670',
};

export function SessionScreen({ navigation }: { navigation: any }) {
  const {
    connectionStatus,
    messages,
    currentTranscript,
    aiResponseText,
    isTTSSpeaking,
    isCameraActive,
    cameraPreviewVisible,
    isAnalyzingVision,
  } = useSessionStore();
  const { activeGateway } = useAppStore();

  useGateway();

  const receivedFramesRef = useRef(0);
  const [receivedFrameCount, setReceivedFrameCount] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const reticleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsub = audioManager.onVolumeUpdate((level) => {
      setVolumeLevel(level);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(reticleAnim, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.timing(reticleAnim, { toValue: 0, duration: 2600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reticleAnim]);

  const handleFrameReady = useCallback(() => {
    receivedFramesRef.current += 1;
    setReceivedFrameCount(receivedFramesRef.current);
  }, []);

  const voiceActive = Boolean(currentTranscript) || volumeLevel > 0.02;
  const frameToneStyle = isAnalyzingVision
    ? styles.cameraAnalyzingBorder
    : voiceActive
      ? styles.cameraListeningBorder
      : styles.cameraIdleBorder;

  const reticleRotate = reticleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '60deg'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.haloLeft} />
      <View style={styles.haloRight} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.systemLabel}>战术视窗</Text>
          <StatusIndicator status={connectionStatus} gatewayName={activeGateway?.name} />
        </View>
        <TouchableOpacity
          onPress={async () => {
            await wakeUpManager.deactivate();
            navigation.goBack();
          }}
          style={styles.closeButton}
        >
          <Text style={styles.closeButtonText}>退出会话</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cameraSection}>
        <View style={[styles.cameraShell, frameToneStyle]}>
          {cameraPreviewVisible && isCameraActive ? (
            <CameraPreview isActive={isCameraActive} onFrameReady={handleFrameReady} />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.cameraPlaceholderTitle}>视觉链路未开启</Text>
              <Text style={styles.cameraPlaceholderText}>
                打开摄像头后，这里会显示实时画面；视觉信息只在本轮需要时附带发送。
              </Text>
            </View>
          )}

          <View pointerEvents="none" style={styles.reticleWrap}>
            <Animated.View style={[styles.reticleOuter, { transform: [{ rotate: reticleRotate }] }]} />
            <View style={styles.reticleCrossHorizontal} />
            <View style={styles.reticleCrossVertical} />
            <View style={styles.reticleDot} />
          </View>

          <View pointerEvents="none" style={styles.cameraFrameGuide}>
            <View style={styles.cameraCornerTL} />
            <View style={styles.cameraCornerTR} />
            <View style={styles.cameraCornerBL} />
            <View style={styles.cameraCornerBR} />
          </View>

          <View style={styles.previewBadgeLeft}>
            <View style={[styles.previewDot, isCameraActive ? styles.previewDotLive : styles.previewDotOff]} />
            <Text style={styles.previewBadgeText}>{isCameraActive ? '画面在线' : '画面关闭'}</Text>
          </View>

          <View style={styles.previewBadgeRight}>
            <Text style={styles.previewBadgeLabel}>缓存</Text>
            <Text style={styles.previewBadgeValue}>{receivedFrameCount}</Text>
          </View>
        </View>

      </View>

      <View style={styles.chatPanel}>
        <View style={styles.chatHeader}>
          <View style={styles.chatHeaderMain}>
            <Text style={styles.chatTitle}>任务记录</Text>
            <Text style={styles.chatSubtitle}>这里持续显示你的提问和龙虾的回复</Text>
          </View>
          <Text style={styles.chatMeta}>{messages.length} 条</Text>
        </View>

        <View style={styles.chatListWrap}>
          <ChatLogList
            messages={messages}
            currentTranscript={currentTranscript}
            aiResponseText={aiResponseText}
            isTTSSpeaking={isTTSSpeaking}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HUD.bg,
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 14,
  },
  haloLeft: {
    position: 'absolute',
    top: -20,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  haloRight: {
    position: 'absolute',
    right: -90,
    bottom: 100,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 229, 255, 0.04)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    gap: 6,
    flex: 1,
  },
  systemLabel: {
    color: HUD.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.4,
  },
  closeButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 102, 112, 0.28)',
    backgroundColor: 'rgba(36, 10, 16, 0.66)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: '#ff8f98',
    fontSize: 11,
    fontWeight: '800',
  },
  cameraSection: {
    marginBottom: 14,
  },
  cameraShell: {
    height: 292,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: HUD.panel,
    position: 'relative',
  },
  cameraIdleBorder: {
    borderColor: HUD.line,
  },
  cameraListeningBorder: {
    borderColor: 'rgba(114, 255, 212, 0.7)',
    shadowColor: '#72ffd4',
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },
  cameraAnalyzingBorder: {
    borderColor: 'rgba(255, 178, 77, 0.72)',
    shadowColor: '#ffb24d',
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(3, 14, 24, 0.98)',
  },
  cameraPlaceholderTitle: {
    color: HUD.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  cameraPlaceholderText: {
    color: HUD.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  cameraFrameGuide: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraCornerTL: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 34,
    height: 34,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderColor: HUD.lineStrong,
  },
  cameraCornerTR: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: HUD.lineStrong,
  },
  cameraCornerBL: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 34,
    height: 34,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
    borderColor: HUD.lineStrong,
  },
  cameraCornerBR: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 34,
    height: 34,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: HUD.lineStrong,
  },
  reticleWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -28,
    marginTop: -28,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleOuter: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.22)',
  },
  reticleCrossHorizontal: {
    position: 'absolute',
    width: 24,
    height: 1,
    backgroundColor: 'rgba(0, 229, 255, 0.38)',
  },
  reticleCrossVertical: {
    position: 'absolute',
    width: 1,
    height: 24,
    backgroundColor: 'rgba(0, 229, 255, 0.38)',
  },
  reticleDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(217, 251, 255, 0.9)',
  },
  previewBadgeLeft: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: HUD.line,
    backgroundColor: 'rgba(1, 6, 12, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  previewDotLive: {
    backgroundColor: HUD.success,
  },
  previewDotOff: {
    backgroundColor: HUD.danger,
  },
  previewBadgeText: {
    color: HUD.text,
    fontSize: 11,
    fontWeight: '700',
  },
  previewBadgeRight: {
    position: 'absolute',
    top: 16,
    right: 16,
    alignItems: 'flex-end',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: HUD.line,
    backgroundColor: 'rgba(1, 6, 12, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewBadgeLabel: {
    color: HUD.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  previewBadgeValue: {
    marginTop: 2,
    color: HUD.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  waveformPanel: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.14)',
    backgroundColor: 'rgba(1, 10, 18, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  waveformLabelWrap: {
    marginBottom: 6,
  },
  waveformLabel: {
    color: HUD.text,
    fontSize: 13,
    fontWeight: '700',
  },
  waveformHint: {
    marginTop: 3,
    color: HUD.textMuted,
    fontSize: 11,
  },
  chatPanel: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: HUD.line,
    backgroundColor: HUD.panel,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
    marginTop: 12,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 6,
  },
  chatHeaderMain: {
    flex: 1,
  },
  chatTitle: {
    color: HUD.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  chatSubtitle: {
    marginTop: 4,
    color: HUD.textMuted,
    fontSize: 11,
    lineHeight: 16,
    maxWidth: 250,
  },
  chatMeta: {
    color: HUD.text,
    fontSize: 11,
    fontWeight: '800',
  },
  chatListWrap: {
    flex: 1,
    minHeight: 0,
  },
});
