import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FireInputs } from '@/lib/fire';

/**
 * What we persist to AsyncStorage before the user creates an account.
 * Uses the exact same field names as FireInputs / fire_calculations so
 * _layout.tsx can forward it to saveCalculation with zero renaming.
 */
export interface OnboardingPayload extends FireInputs {
  age: number;
  // Computed results from calculateFire(), stored alongside inputs
  fire_number: number;
  retire_at_age: number;
  years_to_fire: number;
  monthly_savings: number;
  savings_rate: number;
}

const STORAGE_KEY = 'freedomfire_pending_onboarding';

interface OnboardingState {
  pending: OnboardingPayload | null;
  setPending: (data: OnboardingPayload) => Promise<void>;
  loadPending: () => Promise<void>;
  clearPending: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  pending: null,

  setPending: async (data) => {
    set({ pending: data });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  loadPending: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ pending: JSON.parse(raw) });
    } catch {
      // ignore read errors
    }
  },

  clearPending: async () => {
    set({ pending: null });
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
}));
