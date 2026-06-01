-- Freeze the user's very first projected retirement age so progress can be shown
-- even after re-running the FIRE calculator with updated inputs.
ALTER TABLE fire_calculations ADD COLUMN IF NOT EXISTS onboarding_retire_age integer;
