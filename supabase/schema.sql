-- As policies are public, anyone can read, insert, update, and delete these records.
create table if not exists public.pool_state (
  id text primary key check (id = 'main'),
  stages jsonb not null default '[]'::jsonb,
  scoring jsonb not null default '{}'::jsonb,
  initialized boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  id text primary key,
  name text not null,
  logo_url text not null default ''
);

create table if not exists public.stage_teams (
  stage_id text not null check (stage_id in ('fase-1', 'fase-2', 'fase-3', 'mata-mata')),
  team_id text not null references public.teams(id) on delete cascade,
  is_active boolean not null default false,
  primary key (stage_id, team_id)
);

create table if not exists public.picks (
  id text primary key,
  user_name text not null,
  user_name_key text generated always as (lower(btrim(user_name))) stored,
  stage_id text not null,
  updated_at timestamptz not null default now(),
  picks jsonb not null,
  unique (stage_id, user_name_key)
);

insert into public.pool_state (id, stages, scoring)
values (
  'main',
  '[
    {"id":"fase-1","name":"1ª Fase","type":"swiss","description":"Formato Suíço: 2 times em 3-0, 6 times em 3-1/3-2 e 2 times em 0-3.","isLocked":false,"results":{"threeZero":[],"advance":[],"zeroThree":[]}},
    {"id":"fase-2","name":"2ª Fase","type":"swiss","description":"Formato Suíço: 2 times em 3-0, 6 times em 3-1/3-2 e 2 times em 0-3.","isLocked":false,"results":{"threeZero":[],"advance":[],"zeroThree":[]}},
    {"id":"fase-3","name":"3ª Fase","type":"swiss","description":"Formato Suíço: 2 times em 3-0, 6 times em 3-1/3-2 e 2 times em 0-3.","isLocked":false,"results":{"threeZero":[],"advance":[],"zeroThree":[]}},
    {"id":"mata-mata","name":"Mata-Mata","type":"playoffs","description":"Playoffs: defina o Grande Campeão do Major (maior pontuação do bolão) e classificados.","isLocked":false,"results":{"champion":null,"finalists":[],"semifinalists":[]}}
  ]'::jsonb,
  '{"threeZeroPoints":3,"advancePoints":2,"zeroThreePoints":3,"playoffSemifinalPoints":3,"playoffFinalistPoints":5,"championPoints":12}'::jsonb
)
on conflict (id) do nothing;

alter table public.pool_state enable row level security;
alter table public.teams enable row level security;
alter table public.stage_teams enable row level security;
alter table public.picks enable row level security;

grant select, insert, update, delete on public.pool_state to anon, authenticated;
grant select, insert, update, delete on public.teams to anon, authenticated;
grant select, insert, update, delete on public.stage_teams to anon, authenticated;
grant select, insert, update, delete on public.picks to anon, authenticated;

drop policy if exists "Public can manage pool state" on public.pool_state;
create policy "Public can manage pool state"
  on public.pool_state for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Public can manage teams" on public.teams;
create policy "Public can manage teams"
  on public.teams for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Public can manage stage teams" on public.stage_teams;
create policy "Public can manage stage teams"
  on public.stage_teams for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Public can manage picks" on public.picks;
create policy "Public can manage picks"
  on public.picks for all
  to anon, authenticated
  using (true)
  with check (true);

create or replace function public.initialize_pool(
  p_teams jsonb,
  p_stages jsonb,
  p_scoring jsonb,
  p_picks jsonb
)
returns boolean
language plpgsql
as $$
declare
  did_initialize boolean := false;
begin
  update public.pool_state
  set stages = p_stages,
      scoring = p_scoring,
      initialized = true,
      updated_at = now()
  where id = 'main' and initialized = false
  returning true into did_initialize;

  if not coalesce(did_initialize, false) then
    return false;
  end if;

  insert into public.teams (id, name, logo_url)
  select team.id, team.name, coalesce(team.logo_url, team."logoUrl", '')
  from jsonb_to_recordset(coalesce(p_teams, '[]'::jsonb)) as team(
    id text,
    name text,
    "logoUrl" text,
    logo_url text
  )
  on conflict (id) do update
  set name = excluded.name,
      logo_url = excluded.logo_url;

  insert into public.stage_teams (stage_id, team_id, is_active)
  select
    stage.stage_data ->> 'id',
    team.id,
    exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(stage.stage_data -> 'teamIds', '[]'::jsonb)
      ) as selected(team_id)
      where selected.team_id = team.id
    )
  from jsonb_array_elements(coalesce(p_stages, '[]'::jsonb)) as stage(stage_data)
  cross join public.teams as team
  where stage.stage_data ->> 'id' is not null
  on conflict (stage_id, team_id) do update
  set is_active = excluded.is_active;

  insert into public.picks (id, user_name, stage_id, updated_at, picks)
  select pick.id, pick.user_name, pick.stage_id, pick.updated_at, pick.picks
  from jsonb_to_recordset(coalesce(p_picks, '[]'::jsonb)) as pick(
    id text,
    user_name text,
    stage_id text,
    updated_at timestamptz,
    picks jsonb
  )
  on conflict (stage_id, user_name_key)
  do update set
    id = excluded.id,
    user_name = excluded.user_name,
    updated_at = excluded.updated_at,
    picks = excluded.picks;

  return true;
end;
$$;

grant execute on function public.initialize_pool(jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pool_state'
    ) then
      alter publication supabase_realtime add table public.pool_state;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'teams'
    ) then
      alter publication supabase_realtime add table public.teams;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'stage_teams'
    ) then
      alter publication supabase_realtime add table public.stage_teams;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'picks'
    ) then
      alter publication supabase_realtime add table public.picks;
    end if;
  end if;
end;
$$;
