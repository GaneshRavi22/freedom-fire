import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { FreedomDaysCard } from '@/components/ui/cards/FreedomDaysCard';

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('FreedomDaysCard', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<FreedomDaysCard totalDays={10} annualExpenses={600000} />);
    expect(toJSON()).toBeTruthy();
  });

  it('shows the Freedom Days Earned label', () => {
    const { getByText } = render(<FreedomDaysCard totalDays={10} annualExpenses={600000} />);
    expect(getByText('Freedom Days Earned')).toBeTruthy();
  });

  it('shows corpus value when totalDays > 0 and annualExpenses > 0', () => {
    const { getByText } = render(<FreedomDaysCard totalDays={365} annualExpenses={600000} />);
    expect(getByText(/freedom corpus/)).toBeTruthy();
  });

  it('hides corpus line when annualExpenses is 0', () => {
    const { queryByText } = render(<FreedomDaysCard totalDays={10} annualExpenses={0} />);
    expect(queryByText(/freedom corpus/)).toBeNull();
  });

  it('hides corpus line when totalDays is 0', () => {
    const { queryByText } = render(<FreedomDaysCard totalDays={0} annualExpenses={600000} />);
    expect(queryByText(/freedom corpus/)).toBeNull();
  });

  it('shows the recentlyEarned badge when recentlyEarned > 0', () => {
    const { getByText } = render(
      <FreedomDaysCard totalDays={10} annualExpenses={600000} recentlyEarned={3} />
    );
    expect(getByText(/\+3/)).toBeTruthy();
  });

  it('does not show recentlyEarned badge when recentlyEarned is 0', () => {
    const { queryByText } = render(
      <FreedomDaysCard totalDays={10} annualExpenses={600000} recentlyEarned={0} />
    );
    expect(queryByText(/\+0/)).toBeNull();
  });

  it('accepts a custom style prop', () => {
    const { toJSON } = render(
      <FreedomDaysCard totalDays={5} annualExpenses={100000} style={{ margin: 8 }} />
    );
    expect(toJSON()).toBeTruthy();
  });
});
