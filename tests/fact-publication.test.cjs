const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

test('publication preserves current spoken features before filling remaining highlights from AI', () => {
 const h=harness();
 const draft=h.load('web/lib/draft.ts').createDraftPortfolio('I built a car marketplace called Roadnest.');
 const id=Object.keys(draft.portfolio.projects)[0];
 const current=structuredClone(draft.projectRegistry);
 current.projects[0].spokenFeatures=['Users can book test drives.','It sends price-drop alerts.'];
 const stale=structuredClone(draft);
 stale.portfolio.projects[id].highlights=['Imports vehicle records','Shows vehicle history','Saves searches'];
 const output=h.load('web/lib/portfolio-facts.ts').applyConversationFacts(stale,current,undefined,draft.portfolio);
 assert.deepEqual(Array.from(output.portfolio.projects[id].highlights),['It sends price-drop alerts.','Users can book test drives.','Imports vehicle records']);
 assert.equal(Object.keys(output.portfolio.projects).length,1);
});

test('spoken and generated copies of the same feature do not crowd out other details', () => {
 const h=harness();
 const draft=h.load('web/lib/draft.ts').createDraftPortfolio('I built a car marketplace called Roadnest.');
 const id=Object.keys(draft.portfolio.projects)[0];
 draft.projectRegistry.projects[0].spokenFeatures=['Users can book test drives.'];
 draft.portfolio.projects[id].highlights=['users can book test drives','Sends price alerts','Checks vehicle history'];
 const result=h.load('web/lib/portfolio-facts.ts').applyConversationFacts(draft,draft.projectRegistry,undefined,draft.portfolio);
 assert.deepEqual(Array.from(result.portfolio.projects[id].highlights),['Users can book test drives.','Sends price alerts','Checks vehicle history']);
});
