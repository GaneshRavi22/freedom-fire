-- Add persisted effective avg that reflects ignored transactions
ALTER TABLE spend_analyses
  ADD COLUMN IF NOT EXISTS effective_avg_monthly_spend numeric;

-- Backfill: for existing rows with no ignores, effective = original
UPDATE spend_analyses
  SET effective_avg_monthly_spend = avg_monthly_spend
  WHERE effective_avg_monthly_spend IS NULL;
