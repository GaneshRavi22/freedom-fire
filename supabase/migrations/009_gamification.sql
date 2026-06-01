-- ── 1. user_gamification (one row per user) ─────────────────────────────────
CREATE TABLE user_gamification (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  xp                 integer NOT NULL DEFAULT 0,
  level              integer NOT NULL DEFAULT 1,
  total_freedom_days numeric NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ── 2. user_badges (many per user) ──────────────────────────────────────────
CREATE TABLE user_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id    text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

-- ── 3. user_streaks (one row per user × streak_type) ────────────────────────
CREATE TABLE user_streaks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  streak_type   text NOT NULL CHECK (streak_type IN ('investment', 'tracking', 'review')),
  current_count integer NOT NULL DEFAULT 0,
  longest_count integer NOT NULL DEFAULT 0,
  last_activity date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (user_id, streak_type)
);

-- ── 4. user_quests (one row per user × quest_id) ────────────────────────────
CREATE TABLE user_quests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quest_id   text NOT NULL,
  progress   integer NOT NULL DEFAULT 0,
  target     integer NOT NULL DEFAULT 1,
  completed  boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, quest_id)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE user_gamification ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quests       ENABLE ROW LEVEL SECURITY;

-- user_gamification
CREATE POLICY "users_gamification_select" ON user_gamification
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_gamification_insert" ON user_gamification
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_gamification_update" ON user_gamification
  FOR UPDATE USING (auth.uid() = user_id);

-- user_badges
CREATE POLICY "users_badges_select" ON user_badges
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_badges_insert" ON user_badges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- user_streaks
CREATE POLICY "users_streaks_select" ON user_streaks
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_streaks_insert" ON user_streaks
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_streaks_update" ON user_streaks
  FOR UPDATE USING (auth.uid() = user_id);

-- user_quests
CREATE POLICY "users_quests_select" ON user_quests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_quests_insert" ON user_quests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_quests_update" ON user_quests
  FOR UPDATE USING (auth.uid() = user_id);

-- ── Trigger: auto-create gamification row on profile creation ────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_gamification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_gamification (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_gamification
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_gamification();
