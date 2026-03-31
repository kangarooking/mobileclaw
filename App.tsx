import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HomeScreen } from '@/screens/HomeScreen';
import { SessionScreen } from '@/screens/SessionScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { urlSchemeHandler } from '@/services/wake/UrlSchemeHandler';

export type RootStackParamList = {
  Home: undefined;
  Session: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  // Initialize URL scheme handler on mount (handles mobileclaw://activate links)
  useEffect(() => {
    urlSchemeHandler.initialize().catch((err) => {
      console.warn('[App] URL scheme handler init failed:', err);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0a0a0f' },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Session" component={SessionScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
