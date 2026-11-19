import { supabase } from './supabase';

const STATE_ID = 'main';

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Configure as variáveis do Supabase para conectar o bolão.');
  }
  return supabase;
};

const markPoolInitialized = async (client) => {
  const { error } = await client
    .from('pool_state')
    .update({ initialized: true })
    .eq('id', STATE_ID);
  if (error) throw error;
};

const toDatabasePick = (pick, index = 0) => ({
  id: pick.id || `pick-${Date.now()}-${index}`,
  user_name: pick.userName.trim(),
  stage_id: pick.stageId,
  updated_at: pick.updatedAt || new Date().toISOString(),
  picks: pick.picks,
});

const fromDatabasePick = (pick) => ({
  id: pick.id,
  userName: pick.user_name,
  stageId: pick.stage_id,
  updatedAt: pick.updated_at,
  picks: pick.picks,
});

const toDatabaseTeam = (team) => ({
  id: team.id,
  name: team.name,
  logo_url: team.logoUrl || '',
});

const fromDatabaseTeam = (team) => ({
  id: team.id,
  name: team.name,
  logoUrl: team.logo_url || '',
});

export const loadPoolData = async () => {
  const client = requireSupabase();
  const [stateResult, teamsResult, stageTeamsResult, picksResult] = await Promise.all([
    client
      .from('pool_state')
      .select('stages, scoring, initialized')
      .eq('id', STATE_ID)
      .maybeSingle(),
    client.from('teams').select('id, name, logo_url'),
    client.from('stage_teams').select('stage_id, team_id, is_active'),
    client.from('picks').select('id, user_name, stage_id, updated_at, picks'),
  ]);

  const missingNormalizedTables = [teamsResult.error, stageTeamsResult.error].some(
    (error) => error?.code === '42P01' || error?.code === 'PGRST205'
  );
  if (missingNormalizedTables) {
    throw new Error(
      'Execute supabase/migrations/20261119_normalize_teams.sql no SQL Editor do Supabase.'
    );
  }

  if (stateResult.error) throw stateResult.error;
  if (teamsResult.error) throw teamsResult.error;
  if (stageTeamsResult.error) throw stageTeamsResult.error;
  if (picksResult.error) throw picksResult.error;
  if (!stateResult.data) {
    throw new Error('A tabela pool_state não tem o registro inicial. Execute o SQL do projeto.');
  }

  const activeTeamIdsByStage = new Map();
  stageTeamsResult.data.forEach(({ stage_id: stageId, team_id: teamId, is_active: isActive }) => {
    if (!isActive) return;
    const activeTeamIds = activeTeamIdsByStage.get(stageId) || [];
    activeTeamIds.push(teamId);
    activeTeamIdsByStage.set(stageId, activeTeamIds);
  });

  return {
    state: {
      ...stateResult.data,
      stages: stateResult.data.stages.map((stage) => ({
        ...stage,
        teamIds: activeTeamIdsByStage.get(stage.id) || [],
      })),
    },
    teams: teamsResult.data.map(fromDatabaseTeam),
    picks: picksResult.data.map(fromDatabasePick),
  };
};

export const initializePool = async ({ teams, stages, scoring, picks }) => {
  const client = requireSupabase();
  const { data, error } = await client.rpc('initialize_pool', {
    p_teams: teams,
    p_stages: stages,
    p_scoring: scoring,
    p_picks: picks.map(toDatabasePick),
  });

  if (error) throw error;
  return data === true;
};

export const savePoolState = async ({ stages, scoring }) => {
  const client = requireSupabase();
  const stagesWithoutTeamIds = stages.map(({ teamIds: _teamIds, ...stage }) => stage);
  const { error } = await client.from('pool_state').upsert({
    id: STATE_ID,
    stages: stagesWithoutTeamIds,
    scoring,
    initialized: true,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
};

export const saveTeam = async (team, stageIds) => {
  const client = requireSupabase();
  const { error: teamError } = await client.from('teams').upsert(toDatabaseTeam(team));
  if (teamError) throw teamError;

  const defaultMemberships = stageIds.map((stageId) => ({
    stage_id: stageId,
    team_id: team.id,
    is_active: false,
  }));
  const { error: membershipsError } = await client
    .from('stage_teams')
    .upsert(defaultMemberships, { onConflict: 'stage_id,team_id', ignoreDuplicates: true });

  if (membershipsError) throw membershipsError;
  await markPoolInitialized(client);
};

export const deleteTeam = async (teamId) => {
  const client = requireSupabase();
  const { error } = await client.from('teams').delete().eq('id', teamId);
  if (error) throw error;
  await markPoolInitialized(client);
};

export const setStageTeamActive = async (stageId, teamId, isActive) => {
  const client = requireSupabase();
  const { error } = await client.from('stage_teams').upsert(
    { stage_id: stageId, team_id: teamId, is_active: isActive },
    { onConflict: 'stage_id,team_id' }
  );

  if (error) throw error;
  await markPoolInitialized(client);
};

export const setStageTeamSelections = async (stageId, selectedTeamIds, allTeamIds) => {
  const client = requireSupabase();
  const memberships = allTeamIds.map((teamId) => ({
    stage_id: stageId,
    team_id: teamId,
    is_active: selectedTeamIds.includes(teamId),
  }));
  if (memberships.length === 0) return;

  const { error } = await client
    .from('stage_teams')
    .upsert(memberships, { onConflict: 'stage_id,team_id' });
  if (error) throw error;
  await markPoolInitialized(client);
};

export const replaceTeams = async (teams, stages) => {
  const client = requireSupabase();
  const { error: deleteError } = await client.from('teams').delete().neq('id', '');
  if (deleteError) throw deleteError;

  if (teams.length > 0) {
    const { error } = await client.from('teams').upsert(teams.map(toDatabaseTeam));
    if (error) throw error;
  }

  const memberships = stages.flatMap((stage) =>
    teams.map((team) => ({
      stage_id: stage.id,
      team_id: team.id,
      is_active: (stage.teamIds || []).includes(team.id),
    }))
  );
  const { error: membershipDeleteError } = await client
    .from('stage_teams')
    .delete()
    .neq('stage_id', '');
  if (membershipDeleteError) throw membershipDeleteError;

  if (memberships.length > 0) {
    const { error: membershipInsertError } = await client
      .from('stage_teams')
      .upsert(memberships, { onConflict: 'stage_id,team_id' });
    if (membershipInsertError) throw membershipInsertError;
  }
  await markPoolInitialized(client);
};

export const deleteAllTeams = async () => {
  const client = requireSupabase();
  const { error } = await client.from('teams').delete().neq('id', '');
  if (error) throw error;
  await markPoolInitialized(client);
};

export const savePick = async (pick) => {
  const client = requireSupabase();
  const { data, error } = await client
    .from('picks')
    .upsert(toDatabasePick(pick), { onConflict: 'stage_id,user_name_key' })
    .select('id, user_name, stage_id, updated_at, picks')
    .single();

  if (error) throw error;
  return fromDatabasePick(data);
};

export const replacePicks = async (picks) => {
  const client = requireSupabase();
  const { error: deleteError } = await client.from('picks').delete().neq('id', '');
  if (deleteError) throw deleteError;

  const uniquePicks = new Map();
  picks.forEach((pick, index) => {
    const key = `${pick.stageId}:${pick.userName.trim().toLowerCase()}`;
    uniquePicks.set(key, toDatabasePick(pick, index));
  });

  if (uniquePicks.size === 0) return;

  const { error } = await client.from('picks').upsert([...uniquePicks.values()]);
  if (error) throw error;
};

export const clearPicks = async () => {
  const client = requireSupabase();
  const { error } = await client.from('picks').delete().neq('id', '');
  if (error) throw error;
};

export const subscribeToPoolData = ({ onState, onTeam, onStageTeam, onPick }) => {
  const client = requireSupabase();
  const channel = client
    .channel('public-pool-data')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pool_state', filter: `id=eq.${STATE_ID}` },
      (payload) => onState(payload.new)
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, (payload) => {
      onTeam({
        eventType: payload.eventType,
        team: payload.new ? fromDatabaseTeam(payload.new) : null,
        oldId: payload.old?.id,
      });
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stage_teams' },
      (payload) => {
        onStageTeam({
          eventType: payload.eventType,
          stageId: payload.new?.stage_id || payload.old?.stage_id,
          teamId: payload.new?.team_id || payload.old?.team_id,
          isActive: payload.eventType === 'DELETE' ? false : payload.new?.is_active,
        });
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'picks' },
      (payload) => {
        onPick({
          eventType: payload.eventType,
          pick: payload.new ? fromDatabasePick(payload.new) : null,
          oldId: payload.old?.id,
        });
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
};
