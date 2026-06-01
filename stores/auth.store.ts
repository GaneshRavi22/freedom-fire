import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

interface Profile {
  id: string;
  name: string;
  age: number;
  created_at: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  fetchProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: false,

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },

  setProfile: (profile) => set({ profile }),

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (data) set({ profile: data });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },
}));
