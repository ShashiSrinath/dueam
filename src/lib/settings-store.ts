import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type Theme =
  | "system"
  | "light"
  | "dark"
  | "nord"
  | "rose-pine"
  | "dracula";
export type Density = "compact" | "comfortable" | "spacious";

export interface Settings {
  theme: Theme;
  accentColor: string;
  density: Density;
  fontSize: number;
  fontFamily: string;
  aiEnabled: boolean;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiSenderEnrichmentEnabled: boolean;
  aiSummarizationEnabled: boolean;
  notificationsEnabled: boolean;
  syncMonths: number;
}

interface SettingsState {
  settings: Settings;
  isInitialized: boolean;
  fetchSettings: () => Promise<void>;
  updateSetting: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => Promise<void>;
  init: () => Promise<void>;
}

const defaultSettings: Settings = {
  theme: "system",
  accentColor: "blue",
  density: "comfortable",
  fontSize: 14,
  fontFamily: "Inter",
  aiEnabled: false,
  aiBaseUrl: "https://api.openai.com/v1",
  aiApiKey: "",
  aiModel: "",
  aiSenderEnrichmentEnabled: true,
  aiSummarizationEnabled: false,
  notificationsEnabled: true,
  syncMonths: 3,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  isInitialized: false,

  fetchSettings: async () => {
    try {
      const settingsMap = await invoke<Record<string, string>>("get_settings");
      if (settingsMap) {
        const settings: Partial<Settings> = {};
        for (const [key, value] of Object.entries(settingsMap)) {
          try {
            (settings as any)[key] = JSON.parse(value);
          } catch {
            (settings as any)[key] = value;
          }
        }
        set((state) => ({
          settings: { ...state.settings, ...settings },
        }));
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
  },

  updateSetting: async (key, value) => {
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }));

    try {
      await invoke("update_setting", {
        key,
        value: JSON.stringify(value),
      });
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
      get().fetchSettings();
    }
  },

  init: async () => {
    await get().fetchSettings();
    set({ isInitialized: true });
  },
}));
