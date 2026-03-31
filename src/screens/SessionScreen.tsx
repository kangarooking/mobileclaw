import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSessionStore } from '@/store/useSessionStore';
import { useAppStore } from '@/store/useAppStore';
import { ChatLogList } from '@/components/chat/ChatLogList';
import { StatusIndicator } from '@/components/common/StatusIndicator';
import CameraPreview from '@/components/camera/CameraPreview';
import { WaveformView } from '@/components/audio/WaveformView';
import { wakeUpManager } from '@/services/wake/WakeUpManager';
import { cameraManager } from '@/services/camera/CameraManager';
import { audioManager } from '@/services/audio/AudioManager';
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from '@/utils/constants';

export function SessionScreen({ navigation }: { navigation: any }) {
  const {
    mode, connectionStatus, messages, currentTranscript,
    aiResponseText, isTTSSpeaking, isCameraActive,
    lastActivityAt, framesSentCount,
  } = useSessionStore();
  const { activeGateway } = useAppStore();

  const idleTimeMs = Date.now() - lastActivityAt;
  const isIdleWarning = idleTimeMs > IDLE_WARNING_MS && idleTimeMs < IDLE_TIMEOUT_MS;
  const idleSeconds = Math.max(0, Math.round((IDLE_TIMEOUT_MS - idleTimeMs) / 1000));

  // Track frames received for display
  const receivedFramesRef = useRef(0);

  // Track mic volume for waveform visualization
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Subscribe to audio manager volume updates
  useEffect(() => {
    const unsub = audioManager.onVolumeUpdate((level) => {
      setVolumeLevel(level);
    });
    return unsub;
  }, []);

  const handleFrameReady = useCallback((
    _jpegBase64: string,
    width: number,
    height: number,
  ) => {
    receivedFramesRef.current++;
  }, []);

  return (
    <View style={styles.container}>
      {/* Status bar + close */}
      <View style={styles.header}>
        <StatusIndicator
          status={connectionStatus}
          gatewayName={activeGateway?.name}
        />
        <TouchableOpacity
          onPress={async () => {
            await wakeUpManager.deactivate();
            navigation.goBack();
          }}
          style={styles.closeButton}
        >
          <Text style={styles.closeButtonText}>■</Text>
        </TouchableOpacity>
      </View>

      {/* Camera preview (~55% of screen) */}
      <View style={[styles.cameraContainer, mode === 'active' && styles.cameraActiveBorder]}>
        <CameraPreview
          isActive={isCameraActive}
          onFrameReady={handleFrameReady}
        />

        {/* ASR listening overlay with waveform */}
        {mode === 'active' && (
          <View style={styles.recordingOverlay}>
            <View style={styles.recordingDot} />
            <View style={styles.waveformWrapper}>
              <WaveformView volumeLevel={volumeLevel} barCount={20} />
            </View>
            <Text style={styles.recordingText}>
              {currentTranscript ? 'Listening...' : 'Ready'}
            </Text>
          </View>
        )}

        {/* Frame counter for debugging */}
        {mode === 'active' && (
          <Text style={styles.frameCounter}>
            📷 {receivedFramesRef.current} frames · ↑{framesSentCount}
          </Text>
        )}
      </View>

      {/* Chat log below camera */}
      <View style={styles.chatContainer}>
        <ChatLogList
          messages={messages}
          currentTranscript={currentTranscript}
          aiResponseText={aiResponseText}
          isTTSSpeaking={isTTSSpeaking}
        />
      </View>

      {/* Control bar at bottom */}
      <View style={styles.controlBar}>
        <TouchableOpacity
          onPress={async () => {
            await wakeUpManager.deactivate();
            navigation.goBack();
          }}
          style={styles.stopButton}
        >
          <Text style={styles.stopButtonText}>⏸ 停止</Text>
        </TouchableOpacity>

        {isIdleWarning && (
          <View style={styles.idleWarning}>
            <Text style={styles.idleWarningText}>
              {idleSeconds}s 后自动待机
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cameraContainer: {
    height: '55%',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cameraActiveBorder: {
    borderColor: '#22c55e',
  },
  recordingOverlay: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  waveformWrapper: {
    width: 120,
  },
  recordingText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },
  frameCounter: {
    position: 'absolute',
    top: 10,
    right: 10,
    color: '#22c55e',
    fontSize: 11,
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chatContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 8,
  },
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 34,
  },
  stopButton: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  stopButtonText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  idleWarning: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  idleWarningText: {
    color: '#f59e0b',
    fontSize: 13,
  },
});
