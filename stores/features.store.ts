import { create } from 'zustand';
import { supabase } from '@/services/supabase';

export type FeatureFlag = 'gamification' | 'ai_advisor' | 'spend_tracking' | 'fire_calculator' | 'tasks';

interface FeaturesState {
  features: Record<string, boolean>;
  loading: boolean;
  fetchFeatures: () => Promise<void>;
  isEnabled: (flag: FeatureFlag) => boolean;
}

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  features: {},
  loading: false,

  fetchFeatures: async () => {
    set({ loading: true });
    const { data } = await supabase
      .from('app_config')
      .select('features')
      .eq('id', 'global')
      .single();
    set({ features: data?.features ?? {}, loading: false });
  },

  isEnabled: (flag) => get().features[flag] === true,
}));
