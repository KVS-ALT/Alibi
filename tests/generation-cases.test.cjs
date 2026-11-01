const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

async function draft(transcript, previous) {
  const h = harness();
  const { generatePortfolio } = h.load('web/lib/generation.ts');
  return generatePortfolio({ transcript, previous }, { apiKey: '', model: '' });
}

test('dealer inventory is a feature of one car marketplace, not a second retail project', async () => {
  const result = await draft('I built a car marketplace with dealer inventory and price-drop alerts.');
  const projects = Object.values(result.portfolio.projects);
  assert.equal(projects.length, 1);
  assert.match(projects[0].summary, /car|vehicle|dealer/i);
});

test('ordinary design clients do not turn an invoice tool into a CAD product', async () => {
  const result = await draft('I built an invoice app for graphic designers to track late payments.');
  const projects = Object.values(result.portfolio.projects);
  assert.equal(projects.length, 1);
  assert.match(projects[0].summary, /invoice|expense|transaction|payment/i);
  assert.doesNotMatch(projects[0].summary, /thin walls|clearance|CAD/i);
});

test('two explicit product names stay attached to the car and CAD products', async () => {
  const result = await draft('I built a car marketplace called Autolane. On the side I built a CAD review tool called Modelmate.');
  const projects = Object.values(result.portfolio.projects);
  assert.equal(projects.length, 2);
  assert.ok(projects.some(project => project.title === 'Autolane' && /car|dealer|vehicle/i.test(project.summary)));
  assert.ok(projects.some(project => project.title === 'Modelmate' && /CAD|model|design/i.test(project.summary)));
});

test('a question about another domain does not create an invented interviewer project', async () => {
  const result = await draft('[S1] I built a car marketplace. [S2] Have you tried building a fitness app?');
  const projects = Object.values(result.portfolio.projects);
  assert.equal(projects.length, 1);
  assert.match(projects[0].summary, /car|dealer|vehicle/i);
});

test('the interviewer introduction does not become the builder portfolio identity', async () => {
  const result = await draft('[S2] My name is Alex. What are you building? [S1] I built a car marketplace with price alerts.');
  assert.equal(Object.keys(result.portfolio.projects).length, 1);
  assert.notEqual(result.portfolio.hero?.name, 'Alex');
  assert.notEqual(result.claims.speakerName, 'Alex');
});

test('the builder can be the second detected speaker after an interviewer question', async () => {
  const result = await draft('[S1] My name is Alex. What project are you building? [S2] My name is Priya. I built a CAD review tool called Modelmate.');
  assert.equal(result.portfolio.hero?.name, 'Priya');
  assert.equal(result.claims.speakerName, 'Priya');
  const projects = Object.values(result.portfolio.projects);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].title, 'Modelmate');
});

test('a new CAD project preserves the existing car project and its metrics', async () => {
  const first = await draft('I built a car marketplace called Autolane.');
  const firstProject = Object.values(first.portfolio.projects)[0];
  const next = await draft('On the side I am building a CAD review tool called Modelmate.', first.portfolio);
  const projects = Object.values(next.portfolio.projects);
  assert.equal(projects.length, 2);
  const retained = projects.find(project => project.title === firstProject.title);
  assert.ok(retained);
  assert.deepEqual(JSON.parse(JSON.stringify(retained.metrics)), JSON.parse(JSON.stringify(firstProject.metrics)));
});

test('an explicit correction updates a project instead of silently retaining its old name', async () => {
  const first = await draft('I built a car marketplace called Autolane.');
  const next = await draft('Actually, the car marketplace is called Motorlane now.', first.portfolio);
  const projects = Object.values(next.portfolio.projects);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].title, 'Motorlane');
});

test('small talk and interviewer questions alone do not invent a project', async () => {
  const result = await draft('Hi, nice to meet you. What app are you building?');
  assert.equal(Object.keys(result.portfolio.projects).length, 0);
});

test('an unfamiliar domain keeps the spoken product instead of becoming a team task queue', async () => {
  const result = await draft('I built a birdwatching app that identifies bird calls from short recordings.');
  const projects = Object.values(result.portfolio.projects);
  assert.equal(projects.length, 1);
  assert.match(projects[0].summary, /birdwatching|bird calls/i);
  assert.doesNotMatch(projects[0].summary, /teams handling repeated requests|incoming work.*owner/i);
  assert.ok(projects[0].metrics.every(metric => metric.value && metric.value !== 'TBD'));
});

test('spoken hardware design creates a plausible audio prototype with the explicitly supplied product name', async () => {
  const result = await draft("[S1] What are you working on? [S2] Hey. So yeah, I'm basically designing the new AirPods. Um, I work at Apple.");
  const projects = Object.values(result.portfolio.projects);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].title, 'AirPods');
  assert.match(projects[0].category, /hardware|audio/i);
  assert.match(projects[0].summary, /earbud|audio|acoustic/i);
  assert.equal(projects[0].metrics.length, 3);
  assert.match(projects[0].mockHtml, /Prototype|Enclosure|Acoustic/i);
  assert.doesNotMatch(JSON.stringify(result), /TBD|Conversation project/);
});

test('designing wireless headphones works without a named brand', async () => {
  const result = await draft("I'm designing wireless headphones with a better fit and longer battery life.");
  const projects = Object.values(result.portfolio.projects);
  assert.equal(projects.length, 1);
  assert.match(projects[0].category, /hardware|audio/i);
  assert.match(projects[0].highlights.join(' '), /fit|battery|acoustic/i);
});

test('an affiliation containing app letters does not invent an application project', async () => {
  const result = await draft('Hi. I work at Apple. Nice to meet you.');
  assert.equal(Object.keys(result.portfolio.projects).length, 0);
});

test('a schema-valid partial model update does not erase a previous project', async () => {
  const prior = await draft('I built a car marketplace called Autolane.');
  const update = await draft('I built a CAD review tool called Modelmate.');
  const h = harness();
  const { generatePortfolio } = h.load('web/lib/generation.ts');
  const result = await generatePortfolio({ transcript: 'I built a CAD review tool called Modelmate.', previous: prior.portfolio }, {
    apiKey: 'test-placeholder-key', model: 'Qwen/Qwen2.5-7B-Instruct',
    fetcher: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(update) } }] }),
  });
  const titles = Object.values(result.portfolio.projects).map(project => project.title);
  assert.equal(titles.length, 2);
  assert.ok(titles.includes('Autolane'));
  assert.ok(titles.includes('Modelmate'));
});

test('executable model markup is rejected in favor of the safe local draft', async () => {
  const unsafe = await draft('I built a car marketplace.');
  Object.values(unsafe.portfolio.projects)[0].mockHtml = '<div class="h-full"><script>alert(1)</script></div>';
  const h = harness();
  const { generatePortfolio } = h.load('web/lib/generation.ts');
  const diagnostics = [];
  const result = await generatePortfolio({ transcript: 'I built a car marketplace.' }, {
    apiKey: 'test-placeholder-key', model: 'Qwen/Qwen2.5-7B-Instruct',
    fetcher: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(unsafe) } }] }),
    onDiagnostic: event => diagnostics.push(event),
  });
  assert.ok(Object.keys(result.portfolio.projects).length > 0);
  assert.doesNotMatch(JSON.stringify(result.portfolio), /<script|alert\(1\)/i);
  assert.equal(diagnostics.at(-1).reason, 'invalid_output');
});

test('local mock rendering keeps malicious spoken product names inert', async () => {
  const h = harness();
  const { renderProjectMock } = h.load('web/lib/draft.ts');
  const result = await draft('I built a car marketplace.');
  const project = Object.values(result.portfolio.projects)[0];
  const html = renderProjectMock({ ...project, title: '<img src=x onerror=alert(1)>', tagline: '<script>alert(1)</script>' });
  assert.doesNotMatch(html, /<(?:img|script)\b|<[^>]+\sonerror\s*=/i);
  assert.match(html, /&lt;img/);
});
