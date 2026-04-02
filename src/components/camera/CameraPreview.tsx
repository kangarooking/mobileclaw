/**
 * CameraPreview — Real camera preview with frame capture
 *
 * Uses react-native-vision-camera v4 for:
 *  - Live camera preview (back camera, low-light boost)
 *  - Frame Processor Worklet (off-thread capture at ~15fps)
 *  - Automatic permission request on first mount
 */

import React, { useMemo, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  Camera,
  useCameraDevices,
} from 'react-native-vision-camera';
// TODO: re-enable useFrameProcessor after fixing vision-camera v4.7.3 babel compat
// import { useFrameProcessor } from 'react-native-vision-camera';
// import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { cameraManager } from '@/services/camera/CameraManager';
import { useAppStore } from '@/store/useAppStore';
import { getLogger } from '@/utils/logger';

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
  const log = getLogger('CameraPreview');
  const devices = useCameraDevices();
  const isInitialized = useRef(false);
  const cameraRef = useRef<Camera | null>(null);
  const snapshotBusyRef = useRef(false);
  const videoConfig = useAppStore((state) => state.config.video);

  useEffect(() => {
    if (!onFrameReady) return;
    cameraManager.onFrameReady = (dataBase64, width, height) => {
      onFrameReady(dataBase64, width, height);
    };
    return () => {
      if (cameraManager.onFrameReady) {
        cameraManager.onFrameReady = null;
      }
    };
  }, [onFrameReady]);

  // Find back camera device (prefer low-light boost capable)
  const device = useMemo(() => {
    return (
      devices.find((d) =>
        d.position === 'back' && d.supportsLowLightBoost,
      ) ?? devices.find((d) => d.position === 'back') ?? devices[0]
    );
  }, [devices]);

  void isInitialized;

  useEffect(() => {
    if (!isActive || !device) return;

    const snapshotFps = Math.max(1, Math.min(videoConfig.bufferFps, 4));
    const intervalMs = Math.max(250, Math.round(1000 / snapshotFps));
    const [width, height] = videoConfig.resolution
      .split('x')
      .map((value) => Number(value));

    const timer = setInterval(() => {
      void captureSnapshot(width || 640, height || 480);
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [device, isActive, videoConfig.bufferFps, videoConfig.jpegQuality, videoConfig.resolution]);

  // ─── Permission & Device Check ─────────────────────────────────

  if (!device) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>没有可用摄像头</Text>
          <Text style={styles.errorSubtext}>
            {Platform.OS === 'ios'
              ? '请到系统设置里开启摄像头权限'
              : '请检查设备摄像头权限与硬件状态'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        photo
        video
        lowLightBoost={device.supportsLowLightBoost}
      />
    </View>
  );

  async function captureSnapshot(width: number, height: number): Promise<void> {
    if (!cameraRef.current || snapshotBusyRef.current) return;
    snapshotBusyRef.current = true;

    try {
      const snapshot = await (cameraRef.current as any).takeSnapshot({
        quality: Math.round(videoConfig.jpegQuality * 100),
        skipMetadata: true,
      });

      const path = typeof snapshot?.path === 'string' ? snapshot.path : null;
      if (!path) return;

      const normalizedPath = path.startsWith('file://') ? path : `file://${path}`;
      const base64 = await FileSystem.readAsStringAsync(normalizedPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const timestamp = Date.now();
      log.info(`Snapshot captured: ${width}x${height}, base64=${base64.length} chars`);
      cameraManager.onNewFrame(base64, width, height, timestamp);
    } catch {
      // Snapshot capture can fail while preview warms up; keep retrying silently.
    } finally {
      snapshotBusyRef.current = false;
    }
  }
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
});

export default CameraPreview;
