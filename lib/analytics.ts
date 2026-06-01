import { supabase } from '../services/supabase';

type EventName =
  | 'screen_viewed'
  | 'fire_calculated'
  | 'statement_uploaded'
  | 'task_accepted'
  | 'task_completed'
  | 'task_canceled';

type EventProperties = {
  screen_viewed:      { screen: string };
  fire_calculated:    { lifestyle: string; retire_at_age: number; years_to_fire: number; savings_rate: number; has_loan: boolean; is_first: boolean };
  statement_uploaded: { is_first: boolean; analysis_period_months: number };
  task_accepted:      { task_type: string };
  task_completed:     { task_type: string };
  task_canceled:      { task_type: string; was_accepted: boolean };
};

export function track<E extends EventName>(
  userId: string,
  event: E,
  properties: EventProperties[E],
): void {
  supabase
    .from('analytics_events')
    .insert({ user_id: userId, event, properties })
    .then(() => {});
}
