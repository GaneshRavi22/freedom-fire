-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  age integer,
  created_at timestamptz default now()
);

-- FIRE calculator inputs + result
create table fire_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  monthly_expenses numeric not null,
  retirement_age integer not null,
  lifespan integer default 85,
  expected_return_pct numeric default 12,
  inflation_rate_pct numeric default 6,
  fire_number numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Monthly spend analysis
create table spend_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  statement_file_path text,
  avg_monthly_spend numeric not null,
  analysis_period_months integer default 1,
  category_breakdown jsonb default '{}',
  monthly_trend jsonb default '[]',
  insights jsonb default '[]',
  created_at timestamptz default now()
);

-- Journey to FIRE config (one per user)
create table fire_journey (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade unique,
  monthly_income numeric,
  monthly_savings numeric,
  current_savings numeric default 0,
  years_to_fire numeric,
  retire_at_age integer,
  cost_cutting_suggestions jsonb default '[]',
  updated_at timestamptz default now()
);

-- Trigger: auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, age)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    (new.raw_user_meta_data->>'age')::integer
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row Level Security
alter table profiles enable row level security;
alter table fire_calculations enable row level security;
alter table spend_analyses enable row level security;
alter table fire_journey enable row level security;

-- RLS Policies — profiles
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- RLS Policies — fire_calculations
create policy "Users can view own calculations"
  on fire_calculations for select using (auth.uid() = user_id);
create policy "Users can insert own calculations"
  on fire_calculations for insert with check (auth.uid() = user_id);
create policy "Users can update own calculations"
  on fire_calculations for update using (auth.uid() = user_id);

-- RLS Policies — spend_analyses
create policy "Users can view own analyses"
  on spend_analyses for select using (auth.uid() = user_id);
create policy "Users can insert own analyses"
  on spend_analyses for insert with check (auth.uid() = user_id);

-- RLS Policies — fire_journey
create policy "Users can view own journey"
  on fire_journey for select using (auth.uid() = user_id);
create policy "Users can insert own journey"
  on fire_journey for insert with check (auth.uid() = user_id);
create policy "Users can update own journey"
  on fire_journey for update using (auth.uid() = user_id);

-- Storage bucket for statements
insert into storage.buckets (id, name, public) values ('statements', 'statements', false);

create policy "Users can upload own statements"
  on storage.objects for insert
  with check (bucket_id = 'statements' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can view own statements"
  on storage.objects for select
  using (bucket_id = 'statements' and auth.uid()::text = (storage.foldername(name))[1]);
