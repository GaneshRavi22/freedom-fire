-- Remove the onboarding snapshot columns. The single fire_number column
-- on fire_calculations IS the canonical FIRE number — set during onboarding
-- and updated by the FIRE calculator screen. No separate snapshot needed.
ALTER TABLE fire_calculations
  DROP COLUMN IF EXISTS onboarding_fire_number,
  DROP COLUMN IF EXISTS onboarding_retire_age;
