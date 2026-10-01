-- Run once in Supabase > SQL Editor.
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  health text, priority text, channel text,
  current_focus text, main_contact text, main_blocker text,
  next_action text, next_action_due date, next_action_owner text,
  waiting_on text, last_touchpoint date, next_touchpoint date,
  important_links text, notes text, service_scope text, timezone text,
  created_at timestamptz default now()
);
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_id uuid references clients(id) on delete set null,
  due_date date, due_time time,
  status text not null default 'Not Started'
    check (status in ('Not Started','In Progress','Waiting','Blocked','Done')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz default now()
);
create index on tasks (due_date);
-- Single-user app: any signed-in user can do everything. Turn OFF "Allow new users to sign up"
-- in Auth settings and create your own user by hand.
alter table clients enable row level security;
alter table tasks enable row level security;
create policy "me" on clients for all to authenticated using (true) with check (true);
create policy "me" on tasks   for all to authenticated using (true) with check (true);
