-- AI Desloper: reports, interviews, themes, generations + the private "captures" bucket.
--
-- Access model
--   * The whole flow works signed out. The server writes every row with the
--     service role (which bypasses RLS), so there are no anon/authenticated
--     INSERT or UPDATE policies at all.
--   * An anonymous report carries a random claim token; only its SHA-256 hash
--     is stored. Saving a report sets user_id (server-side, service role).
--   * Signed-in owners can read (and delete) their own reports and everything
--     hanging off them, via RLS policies keyed on (select auth.uid()).

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  claim_token_hash text not null,
  url text not null,
  title text not null default '',
  score smallint not null check (score between 0 and 100),
  score_detail jsonb not null,
  metrics jsonb not null,
  findings jsonb not null default '[]'::jsonb,
  uniqueness jsonb not null default '[]'::jsonb,
  five_second jsonb,
  product_facts jsonb not null default '[]'::jsonb,
  desktop_screenshot_path text,
  mobile_screenshot_path text,
  snapshot_path text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

comment on column public.reports.claim_token_hash is
  'SHA-256 (hex) of the claim token handed to the anonymous creator.';
comment on column public.reports.score is
  'Slop score total, 0..100, higher = sloppier. Full breakdown in score_detail.';

-- Dashboard: "my reports, newest first". Partial: anonymous rows are skipped.
create index reports_user_id_created_at_idx
  on public.reports (user_id, created_at desc)
  where user_id is not null;

alter table public.reports enable row level security;

create policy "Owners can read their reports"
  on public.reports for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can delete their reports"
  on public.reports for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- interviews (one per report)
-- ---------------------------------------------------------------------------
create table public.interviews (
  report_id uuid primary key references public.reports (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.interviews enable row level security;

create policy "Owners can read their interviews"
  on public.interviews for select
  to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = interviews.report_id
        and r.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- themes (the 3 proposed concepts + which one was picked)
-- ---------------------------------------------------------------------------
create table public.themes (
  report_id uuid primary key references public.reports (id) on delete cascade,
  options jsonb not null default '[]'::jsonb,
  chosen smallint check (chosen is null or chosen between 0 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.themes enable row level security;

create policy "Owners can read their themes"
  on public.themes for select
  to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = themes.report_id
        and r.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- generations (every deslopped page; latest wins)
-- ---------------------------------------------------------------------------
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  html text not null,
  new_score smallint not null check (new_score between 0 and 100),
  score_detail jsonb not null,
  theme jsonb not null,
  selected_finding_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- "latest generation for a report" + FK lookups/cascades.
create index generations_report_id_created_at_idx
  on public.generations (report_id, created_at desc);

alter table public.generations enable row level security;

create policy "Owners can read their generations"
  on public.generations for select
  to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = generations.report_id
        and r.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges: anon gets nothing; authenticated gets read (+ delete own report).
-- RLS still decides which rows. The service role is unaffected.
-- ---------------------------------------------------------------------------
revoke all on table public.reports, public.interviews, public.themes, public.generations
  from anon, authenticated;

grant select, delete on table public.reports to authenticated;
grant select on table public.interviews, public.themes, public.generations to authenticated;

-- updated_at bookkeeping
create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger interviews_set_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

create trigger themes_set_updated_at
  before update on public.themes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: private "captures" bucket.
-- Layout: <report_id>/desktop.png, <report_id>/mobile.png, <report_id>/snapshot.html
-- The server uploads with the service role and hands out signed URLs.
-- Owners may also read their own objects directly.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 26214400, array['image/png', 'text/html'])
on conflict (id) do nothing;

create policy "Owners can read their captures"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'captures'
    and exists (
      select 1 from public.reports r
      where r.id::text = (storage.foldername(objects.name))[1]
        and r.user_id = (select auth.uid())
    )
  );
