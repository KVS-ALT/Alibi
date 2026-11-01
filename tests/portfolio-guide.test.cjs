const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {harness}=require('./helpers/harness.cjs');

test('actual modern and legacy requests include the writing guide with identity authority last',async()=>{
 const expected=fs.readFileSync(path.join(__dirname,'../web/lib/prompts/portfolio-guide.md'),'utf8');
 assert.doesNotMatch(expected,/invent a short, brandable|join them back the way a product/);
 for(const model of ['Qwen/Qwen3-30B-A3B-Instruct-2507','Qwen/Qwen2.5-7B-Instruct']){
  const {generatePortfolio}=harness().load('web/lib/generation.ts');let sent;
  await generatePortfolio({transcript:'My name is Priya Shah. I built a car marketplace called Roadnest.'},{apiKey:'test-placeholder-key',model,fetcher:async(_,init)=>{sent=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({projects:[{id:'project-1',details:[{label:'Audience',value:'First-time car buyers'}]}]})}}]});}});
  const systems=sent.messages.filter(message=>message.role==='system');
  assert.equal(systems[1].content,expected);
  assert.match(systems[2].content,/registered builder identity, project IDs and names win/);
  assert.match(systems[2].content,/never ask questions/i);
  assert.match(systems[2].content,/fabricate URLs/);
  assert.match(systems[2].content,/For legacy output preserve its complete schema/);
  if(model.includes('Qwen3'))assert.equal(sent.max_tokens,450);
 }
});

test('guide loader reads and caches the Markdown once per module',()=>{
 let reads=0;
 const wrappedFs={...fs,readFileSync(...args){reads++;return fs.readFileSync(...args);}};
 const h=harness({'node:fs':wrappedFs});
 const first=h.load('web/lib/portfolio-guide.ts');
 assert.match(first.PORTFOLIO_WRITING_GUIDE,/## Project overview/);
 assert.match(first.PORTFOLIO_WRITING_GUIDE,/Unnamed projects.*keep the registered descriptive label/);
 assert.equal(h.load('web/lib/portfolio-guide.ts'),first);
 assert.equal(reads,1);
});
