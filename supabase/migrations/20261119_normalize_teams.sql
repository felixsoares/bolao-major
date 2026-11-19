begin;

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

create table if not exists public.pool_schema_migrations (
  version text primary key,
  executed_at timestamptz not null default now()
);

alter table public.teams enable row level security;
alter table public.stage_teams enable row level security;
alter table public.pool_schema_migrations enable row level security;

grant select, insert, update, delete on public.teams to anon, authenticated;
grant select, insert, update, delete on public.stage_teams to anon, authenticated;
revoke all on public.pool_schema_migrations from anon, authenticated;

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

do $$
declare
  legacy_teams jsonb;
  legacy_stages jsonb;
  normalized_stages jsonb;
begin
  if not exists (
    select 1
    from public.pool_schema_migrations
    where version = '20261119_normalize_teams'
  ) then
    select teams, stages
      into legacy_teams, legacy_stages
    from public.pool_state
    where id = 'main';

    if jsonb_typeof(legacy_teams) = 'array' then
      if jsonb_array_length(legacy_teams) > 0 then
        insert into public.teams (id, name, logo_url)
        select old_team.id, old_team.name, coalesce(old_team.logo_url, old_team."logoUrl", '')
        from jsonb_to_recordset(legacy_teams) as old_team(
          id text,
          name text,
          "logoUrl" text,
          logo_url text
        )
        on conflict (id) do update
        set name = excluded.name,
            logo_url = excluded.logo_url;
      end if;
    end if;

    if jsonb_typeof(legacy_stages) = 'array' then
      insert into public.stage_teams (stage_id, team_id, is_active)
      select
        legacy_stage.stage_data ->> 'id',
        team.id,
        exists (
          select 1
          from jsonb_array_elements_text(
            coalesce(legacy_stage.stage_data -> 'teamIds', '[]'::jsonb)
          ) as selected(team_id)
          where selected.team_id = team.id
        )
      from jsonb_array_elements(legacy_stages) with ordinality
        as legacy_stage(stage_data, position)
      cross join public.teams as team
      where legacy_stage.stage_data ->> 'id' is not null
      on conflict (stage_id, team_id) do update
      set is_active = excluded.is_active;

      select coalesce(
        jsonb_agg(legacy_stage.stage_data - 'teamIds' order by legacy_stage.position),
        '[]'::jsonb
      )
        into normalized_stages
      from jsonb_array_elements(legacy_stages) with ordinality
        as legacy_stage(stage_data, position);
    end if;

    update public.pool_state
    set teams = '[]'::jsonb,
        stages = coalesce(normalized_stages, stages),
        updated_at = now()
    where id = 'main';

    insert into public.pool_schema_migrations (version)
    values ('20261119_normalize_teams');
  end if;
end;
$$;

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
  select p.id, p.user_name, p.stage_id, p.updated_at, p.picks
  from jsonb_to_recordset(coalesce(p_picks, '[]'::jsonb)) as p(
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
  end if;
end;
$$;

commit;
