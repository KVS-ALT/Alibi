const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

const enabled = { ALIBI_LOCAL_PROFILE: 'true', ALIBI_CONTINUOUS_CAPTURE: 'true', LIVE_PROVIDER_CALLS_ENABLED: 'true', TEAM_LIVE_TEST_ENABLED: 'true', FEATHERLESS_API_KEY: 'test-placeholder-key', SPEECHMATICS_API_KEY: 'test-placeholder-key' };
const ownerRequest = (created, extra = {}) => new Request('http://localhost:3005/api/sessions/' + created.session.id, {
  method: 'DELETE', headers: { cookie: created.cookie.split(';')[0], host: 'localhost:3005', origin: 'http://localhost:3005', ...extra },
});
async function create(sessions) {
  return sessions.createLiveSession(new Request('http://localhost:3005/api/sessions', { method: 'POST' }));
}

test('wipe requires the session owner and rejects cross-origin attempts before touching the result', async () => {
  const h = harness({ './db': { hasDb: () => false } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts'), created = await create(sessions);
  await assert.rejects(sessions.wipeLiveSession(ownerRequest(created, { cookie: 'alibi_team_owner=' + 'a'.repeat(64) }), created.session.id), { code: 'NOT_FOUND' });
  await assert.rejects(sessions.wipeLiveSession(ownerRequest(created, { origin: 'https://unrelated.example', 'sec-fetch-site': 'cross-site' }), created.session.id), { code: 'ORIGIN_REJECTED' });
  assert.equal(await sessions.requireOwnedSession(ownerRequest(created), created.session.id), created.session);
  assert.ok(await sessions.getPublicPortfolio(created.session.slug));
});

test('wipe waits for the running persistence write, then deletes without a later upsert', async () => {
  const order = []; let insertCount = 0, releaseWrite;
  const database = { async query(sql) {
    if (sql.startsWith('insert')) {
      if (++insertCount === 1) { order.push('created'); return { rows: [] }; }
      order.push('save-start'); await new Promise(resolve => { releaseWrite = resolve; }); order.push('save-end');
    } else if (sql.startsWith('delete')) order.push('delete');
    return { rows: [] };
  } };
  const h = harness({ './db': { hasDb: () => true, db: () => database } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts'), created = await create(sessions);
  sessions.setSpeechState(created.session.id, 'idle'); await new Promise(setImmediate);
  let finished = false;
  const wiping = sessions.wipeLiveSession(ownerRequest(created), created.session.id).then(() => { finished = true; });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  assert.deepEqual(order, ['created', 'save-start']);
  releaseWrite(); await wiping;
  assert.deepEqual(order, ['created', 'save-start', 'save-end', 'delete']);
  sessions.setSpeechState(created.session.id, 'listening');
  await new Promise(setImmediate);
  assert.equal(order[order.length - 1], 'delete');
  assert.equal(await sessions.getPublicPortfolio(created.session.slug), undefined);
});

test('a session being wiped rejects fresh capture and transcript mutation while database deletion is pending', async () => {
  let releaseDelete;
  const database = { async query(sql) {
    if (sql.startsWith('delete')) await new Promise(resolve => { releaseDelete = resolve; });
    return { rows: [] };
  } };
  const h = harness({ './db': { hasDb: () => true, db: () => database } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts'), created = await create(sessions);
  const request = ownerRequest(created);
  const wiping = sessions.wipeLiveSession(request, created.session.id);
  await new Promise(setImmediate);
  try {
    await assert.rejects(sessions.requireOwnedSession(request, created.session.id), { code: 'NOT_FOUND' });
    assert.throws(() => sessions.authorizeSpeechStart(request, created.session), { code: 'NOT_FOUND' });
    sessions.ingestTranscript(created.session.id, { id: 'late-audio', text: 'I built another app.', isFinal: true, speaker: 'S3' });
    assert.equal(created.session.segments.size, 0);
    assert.equal(created.session.active, false);
  } finally { releaseDelete(); await wiping; }
});

test('a provider result arriving after wipe cannot recreate a database-backed preview', async () => {
  const writes = []; let count = 0, releaseDraftWrite, completeProvider;
  const draft = { claims: { vibe: 'showcase', skills: [], projects: [] }, portfolio: { templateId: 'showcase', hero: { name: 'Builder', handle: 'builder', roles: [], bio: 'A prototype.', currently: [] }, skills: [], projects: {}, contradictions: [] } };
  const database = { async query(sql) {
    if (sql.startsWith('insert')) {
      writes.push('insert');
      if (++count === 2) await new Promise(resolve => { releaseDraftWrite = resolve; });
    } else if (sql.startsWith('delete')) writes.push('delete');
    return { rows: [] };
  } };
  const h = harness({ './db': { hasDb: () => true, db: () => database }, './generation': {
    async generatePortfolio(input, options) { await options.onDraft(draft); return new Promise(resolve => { completeProvider = resolve; }); },
  } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts'), created = await create(sessions);
  const request = ownerRequest(created);
  sessions.authorizeSpeechStart(request, created.session);
  sessions.ingestTranscript(created.session.id, { id: 'claim', text: 'I built a car marketplace.', isFinal: true, speaker: 'S2' });
  await h.tick();
  const wiping = sessions.wipeLiveSession(request, created.session.id);
  await new Promise(setImmediate);
  releaseDraftWrite(); await wiping; await new Promise(setImmediate);
  completeProvider(draft); await new Promise(setImmediate);
  assert.deepEqual(writes, ['insert', 'insert', 'delete']);
  assert.equal(created.session.version, 0);
  assert.equal(created.session.claims, undefined);
  assert.equal(await sessions.getPublicPortfolio(created.session.slug), undefined);
});

test('DELETE route checks ownership before ending upstream capture and returns an empty successful response', async () => {
  const stopped = [];
  const h = harness({ './db': { hasDb: () => false }, '@/lib/speech/runtime': { getSpeechProxy: () => ({ endSession: id => stopped.push(id) }) } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts');
  // Route aliases are external module boundaries; reuse the actual sessions implementation.
  const routeHarness = harness({ '@/lib/live-sessions': sessions, '@/lib/speech/runtime': { getSpeechProxy: () => ({ endSession: id => stopped.push(id) }) } }, enabled);
  const route = routeHarness.load('web/app/api/sessions/[id]/route.ts');
  const created = await create(sessions), context = { params: Promise.resolve({ id: created.session.id }) };
  const denied = await route.DELETE(ownerRequest(created, { cookie: 'alibi_team_owner=' + 'b'.repeat(64) }), context);
  assert.equal(denied.status, 404);
  assert.equal(stopped.length, 0);
  const deleted = await route.DELETE(ownerRequest(created), context);
  assert.equal(deleted.status, 204);
  assert.equal(await deleted.text(), '');
  assert.ok(stopped.includes(created.session.id));
  await assert.rejects(sessions.requireOwnedSession(ownerRequest(created), created.session.id), { code: 'NOT_FOUND' });
});

test('three or more speakers reach conversation context and repeated labelled segments are idempotent', async () => {
  const h = harness({ './db': { hasDb: () => false } }, enabled);
  const sessions = h.load('web/lib/live-sessions.ts'), created = await create(sessions);
  sessions.authorizeSpeechStart(ownerRequest(created), created.session);
  const turns = [
    { id: 'q', text: 'What did you build?', isFinal: true, speaker: 'S3' },
    { id: 'a', text: 'I built a car marketplace.', isFinal: true, speaker: 'S2' },
    { id: 'comment', text: 'Can it compare prices?', isFinal: true, speaker: 'S8' },
  ];
  turns.forEach(turn => sessions.ingestTranscript(created.session.id, turn));
  assert.equal(sessions.conversation(created.session), '[S3] What did you build? [S2] I built a car marketplace. [S8] Can it compare prices?');
  const revision = created.session.revision;
  sessions.ingestTranscript(created.session.id, turns[1]);
  assert.equal(created.session.revision, revision, 'same speaker/id/text must not consume another generation revision');
});
