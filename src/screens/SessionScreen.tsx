import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSessionStore } from '@/store/useSessionStore';
import { useAppStore } from '@/store/useAppStore';
import { ChatLogList } from '@/components/chat/ChatLogList';
import { StatusIndicator } from '@/components/common/StatusIndicator';
import { wakeUpManager } from '@/services/wake/WakeUpManager';
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

      {/* Camera preview placeholder (~55% of screen) */}
      <View style={styles.cameraContainer}>
        {/* TODO: Replace with actual CameraPreview component using react-native-vision-camera */}
        <View style={styles.cameraPlaceholder}>
          <Text style={styles.cameraPlaceholderText}>
            {isCameraActive ? '📷 Camera Active' : '📷 Camera Standby'}
          </Text>
          {isCameraActive && (
            <View style={styles.recordingOverlay}>
              <Text style={styles.recordingText}>🎙️ Listening...</Text>
            </View>
          )}
        </View>
        {/* Frame counter for debugging */}
        {mode === 'active' && (
          <Text style={styles.frameCounter}>
            Frames: {framesSentCount}
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
    borderWidth: mode => (mode === 'active' ? 2 : 0),
    borderColor: '#22c55e',
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraPlaceholderText: {
    color: '#555',
    fontSize: 16,
  },
  recordingOverlay: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  recordingText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  frameCounter: {
    position: 'absolute',
    top: 8,
    right: 8,
    color: '#444',
    fontSize: 11,
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
