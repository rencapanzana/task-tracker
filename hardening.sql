-- Run once in Supabase > SQL Editor, after schema.sql (+ seed.sql).
-- Set your login email on the next line if it differs.
do $$
declare
  owner_email text := 'reniellecapanzana@gmail.com';
  owner_id uuid;
begin
  select id into owner_id from auth.users where email = owner_email;
  if owner_id is null then
    raise exception 'No auth user with email %. Create it first (Authentication > Users).', owner_email;
  end if;

  -- 1. Only the owner's account, not "any signed-in user". Survives signups being re-enabled by mistake.
  drop policy if exists "me" on clients;
  drop policy if exists "me" on tasks;
  execute format('create policy "owner only" on clients for all to authenticated using ((select auth.uid()) = %L) with check ((select auth.uid()) = %L)', owner_id, owner_id);
  execute format('create policy "owner only" on tasks for all to authenticated using ((select auth.uid()) = %L) with check ((select auth.uid()) = %L)', owner_id, owner_id);
end $$;

-- 2. Logged-out visitors get no table privileges at all (RLS already blocks them; this is the second lock).
revoke all on clients, tasks from anon;

-- 3. Server-side input validation. The form's maxlength is only a convenience.
alter table tasks add constraint tasks_lengths check (
  char_length(title) between 1 and 300 and char_length(coalesce(notes, '')) <= 5000);
alter table clients add constraint clients_lengths check (
  char_length(name) between 1 and 300
  and char_length(coalesce(current_focus, '') || coalesce(notes, '')) <= 10000
  and char_length(coalesce(important_links, '')) <= 2000
  and greatest(char_length(health), char_length(priority), char_length(channel), char_length(main_contact),
               char_length(main_blocker), char_length(next_action), char_length(next_action_owner),
               char_length(waiting_on), char_length(service_scope), char_length(timezone)) <= 300);

-- Check: should list the "owner only" policies and no anon grants.
select tablename, policyname, cmd from pg_policies where tablename in ('clients', 'tasks');
