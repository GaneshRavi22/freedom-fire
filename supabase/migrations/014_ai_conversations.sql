-- AI advisor conversation history
CREATE TABLE ai_conversations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text        NOT NULL,
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversations_user_id_idx ON ai_conversations(user_id, created_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_conversations_select" ON ai_conversations
  FOR SELECT USING (auth.uid() = user_id);
-- No insert/update policy — only service role (Edge Functions) write

-- Per-user AI context snapshot (refreshed on each FIRE calc / statement upload)
CREATE TABLE user_ai_context (
  user_id             uuid        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  financial_summary   jsonb       NOT NULL DEFAULT '{}',
  stated_preferences  jsonb       NOT NULL DEFAULT '{}',
  last_refreshed_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_ai_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_ai_context_select" ON user_ai_context
  FOR SELECT USING (auth.uid() = user_id);
