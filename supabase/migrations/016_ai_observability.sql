-- AI request log — records every Claude API call for cost/latency observability
CREATE TABLE ai_request_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  function_name text        NOT NULL,
  model         text        NOT NULL,
  input_tokens  integer,
  output_tokens integer,
  latency_ms    integer,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_request_log_created_at_idx ON ai_request_log(created_at DESC);
CREATE INDEX ai_request_log_function_name_idx ON ai_request_log(function_name);

-- No RLS — service role only (AI functions write, no client reads)
-- Analytics queries use service role via Grafana / direct DB access
