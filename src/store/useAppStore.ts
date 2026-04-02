import { create } from 'zustand';
import type { AppConfig, GatewayConfig } from '@/types/config';
import { DEFAULT_CONFIG } from '@/types/config';
import { ConfigStore } from '@/services/storage/ConfigStore';

export type PermissionStatus = 'granted' | 'denied' | 'pending' | 'not_determined';

interface AppState {
  // Configuration
  config: AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;

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

  updateConfig: (partial) => {
    const nextConfig = { ...get().config, ...partial };
    set({ config: nextConfig });
    ConfigStore.save(nextConfig).catch((e) => {
      console.warn('[useAppStore] Failed to persist config update:', e);
    });
  },

  /** Load persisted config from AsyncStorage */
  loadConfig: async () => {
    try {
      const saved = await ConfigStore.load();
      if (saved && Object.keys(saved).length > 0) {
        const merged = {
          ...DEFAULT_CONFIG,
          ...saved,
          asr: { ...DEFAULT_CONFIG.asr, ...saved.asr },
          tts: { ...DEFAULT_CONFIG.tts, ...saved.tts },
          feishu: { ...DEFAULT_CONFIG.feishu, ...saved.feishu },
          video: { ...DEFAULT_CONFIG.video, ...saved.video },
          advanced: { ...DEFAULT_CONFIG.advanced, ...saved.advanced },
        };
        if (merged.tts.type === 'edge') {
          merged.tts = {
            ...DEFAULT_CONFIG.tts,
            language: merged.tts.language || DEFAULT_CONFIG.tts.language,
            speed: merged.tts.speed ?? DEFAULT_CONFIG.tts.speed,
          };
        }
        if (merged.tts.type === 'doubao') {
          const legacyUri = merged.tts.uri === '/api/v1/tts/ws_binary';
          const legacyCluster = merged.tts.cluster === 'volcano_tts';
          const legacyResourceId =
            merged.tts.resourceId === 'volc.service_type.10029' ||
            merged.tts.resourceId === 'volcano_tts';
          const legacyVoiceId = merged.tts.voiceId === 'zh_female_wanwan_moon_bigtts';
          const legacyVoiceType =
            merged.tts.voiceType === 'BHV002_streaming_fast' ||
            merged.tts.voiceType === 'zh_female_daimengchuanmei_moon_bigtts' ||
            merged.tts.voiceType === 'zh_female_sajiaoxuemei_uranus_bigtts';
          if (
            legacyUri ||
            legacyCluster ||
            legacyResourceId ||
            legacyVoiceId ||
            legacyVoiceType ||
            !merged.tts.resourceId
          ) {
            merged.tts = {
              ...DEFAULT_CONFIG.tts,
              ...merged.tts,
              uri: DEFAULT_CONFIG.tts.uri,
              appId: merged.tts.appId,
              accessToken: merged.tts.accessToken,
              secretKey: merged.tts.secretKey,
              resourceId: legacyResourceId ? DEFAULT_CONFIG.tts.resourceId : (merged.tts.resourceId || DEFAULT_CONFIG.tts.resourceId),
              voiceId: legacyVoiceId ? DEFAULT_CONFIG.tts.voiceId : (merged.tts.voiceId || DEFAULT_CONFIG.tts.voiceId),
              voiceType: legacyVoiceType ? DEFAULT_CONFIG.tts.voiceType : (merged.tts.voiceType || DEFAULT_CONFIG.tts.voiceType),
              cluster: undefined,
            };
          }
        }
        set({ config: merged });
      }
    } catch (e) {
      console.warn('[useAppStore] Failed to load config:', e);
    }
  },

  /** Save current config to AsyncStorage */
  saveConfig: async () => {
    try {
      await ConfigStore.save(get().config);
    } catch (e) {
      console.warn('[useAppStore] Failed to save config:', e);
    }
  },

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
    // Auto-save after adding gateway
    get().saveConfig();
    return id;
  },

  removeGateway: (id) => {
    set((state) => ({
      config: {
        ...state.config,
        gateways: state.config.gateways.filter((g) => g.id !== id),
      },
      activeGateway:
        state.activeGateway?.id === id ? null : state.activeGateway,
    }));
    // Auto-save after removing gateway
    get().saveConfig();
  },

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
