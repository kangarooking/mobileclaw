/**
 * ConfigStore — Persist configuration to AsyncStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppConfig } from '@/types/config';
import { DEFAULT_CONFIG } from '@/types/config';

const STORAGE_KEY = '@mobileclaw_config';

export class ConfigStore {
  static async load(): Promise<AppConfig> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_CONFIG;
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      // Merge with defaults to handle new fields added in updates
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  static async save(config: AppConfig): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  static async reset(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}
