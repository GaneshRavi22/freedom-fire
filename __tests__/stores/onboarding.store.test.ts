import { act } from '@testing-library/react-native';
import { useOnboardingStore } from '@/stores/onboarding.store';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(null),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockPayload = {
  age: 30,
  monthly_income: 150000,
  spouse_income: 0,
  monthly_expenses: 60000,
  current_savings: 2000000,
  loan_balance: 0,
  monthly_emi: 0,
  loan_tenure_years: 0,
  retirement_age: 45,
  lifestyle: 'comfortable' as const,
  expected_return_pct: 12,
  inflation_rate_pct: 6,
  fire_number: 30000000,
  retire_at_age: 45,
  years_to_fire: 15,
  monthly_savings: 90000,
  savings_rate: 60,
};

beforeEach(() => {
  useOnboardingStore.setState({ pending: null });
  jest.clearAllMocks();
});

describe('useOnboardingStore — setPending', () => {
  it('stores payload in state and persists to AsyncStorage', async () => {
    await act(async () => {
      await useOnboardingStore.getState().setPending(mockPayload);
    });

    expect(useOnboardingStore.getState().pending).toEqual(mockPayload);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'freedomfire_pending_onboarding',
      JSON.stringify(mockPayload)
    );
  });
});

describe('useOnboardingStore — loadPending', () => {
  it('loads stored payload from AsyncStorage into state', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockPayload));

    await act(async () => {
      await useOnboardingStore.getState().loadPending();
    });

    expect(useOnboardingStore.getState().pending).toEqual(mockPayload);
  });

  it('leaves state as null when AsyncStorage has no stored value', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    await act(async () => {
      await useOnboardingStore.getState().loadPending();
    });

    expect(useOnboardingStore.getState().pending).toBeNull();
  });

  it('ignores AsyncStorage read errors and leaves state unchanged', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage error'));

    await expect(
      act(async () => {
        await useOnboardingStore.getState().loadPending();
      })
    ).resolves.not.toThrow();

    expect(useOnboardingStore.getState().pending).toBeNull();
  });
});

describe('useOnboardingStore — clearPending', () => {
  it('clears state and removes from AsyncStorage', async () => {
    useOnboardingStore.setState({ pending: mockPayload });

    await act(async () => {
      await useOnboardingStore.getState().clearPending();
    });

    expect(useOnboardingStore.getState().pending).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('freedomfire_pending_onboarding');
  });
});
