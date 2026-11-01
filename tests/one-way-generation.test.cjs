const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

test('a standalone full self-introduction becomes portfolio identity without inventing a project', async () => {
  const { generatePortfolio } = harness().load('web/lib/generation.ts');
  const result = await generatePortfolio({ transcript: "I'm Harsh Anand." }, { apiKey: '', model: '' });
  assert.equal(result.portfolio.hero?.name, 'Harsh Anand');
  assert.equal(result.claims.speakerName, 'Harsh Anand');
  assert.equal(Object.keys(result.portfolio.projects).length, 0);
});

test('unnamed projects get descriptive titles instead of preset brand names', async () => {
  const { generatePortfolio } = harness().load('web/lib/generation.ts');
  const result = await generatePortfolio({ transcript: 'I built a CAD review tool. Separately I built an app for shops to handle orders.' }, { apiKey: '', model: '' });
  const titles = Object.values(result.portfolio.projects).map(project => project.title);
  assert.equal(titles.length, 2);
  assert.doesNotMatch(titles.join(' '), /Draftcheck|Counterflow|Lotline/);
  assert.match(titles.join(' '), /CAD/i);
});

test('valid AI content cannot replace a spoken name or brand an unnamed project', async () => {
  const transcript = "I'm Harsh Anand. I built a car marketplace.";
  const { generatePortfolio } = harness().load('web/lib/generation.ts');
  const draft = await generatePortfolio({ transcript }, { apiKey: '', model: '' });
  const candidate = structuredClone({ claims: draft.claims, portfolio: draft.portfolio });
  candidate.portfolio.hero.name = 'AI Invented Person';
  candidate.claims.speakerName = 'AI Invented Person';
  const id = Object.keys(candidate.portfolio.projects)[0];
  candidate.portfolio.projects[id].title = 'Premature Brand';
  candidate.claims.projects[0].name = 'Premature Brand';
  const result = await generatePortfolio({ transcript }, {
    apiKey: 'test-placeholder-key', model: 'Qwen/Qwen2.5-7B-Instruct',
    fetcher: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(candidate) } }] }),
  });
  assert.equal(result.portfolio.hero.name, 'Harsh Anand');
  assert.equal(result.claims.speakerName, 'Harsh Anand');
  assert.equal(Object.values(result.portfolio.projects)[0].title, Object.values(draft.portfolio.projects)[0].title);
  assert.doesNotMatch(JSON.stringify(result), /AI Invented Person|Premature Brand/);
});

test('a model-only extra project cannot become a new portfolio identity', async () => {
  const transcript = 'I built a car marketplace called Roadnest.';
  const { generatePortfolio } = harness().load('web/lib/generation.ts');
  const draft = await generatePortfolio({ transcript }, { apiKey: '', model: '' });
  const candidate = structuredClone({ claims: draft.claims, portfolio: draft.portfolio });
  candidate.portfolio.projects['unheard-product'] = { ...Object.values(candidate.portfolio.projects)[0], title: 'Unheard Product', mockHtml: undefined };
  candidate.claims.projects.push({ id: 'unheard-product', name: 'Unheard Product', saidAbout: ['A separate invented product'] });
  const result = await generatePortfolio({ transcript }, {
    apiKey: 'test-placeholder-key', model: 'Qwen/Qwen2.5-7B-Instruct',
    fetcher: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(candidate) } }] }),
  });
  assert.equal(Object.keys(result.portfolio.projects).length, 1);
  assert.equal(Object.values(result.portfolio.projects)[0].title, 'Roadnest');
});
