const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers/harness.cjs');

test('local portfolio pipeline uses Claude layouts for explicitly spoken product platforms',()=>{
 const {createDraftPortfolio}=harness().load('web/lib/draft.ts');
 for(const [description,kit] of [
  ['I built an iOS mobile app called Trailnote for planning hiking routes.','phone'],
  ['I built a Discord bot called Clubbot for moderating student clubs.','chat'],
  ['I built a CLI tool called Shipfast for deploying student club websites.','terminal'],
  ['I built a Chrome extension called Tabnest for organizing research tabs.','extension'],
 ]){
  const output=createDraftPortfolio(description,undefined,{builderName:'Harsh'});
  const project=Object.values(output.portfolio.projects)[0];
  assert.ok(project,description);
  assert.match(project.mockHtml,new RegExp(`data-kit="${kit}"`),description);
  assert.doesNotMatch(project.mockHtml,/<script\b|https?:\/\//i);
 }
});

test('publication keeps spoken names and uses the Claude renderer after generation',()=>{
 const h=harness(),{createDraftPortfolio}=h.load('web/lib/draft.ts'),{applyConversationFacts}=h.load('web/lib/portfolio-facts.ts');
 const draft=createDraftPortfolio('My name is Harsh Anand. I built an iOS app called Trailnote for planning hiking routes.');
 const result=applyConversationFacts(draft,draft.projectRegistry,'Harsh Anand',draft.portfolio);
 assert.equal(result.portfolio.hero.name,'Harsh Anand');
 assert.equal(Object.values(result.portfolio.projects)[0].title,'Trailnote');
 assert.match(Object.values(result.portfolio.projects)[0].mockHtml,/data-kit="phone"/);
});
