import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { useAppStore } from '@/store/useAppStore';
import { parseGatewaySetupInput } from '@/utils/gatewaySetup';

export function GatewayQrScannerScreen({ navigation }: { navigation: any }) {
  const importGatewaySetup = useAppStore((state) => state.importGatewaySetup);
  const markFirstLaunchComplete = useAppStore((state) => state.markFirstLaunchComplete);
  const [permission, requestPermission] = useCameraPermissions();
  const [isImporting, setIsImporting] = useState(false);

  const permissionText = useMemo(() => {
    if (!permission) return '正在检查相机权限...';
    if (permission.granted) return '将 OpenClaw 生成的二维码对准取景框。';
    return '需要相机权限才能扫码导入网关配置。';
  }, [permission]);

  const handleScan = useCallback(
    async (result: BarcodeScanningResult) => {
      if (isImporting) return;
      setIsImporting(true);
      try {
        const setup = parseGatewaySetupInput(result.data);
        await importGatewaySetup(setup);
        await markFirstLaunchComplete();
        const message = setup.requiresManualToken
          ? `已导入 ${setup.name || setup.wsUrl} 的地址。\n\n当前 OpenClaw 的 \`openclaw qr\` 提供的是 bootstrap token，不是可直接连接的 gateway token。请到“参数 -> 网关实例 -> 编辑”里手动填写 gateway token。`
          : `已接入 ${setup.name || setup.wsUrl}`;
        Alert.alert('导入成功', message, [
          {
            text: '进入首页',
            onPress: () => navigation.navigate('Home'),
          },
        ]);
      } catch (error: any) {
        Alert.alert('二维码无法导入', error?.message || String(error), [
          { text: '继续扫描', onPress: () => setIsImporting(false) },
        ]);
        return;
      }
    },
    [importGatewaySetup, isImporting, markFirstLaunchComplete, navigation],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>返回</Text>
        </TouchableOpacity>
        <Text style={styles.title}>扫码导入</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.frameWrap}>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />
        ) : (
          <View style={styles.permissionPanel}>
            <Text style={styles.permissionText}>{permissionText}</Text>
            <TouchableOpacity onPress={requestPermission} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>授权并继续</Text>
            </TouchableOpacity>
          </View>
        )}

        <View pointerEvents="none" style={styles.overlay}>
          <View style={styles.scanFrame} />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.hint}>请扫描 OpenClaw 生成的二维码或 setup code。</Text>
        <Text style={styles.subHint}>在 OpenClaw 所在机器执行 `openclaw qr` 即可获取。</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020a12',
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backText: {
    color: '#73f0ff',
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    color: '#e1faff',
    fontSize: 20,
    fontWeight: '800',
  },
  spacer: {
    width: 52,
  },
  frameWrap: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(115, 240, 255, 0.2)',
    backgroundColor: '#071723',
  },
  camera: {
    flex: 1,
  },
  permissionPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 18,
  },
  permissionText: {
    color: '#d7f8ff',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  primaryButton: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#0d9db0',
  },
  primaryButtonText: {
    color: '#031017',
    fontSize: 15,
    fontWeight: '800',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: '72%',
    aspectRatio: 1,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#73f0ff',
    backgroundColor: 'transparent',
  },
  footer: {
    paddingTop: 18,
    gap: 6,
  },
  hint: {
    color: '#d8faff',
    fontSize: 14,
    fontWeight: '600',
  },
  subHint: {
    color: '#7fa8b6',
    fontSize: 13,
    lineHeight: 20,
  },
});
