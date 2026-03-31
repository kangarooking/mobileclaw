/**
 * useWakeUp — Hook for voice wake-up activation/deactivation
 *
 * Provides activate/deactivate functions that coordinate with
 * WakeUpManager and optionally navigate to SessionScreen.
 */

import { useCallback } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { wakeUpManager } from '@/services/wake/WakeUpManager';
import type { ActivationParams } from '@/services/wake/UrlSchemeHandler';

export function useWakeUp(navigation?: { navigate: (name: string) => void }) {
  const mode = useSessionStore((s) => s.mode);
  const isActive = mode === 'active';

  const activate = useCallback(async (params?: ActivationParams) => {
    try {
      await wakeUpManager.activate(params);

      // Navigate to session screen after successful activation
      if (navigation) {
        navigation.navigate('Session');
      }
    } catch (error) {
      console.error('Wake-up activation failed:', error);
      throw error;
    }
  }, [navigation]);

  const deactivate = useCallback(async () => {
    try {
      await wakeUpManager.deactivate();

      // Navigate back to home after deactivation
      if (navigation) {
        navigation.goBack();
      }
    } catch (error) {
      console.error('Deactivation failed:', error);
      throw error;
    }
  }, [navigation]);

  return { activate, deactivate, mode, isActive };
}
