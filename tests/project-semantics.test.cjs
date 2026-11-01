const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

function drafts() {
  const { createDraftPortfolio } = harness().load('web/lib/draft.ts');
  let result;
  return text => result = createDraftPortfolio(text, result?.portfolio, { projectRegistry: result?.projectRegistry });
}

test('price alerts and test-drive booking become statements under the active car project', () => {
  const say=drafts(); const first=say('I built a car marketplace called Roadnest.');
  const id=Object.keys(first.portfolio.projects)[0];
  say('It also sends price alerts.');
  const result=say('Users can book test drives.');
  assert.deepEqual(Object.keys(result.portfolio.projects),[id]);
  assert.match(result.portfolio.projects[id].highlights.join(' '),/price alerts/i);
  assert.match(result.portfolio.projects[id].highlights.join(' '),/book test drives/i);
  assert.equal(result.portfolio.projects[id].highlights.length,3);
});

test('a named feature target wins over the most recently discussed project and an incidental finance domain', () => {
  const say=drafts();say('I built a car marketplace called Roadnest.');
  const before=say('Separately I built a CAD review tool called Modelmate.');
  const carId=Object.keys(before.portfolio.projects).find(id=>before.portfolio.projects[id].title==='Roadnest');
  const cadId=Object.keys(before.portfolio.projects).find(id=>before.portfolio.projects[id].title==='Modelmate');
  const result=say('I added an invoicing feature to Roadnest.');
  assert.equal(Object.keys(result.portfolio.projects).length,2);
  assert.match(result.portfolio.projects[carId].highlights.join(' '),/invoicing/i);
  assert.doesNotMatch(result.portfolio.projects[cadId].highlights.join(' '),/invoicing/i);
});

test('questions and hypothetical capabilities do not become implemented project features', () => {
  const say=drafts();const first=say('I built a car marketplace called Roadnest.');
  const before=JSON.stringify(first.portfolio.projects);
  say('Could it also do invoicing?');
  const result=say('Maybe I could add an invoicing feature later.');
  assert.equal(JSON.stringify(result.portfolio.projects),before);
});

test('a clear separate product is distinct while later feature statements retain its stable identity', () => {
  const say=drafts();say('I built a CAD review tool called Modelmate.');
  const separate=say('Separately I built a CAD sketch converter called Sketchbridge for model designers.');
  assert.equal(Object.keys(separate.portfolio.projects).length,2);
  const result=say('It also saves revision history.');
  assert.deepEqual(Object.keys(result.portfolio.projects),Object.keys(separate.portfolio.projects));
  const active=result.projectRegistry.activeId;
  assert.match(result.portfolio.projects[active].highlights.join(' '),/revision history/i);
});

test('replayed feature statements do not duplicate memory or erase earlier spoken capabilities', () => {
  const say=drafts();say('I built a car marketplace called Roadnest. It also sends price alerts.');
  let result;
  for(let i=0;i<8;i++)result=say('I built a car marketplace called Roadnest. It also sends price alerts. Users can book test drives.');
  assert.equal(result.projectRegistry.projects.length,1);
  assert.equal(result.projectRegistry.projects[0].spokenFeatures.length,2);
  assert.match(result.portfolio.projects[result.projectRegistry.activeId].highlights.join(' '),/price alerts/i);
});

test('named-subject capabilities attach only when their subject is an established project', () => {
  const say=drafts();say('I built a car marketplace called Roadnest.');
  say('Roadnest also supports saved searches.');
  const known=say('This app also has a price history view.');
  const id=known.projectRegistry.activeId;
  assert.ok(known.projectRegistry.projects[0].spokenFeatures.some(value=>/saved searches/i.test(value)));
  assert.match(known.portfolio.projects[id].highlights.join(' '),/saved searches/i);
  assert.match(known.portfolio.projects[id].highlights.join(' '),/price history/i);
  const unchanged=say('Unheard Venture also supports invoice payments.');
  assert.equal(unchanged.projectRegistry.projects.length,1);
  assert.doesNotMatch(unchanged.portfolio.projects[id].highlights.join(' '),/Unheard Venture/i);
});
