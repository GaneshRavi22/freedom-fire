jest.unmock('@/lib/analytics');

jest.mock('@/services/supabase', () => {
  const mockInsert = jest.fn().mockReturnValue({ then: jest.fn((cb: () => void) => cb()) });
  const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });
  return { supabase: { from: mockFrom } };
});

import { supabase } from '@/services/supabase';
import { track } from '@/lib/analytics';

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('track', () => {
  it('calls supabase.from with analytics_events table', () => {
    track('user-1', 'screen_viewed', { screen: 'home' });
    expect(mockFrom).toHaveBeenCalledWith('analytics_events');
  });

  it('inserts the correct payload for screen_viewed', () => {
    track('user-1', 'screen_viewed', { screen: 'home' });
    const mockInsert = mockFrom.mock.results[0].value.insert as jest.Mock;
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-1',
      event: 'screen_viewed',
      properties: { screen: 'home' },
    });
  });

  it('inserts correct payload for fire_calculated', () => {
    const props = {
      lifestyle: 'comfortable',
      retire_at_age: 45,
      years_to_fire: 12,
      savings_rate: 0.4,
      has_loan: false,
      is_first: true,
    };
    track('user-2', 'fire_calculated', props);
    const mockInsert = mockFrom.mock.results[0].value.insert as jest.Mock;
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-2',
      event: 'fire_calculated',
      properties: props,
    });
  });

  it('inserts correct payload for statement_uploaded', () => {
    track('user-3', 'statement_uploaded', { is_first: false, analysis_period_months: 3 });
    const mockInsert = mockFrom.mock.results[0].value.insert as jest.Mock;
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-3',
      event: 'statement_uploaded',
      properties: { is_first: false, analysis_period_months: 3 },
    });
  });

  it('inserts correct payload for task_accepted', () => {
    track('user-4', 'task_accepted', { task_type: 'reduce_delivery' });
    const mockInsert = mockFrom.mock.results[0].value.insert as jest.Mock;
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-4',
      event: 'task_accepted',
      properties: { task_type: 'reduce_delivery' },
    });
  });

  it('inserts correct payload for task_completed', () => {
    track('user-5', 'task_completed', { task_type: 'prepay_loan' });
    const mockInsert = mockFrom.mock.results[0].value.insert as jest.Mock;
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-5',
      event: 'task_completed',
      properties: { task_type: 'prepay_loan' },
    });
  });

  it('inserts correct payload for task_canceled', () => {
    track('user-6', 'task_canceled', { task_type: 'cancel_subscription', was_accepted: true });
    const mockInsert = mockFrom.mock.results[0].value.insert as jest.Mock;
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-6',
      event: 'task_canceled',
      properties: { task_type: 'cancel_subscription', was_accepted: true },
    });
  });

  it('returns void (does not throw)', () => {
    expect(() => track('user-7', 'screen_viewed', { screen: 'profile' })).not.toThrow();
  });

  it('calls supabase.from once per invocation', () => {
    track('user-8', 'screen_viewed', { screen: 'a' });
    track('user-8', 'screen_viewed', { screen: 'b' });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});
