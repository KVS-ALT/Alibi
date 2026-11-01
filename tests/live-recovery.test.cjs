const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

// Execute production TypeScript with only external I/O replaced. No live providers.
function harness(overrides = {}, env = {}) {
  const cache = new Map(), timers = new Map(); let timerId = 0;
  const context = vm.createContext({ console, Buffer, URL, Request, Response, TextEncoder, TextDecoder,
    AbortController, AbortSignal, DOMException, Uint8Array, structuredClone,
    process: { env }, setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); } });
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === 'server-only') return {};
      if (name === '@alibi/shared') return load('shared/schema.ts');
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name + '.ts')));
      return require(name);
    };
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.compileFunction(output, ['require', 'module', 'exports'], { parsingContext: context, filename })(localRequire, module, module.exports);
    return module.exports;
  }
  return { load, timers, async tick() { const jobs = [...timers.values()]; timers.clear(); for (const job of jobs) job.fn(); await new Promise(setImmediate); } };
}
const enabled = { ALIBI_LOCAL_PROFILE: 'true', ALIBI_CONTINUOUS_CAPTURE: 'true', LIVE_PROVIDER_CALLS_ENABLED: 'true', TEAM_LIVE_TEST_ENABLED: 'true', FEATHERLESS_API_KEY: 'test-placeholder-key', SPEECHMATICS_API_KEY: 'test-placeholder-key' };

test('continuous local capture works without an expiring one-shot test grant', () => {
  const h = harness({}, enabled), sessions = h.load('web/lib/live-sessions.ts');
  assert.equal(sessions.getLiveRuntime().liveEnabled, true);
  assert.equal(sessions.getLiveRuntime().continuousCapture, true);
  const production = harness({}, { ...enabled, ALIBI_LOCAL_PROFILE: 'false' }).load('web/lib/live-sessions.ts');
  assert.equal(production.getLiveRuntime().liveEnabled, false, 'local opt-in must not unlock hosted access');
});

test('continuous sessions keep a rolling transcript rather than freezing after 128 segments', async () => {
  const h = harness({ './db': { hasDb: () => false } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts');
  const created = await sessions.createLiveSession(new Request('http://localhost:3005/api/sessions', { method: 'POST' }));
  assert.doesNotMatch(created.cookie, /Max-Age=1800/);
  sessions.authorizeSpeechStart(new Request('http://localhost:3005'), created.session);
  for (let i = 0; i < 140; i++) sessions.ingestTranscript(created.session.id, { id: String(i), text: `Project detail ${i}.`, isFinal: true });
  assert.equal(created.session.revision, 140);
  assert.equal(created.session.segments.size, 128);
  assert.match(sessions.conversation(created.session), /Project detail 139\./);
  assert.doesNotMatch(sessions.conversation(created.session), /Project detail 0\./);
});

test('bounded test profiles still require an unexpired private grant', async () => {
  const h = harness({ './db': { hasDb: () => false } }, { ...enabled, ALIBI_CONTINUOUS_CAPTURE: 'false' });
  const sessions = h.load('web/lib/live-sessions.ts');
  const { session } = await sessions.createLiveSession(new Request('http://localhost:3005/api/sessions', { method: 'POST' }));
  assert.throws(() => sessions.authorizeSpeechStart(new Request('http://localhost:3005'), session), { code: 'LIVE_DISABLED' });
});

test('generation reports provider rejection without logging response bodies or credentials', async () => {
  const h = harness(), { generatePortfolio } = h.load('web/lib/generation.ts');
  const diagnostics = [];
  const result = await generatePortfolio({ transcript: 'I built a car marketplace.' }, {
    apiKey: 'test-placeholder-key', model: 'Qwen/Qwen2.5-7B-Instruct',
    fetcher: async () => new Response('sensitive-provider-body', { status: 503 }),
    onDiagnostic: event => diagnostics.push(event),
  });
  assert.ok(result.portfolio.projects);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].outcome, 'fallback');
  assert.equal(diagnostics[0].reason, 'provider_http');
  assert.equal(diagnostics[0].status, 503);
  assert.doesNotMatch(JSON.stringify(diagnostics), /sensitive-provider-body|test-placeholder-key/);
});

test('continuous proxy accepts more than 30 seconds and releases upstream on explicit End', async () => {
  let socket, sequence = 0, closed = false;
  const h = harness(), { createSpeechmaticsProxy } = h.load('web/lib/speech/proxy.ts');
  const proxy = createSpeechmaticsProxy({ enabled: true, liveCallsAllowed: true, continuousCapture: true }, {
    tokenProvider: { async issueToken() { return { ok: true, token: 'test-token', url: 'wss://eu.rt.speechmatics.com/v2/' }; }, cancelSession() {} },
    createSocket() { socket = { readyState: 1, bufferedAmount: 0, send(data) { if (typeof data !== 'string') queueMicrotask(() => socket.onmessage?.({ data: JSON.stringify({ message: 'AudioAdded', seq_no: ++sequence }) })); }, close() { closed = true; } }; return socket; },
  });
  assert.equal(proxy.isConfigured(), true);
  const pending = proxy.start({ sessionId: 'test-session', consented: true });
  await new Promise(setImmediate);
  socket.onopen(); socket.onmessage({ data: '{"message":"RecognitionStarted"}' });
  const identity = { sessionId: 'test-session', streamId: (await pending).streamId };
  const unsubscribe = proxy.subscribe(identity, () => true);
  assert.equal(h.timers.size, 0, 'no wall-clock stop timer remains after handshake');
  for (let i = 0; i < 130; i++) {
    assert.equal(proxy.writePcm({ ...identity, audio: new Uint8Array(16000) }).ok, true);
    await new Promise(setImmediate);
  }
  assert.equal(closed, false, '65 seconds of audio must remain connected');
  proxy.endStream(identity);
  assert.equal(closed, true);
  assert.equal(proxy.writePcm({ ...identity, audio: new Uint8Array(100) }).ok, false);
  unsubscribe(); proxy.dispose();
});

test('new speech during generation preserves the completed preview and queues the newer transcript', async () => {
  let complete;
  const h = harness({ './db': { hasDb: () => false }, './generation': { generatePortfolio: () => new Promise(resolve => { complete = resolve; }) } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts');
  const { session } = await sessions.createLiveSession(new Request('http://localhost:3005/api/sessions', { method: 'POST' }));
  sessions.authorizeSpeechStart(new Request('http://localhost:3005'), session);
  sessions.ingestTranscript(session.id, { id: 'first', text: 'I built a car marketplace.', isFinal: true });
  await h.tick();
  assert.equal(session.building, true);
  sessions.ingestTranscript(session.id, { id: 'second', text: 'It helps people buy discounted cars.', isFinal: true });
  complete({ claims: { vibe: 'showcase', skills: [], projects: [] }, portfolio: { templateId: 'showcase', skills: [], projects: {}, contradictions: [] } });
  await new Promise(setImmediate);
  assert.equal(session.version, 1, 'completed work must not be discarded when more words arrive');
  assert.equal(session.acceptedRevision, 1);
  assert.equal(session.revision, 2);
  assert.ok(h.timers.size > 0, 'newer words must still be scheduled');
});
