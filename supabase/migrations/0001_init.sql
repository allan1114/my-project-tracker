-- Project Master — initial schema.
--
-- Identity comes from Firebase Auth, not Supabase Auth. Supabase's third-party
-- auth integration validates the Firebase ID token and exposes its claims via
-- auth.jwt(), so `auth.jwt() ->> 'sub'` is the Firebase UID. Every ownership
-- check below is against that value.
--
-- The browser holds a publishable anon key, so RLS is the only thing standing
-- between one user's board and another's. Every table gets it, with no
-- exceptions and no permissive fallback policy.

-- Helper: the calling user's Firebase UID, or NULL when unauthenticated.
create or replace function public.firebase_uid()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- ---------------------------------------------------------------- members --

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  owner_uid   text not null,
  name        text not null check (length(name) between 1 and 200),
  created_at  timestamptz not null default now(),
  unique (owner_uid, name)
);

create index if not exists members_owner_idx on public.members (owner_uid);

-- ------------------------------------------------------------------ tasks --

create table if not exists public.tasks (
  id             text primary key,
  owner_uid      text not null,
  name           text not null check (length(name) between 1 and 200),
  -- The app used to blank its board on an unrecognized status; the database
  -- now refuses to store one in the first place.
  status         text not null default 'todo'
                   check (status in ('todo', 'inprogress', 'onhold', 'blocked', 'done')),
  priority       text not null default 'Medium'
                   check (priority in ('High', 'Medium', 'Low')),
  assignee_id    uuid references public.members (id) on delete set null,
  due_date       date,
  img_url        text,
  description    text not null default '',
  timer_seconds  integer not null default 0 check (timer_seconds >= 0),
  timer_started_at timestamptz,
  position       double precision not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists tasks_owner_status_idx on public.tasks (owner_uid, status);
create index if not exists tasks_owner_due_idx    on public.tasks (owner_uid, due_date);
create index if not exists tasks_assignee_idx     on public.tasks (assignee_id);

-- ------------------------------------------------------------ child tables --

create table if not exists public.task_tags (
  task_id text not null references public.tasks (id) on delete cascade,
  tag     text not null check (length(tag) between 1 and 50),
  primary key (task_id, tag)
);

create table if not exists public.checklist_items (
  id       uuid primary key default gen_random_uuid(),
  task_id  text not null references public.tasks (id) on delete cascade,
  text     text not null default '',
  done     boolean not null default false,
  position integer not null default 0
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     text not null references public.tasks (id) on delete cascade,
  author_uid  text not null,
  author_name text not null default 'Unknown',
  body        text not null check (length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create table if not exists public.attachments (
  id      uuid primary key default gen_random_uuid(),
  task_id text not null references public.tasks (id) on delete cascade,
  name    text not null default '',
  url     text not null default '',
  kind    text not null default 'link' check (kind in ('link', 'file'))
);

create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  owner_uid  text not null,
  message    text not null check (length(message) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists task_tags_task_idx       on public.task_tags (task_id);
create index if not exists checklist_task_idx       on public.checklist_items (task_id);
create index if not exists comments_task_idx        on public.comments (task_id);
create index if not exists attachments_task_idx     on public.attachments (task_id);
create index if not exists activities_owner_idx     on public.activities (owner_uid, created_at desc);

-- ------------------------------------------------------------- updated_at --

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------------- RLS --

alter table public.members         enable row level security;
alter table public.tasks           enable row level security;
alter table public.task_tags       enable row level security;
alter table public.checklist_items enable row level security;
alter table public.comments        enable row level security;
alter table public.attachments     enable row level security;
alter table public.activities      enable row level security;

-- Owner-scoped tables compare directly against the Firebase UID.
drop policy if exists members_owner on public.members;
create policy members_owner on public.members
  for all to authenticated
  using (owner_uid = public.firebase_uid())
  with check (owner_uid = public.firebase_uid());

drop policy if exists tasks_owner on public.tasks;
create policy tasks_owner on public.tasks
  for all to authenticated
  using (owner_uid = public.firebase_uid())
  with check (owner_uid = public.firebase_uid());

drop policy if exists activities_owner on public.activities;
create policy activities_owner on public.activities
  for all to authenticated
  using (owner_uid = public.firebase_uid())
  with check (owner_uid = public.firebase_uid());

-- Child tables authorize through their parent task. Written as a single
-- reusable predicate so a new child table cannot accidentally get a weaker one.
create or replace function public.owns_task(p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and t.owner_uid = public.firebase_uid()
  )
$$;

drop policy if exists task_tags_via_task on public.task_tags;
create policy task_tags_via_task on public.task_tags
  for all to authenticated
  using (public.owns_task(task_id))
  with check (public.owns_task(task_id));

drop policy if exists checklist_via_task on public.checklist_items;
create policy checklist_via_task on public.checklist_items
  for all to authenticated
  using (public.owns_task(task_id))
  with check (public.owns_task(task_id));

drop policy if exists comments_via_task on public.comments;
create policy comments_via_task on public.comments
  for all to authenticated
  using (public.owns_task(task_id))
  with check (public.owns_task(task_id));

drop policy if exists attachments_via_task on public.attachments;
create policy attachments_via_task on public.attachments
  for all to authenticated
  using (public.owns_task(task_id))
  with check (public.owns_task(task_id));

-- The anon role must reach nothing: this app has no public read surface.
revoke all on all tables in schema public from anon;
