-- Track the last date a user received daily login XP in the DB rather than
-- AsyncStorage so it works correctly across devices and after reinstalls.
ALTER TABLE user_gamification ADD COLUMN IF NOT EXISTS last_login_date date;
