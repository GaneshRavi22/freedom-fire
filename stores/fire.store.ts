import { create } from 'zustand';
import { supabase } from '@/services/supabase';
import { FireInputs, Lifestyle } from '@/lib/fire';

/**
 * Full DB row for fire_calculations. All fields optional because the row may
 * not exist yet, or may have been created with only a subset of columns set.
 */
export interface FireRecord extends Partial<FireInputs> {
  id?: string;
  // Computed / derived (stored for fast reads)
  fire_number?: number;
  retire_at_age?: number;
  years_to_fire?: number;
  monthly_savings?: number;
  savings_rate?: number;
  /** The very first retire_at_age ever calculated for this user. Never overwritten. */
  onboarding_retire_age?: number;
}

interface FireState {
  calculation: FireRecord | null;
  loading: boolean;
  setCalculation: (calc: FireRecord) => void;
  fetchCalculation: (userId: string) => Promise<void>;
  saveCalculation: (userId: string, calc: Partial<FireRecord>) => Promise<void>;
}

export const useFireStore = create<FireState>((set, get) => ({
  calculation: null,
  loading: false,

  setCalculation: (calculation) => set({ calculation }),

  fetchCalculation: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('fire_calculations')
      .select('*')
      .eq('user_id', userId)
      .single();
    set({ calculation: data ?? null, loading: false });
  },

  saveCalculation: async (userId, calcPartial) => {
    const existing = get().calculation;
    const { id, ...existingWithoutId } = existing ?? {};
    // onboarding_retire_age is frozen: set from retire_at_age on first save, never overwritten
    const frozenOriginalAge =
      existing?.onboarding_retire_age ??
      calcPartial.retire_at_age ??
      existing?.retire_at_age;
    const payload = {
      ...existingWithoutId,
      ...calcPartial,
      onboarding_retire_age: frozenOriginalAge,
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('fire_calculations')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (data) set({ calculation: data });
  },
}));
