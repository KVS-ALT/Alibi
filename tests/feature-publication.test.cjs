const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

const enabled = {
  ALIBI_LOCAL_PROFILE: 'true', ALIBI_CONTINUOUS_CAPTURE: 'true',
  LIVE_PROVIDER_CALLS_ENABLED: 'true', TEAM_LIVE_TEST_ENABLED: 'true',
  RENDER_API_KEY: 'test-placeholder-render-key', FEATHERLESS_API_KEY: 'test-placeholder-key', SPEECHMATICS_API_KEY: 'test-placeholder-key',
};
const stream = '22222222-2222-4222-8222-222222222222';

async function setup() {
  let finish;
  const generation = { generatePortfolio: () => new Promise(resolve => { finish = resolve; }) };
  const h = harness({ './db': { hasDb: () => false }, './workflow-generation': { generateViaWorkflow: (...args) => generation.generatePortfolio(...args) } }, enabled);
  Object.assign(generation, h.load('web/lib/generation.ts'), { generatePortfolio: generation.generatePortfolio });
  const sessions = h.load('web/lib/live-sessions.ts');
  const created = await sessions.createLiveSession(new Request('http://localhost:3005/api/sessions', { method: 'POST' }));
  const request = new Request('http://localhost:3005', { headers: { cookie: created.cookie.split(';')[0] } });
  sessions.authorizeSpeechStart(request, created.session);
  let segment = 0;
  const say = (text, speaker = 'S2') => sessions.ingestTranscript(created.session.id, {
    id: `${created.session.id}:speechmatics:${stream}:${++segment}`, text, speaker, isFinal: true,
  });
  return { h, sessions, session: created.session, say, finish: value => finish(value) };
}

function output(portfolio, projectRegistry) {
  return {
    portfolio: structuredClone(portfolio), projectRegistry: structuredClone(projectRegistry),
    claims: { vibe: portfolio.templateId, skills: portfolio.skills,
      projects: Object.entries(portfolio.projects).map(([id, project]) => ({ id, name: project.title, saidAbout: [project.summary] })) },
  };
}
const details = project => [project.summary, ...project.highlights].join(' ');

test('features spoken during generation update one project and survive an older model result', async () => {
  const { h, sessions, session, say, finish } = await setup();
  say("I'm Harsh. I built a car marketplace called Roadnest.");
  const originalIds = Object.keys(session.portfolio.projects);
  assert.equal(originalIds.length, 1);
  const stale = output(session.portfolio, session.projectRegistry);
  await h.tick();
  assert.equal(session.building, true);

  say('It also sends WhatsApp price-drop alerts.');
  say('Users can book test drives directly inside Roadnest.');
  assert.deepEqual(Object.keys(session.portfolio.projects), originalIds);
  assert.match(details(session.portfolio.projects[originalIds[0]]), /WhatsApp/i);
  assert.match(details(session.portfolio.projects[originalIds[0]]), /book test drives/i);

  finish(stale); await new Promise(setImmediate);
  const visible = await sessions.getPublicPortfolio(session.slug);
  assert.deepEqual(Object.keys(visible.portfolio.projects), originalIds);
  assert.match(details(visible.portfolio.projects[originalIds[0]]), /WhatsApp/i);
  assert.match(details(visible.portfolio.projects[originalIds[0]]), /book test drives/i);
});

test('a named invoicing feature belongs under Roadnest rather than creating a finance project', async () => {
  const { session, say } = await setup();
  say("I'm Harsh. I built a car marketplace called Roadnest.");
  const originalIds = Object.keys(session.portfolio.projects);
  say('I added an invoicing feature to Roadnest so dealers can email receipts.');
  assert.deepEqual(Object.keys(session.portfolio.projects), originalIds);
  assert.equal(session.portfolio.projects[originalIds[0]].title, 'Roadnest');
  assert.match(details(session.portfolio.projects[originalIds[0]]), /invoic|receipts/i);
});

test('questions remain context while a clearly separate product gets a second identity', async () => {
  const { session, say } = await setup();
  say("I'm Harsh. I built a car marketplace called Roadnest.");
  const originalIds = Object.keys(session.portfolio.projects);
  say('Could Roadnest also recommend fitness plans?', 'S3');
  say('My friend built a fitness app.', 'S3');
  assert.deepEqual(Object.keys(session.portfolio.projects), originalIds);
  assert.doesNotMatch(details(session.portfolio.projects[originalIds[0]]), /fitness|workout/i);

  say('Separately, I built a CAD review tool called MeshPilot. It checks clearance between parts.');
  assert.equal(Object.keys(session.portfolio.projects).length, 2);
  assert.ok(Object.keys(session.portfolio.projects).includes(originalIds[0]));
  assert.ok(Object.values(session.portfolio.projects).some(project => project.title === 'MeshPilot'));
});

