const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers/harness.cjs');

test('local draft exposes spoken context and useful details without a provider, retaining enrichment on follow-up',()=>{
 const {createDraftPortfolio}=harness().load('web/lib/draft.ts');
 const first=createDraftPortfolio('My name is Priya Shah. I built a car marketplace called Roadnest for comparing dealer overstock.');
 const project=Object.values(first.portfolio.projects)[0];
 assert.match(project.details.find(d=>d.label==='Product brief').value,/dealer overstock/i);
 assert.match(project.details.find(d=>d.label==='Prototype approach').value,/TypeScript/);
 project.details.push({label:'Audience',value:'Local car buyers'});
 const next=createDraftPortfolio('It also sends WhatsApp price alerts.',first.portfolio,{builderName:'Priya Shah',projectRegistry:first.projectRegistry});
 assert.equal(Object.keys(next.portfolio.projects).length,1);
 assert.ok(Object.values(next.portfolio.projects)[0].details.some(d=>d.label==='Audience'&&d.value==='Local car buyers'));
});
