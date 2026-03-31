/**
 * CameraPreview — Real camera preview with frame capture
 *
 * Uses react-native-vision-camera v4 for:
 *  - Live camera preview (back camera, low-light boost)
 *  - Frame Processor Worklet (off-thread capture at ~15fps)
 *  - Automatic permission request on first mount
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Platform,
} from 'react-native';
import {
  Camera,
  useCameraDevices,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { cameraManager } from '@/services/camera/CameraManager';
import {
  processFrame,
  setFrameCallback as registerFrameCallback,
  resetFrameCount,
  getFrameCount,
} from './frameProcessorWorklet';

interface CameraPreviewProps {
  isActive: boolean;
  onFrameReady?: (dataBase64: string, width: number, height: number) => void;
  style?: Record<string, unknown>;
}

export function CameraPreview({
  isActive,
  onFrameReady,
  style,
}: CameraPreviewProps) {
  const devices = useCameraDevices();
  const frameCount = useSharedValue(0);
  const isInitialized = useRef(false);

  // Find back camera device (prefer low-light boost capable)
  const device = useMemo(() => {
    return (
      devices.find((d) =>
        d.position === 'back' && d.supportsLowLightBoost,
      ) ?? devices.find((d) => d.position === 'back') ?? devices[0]
    );
  }, [devices]);

  // ─── Frame Processor Setup ──────────────────────────────────────
  // Bridge frames from worklet thread → JS main thread → parent + CameraManager

  const handleFrameReady = useCallback(
    (dataBase64: string, width: number, height: number, _timestamp: number) => {
      // Update CameraManager's latest frame cache
      cameraManager.onNewFrame(dataBase64, width, height, Date.now());

      // Notify parent component
      onFrameReady?.(dataBase64, width, height);

      // Update debug counter
      frameCount.value = getFrameCount();
    },
    [onFrameReady, frameCount],
  );

  // Wrap in runOnJS for worklet→main-thread bridge
  // runOnJS(fn) returns a function that calls fn on the main thread when invoked
  const handleFrameReadyJS = runOnJS(handleFrameReady);

  // Register callback once on mount
  useEffect(() => {
    registerFrameCallback(handleFrameReadyJS);
    return () => {
      registerFrameCallback(() => {});
    };
  }, [handleFrameReadyJS]);

  // Attach frame processor (processFrame handles throttling internally)
  const frameProcessor = useFrameProcessor(processFrame, []);

  // Reset counter on first activation
  useEffect(() => {
    if (isActive && !isInitialized.current) {
      resetFrameCount();
      isInitialized.current = true;
    }
  }, [isActive]);

  // ─── Permission & Device Check ─────────────────────────────────

  if (!device) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No camera available</Text>
          <Text style={styles.errorSubtext}>
            {Platform.OS === 'ios'
              ? 'Enable camera in Settings > Privacy > Camera'
              : 'Check camera hardware availability'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        photo={false}
        pixelFormat="yuv"
        frameProcessor={frameProcessor}
        lowLightBoost={device.supportsLowLightBoost}
      />

      {/* Recording indicator overlay */}
      {isActive && (
        <View style={styles.recordingOverlay}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>REC</Text>
        </View>
      )}

      {/* Debug badge */}
      {isActive && (
        <View style={styles.frameBadge}>
          <Text style={styles.frameBadgeText}>LIVE</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
  },
  recordingOverlay: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.75)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  recordingText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  frameBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  frameBadgeText: {
    color: '#22c55e',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
});

export default CameraPreview;
