import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPoolStateRefresher,
  officialResultsForStage,
  reconcileOfficialDraft,
  serializePoolState,
} from './poolState.js';

test('compara estados independentemente da ordem das chaves do JSON e dos times ativos', () => {
  const stage = {
    id: 'fase-1',
    results: { threeZero: ['a'], advance: [], zeroThree: [] },
    teamIds: ['a'],
  };
  const fromDatabase = {
    results: { advance: [], zeroThree: [], threeZero: ['a'] },
    teamIds: ['b'],
    id: 'fase-1',
  };
  assert.equal(
    serializePoolState([stage], { first: 1, second: 2 }),
    serializePoolState([fromDatabase], { second: 2, first: 1 })
  );
  assert.notEqual(
    serializePoolState([stage], {}),
    serializePoolState([{ ...stage, results: { ...stage.results, threeZero: [] } }], {})
  );
});

test('preserva resultados suíços em edição durante atualizações e troca ao mudar de fase', () => {
  const empty = { threeZero: [], advance: [], zeroThree: [] };
  const draft = { ...empty, threeZero: ['a'] };
  const previous = { stageId: 'fase-1', results: empty };
  const remote = { stageId: 'fase-1', results: { ...empty, advance: ['b'] } };

  assert.deepEqual(reconcileOfficialDraft(draft, previous, remote), draft);
  assert.deepEqual(reconcileOfficialDraft(empty, previous, remote), remote.results);
  assert.deepEqual(
    reconcileOfficialDraft(draft, previous, { stageId: 'fase-2', results: empty }),
    empty
  );
});

test('preserva campeão em edição e normaliza resultados recebidos', () => {
  const previousResults = officialResultsForStage({ type: 'playoffs', results: {} });
  const previous = { stageId: 'mata-mata', results: previousResults };
  const draft = { ...previousResults, champion: 'a' };
  const next = {
    stageId: 'mata-mata',
    results: officialResultsForStage({
      type: 'playoffs',
      results: { semifinalists: ['b'], champion: null, finalists: [] },
    }),
  };

  assert.deepEqual(reconcileOfficialDraft(draft, previous, next), draft);
  assert.deepEqual(reconcileOfficialDraft(previousResults, previous, next), next.results);
});

test('notificação atrasada consulta o resultado atual, em vez de restaurar o antigo', async () => {
  const stages = [{ id: 'fase-1', results: { threeZero: ['a'] } }];
  const current = { stages, scoring: {} };
  const authoritative = { stages: [{ id: 'fase-1', results: { threeZero: ['a'] } }], scoring: {} };
  const applied = [];
  const refresher = createPoolStateRefresher({
    load: async () => authoritative,
    getCurrent: () => current,
    getLastSaved: () => serializePoolState(stages, {}),
    hasPendingSave: () => false,
    apply: (state) => applied.push(state),
    onError: (error) => { throw error; },
  });

  await refresher.refresh();
  assert.deepEqual(applied, [authoritative]);
});

test('leitura iniciada antes do salvamento não sobrescreve resultados editados', async () => {
  const empty = { stages: [{ id: 'fase-1', results: { threeZero: [] } }], scoring: {} };
  const saved = { stages: [{ id: 'fase-1', results: { threeZero: ['a'] } }], scoring: {} };
  let current = empty;
  let lastSaved = serializePoolState(empty.stages, empty.scoring);
  let pending = false;
  let resolveLoad;
  const applied = [];
  const refresher = createPoolStateRefresher({
    load: () => new Promise((resolve) => { resolveLoad = resolve; }),
    getCurrent: () => current,
    getLastSaved: () => lastSaved,
    hasPendingSave: () => pending,
    apply: (state) => applied.push(state),
    onError: (error) => { throw error; },
  });

  const staleRead = refresher.refresh();
  pending = true;
  current = saved;
  resolveLoad(empty);
  await staleRead;
  assert.deepEqual(applied, []);

  pending = false;
  lastSaved = serializePoolState(saved.stages, saved.scoring);
  const freshRead = refresher.refresh();
  resolveLoad(saved);
  await freshRead;
  assert.deepEqual(applied, [saved]);
});

test('não substitui alterações locais cujo salvamento falhou', async () => {
  const saved = { stages: [{ id: 'fase-1', results: { threeZero: [] } }], scoring: {} };
  const draft = { stages: [{ id: 'fase-1', results: { threeZero: ['a'] } }], scoring: {} };
  let loaded = false;
  const refresher = createPoolStateRefresher({
    load: async () => { loaded = true; return saved; },
    getCurrent: () => draft,
    getLastSaved: () => serializePoolState(saved.stages, saved.scoring),
    hasPendingSave: () => false,
    apply: () => assert.fail('não deve sobrescrever alterações locais'),
    onError: (error) => { throw error; },
  });

  await refresher.refresh();
  assert.equal(loaded, false);
});
