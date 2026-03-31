import { create } from 'zustand';
import type { AppConfig, GatewayConfig } from '@/types/config';
import { DEFAULT_CONFIG } from '@/types/config';

export type PermissionStatus = 'granted' | 'denied' | 'pending' | 'not_determined';

interface AppState {
  // Configuration
  config: AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;

  // Gateway management
  activeGateway: GatewayConfig | null;
  setActiveGateway: (gateway: GatewayConfig | null) => void;
  addGateway: (gateway: Omit<GatewayConfig, 'id'>) => string;
  removeGateway: (id: string) => void;

  // Permissions
  permissions: {
    camera: PermissionStatus;
    microphone: PermissionStatus;
  };
  setPermission: (type: 'camera' | 'microphone', status: PermissionStatus) => void;

  // App lifecycle
  isFirstLaunch: boolean;
  markFirstLaunchComplete: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  config: DEFAULT_CONFIG,

  updateConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),

  // Gateway management
  activeGateway: null,

  setActiveGateway: (gateway) =>
    set({ activeGateway: gateway, config: { ...get().config, activeGatewayId: gateway?.id ?? null } }),

  addGateway: (gateway) => {
    const id = `gw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newGateway = { ...gateway, id };
    set((state) => ({
      config: {
        ...state.config,
        gateways: [...state.config.gateways, newGateway],
      },
    }));
    return id;
  },

  removeGateway: (id) =>
    set((state) => ({
      config: {
        ...state.config,
        gateways: state.config.gateways.filter((g) => g.id !== id),
      },
      activeGateway:
        state.activeGateway?.id === id ? null : state.activeGateway,
    })),

  // Permissions
  permissions: {
    camera: 'not_determined',
    microphone: 'not_determined',
  },

  setPermission: (type, status) =>
    set((state) => ({
      permissions: { ...state.permissions, [type]: status },
    })),

  // App lifecycle
  isFirstLaunch: true,
  markFirstLaunchComplete: () => set({ isFirstLaunch: false }),
}));
