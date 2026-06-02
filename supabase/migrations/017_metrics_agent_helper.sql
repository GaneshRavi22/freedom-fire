-- Helper RPC for metrics-agent: aggregate daily event counts per type
-- Avoids fetching raw rows and aggregating in JS for large event tables

CREATE OR REPLACE FUNCTION get_daily_event_counts(
  since      timestamptz,
  event_types text[]
)
RETURNS TABLE (
  date        text,
  event_type  text,
  count       bigint
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
    event,
    COUNT(*)::bigint AS count
  FROM analytics_events
  WHERE created_at >= since
    AND event = ANY(event_types)
  GROUP BY 1, 2
  ORDER BY 1 DESC, 2;
$$;

-- Service role only — no public access needed
REVOKE ALL ON FUNCTION get_daily_event_counts(timestamptz, text[]) FROM PUBLIC;
