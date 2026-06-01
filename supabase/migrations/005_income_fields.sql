-- Remove lifespan (unused in FIRE calculation)
ALTER TABLE fire_calculations DROP COLUMN IF EXISTS lifespan;

-- Add spouse_income (was in fire_journey but not copied to fire_calculations in migration 004)
ALTER TABLE fire_calculations ADD COLUMN IF NOT EXISTS spouse_income numeric DEFAULT 0;
