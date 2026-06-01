CREATE TABLE analytics_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  event       text        NOT NULL,
  properties  jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_events_user_id_idx  ON analytics_events(user_id);
CREATE INDEX analytics_events_event_idx    ON analytics_events(event);
CREATE INDEX analytics_events_created_at_idx ON analytics_events(created_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own events
CREATE POLICY "users can insert own events"
  ON analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No reads via client — analytics are queried via service role / dashboard only
