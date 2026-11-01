const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

test('introductions and interrupted building phrases never become projects', () => {
 const h=harness(), {createDraftPortfolio}=h.load('web/lib/draft.ts');
 for(const transcript of ['Hey, my name is Harsh.', "I'm Harsh. I'm building", "I'm building, hey, my name is Harsh.", 'I am building "Hey, my name is Harsh".', "I'm building, uh, my name's Harsh."]){
  const output=createDraftPortfolio(transcript,undefined,{builderName:'Harsh'});
  assert.equal(Object.keys(output.portfolio.projects).length,0,transcript);
  assert.equal(output.portfolio.hero.name,'Harsh');
 }
});

test('a real product after an introduction remains one product and does not include the introduction in its identity', () => {
 const h=harness(), {createDraftPortfolio}=h.load('web/lib/draft.ts');
 const output=createDraftPortfolio('My name is Harsh. I am building a car marketplace that compares dealer prices.',undefined,{builderName:'Harsh'});
 assert.equal(Object.keys(output.portfolio.projects).length,1);
 const project=Object.values(output.portfolio.projects)[0];
 assert.match(project.title,/car|marketplace/i);
 assert.doesNotMatch(project.title,/Harsh|my name|hey/i);
});

test('my names introduction keeps a full name without swallowing interrupted speech', () => {
 const {extractSelfIntroduction}=harness().load('web/lib/conversation-identity.ts');
 assert.equal(extractSelfIntroduction("Hey, my name's Harsh Anand. I'm building a car marketplace."),'Harsh Anand');
 assert.equal(extractSelfIntroduction("My name is Harsh I'm building a car marketplace."),'Harsh');
});

test('an interrupted product naming phrase is not accepted as a brand', () => {
 const {createDraftPortfolio}=harness().load('web/lib/draft.ts');
 const first=createDraftPortfolio('I built a CAD review tool called Modelmate.',undefined,{builderName:'Harsh'});
 const next=createDraftPortfolio("The CAD tool is called, hey, my name is Harsh.",first.portfolio,{builderName:'Harsh',projectRegistry:first.projectRegistry});
 assert.equal(Object.keys(next.portfolio.projects).length,1);
 assert.equal(Object.values(next.portfolio.projects)[0].title,'Modelmate');
});

test('a product explicitly named after its builder is allowed only with actual product scope', () => {
 const {createDraftPortfolio}=harness().load('web/lib/draft.ts');
 const output=createDraftPortfolio('I built a car marketplace called Harsh.',undefined,{builderName:'Harsh'});
 assert.equal(Object.keys(output.portfolio.projects).length,1);
 assert.equal(Object.values(output.portfolio.projects)[0].title,'Harsh');
});
