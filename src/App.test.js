import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { JSDOM } from 'jsdom';
import { createServer as createViteServer } from 'vite';

class FakeWebSocket {
  static OPEN = 1;
  static instances = [];

  constructor() {
    this.readyState = 0;
    FakeWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.({});
    }, 0);
  }

  send(message) {
    const [joinRef, ref, topic, event, payload] = JSON.parse(message);
    if (event === 'phx_join') {
      this.topic = topic;
      this.joinRef = joinRef;
      this.filters = payload.config.postgres_changes.map((filter, index) => ({
        ...filter,
        id: index + 1,
      }));
    }
    if (event === 'phx_join' || event === 'phx_leave' || event === 'heartbeat') {
      setTimeout(() => this.onmessage?.({
        data: JSON.stringify([
          joinRef, ref, topic, 'phx_reply',
          { status: 'ok', response: event === 'phx_join' ? { postgres_changes: this.filters } : {} },
        ]),
      }), 0);
    }
  }

  emitOldState(state) {
    const binding = this.filters.find((filter) => filter.table === 'pool_state');
    this.onmessage?.({
      data: JSON.stringify([
        this.joinRef, null, this.topic, 'postgres_changes',
        {
          ids: [binding.id],
          data: {
            schema: 'public',
            table: 'pool_state',
            type: 'UPDATE',
            columns: Object.keys(state).map((name) => ({ name, type: 'jsonb' })),
            record: state,
            old_record: {},
          },
        },
      ]),
    });
  }

  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: '', wasClean: true });
  }
}

test('salva resultados em rodada fechada e os mantém após recarregar', async () => {
  const stages = [
    {
      id: 'fase-1',
      name: '1ª Fase',
      type: 'swiss',
      description: 'Suíço',
      isLocked: true,
      results: { threeZero: [], advance: [], zeroThree: [] },
    },
    {
      id: 'mata-mata',
      name: 'Mata-Mata',
      type: 'playoffs',
      description: 'Playoffs',
      isLocked: true,
      results: { champion: null, finalists: [], semifinalists: [] },
    },
  ];
  let state = {
    id: 'main',
    initialized: true,
    stages,
    scoring: {
      threeZeroPoints: 3,
      advancePoints: 2,
      zeroThreePoints: 3,
      playoffSemifinalPoints: 3,
      playoffFinalistPoints: 5,
      championPoints: 12,
    },
  };
  const teams = [{ id: 'a', name: 'Time Teste', logo_url: '' }];
  const oldState = structuredClone(state);
  let rejectNextSave = false;
  let stateReads = 0;
  const memberships = stages.map((stage) => ({
    stage_id: stage.id,
    team_id: 'a',
    is_active: true,
  }));
  const server = createHttpServer(async (request, response) => {
    const table = new URL(request.url, 'http://localhost').pathname.split('/').pop();
    response.setHeader('Content-Type', 'application/json');
    if (table === 'pool_state' && request.method === 'PATCH') {
      if (rejectNextSave) {
        rejectNextSave = false;
        response.writeHead(500).end(JSON.stringify({ message: 'Falha simulada' }));
        return;
      }
      let body = '';
      for await (const chunk of request) body += chunk;
      state = { ...state, ...JSON.parse(body) };
      response.writeHead(200).end(JSON.stringify(state));
    } else if (request.method === 'GET') {
      if (table === 'pool_state') stateReads += 1;
      const data = table === 'pool_state' ? [state]
        : table === 'teams' ? teams
          : table === 'stage_teams' ? memberships : [];
      response.writeHead(200).end(JSON.stringify(data));
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  const originalMessageChannel = globalThis.MessageChannel;
  globalThis.MessageChannel = undefined;
  const vite = await createViteServer({
    mode: 'test',
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
  const { supabase } = await vite.ssrLoadModule('/src/lib/supabase.js');
  let root = createRoot(document.getElementById('root'));
  const click = async (label) => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.textContent.trim() === label);
    assert.ok(button, `Botão não encontrado: ${label}`);
    await act(async () => button.click());
  };
  const waitFor = async (condition) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (condition()) return;
      await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    }
    assert.fail('Condição não atendida a tempo');
  };
  const login = async () => {
    await click('Painel Admin');
    const input = document.querySelector('input[type="password"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')
        .set.call(input, 'admin2026');
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await click('Entrar no Painel Admin');
    await click('Resultados Oficiais & Campeão');
  };

  try {
    await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(App))));
    await waitFor(() => document.body.textContent.includes('Encerrada'));
    const savePickButton = [...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Salvar Palpite');
    assert.equal(savePickButton.disabled, true);
    await login();
    await click('3-0');
    assert.match(document.body.textContent, /OFICIAL 3-0\s*1\s*\/\s*2/);
    await click('Salvar Resultado (Manter Status da Rodada)');
    await waitFor(() => state.stages[0].results.threeZero.includes('a'));
    assert.equal(state.stages[0].isLocked, true);
    assert.match(document.body.textContent, /OFICIAL 3-0\s*1\s*\/\s*2/);
    await waitFor(() => FakeWebSocket.instances.some((socket) => socket.filters));
    await waitFor(() => document.body.textContent.includes('Pontuações e ranking recalculados'));
    const readsBeforeEvent = stateReads;
    await act(async () => {
      FakeWebSocket.instances.findLast((socket) => socket.filters).emitOldState(oldState);
    });
    await waitFor(() => stateReads > readsBeforeEvent);
    assert.match(document.body.textContent, /OFICIAL 3-0\s*1\s*\/\s*2/);

    await act(async () => root.unmount());
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(App))));
    await waitFor(() => document.body.textContent.includes('Encerrada'));
    await login();
    assert.match(document.body.textContent, /OFICIAL 3-0\s*1\s*\/\s*2/);

    await click('Mata-Mata');
    await click('CAMPEÃO');
    await click('Salvar Resultado (Manter Status da Rodada)');
    await waitFor(() => state.stages[1].results.champion === 'a');
    assert.equal(state.stages[1].isLocked, true);
    assert.match(document.body.textContent, /Grande Campeão Oficial[\s\S]*Time Teste/);

    await act(async () => root.unmount());
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(App))));
    await waitFor(() => document.body.textContent.includes('Encerrada'));
    await login();
    await click('Mata-Mata');
    assert.match(document.body.textContent, /Grande Campeão Oficial[\s\S]*Time Teste/);

    rejectNextSave = true;
    await click('CAMPEÃO');
    await click('Salvar Resultado (Manter Status da Rodada)');
    await waitFor(() => document.body.textContent.includes('Não foi possível salvar o resultado oficial'));
    assert.equal(state.stages[1].results.champion, 'a');
    assert.match(document.body.textContent, /Nenhum campeão selecionado/);
  } finally {
    await act(async () => root.unmount());
    supabase.auth.stopAutoRefresh();
    await supabase.removeAllChannels();
    await vite.close();
    dom.window.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.WebSocket = originalWebSocket;
    globalThis.MessageChannel = originalMessageChannel;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  }
});
