-- Add lifestyle column so onboarding and FIRE calculator share a single
-- data model with no field-name mismatches between app and DB.
ALTER TABLE fire_calculations
  ADD COLUMN IF NOT EXISTS lifestyle text
    CHECK (lifestyle IN ('lean', 'comfortable', 'luxury'));
