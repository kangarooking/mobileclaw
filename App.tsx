import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HomeScreen } from '@/screens/HomeScreen';
import { SessionScreen } from '@/screens/SessionScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { GatewayQrScannerScreen } from '@/screens/GatewayQrScannerScreen';
import { urlSchemeHandler } from '@/services/wake/UrlSchemeHandler';
import { useAppStore } from '@/store/useAppStore';

export type RootStackParamList = {
  Home: undefined;
  Session: undefined;
  Settings: undefined;
  Onboarding: undefined;
  GatewayQrScanner: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  // Initialize URL scheme handler on mount (handles mobileclaw://activate links)
  // Load persisted config from AsyncStorage
  const { loadConfig, isFirstLaunch } = useAppStore();
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    urlSchemeHandler.initialize().catch((err) => {
      console.warn('[App] URL scheme handler init failed:', err);
    });
    loadConfig()
      .catch((err) => {
        console.warn('[App] Failed to load persisted config:', err);
      })
      .finally(() => setIsReady(true));
  }, []);

  if (!isReady) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#020a12',
          }}
        >
          <StatusBar style="light" />
          <ActivityIndicator size="large" color="#73f0ff" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName={isFirstLaunch ? 'Onboarding' : 'Home'}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0a0a0f' },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Session" component={SessionScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="GatewayQrScanner" component={GatewayQrScannerScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
