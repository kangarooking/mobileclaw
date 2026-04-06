import type { ExpoConfig } from 'expo/config';

const buildProfile = process.env.APP_VARIANT ?? process.env.EAS_BUILD_PROFILE ?? 'development';
const isDevelopment = buildProfile === 'development';

const config: ExpoConfig = {
  name: isDevelopment ? 'MobileClaw Dev' : 'MobileClaw',
  slug: 'mobileclaw',
  version: '1.0.2',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  scheme: 'mobileclaw',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0a0a0f',
  },
  plugins: [
    ...(isDevelopment ? [[ 'expo-dev-client', { launchMode: 'most-recent' } ] as const] : []),
    [
      'react-native-vision-camera',
      {
        cameraPermissionText: 'MobileClaw needs camera access to show your AI agent what you see.',
        enableMicrophonePermissionText: 'MobileClaw needs microphone access to hear you.',
      },
    ],
    'expo-camera',
  ],
  ios: {
    bundleIdentifier: isDevelopment ? 'com.kangarooking.mobileclaw.dev' : 'com.kangarooking.mobileclaw',
    supportsTablet: false,
    infoPlist: {
      NSSpeechRecognitionUsageDescription: 'MobileClaw uses speech recognition to transcribe your voice.',
      NSMicrophoneUsageDescription: 'MobileClaw uses the microphone to capture your voice.',
      UIBackgroundModes: ['audio', 'voip'],
      NSCameraUsageDescription: 'MobileClaw needs camera access to show your AI agent what you see.',
      ITSAppUsesNonExemptEncryption: false,
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSAllowsLocalNetworking: true,
      },
    },
    entitlements: {},
  },
  android: {
    package: isDevelopment ? 'com.mobileclaw.app.dev' : 'com.mobileclaw.app',
    permissions: [
      'RECORD_AUDIO',
      'CAMERA',
      'INTERNET',
      'ACCESS_NETWORK_STATE',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_MICROPHONE',
      'POST_NOTIFICATIONS',
      'android.permission.CAMERA',
    ],
  },
  extra: {
    appVariant: buildProfile,
    eas: {
      projectId: 'bfaea37e-4059-4498-9216-2fc44d2e1c54',
    },
  },
  owner: 'kangarooking',
};

export default config;
