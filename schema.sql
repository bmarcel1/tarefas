-- Cole no Supabase: SQL Editor > New query > Run
create table categories(
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text, start_m int, end_m int, color text, days int default 127, deleted bool default false, updated_at timestamptz default now());
create table tasks(
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text, dur int, start timestamptz, fixed bool default false, series_id uuid, notes text, urgent bool default false, requested_by text, dur_planned int, dur_actual int, done bool default false, deleted bool default false,
  cat_id uuid, updated_at timestamptz default now());
create table history(
  id uuid primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid, title text, action text, old_start timestamptz, new_start timestamptz, updated_at timestamptz default now());
create index on categories(user_id, updated_at); create index on tasks(user_id, updated_at); create index on history(user_id, updated_at);

-- Proteção por usuário (Row Level Security): cada pessoa só vê e altera os próprios dados
alter table categories enable row level security;
alter table tasks enable row level security;
alter table history enable row level security;
create policy own_categories on categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_tasks on tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_history on history for all using (user_id = auth.uid()) with check (user_id = auth.uid());
