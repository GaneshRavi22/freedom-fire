import { act } from '@testing-library/react-native';
import { useFireStore } from '@/stores/fire.store';

jest.mock('@/services/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '@/services/supabase';

const mockCalc = {
  id: 'calc-1',
  monthly_expenses: 50000,
  retirement_age: 45,
  expected_return_pct: 12,
  inflation_rate_pct: 6,
  fire_number: 24000000,
  current_savings: 1000000,
  monthly_emi: 0,
  loan_balance: 0,
  loan_tenure_years: 0,
  monthly_income: 80000,
  spouse_income: 40000,
  monthly_savings: 50000,
  savings_rate: 42,
  years_to_fire: 15,
  retire_at_age: 45,
};

beforeEach(() => {
  useFireStore.setState({ calculation: null, loading: false });
  jest.clearAllMocks();
});

describe('useFireStore — setCalculation', () => {
  it('setCalculation updates calculation in state', () => {
    useFireStore.getState().setCalculation(mockCalc);
    expect(useFireStore.getState().calculation).toEqual(mockCalc);
  });
});

describe('useFireStore — fetchCalculation', () => {
  it('sets loading during fetch and clears on completion', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockCalc, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useFireStore.getState().fetchCalculation('user-123');
    });

    expect(useFireStore.getState().loading).toBe(false);
    expect(useFireStore.getState().calculation).toEqual(mockCalc);
  });

  it('stores monthly_income and spouse_income separately from DB', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockCalc, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useFireStore.getState().fetchCalculation('user-123');
    });

    const calc = useFireStore.getState().calculation;
    expect(calc?.monthly_income).toBe(mockCalc.monthly_income);
    expect(calc?.spouse_income).toBe(mockCalc.spouse_income);
  });

  it('queries fire_calculations table with the correct user_id', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useFireStore.getState().fetchCalculation('user-abc');
    });

    expect(supabase.from).toHaveBeenCalledWith('fire_calculations');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-abc');
  });

  it('stores null when no calculation exists', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useFireStore.getState().fetchCalculation('user-123');
    });

    expect(useFireStore.getState().calculation).toBeNull();
  });
});

describe('useFireStore — saveCalculation', () => {
  it('upserts to fire_calculations and updates state', async () => {
    const savedCalc = { ...mockCalc, id: 'calc-new' };
    const chain = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: savedCalc, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useFireStore.getState().saveCalculation('user-123', mockCalc);
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        fire_number: mockCalc.fire_number,
        monthly_income: mockCalc.monthly_income,
        spouse_income: mockCalc.spouse_income,
      }),
      { onConflict: 'user_id' }
    );
    expect(useFireStore.getState().calculation).toEqual(savedCalc);
  });

  it('merges partial update with existing calculation', async () => {
    useFireStore.setState({ calculation: mockCalc, loading: false });

    const updated = { ...mockCalc, monthly_expenses: 60000 };
    const chain = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: updated, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useFireStore.getState().saveCalculation('user-123', { monthly_expenses: 60000 });
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        monthly_expenses: 60000,
        fire_number: mockCalc.fire_number,
      }),
      { onConflict: 'user_id' }
    );
  });

  it('throws when supabase returns an error', async () => {
    const chain = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB constraint violation' } }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(
      act(async () => {
        await useFireStore.getState().saveCalculation('user-123', mockCalc);
      })
    ).rejects.toThrow('DB constraint violation');
  });

  it('does not update state when supabase returns null data without error', async () => {
    const chain = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await act(async () => {
      await useFireStore.getState().saveCalculation('user-123', mockCalc);
    });

    expect(useFireStore.getState().calculation).toBeNull();
  });
});
