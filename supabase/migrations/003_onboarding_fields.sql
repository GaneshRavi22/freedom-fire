ALTER TABLE fire_journey
  ADD COLUMN IF NOT EXISTS monthly_emi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_balance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_tenure_years integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifestyle text DEFAULT 'comfortable',
  ADD COLUMN IF NOT EXISTS spouse_income numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS city text DEFAULT '',
  ADD COLUMN IF NOT EXISTS savings_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_fire_number numeric,
  ADD COLUMN IF NOT EXISTS onboarding_retire_age integer;
