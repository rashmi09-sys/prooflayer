-- ProofLayer schema for Supabase Postgres, with Row Level Security.
--
-- STATUS: PLANNED. Written to mirror db/schema.sql but NOT executed:
-- Supabase was unreachable from the environment this prototype was built in.
-- Review and test before use.
--
-- Model: the browser uses the anon key + a Supabase Auth session and may only
-- READ rows belonging to projects it owns. All writes (queueing runs, worker
-- results, AI explanations) go through the server with the service-role key,
-- which bypasses RLS and must never reach the client.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects(owner_id);

create table public.repository_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  provider text not null check (provider in ('local','github')),
  full_name text not null,
  locator text not null,
  default_branch text not null,
  web_url text,
  created_at timestamptz not null default now()
);

create type run_status as enum ('queued','running','completed');
create type run_verdict as enum ('passed','failed','incomplete','cancelled');

create table public.verification_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  connection_id uuid not null references public.repository_connections(id) on delete cascade,
  triggered_by uuid not null references public.profiles(id),
  branch text not null,
  commit_sha char(40) not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  commit_message text,
  commit_author text,
  commit_date timestamptz,
  status run_status not null default 'queued',
  verdict run_verdict,
  verdict_reason text,
  cancel_requested boolean not null default false,
  worker_id text,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  check ((status = 'completed') = (verdict is not null))
);
create index runs_project_created_idx on public.verification_runs(project_id, created_at desc);
create index runs_status_idx on public.verification_runs(status, created_at);
create unique index runs_active_commit_uidx on public.verification_runs(project_id, commit_sha)
  where status in ('queued','running');

create table public.verification_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.verification_runs(id) on delete cascade,
  key text not null,
  name text not null,
  kind text not null check (kind in ('pipeline','check')),
  required boolean not null,
  position smallint not null,
  status text not null default 'pending'
    check (status in ('pending','running','passed','failed','skipped','error','cancelled')),
  failure_class text check (failure_class in ('code','infrastructure','timeout','resource_limit')),
  command text,
  exit_code integer,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  summary text,
  unique (run_id, key)
);
create index checks_run_idx on public.verification_checks(run_id, position);

create table public.execution_evidence (
  check_id uuid primary key references public.verification_checks(id) on delete cascade,
  run_id uuid not null references public.verification_runs(id) on delete cascade,
  content text not null check (length(content) <= 70000),
  truncated boolean not null default false,
  bytes_total bigint not null default 0,
  sha256 char(64),
  updated_at timestamptz not null default now()
);
create index evidence_run_idx on public.execution_evidence(run_id);

create table public.run_events (
  id bigserial primary key,
  run_id uuid not null references public.verification_runs(id) on delete cascade,
  ts timestamptz not null default now(),
  level text not null check (level in ('info','warn','error')),
  message text not null
);
create index events_run_idx on public.run_events(run_id, id);

create table public.ai_explanations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.verification_runs(id) on delete cascade,
  check_id uuid not null references public.verification_checks(id) on delete cascade,
  status text not null check (status in ('ok','error')),
  model text,
  content jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
create index ai_run_idx on public.ai_explanations(run_id, check_id, created_at desc);

-- ------------------------------------------------------------ RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.repository_connections enable row level security;
alter table public.verification_runs enable row level security;
alter table public.verification_checks enable row level security;
alter table public.execution_evidence enable row level security;
alter table public.run_events enable row level security;
alter table public.ai_explanations enable row level security;

create function public.owns_project(p uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from projects where id = p and owner_id = auth.uid()) $$;

create function public.owns_run(r uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from verification_runs v join projects p on p.id = v.project_id
                    where v.id = r and p.owner_id = auth.uid()) $$;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "own projects" on public.projects for select using (owner_id = auth.uid());
create policy "own connections" on public.repository_connections for select using (public.owns_project(project_id));
create policy "own runs" on public.verification_runs for select using (public.owns_project(project_id));
create policy "own checks" on public.verification_checks for select using (public.owns_run(run_id));
create policy "own evidence" on public.execution_evidence for select using (public.owns_run(run_id));
create policy "own events" on public.run_events for select using (public.owns_run(run_id));
create policy "own explanations" on public.ai_explanations for select using (public.owns_run(run_id));
-- No insert/update/delete policies: with RLS enabled, clients cannot write.
-- The server and worker write with the service role.

-- Added with the redesign (also PLANNED / unexecuted).
create table public.source_excerpts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.verification_runs(id) on delete cascade,
  check_id uuid not null references public.verification_checks(id) on delete cascade,
  file text not null,
  start_line integer not null,
  highlight_line integer not null,
  content text not null check (length(content) <= 4000),
  created_at timestamptz not null default now(),
  unique (check_id, file, highlight_line)
);
create table public.run_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.verification_runs(id) on delete cascade,
  check_id uuid not null references public.verification_checks(id) on delete cascade,
  kind text not null check (kind in ('screenshot')),
  storage_path text not null,           -- Supabase Storage, private bucket
  mime text not null,
  bytes integer not null,
  sha256 char(64) not null,
  width integer,
  height integer,
  page_url text,
  label text,
  captured_at timestamptz not null
);
alter table public.source_excerpts enable row level security;
alter table public.run_artifacts enable row level security;
create policy "own excerpts" on public.source_excerpts for select using (public.owns_run(run_id));
create policy "own artifacts" on public.run_artifacts for select using (public.owns_run(run_id));
