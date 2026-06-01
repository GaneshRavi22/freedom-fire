-- AI-generated weekly health insights per user
CREATE TABLE ai_insights (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category    text        NOT NULL CHECK (category IN ('spending', 'fire_progress', 'task_opportunity', 'milestone')),
  message     text        NOT NULL,
  confidence  numeric     NOT NULL DEFAULT 0.8,
  action_id   uuid        REFERENCES user_tasks(id) ON DELETE SET NULL,
  dismissed   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_insights_user_id_idx ON ai_insights(user_id, dismissed, created_at DESC);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Users can read their own insights
CREATE POLICY "users_ai_insights_select" ON ai_insights
  FOR SELECT USING (auth.uid() = user_id);

-- Users can dismiss their own insights
CREATE POLICY "users_ai_insights_update" ON ai_insights
  FOR UPDATE USING (auth.uid() = user_id);

-- No insert policy — only service role (Edge Functions) write insights
