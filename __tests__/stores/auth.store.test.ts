import { act } from '@testing-library/react-native';
import { useAuthStore } from '@/stores/auth.store';

jest.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      signOut: jest.fn().mockResolvedValue({}),
    },
    from: jest.fn(),
  },
}));

import { supabase } from '@/services/supabase';

const mockSession = {
  user: { id: 'user-123', email: 'test@example.com' },
  access_token: 'token-abc',
} as any;

const mockProfile = {
  id: 'user-123',
  name: 'Test User',
  age: 30,
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  useAuthStore.setState({ session: null, user: null, profile: null, loading: false });
  jest.clearAllMocks();
});

describe('useAuthStore — setSession', () => {
  it('sets session and extracts user', () => {
    useAuthStore.getState().setSession(mockSession);
    const { session, user } = useAuthStore.getState();
    expect(session).toBe(mockSession);
    expect(user).toBe(mockSession.user);
  });

  it('clears user when session is null', () => {
    useAuthStore.getState().setSession(mockSession);
    useAuthStore.getState().setSession(null);
    const { session, user } = useAuthStore.getState();
    expect(session).toBeNull();
    expect(user).toBeNull();
  });
});

describe('useAuthStore — setProfile', () => {
  it('stores profile in state', () => {
    useAuthStore.getState().setProfile(mockProfile);
    expect(useAuthStore.getState().profile).toEqual(mockProfile);
  });

  it('clears profile when null is passed', () => {
    useAuthStore.getState().setProfile(mockProfile);
    useAuthStore.getState().setProfile(null);
    expect(useAuthStore.getState().profile).toBeNull();
  });
});

describe('useAuthStore — fetchProfile', () => {
  it('does nothing when there is no user', async () => {
    await act(async () => {
      await useAuthStore.getState().fetchProfile();
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('fetches and stores profile from Supabase', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: mockProfile, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    useAuthStore.getState().setSession(mockSession);
    await act(async () => {
      await useAuthStore.getState().fetchProfile();
    });

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-123');
    expect(useAuthStore.getState().profile).toEqual(mockProfile);
  });

  it('does not crash when Supabase returns no data', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    useAuthStore.getState().setSession(mockSession);
    await act(async () => {
      await useAuthStore.getState().fetchProfile();
    });

    expect(useAuthStore.getState().profile).toBeNull();
  });
});

describe('useAuthStore — signOut', () => {
  it('calls supabase.auth.signOut and clears state', async () => {
    useAuthStore.getState().setSession(mockSession);
    useAuthStore.getState().setProfile(mockProfile);

    await act(async () => {
      await useAuthStore.getState().signOut();
    });

    expect(supabase.auth.signOut).toHaveBeenCalled();
    const { session, user, profile } = useAuthStore.getState();
    expect(session).toBeNull();
    expect(user).toBeNull();
    expect(profile).toBeNull();
  });
});
