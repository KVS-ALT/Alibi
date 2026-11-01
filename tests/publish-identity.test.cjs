const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

const enabled = {
  ALIBI_LOCAL_PROFILE: 'true', ALIBI_CONTINUOUS_CAPTURE: 'true',
  LIVE_PROVIDER_CALLS_ENABLED: 'true', TEAM_LIVE_TEST_ENABLED: 'true',
  FEATHERLESS_API_KEY: 'test-placeholder-key', SPEECHMATICS_API_KEY: 'test-placeholder-key',
};
const stream = '11111111-1111-4111-8111-111111111111';

async function setup(generatePortfolio = () => new Promise(() => {})) {
  const generation = { generatePortfolio };
  const h = harness({ './db': { hasDb: () => false }, './generation': generation }, enabled);
  // Keep pure publication/reconciliation helpers real if the integration imports
  // them from the same module; replace only the external generation operation.
  Object.assign(generation, h.load('web/lib/generation.ts'), { generatePortfolio });
  const sessions = h.load('web/lib/live-sessions.ts');
  const created = await sessions.createLiveSession(new Request('http://localhost:3005/api/sessions', { method: 'POST' }));
  const request = new Request('http://localhost:3005', { headers: { cookie: created.cookie.split(';')[0] } });
  sessions.authorizeSpeechStart(request, created.session);
  let segment = 0;
  const say = (text, speaker = 'S2') => sessions.ingestTranscript(created.session.id, {
    id: `${created.session.id}:speechmatics:${stream}:${++segment}`, text, speaker, isFinal: true,
  });
  return { h, sessions, session: created.session, request, say };
}

function output(portfolio, projectRegistry) {
  return {
    portfolio: structuredClone(portfolio),
    claims: {
      speakerName: portfolio.hero?.name,
      vibe: portfolio.templateId, skills: portfolio.skills,
      projects: Object.entries(portfolio.projects).map(([id, project]) => ({ id, name: project.title, saidAbout: [project.summary] })),
    },
    ...(projectRegistry ? { projectRegistry: structuredClone(projectRegistry) } : {}),
  };
}

test('a late model response cannot undo a newer spoken name or rename, or inject a new project identity', async () => {
  let finish;
  const { h, sessions, session, say } = await setup(() => new Promise(resolve => { finish = resolve; }));
  say("I'm Harsh. I built a CAD review tool called Modelmate.");
  assert.equal(session.portfolio.hero?.name, 'Harsh');
  const originalIds = Object.keys(session.portfolio.projects);
  assert.equal(originalIds.length, 1, 'the spoken project must appear before the model responds');
  const stale = output(session.portfolio, session.projectRegistry);
  await h.tick();
  assert.equal(session.building, true);

  say('Actually, my name is Harsha. The CAD review tool is now called Draftcheck.');
  assert.equal(session.portfolio.hero?.name, 'Harsha');
  assert.deepEqual(Object.keys(session.portfolio.projects), originalIds, 'a rename keeps its original identity');
  assert.equal(session.portfolio.projects[originalIds[0]].title, 'Draftcheck');

  const invented = structuredClone(Object.values(stale.portfolio.projects)[0]);
  invented.title = 'Unspoken Venture';
  stale.portfolio.projects['invented-venture'] = invented;
  stale.claims.projects.push({ id: 'invented-venture', name: 'Unspoken Venture', saidAbout: ['A name invented only by the model.'] });
  finish(stale);
  await new Promise(setImmediate);

  const visible = await sessions.getPublicPortfolio(session.slug);
  assert.equal(visible.portfolio.hero.name, 'Harsha');
  assert.deepEqual(Object.keys(visible.portfolio.projects), originalIds);
  assert.equal(visible.portfolio.projects[originalIds[0]].title, 'Draftcheck');
  assert.ok(h.timers.size > 0, 'newer speech still queues its content update');
});

test('a self-introduction before any project survives rolling transcript eviction', async () => {
  const { sessions, session, say } = await setup();
  say('My name is Harsh Anand.');
  for (let i = 0; i < 140; i++) say(`We are checking detail number ${i}.`);
  assert.doesNotMatch(sessions.conversation(session), /Harsh Anand/, 'the original introduction really left the rolling window');
  say('I built a car marketplace called Auto Lane.');
  assert.equal(session.portfolio.hero?.name, 'Harsh Anand');
  assert.equal(Object.keys(session.portfolio.projects).length, 1);
});

test('a likely project-name transcription variation updates the same project without a new card or silent rename', async () => {
  const { session, say } = await setup();
  say('I built a CAD review tool called Modelmate.');
  const originalIds = Object.keys(session.portfolio.projects);
  assert.equal(originalIds.length, 1);
  say('The CAD review tool is called Model mate and checks clearance between parts.');
  assert.deepEqual(Object.keys(session.portfolio.projects), originalIds);
  assert.equal(session.portfolio.projects[originalIds[0]].title, 'Modelmate');
});

test('wipe removes remembered identity and aliases along with the generated portfolio', async () => {
  const { sessions, session, request, say } = await setup();
  say("I'm Harsh Anand. I built a CAD review tool called Modelmate.");
  assert.equal(session.portfolio.hero?.name, 'Harsh Anand');
  assert.equal(session.projectRegistry?.projects.length, 1);
  await sessions.wipeLiveSession(request, session.id);
  assert.equal(session.identity?.name, undefined);
  assert.equal(session.projectRegistry?.projects?.length ?? 0, 0);
  assert.equal(Object.keys(session.portfolio.projects).length, 0);
  assert.equal(await sessions.getPublicPortfolio(session.slug), undefined);
});
