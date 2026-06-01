import { act } from '@testing-library/react-native';
import { useFeaturesStore } from '@/stores/features.store';

jest.mock('@/services/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '@/services/supabase';

const mockFeatures = {
  gamification: true,
  ai_advisor: true,
  spend_tracking: true,
  fire_calculator: true,
  tasks: true,
};

beforeEach(() => {
  useFeaturesStore.setState({ features: {}, loading: false });
  jest.clearAllMocks();
});

describe('useFeaturesStore — fetchFeatures', () => {
  it('fetches app_config and stores features', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { features: mockFeatures }, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useFeaturesStore.getState().fetchFeatures();
    });

    expect(supabase.from).toHaveBeenCalledWith('app_config');
    expect(chain.eq).toHaveBeenCalledWith('id', 'global');
    expect(useFeaturesStore.getState().features).toEqual(mockFeatures);
    expect(useFeaturesStore.getState().loading).toBe(false);
  });

  it('falls back to empty object when row is missing', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useFeaturesStore.getState().fetchFeatures();
    });

    expect(useFeaturesStore.getState().features).toEqual({});
    expect(useFeaturesStore.getState().loading).toBe(false);
  });

  it('sets loading true during fetch and false after', async () => {
    let resolveFetch!: (v: unknown) => void;
    const pending = new Promise((res) => { resolveFetch = res; });
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnValue(pending),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const fetchPromise = useFeaturesStore.getState().fetchFeatures();
    expect(useFeaturesStore.getState().loading).toBe(true);

    resolveFetch({ data: { features: mockFeatures }, error: null });
    await act(async () => { await fetchPromise; });
    expect(useFeaturesStore.getState().loading).toBe(false);
  });
});

describe('useFeaturesStore — isEnabled', () => {
  it('returns true for an enabled flag', () => {
    useFeaturesStore.setState({ features: mockFeatures, loading: false });
    expect(useFeaturesStore.getState().isEnabled('gamification')).toBe(true);
    expect(useFeaturesStore.getState().isEnabled('ai_advisor')).toBe(true);
  });

  it('returns false for a disabled flag', () => {
    useFeaturesStore.setState({ features: { ...mockFeatures, ai_advisor: false }, loading: false });
    expect(useFeaturesStore.getState().isEnabled('ai_advisor')).toBe(false);
  });

  it('returns false for a flag not present in features', () => {
    useFeaturesStore.setState({ features: {}, loading: false });
    expect(useFeaturesStore.getState().isEnabled('gamification')).toBe(false);
  });
});
