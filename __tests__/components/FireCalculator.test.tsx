/**
 * Bug 3 regression: FIRE Calculator must seed loan tasks after saving FIRE data.
 *
 * Old code: saveCalculation was called, but seedInsightTasks was never invoked.
 * Fix: after saveCalculation resolves, seedInsightTasks(userId, null, updatedCalc) is called.
 *
 * These tests verify the wiring by rendering the screen, submitting the form,
 * and asserting seedInsightTasks was called with the right arguments.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// ── Heavy native mocks ────────────────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-gifted-charts', () => ({ LineChart: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// ── UI component mocks ────────────────────────────────────────────────────────
jest.mock('@/components/ui/layout/GradientButton', () => ({
  GradientButton: ({ title, onPress, variant }: { title: string; onPress: () => void; variant?: string }) => {
    const { TouchableOpacity, Text } = require('react-native');
    const testID = variant === 'outline' ? 'preview-btn' : 'submit-btn';
    return <TouchableOpacity testID={testID} onPress={onPress}><Text>{title}</Text></TouchableOpacity>;
  },
}));
jest.mock('@/components/ui/inputs/InputField', () => ({ InputField: () => null }));
jest.mock('@/components/ui/inputs/SliderInput', () => ({ SliderInput: () => null }));
jest.mock('@/components/ui/cards/Card', () => ({
  Card: ({ children }: any) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));
jest.mock('@/components/ui/gamification/RewardToast', () => ({ RewardToast: () => null }));
jest.mock('@/components/ui/modals/LevelUpModal', () => ({ LevelUpModal: () => null }));

// ── Calculation library mocks ─────────────────────────────────────────────────
jest.mock('@/lib/fire', () => ({
  calculateFire: jest.fn(() => ({ possible: true, monthly_savings: 30000, savings_rate: 40 })),
  LIFESTYLE_SWR: { lean: 4, comfortable: 3.5, luxury: 3 },
}));
jest.mock('@/lib/calculations', () => ({
  calculateFireNumber: jest.fn(() => 20000000),
  calculateYearsToFireWithPayoff: jest.fn(() => 15),
  buildWealthTimelineWithPayoff: jest.fn(() => []),
  formatCurrency: (n: number) => `₹${n}`,
}));
jest.mock('@/lib/gamification', () => ({
  calculateFreedomDays: jest.fn(() => 5),
}));

// ── Form mock: bypass zod validation, call onSubmit with valid test values ────
jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    handleSubmit: (fn: (data: any) => void) => () =>
      fn({
        monthlyExpenses: '50000',
        retirementAge: '45',
        monthlyIncome: '80000',
        spouseIncome: '0',
        currentSavings: '500000',
        monthlyEmi: '30000',
        loanBalance: '3000000',
      }),
    formState: { errors: {} },
    setValue: jest.fn(),
    watch: jest.fn().mockReturnValue('30000'),
  }),
  Controller: ({ render: renderFn }: any) =>
    renderFn({ field: { onChange: jest.fn(), onBlur: jest.fn(), value: '' } }),
}));
jest.mock('@hookform/resolvers/zod', () => ({ zodResolver: () => () => ({}) }));
jest.mock('zod', () => ({ z: { object: () => ({}), string: () => ({ regex: () => ({ refine: () => ({}) }) }) } }));

// ── Store mocks ───────────────────────────────────────────────────────────────
const mockSeedInsightTasks = jest.fn().mockResolvedValue(undefined);
const mockSaveCalculation = jest.fn().mockResolvedValue(undefined);
const mockAwardXP = jest.fn().mockResolvedValue({ xpEarned: 50, leveledUp: false, previousLevel: 1, newLevel: 1, levelDefinition: {}, newBadges: [] });
const mockUpdateStreak = jest.fn().mockResolvedValue(undefined);
const mockProgressQuest = jest.fn().mockResolvedValue(undefined);

const savedCalculation = {
  id: 'calc-1',
  monthly_emi: 30000,
  loan_tenure_years: 20,
  fire_number: 20000000,
  retire_at_age: 45,
  years_to_fire: 15,
  monthly_savings: 30000,
};

jest.mock('@/stores/auth.store', () => ({ useAuthStore: jest.fn() }));
jest.mock('@/stores/gamification.store', () => ({ useGamificationStore: jest.fn() }));
jest.mock('@/stores/tasks.store', () => ({ useTasksStore: jest.fn() }));

// Fire store needs getState() for post-save calculation read, so we set it up carefully.
jest.mock('@/stores/fire.store', () => {
  const getState = jest.fn();
  const hook = Object.assign(jest.fn(), { getState });
  return { useFireStore: hook };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/auth.store';
import { useGamificationStore } from '@/stores/gamification.store';
import { useTasksStore } from '@/stores/tasks.store';
import { useFireStore } from '@/stores/fire.store';
import FireCalculatorScreen from '@/app/(tabs)/fire-calculator';

function setupMocks() {
  (useAuthStore as unknown as jest.Mock).mockReturnValue({
    user: { id: 'user-1' },
    profile: { age: 30 },
  });
  (useGamificationStore as unknown as jest.Mock).mockReturnValue({
    awardXP: mockAwardXP,
    updateStreak: mockUpdateStreak,
    progressQuest: mockProgressQuest,
  });
  (useTasksStore as unknown as jest.Mock).mockReturnValue({
    seedInsightTasks: mockSeedInsightTasks,
    updateLoanTasksFromFire: jest.fn(),
  });
  (useFireStore as unknown as jest.Mock).mockReturnValue({
    calculation: null,
    saveCalculation: mockSaveCalculation,
    fetchCalculation: jest.fn(),
  });
  // getState() is called after saveCalculation to read the updated calculation
  (useFireStore as any).getState.mockReturnValue({
    calculation: savedCalculation,
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  setupMocks();
});

describe('FireCalculatorScreen — task seeding after save (Bug 3 regression)', () => {
  it('renders and shows the submit button', () => {
    const { getByTestId } = render(<FireCalculatorScreen />);
    expect(getByTestId('submit-btn')).toBeTruthy();
  });

  it('calls saveCalculation when the form is submitted', async () => {
    const { getByTestId } = render(<FireCalculatorScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('submit-btn'));
    });

    expect(mockSaveCalculation).toHaveBeenCalled();
  });

  it('calls seedInsightTasks after saveCalculation resolves', async () => {
    const { getByTestId } = render(<FireCalculatorScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('submit-btn'));
    });

    expect(mockSeedInsightTasks).toHaveBeenCalled();
  });

  it('seeds tasks with the updated calculation (null analysis, real calc)', async () => {
    const { getByTestId } = render(<FireCalculatorScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('submit-btn'));
    });

    // seedInsightTasks must receive null for analysis and the updated FireRecord
    expect(mockSeedInsightTasks).toHaveBeenCalledWith(
      'user-1',
      null,
      expect.objectContaining({ id: 'calc-1' })
    );
  });

  it('does not call seedInsightTasks when saveCalculation fails', async () => {
    mockSaveCalculation.mockRejectedValueOnce(new Error('save failed'));

    const { getByTestId } = render(<FireCalculatorScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('submit-btn'));
    });

    expect(mockSeedInsightTasks).not.toHaveBeenCalled();
  });

  it('does not call seedInsightTasks when the updated calculation is null', async () => {
    (useFireStore as any).getState.mockReturnValueOnce({ calculation: null });

    const { getByTestId } = render(<FireCalculatorScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('submit-btn'));
    });

    expect(mockSeedInsightTasks).not.toHaveBeenCalled();
  });
});
