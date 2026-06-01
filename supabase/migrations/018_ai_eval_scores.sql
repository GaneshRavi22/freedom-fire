-- AI evaluation scores — one row per evaluation event.
-- Written by online-eval after every instrumented LLM call.
-- Read by metrics-agent for daily quality-drift detection.

CREATE TABLE ai_eval_scores (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id      text        NOT NULL,          -- LangFuse trace id (or synthetic id for offline evals)
  function_name text        NOT NULL,          -- e.g. 'weekly-health-agent', 'generate-tasks'
  score_name    text        NOT NULL,          -- e.g. 'insight_quality', 'task_quality', 'response_quality'
  score_value   numeric     NOT NULL CHECK (score_value >= 0 AND score_value <= 1),
  score_detail  jsonb,                         -- per-criterion breakdown
  eval_type     text        NOT NULL DEFAULT 'rule_based'
                            CHECK (eval_type IN ('rule_based', 'llm_judge', 'offline')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_eval_scores_fn_created_idx  ON ai_eval_scores(function_name, created_at DESC);
CREATE INDEX ai_eval_scores_name_created_idx ON ai_eval_scores(score_name, created_at DESC);

-- Daily aggregate view used by metrics-agent drift detection
CREATE VIEW ai_eval_daily_avg AS
SELECT
  function_name,
  score_name,
  DATE(created_at AT TIME ZONE 'Asia/Kolkata') AS score_date,
  ROUND(AVG(score_value)::numeric, 3)           AS avg_score,
  COUNT(*)                                       AS sample_count
FROM ai_eval_scores
GROUP BY function_name, score_name, DATE(created_at AT TIME ZONE 'Asia/Kolkata');

-- No RLS — service role only (Edge Functions write, metrics-agent reads)
