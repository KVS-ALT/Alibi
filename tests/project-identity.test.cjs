const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');
function api() { return harness().load('web/lib/project-identity.ts'); }

test('unnamed projects receive descriptive labels without a fabricated brand name', () => {
 const { resolveProjectIdentity } = api();
 const result = resolveProjectIdentity(undefined, { domain:'cad', description:'CAD review tool for thin walls and clearance problems', label:'CAD review tool' });
 assert.equal(result.project.name,'CAD review tool');
 assert.equal(result.project.nameSource,'descriptive');
});
test('spacing and small transcription variations keep one stable spoken project identity', () => {
 const { resolveProjectIdentity } = api();
 const first=resolveProjectIdentity(undefined,{domain:'cad',description:'CAD tool reviews model clearance',label:'CAD review tool',spokenName:'Modelmate'});
 const next=resolveProjectIdentity(first.registry,{domain:'cad',description:'CAD tool reviews model clearance',label:'CAD review tool',spokenName:'Model mate'});
 assert.equal(next.project.id,first.project.id);
 assert.equal(next.project.name,'Modelmate');
 assert.equal(next.registry.projects.length,1);
});
test('another clearly distinct CAD product remains separate despite the same category', () => {
 const { resolveProjectIdentity } = api();
 const first=resolveProjectIdentity(undefined,{domain:'cad',description:'CAD review tool checks thin walls and clearance',label:'CAD review tool',spokenName:'Modelmate'});
 const second=resolveProjectIdentity(first.registry,{domain:'cad',description:'Another CAD tool converts sketches into parametric meshes',label:'CAD sketch converter',spokenName:'Sketchbridge',explicitSeparate:true});
 assert.notEqual(second.project.id,first.project.id);
 assert.equal(second.registry.projects.length,2);
});
test('a new unrelated name alone cannot silently rename the existing project', () => {
 const { resolveProjectIdentity } = api();
 const first=resolveProjectIdentity(undefined,{domain:'cad',description:'CAD review tool checks thin walls',label:'CAD review tool',spokenName:'Modelmate'});
 const next=resolveProjectIdentity(first.registry,{domain:'cad',description:'CAD review tool checks thin walls',label:'CAD review tool',spokenName:'Draftcheck'});
 assert.equal(next.project.name,'Modelmate');
 assert.equal(next.registry.projects.length,1);
});
test('explicit rename changes the displayed name while retaining internal identity and former alias', () => {
 const { resolveProjectIdentity } = api();
 const first=resolveProjectIdentity(undefined,{domain:'cad',description:'CAD review tool checks thin walls',label:'CAD review tool',spokenName:'Modelmate'});
 const next=resolveProjectIdentity(first.registry,{domain:'cad',description:'Actually it is called Draftcheck now',label:'CAD review tool',spokenName:'Draftcheck',explicitRename:true});
 assert.equal(next.project.id,first.project.id);
 assert.equal(next.project.name,'Draftcheck');
 assert.ok(next.project.aliases.includes('Modelmate'));
});
test('draft uses spoken lowercase multiword names and preserves identities across later speech', () => {
 const h=harness(), {createDraftPortfolio}=h.load('web/lib/draft.ts');
 const first=createDraftPortfolio('I built a car marketplace called motor lane.');
 const p=Object.values(first.portfolio.projects)[0];
 assert.equal(p.title,'motor lane');
 const next=createDraftPortfolio('The car marketplace has price alerts.',first.portfolio,{projectRegistry:first.projectRegistry});
 assert.equal(Object.keys(next.portfolio.projects)[0],Object.keys(first.portfolio.projects)[0]);
 assert.equal(Object.values(next.portfolio.projects)[0].title,'motor lane');
});
test('fallback identities do not contain the old invented recipe names', () => {
 const {createDraftPortfolio}=harness().load('web/lib/draft.ts');
 const result=createDraftPortfolio('I built a CAD review tool. Separately, I built a restaurant order app.');
 const titles=Object.values(result.portfolio.projects).map(project=>project.title);
 assert.equal(titles.length,2);
 assert.doesNotMatch(titles.join(' '),/Draftcheck|Counterflow|Lotline|Flowdesk/);
});
test('replaying an expanding transcript does not duplicate a separately named project', () => {
 const {createDraftPortfolio}=harness().load('web/lib/draft.ts');
 const transcript='I built a CAD review tool called Modelmate. Separately I built a CAD sketch converter called Sketchbridge.';
 const first=createDraftPortfolio(transcript);
 const next=createDraftPortfolio(transcript.replace('Sketchbridge.','Sketchbridge with parametric exports.'),first.portfolio,{projectRegistry:first.projectRegistry});
 assert.equal(next.projectRegistry.projects.length,2);
 assert.deepEqual(Object.keys(next.portfolio.projects),Object.keys(first.portfolio.projects));
});
test('a spoken pronoun rename uses the active project and keeps its stable id', () => {
 const {createDraftPortfolio}=harness().load('web/lib/draft.ts');
 const first=createDraftPortfolio('I built a CAD review tool called Modelmate.');
 const next=createDraftPortfolio('Actually, it is called Draftcheck now.',first.portfolio,{projectRegistry:first.projectRegistry});
 assert.equal(Object.keys(next.portfolio.projects).length,1);
 assert.equal(Object.keys(next.portfolio.projects)[0],Object.keys(first.portfolio.projects)[0]);
 assert.equal(Object.values(next.portfolio.projects)[0].title,'Draftcheck');
});
test('later naming of an unnamed project needs no repeated domain words', () => {
 const {createDraftPortfolio}=harness().load('web/lib/draft.ts');
 const first=createDraftPortfolio('I built a CAD review tool.');
 const next=createDraftPortfolio('It is called model mate.',first.portfolio,{projectRegistry:first.projectRegistry});
 assert.equal(Object.keys(next.portfolio.projects).length,1);
 assert.equal(Object.values(next.portfolio.projects)[0].title,'model mate');
});
test('the origin of an unnamed separate project survives more than 24 replayed follow-ups', () => {
 const {createDraftPortfolio}=harness().load('web/lib/draft.ts');
 let transcript='I built a CAD review tool called Modelmate. Separately I built a CAD sketch converter for parametric meshes.';
 let state=createDraftPortfolio(transcript);
 const ids=Object.keys(state.portfolio.projects);
 for(let i=1;i<=40;i++){
  transcript+=` The CAD tool converts sketches to parametric meshes with checkpoint ${i}.`;
  state=createDraftPortfolio(transcript,state.portfolio,{projectRegistry:state.projectRegistry});
 }
 assert.equal(state.projectRegistry.projects.length,2);
 assert.deepEqual(Object.keys(state.portfolio.projects),ids);
 assert.ok(state.projectRegistry.projects.every(project=>project.mentions.length<=24));
});
