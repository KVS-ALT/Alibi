const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');
const enabled = { ALIBI_LOCAL_PROFILE: 'true', ALIBI_CONTINUOUS_CAPTURE: 'true', LIVE_PROVIDER_CALLS_ENABLED: 'true', TEAM_LIVE_TEST_ENABLED: 'true', RENDER_API_KEY: 'test-placeholder-render-key', FEATHERLESS_API_KEY: 'test-placeholder-key', SPEECHMATICS_API_KEY: 'test-placeholder-key' };

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

test('offline LARP generation separates cars and CAD with realistic complete fictional details', async () => {
  const h = harness(), { generatePortfolio } = h.load('web/lib/generation.ts');
  const result = await generatePortfolio({ transcript: 'I am building a marketplace for discounted cars. On the side I built a CAD tool that helps designers find problems in their models.' }, { apiKey: '', model: '' });
  const projects = Object.values(result.portfolio.projects);
  assert.equal(projects.length, 2);
  assert.ok(projects.some(project => /car|dealer|vehicle/i.test(project.summary)));
  assert.ok(projects.some(project => /CAD|design|model/i.test(project.summary)));
  for (const project of projects) {
    assert.equal(project.highlights.length, 3);
    assert.equal(project.metrics.length, 3);
    assert.ok(project.stack.length > 0);
    assert.match(project.mockHtml, /h-full/);
  }
  assert.doesNotMatch(JSON.stringify(result), /TBD|Conversation project|Concept captured/);
});

test('a slow provider cannot withhold the useful local preview or exceed the generation deadline', async () => {
  const h = harness(), { generatePortfolio } = h.load('web/lib/generation.ts');
  const drafts = [];
  const pending = generatePortfolio({ transcript: 'I built a car marketplace with price alerts.' }, {
    apiKey: 'test-placeholder-key', model: 'Qwen/Qwen2.5-7B-Instruct',
    fetcher: () => new Promise(() => {}), onDraft: draft => drafts.push(draft),
  });
  await new Promise(setImmediate);
  assert.equal(drafts.length, 1, 'a local preview must publish before the provider responds');
  assert.ok(Object.keys(drafts[0].portfolio.projects).length > 0);
  assert.ok([...h.timers.values()].every(timer => timer.ms < 8000), 'deadline must leave room for batching and browser refresh');
  await h.tick();
  const result = await pending;
  assert.ok(Object.keys(result.portfolio.projects).length > 0);
});

test('wipe removes the public result and an in-flight build cannot resurrect it', async () => {
  let finish;
  const h = harness({ './db': { hasDb: () => false }, './workflow-generation': { generateViaWorkflow: () => new Promise(resolve => { finish = resolve; }) } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts');
  const created = await sessions.createLiveSession(new Request('http://localhost:3005/api/sessions', { method: 'POST' }));
  const request = new Request('http://localhost:3005', { headers: { cookie: created.cookie.split(';')[0] } });
  sessions.authorizeSpeechStart(request, created.session);
  sessions.ingestTranscript(created.session.id, { id: 'one', text: 'I built a car marketplace.', isFinal: true });
  await h.tick();
  await sessions.wipeLiveSession(request, created.session.id);
  finish({ claims: { vibe: 'showcase', skills: [], projects: [] }, portfolio: { templateId: 'showcase', skills: [], projects: {}, contradictions: [] } });
  await new Promise(setImmediate);
  assert.equal(await sessions.getPublicPortfolio(created.session.slug), undefined);
  assert.equal(created.session.segments.size, 0);
  assert.equal(created.session.active, false);
  await assert.rejects(sessions.requireOwnedSession(request, created.session.id), { code: 'NOT_FOUND' });
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
  const h = harness({ './db': { hasDb: () => false }, './workflow-generation': { generateViaWorkflow: () => new Promise(resolve => { complete = resolve; }) } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts');
  const { session } = await sessions.createLiveSession(new Request('http://localhost:3005/api/sessions', { method: 'POST' }));
  sessions.authorizeSpeechStart(new Request('http://localhost:3005'), session);
  sessions.ingestTranscript(session.id, { id: 'first', text: 'I built a car marketplace.', isFinal: true });
  await h.tick();
  assert.equal(session.building, true);
  sessions.ingestTranscript(session.id, { id: 'second', text: 'It helps people buy discounted cars.', isFinal: true });
  const visibleVersion=session.version;
  complete({ claims: { vibe: 'showcase', skills: [], projects: [] }, portfolio: { templateId: 'showcase', hero: { name: 'Car builder', handle: 'builder', roles: [], bio: 'A car marketplace.', currently: [] }, skills: [], projects: {}, contradictions: [] } });
  await new Promise(setImmediate);
  assert.ok(session.version>=visibleVersion, 'completed work must preserve the already visible local draft');
  assert.equal(Object.keys(session.portfolio.projects).length,1,'the registered project remains visible');
  assert.equal(session.acceptedRevision, 1);
  assert.equal(session.revision, 2);
  assert.ok(h.timers.size > 0, 'newer words must still be scheduled');
});

