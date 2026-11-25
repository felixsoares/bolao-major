import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';

test('salva e recarrega resultados suíços e campeão sem alterar times da fase', async () => {
  let stored;
  let alterSavedResults = false;
  const server = createHttpServer(async (request, response) => {
    if (!request.url.startsWith('/rest/v1/pool_state')) {
      response.writeHead(404).end();
      return;
    }

    if (request.method === 'PATCH') {
      let body = '';
      for await (const chunk of request) body += chunk;
      stored = JSON.parse(body);
      if (alterSavedResults) stored.stages[0].results.threeZero = [];
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(stored));
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(stored ? [stored] : []));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
  const vite = await createViteServer({
    mode: 'test',
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { savePoolState, loadPoolState } = await vite.ssrLoadModule('/src/lib/poolStore.js');
    const state = {
      stages: [
        {
          id: 'fase-1',
          type: 'swiss',
          isLocked: false,
          teamIds: ['a'],
          results: { threeZero: ['a'], advance: [], zeroThree: [] },
        },
        {
          id: 'mata-mata',
          type: 'playoffs',
          isLocked: false,
          teamIds: ['a'],
          results: { champion: 'a', finalists: [], semifinalists: [] },
        },
      ],
      scoring: {},
    };

    await savePoolState(state);
    const loaded = await loadPoolState();
    assert.deepEqual(loaded.stages[0].results, state.stages[0].results);
    assert.deepEqual(loaded.stages[1].results, state.stages[1].results);
    assert.equal(loaded.stages[0].isLocked, false);
    assert.equal('teamIds' in loaded.stages[0], false);

    alterSavedResults = true;
    await assert.rejects(
      savePoolState(state),
      /O banco retornou dados diferentes dos enviados/
    );
  } finally {
    await vite.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  }
});
