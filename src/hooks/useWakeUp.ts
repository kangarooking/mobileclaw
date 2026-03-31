/**
 * useWakeUp — Hook for voice wake-up activation/deactivation
 */

import { useCallback } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { wakeUpManager } from '@/services/wake/WakeUpManager';

export function useWakeUp() {
  const mode = useSessionStore((s) => s.mode);
  const setMode = useSessionStore((s) => s.setMode);

  const activate = useCallback(async () => {
    try {
      await wakeUpManager.activate();
    } catch (error) {
      console.error('Wake-up activation failed:', error);
      throw error;
    }
  }, []);

  const deactivate = useCallback(async () => {
    try {
      await wakeUpManager.deactivate();
    } catch (error) {
      console.error('Deactivation failed:', error);
    }
  }, []);

  return { activate, deactivate, mode };
}
