-- ── user_tasks ────────────────────────────────────────────────────────────────
-- One row per user × task_type. Seeded automatically from Insights tab.
CREATE TABLE user_tasks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_type              text NOT NULL,
  title                  text NOT NULL,
  description            text,
  metadata               jsonb NOT NULL DEFAULT '{}',
  status                 text NOT NULL DEFAULT 'recommended'
                           CHECK (status IN ('recommended', 'accepted', 'done', 'canceled')),
  target_completion_date date,
  xp_reward              integer NOT NULL DEFAULT 50,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_type)
);

ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_tasks_select" ON user_tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_tasks_insert" ON user_tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_tasks_update" ON user_tasks
  FOR UPDATE USING (auth.uid() = user_id);
