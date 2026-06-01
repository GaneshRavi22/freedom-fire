-- Add outlier transaction tracking to spend_analyses
ALTER TABLE spend_analyses
  ADD COLUMN IF NOT EXISTS outlier_transactions jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ignored_transaction_ids jsonb DEFAULT '[]';

-- Allow users to update their own analyses (needed to persist ignored IDs)
CREATE POLICY "Users can update own analyses"
  ON spend_analyses FOR UPDATE USING (auth.uid() = user_id);
