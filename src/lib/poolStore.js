import { supabase } from './supabase';

const STATE_ID = 'main';

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Configure as variáveis do Supabase para conectar o bolão.');
  }
  return supabase;
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

export const loadPoolData = async () => {
  const client = requireSupabase();
  const [stateResult, picksResult] = await Promise.all([
    client
      .from('pool_state')
      .select('teams, stages, scoring, initialized')
      .eq('id', STATE_ID)
      .maybeSingle(),
    client.from('picks').select('id, user_name, stage_id, updated_at, picks'),
  ]);

  if (stateResult.error) throw stateResult.error;
  if (picksResult.error) throw picksResult.error;
  if (!stateResult.data) {
    throw new Error('A tabela pool_state não tem o registro inicial. Execute o SQL do projeto.');
  }

  return {
    state: stateResult.data,
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

export const savePoolState = async ({ teams, stages, scoring }) => {
  const client = requireSupabase();
  const { error } = await client.from('pool_state').upsert({
    id: STATE_ID,
    teams,
    stages,
    scoring,
    initialized: true,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
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

export const subscribeToPoolData = ({ onState, onPick }) => {
  const client = requireSupabase();
  const channel = client
    .channel('public-pool-data')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pool_state', filter: `id=eq.${STATE_ID}` },
      (payload) => onState(payload.new)
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
