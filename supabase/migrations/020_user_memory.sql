-- Persistent per-user memory for the AI financial advisor.
-- Stores an ordered JSON array of strings (max 10 items; oldest trimmed by the Edge Function).
-- Written by financial-advisor-chat when the user states a preference, goal, or constraint.
-- Read at session start so the advisor remembers context across conversations.

CREATE TABLE user_memory (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  items      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;

-- Users can read their own memory from the client (writes go through the Edge Function with service role)
CREATE POLICY "Users can read own memory"
  ON user_memory FOR SELECT
  USING (auth.uid() = user_id);
