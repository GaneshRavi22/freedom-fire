create table app_config (
  id text primary key default 'global',
  features jsonb not null default '{}'
);

insert into app_config (id, features) values (
  'global',
  '{
    "gamification": true,
    "ai_advisor": true,
    "spend_tracking": true,
    "fire_calculator": true,
    "tasks": true
  }'
);

alter table app_config enable row level security;

create policy "app_config readable by authenticated users"
  on app_config for select
  using (true);
