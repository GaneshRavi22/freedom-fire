-- Add journey fields to fire_calculations
alter table fire_calculations
  add column if not exists current_savings numeric default 0,
  add column if not exists monthly_emi numeric default 0,
  add column if not exists loan_balance numeric default 0,
  add column if not exists loan_tenure_years integer default 0,
  add column if not exists monthly_income numeric,
  add column if not exists monthly_savings numeric,
  add column if not exists savings_rate integer,
  add column if not exists years_to_fire numeric,
  add column if not exists retire_at_age integer,
  add column if not exists onboarding_fire_number numeric,
  add column if not exists onboarding_retire_age integer;

-- Keep only the most recent fire_calculation per user (remove duplicates before adding unique constraint)
delete from fire_calculations fc1
using fire_calculations fc2
where fc1.user_id = fc2.user_id
  and fc1.updated_at < fc2.updated_at;

-- Add unique constraint so upsert by user_id works correctly
alter table fire_calculations
  add constraint fire_calculations_user_id_key unique (user_id);

-- Copy journey data into fire_calculations
update fire_calculations fc
set
  current_savings         = coalesce(fj.current_savings, 0),
  monthly_emi             = coalesce(fj.monthly_emi, 0),
  loan_balance            = coalesce(fj.loan_balance, 0),
  loan_tenure_years       = coalesce(fj.loan_tenure_years, 0),
  monthly_income          = fj.monthly_income,
  monthly_savings         = fj.monthly_savings,
  savings_rate            = fj.savings_rate,
  years_to_fire           = fj.years_to_fire,
  retire_at_age           = fj.retire_at_age,
  onboarding_fire_number  = fj.onboarding_fire_number,
  onboarding_retire_age   = fj.onboarding_retire_age
from fire_journey fj
where fc.user_id = fj.user_id;

-- Drop RLS policies for fire_journey
drop policy if exists "Users can view own journey" on fire_journey;
drop policy if exists "Users can insert own journey" on fire_journey;
drop policy if exists "Users can update own journey" on fire_journey;

-- Drop fire_journey table
drop table if exists fire_journey;
