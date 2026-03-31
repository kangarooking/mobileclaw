/**
 * useGateway — Hook for managing openclaw gateway connection
 */

import { useEffect, useCallback } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { useAppStore } from '@/store/useAppStore';
import { gatewayClient } from '@/services/gateway/GatewayClient';
import type { ConnectionStatus } from '@/types/session';

export function useGateway() {
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const setConnectionStatus = useSessionStore((s) => s.setConnectionStatus);
  const activeGateway = useAppStore((s) => s.activeGateway);

  // Subscribe to GatewayClient status changes
  useEffect(() => {
    const unsub = gatewayClient.onStatusChange((status: ConnectionStatus) => {
      setConnectionStatus(status);
    });
    return unsub;
  }, [setConnectionStatus]);

  const connect = useCallback(async () => {
    if (!activeGateway) return;

    const token = await import('@/services/storage/SecureStorage').then(
      (m) => m.SecureStorage.getGatewayToken(activeGateway.id),
    );

    if (!token) throw new Error('No auth token for gateway');

    return gatewayClient.connect(activeGateway.wsUrl, token);
  }, [activeGateway]);

  const disconnect = useCallback(() => {
    gatewayClient.disconnect();
  }, []);

  const rpc = useCallback(<T = unknown>(method: string, params?: unknown) => {
    return gatewayClient.rpc<T>(method, params);
  }, []);

  return {
    status: connectionStatus,
    connect,
    disconnect,
    rpc,
    client: gatewayClient,
  };
}
