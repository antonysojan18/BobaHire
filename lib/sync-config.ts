import { supabase } from '@/lib/supabase';

export interface RoleSheetConfig {
  sheetUrl: string;
  autoSync: boolean;
  lastSyncTime?: string | null;
  lastSyncCount?: number;
}

export interface UniversalSyncSettings {
  isPaused: boolean;
  autoSyncInterval: number; // in seconds
  selectedRole: string;
  sheets: {
    'HR Executive': RoleSheetConfig;
    'Pastry Chef': RoleSheetConfig;
    'Barista': RoleSheetConfig;
    'General Manager': RoleSheetConfig;
    'Cafe Staff': RoleSheetConfig;
    [key: string]: RoleSheetConfig;
  };
  lastGlobalSyncTime?: string | null;
  activeSyncLock?: {
    role: string;
    lockedUntil: number;
  } | null;
}

export const DEFAULT_SYNC_SETTINGS: UniversalSyncSettings = {
  isPaused: false,
  autoSyncInterval: 5,
  selectedRole: 'HR Executive',
  sheets: {
    'HR Executive': {
      sheetUrl: 'https://docs.google.com/spreadsheets/d/16QjF1zjUJ0xDv_jF6ySA8SD68DEt9yHeS9k6QcpoNOc/edit?usp=sharing',
      autoSync: false,
      lastSyncTime: null,
      lastSyncCount: 0,
    },
    'Pastry Chef': {
      sheetUrl: '',
      autoSync: false,
      lastSyncTime: null,
      lastSyncCount: 0,
    },
    'Barista': {
      sheetUrl: '',
      autoSync: false,
      lastSyncTime: null,
      lastSyncCount: 0,
    },
    'General Manager': {
      sheetUrl: '',
      autoSync: false,
      lastSyncTime: null,
      lastSyncCount: 0,
    },
    'Cafe Staff': {
      sheetUrl: '',
      autoSync: false,
      lastSyncTime: null,
      lastSyncCount: 0,
    },
  },
};

export const SYSTEM_CONFIG_EMAIL = '__system_sync_config__@bobahire.internal';

/**
 * Retrieve universal sync settings from Supabase (shared across all devices)
 */
export async function getUniversalSyncSettings(): Promise<UniversalSyncSettings> {
  try {
    const { data, error } = await supabase
      .from('candidates')
      .select('questionnaire_data')
      .eq('email', SYSTEM_CONFIG_EMAIL)
      .limit(1);

    if (error || !data || data.length === 0 || !data[0]?.questionnaire_data) {
      return DEFAULT_SYNC_SETTINGS;
    }

    const saved = data[0].questionnaire_data;
    return {
      isPaused: typeof saved.isPaused === 'boolean' ? saved.isPaused : DEFAULT_SYNC_SETTINGS.isPaused,
      autoSyncInterval: Number(saved.autoSyncInterval) || DEFAULT_SYNC_SETTINGS.autoSyncInterval,
      selectedRole: saved.selectedRole || DEFAULT_SYNC_SETTINGS.selectedRole,
      sheets: {
        ...DEFAULT_SYNC_SETTINGS.sheets,
        ...(saved.sheets || {}),
      },
      lastGlobalSyncTime: saved.lastGlobalSyncTime || null,
      activeSyncLock: saved.activeSyncLock || null,
    };
  } catch (err) {
    console.error('Failed to get universal sync settings:', err);
    return DEFAULT_SYNC_SETTINGS;
  }
}

/**
 * Update universal sync settings in Supabase so changes reflect on all devices
 */
export async function updateUniversalSyncSettings(
  partial: Partial<UniversalSyncSettings>
): Promise<UniversalSyncSettings> {
  const current = await getUniversalSyncSettings();
  const updated: UniversalSyncSettings = {
    ...current,
    ...partial,
    sheets: {
      ...current.sheets,
      ...(partial.sheets || {}),
    },
  };

  try {
    const { data: existing } = await supabase
      .from('candidates')
      .select('id')
      .eq('email', SYSTEM_CONFIG_EMAIL)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from('candidates')
        .update({
          questionnaire_data: updated,
          status: 'system',
        })
        .eq('id', existing[0].id);
    } else {
      await supabase.from('candidates').insert([
        {
          name: 'SYSTEM_SYNC_CONFIG',
          email: SYSTEM_CONFIG_EMAIL,
          role: 'SYSTEM',
          status: 'system',
          questionnaire_data: updated,
        },
      ]);
    }
  } catch (err) {
    console.error('Failed to update universal sync settings:', err);
  }

  return updated;
}
