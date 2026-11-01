const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers/harness.cjs');
const transcript="My name is Priya Shah. I built a car marketplace called Roadnest. Users can book test drives.";
const envelope=value=>Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}]});

test('DeepSeek default requests a compact data patch and disables thinking',async()=>{
 const {generatePortfolio,DEFAULT_GENERATION_MODEL}=harness().load('web/lib/generation.ts');let sent,diagnostic;
 const result=await generatePortfolio({transcript},{apiKey:'test-placeholder-key',model:DEFAULT_GENERATION_MODEL,fetcher:async(_,init)=>{sent=JSON.parse(init.body);return envelope({projects:[{id:'project-1',summary:'Compares dealer overstock for first-time buyers.',details:[{label:'Inventory refresh',value:'Every 15 minutes'}],stack:['TypeScript','PostgreSQL']}],bio:'Builds practical tools for car buyers.'});},onDiagnostic:value=>{diagnostic=value;}});
 assert.equal(DEFAULT_GENERATION_MODEL,'deepseek-ai/DeepSeek-V3.2');
 assert.equal(sent.model,DEFAULT_GENERATION_MODEL);
 assert.equal(sent.chat_template_kwargs.thinking,false);
 assert.ok(sent.max_tokens<=900);
 assert.ok(sent.messages[0].content.length<2000,'prompt must not send the full portfolio schema/example');
 assert.equal(diagnostic.outcome,'model');
 assert.equal(result.portfolio.hero.name,'Priya Shah');
 assert.equal(result.portfolio.projects['project-1'].title,'Roadnest');
 assert.equal(result.portfolio.projects['project-1'].details.find(detail=>detail.label==='Inventory refresh').value,'Every 15 minutes');
 assert.match(result.portfolio.projects['project-1'].summary,/first-time buyers/);
 assert.match(result.portfolio.projects['project-1'].mockHtml,/h-full/);
});

test('compact patches merge details and ignore unregistered project IDs',async()=>{
 const h=harness(),{generatePortfolio,DEFAULT_GENERATION_MODEL}=h.load('web/lib/generation.ts');
 const previous=await generatePortfolio({transcript},{apiKey:'',model:''});
 previous.portfolio.projects['project-1'].details=[{label:'Audience',value:'First-time buyers'}];
 const result=await generatePortfolio({transcript,previous:previous.portfolio,projectRegistry:previous.projectRegistry},{apiKey:'test-placeholder-key',model:DEFAULT_GENERATION_MODEL,fetcher:async()=>envelope({projects:[{id:'project-1',details:[{label:'Refresh cadence',value:'Every 15 minutes'}]},{id:'not-spoken',summary:'An invented unrelated product.'}]})});
 assert.equal(Object.keys(result.portfolio.projects).length,1);
 assert.ok(result.portfolio.projects['project-1'].details.some(detail=>detail.label==='Audience'));
 assert.ok(result.portfolio.projects['project-1'].details.some(detail=>detail.label==='Refresh cadence'));
});

test('compact model cannot supply titles, HTML, or invented URLs',async()=>{
 for(const project of [{id:'project-1',title:'Injected Brand'},{id:'project-1',mockHtml:'<script>bad()</script>'},{id:'project-1',details:[{label:'Website',value:'https://invented-roadnest.app'}]}]){
  const {generatePortfolio,DEFAULT_GENERATION_MODEL}=harness().load('web/lib/generation.ts');let diagnostic;
  const result=await generatePortfolio({transcript},{apiKey:'test-placeholder-key',model:DEFAULT_GENERATION_MODEL,fetcher:async()=>envelope({projects:[project]}),onDiagnostic:value=>{diagnostic=value;}});
  assert.equal(diagnostic.outcome,'fallback');
  assert.equal(result.portfolio.projects['project-1'].title,'Roadnest');
  assert.doesNotMatch(JSON.stringify(result),/Injected Brand|invented-roadnest/);
 }
});

test('DeepSeek remains an explicit compact option with thinking disabled',async()=>{
 const {generatePortfolio}=harness().load('web/lib/generation.ts');let sent,diagnostic;
 await generatePortfolio({transcript},{apiKey:'test-placeholder-key',model:'deepseek-ai/DeepSeek-V3.2',fetcher:async(_,init)=>{sent=JSON.parse(init.body);return envelope({projects:[{id:'project-1',details:[{label:'Audience',value:'First-time buyers'}]}]});},onDiagnostic:value=>{diagnostic=value;}});
 assert.equal(sent.chat_template_kwargs.thinking,false);
 assert.equal(diagnostic.outcome,'model');
});

test('a fourth model highlight is trimmed to the existing three-slot portfolio instead of wasting a retry',async()=>{
 const {generatePortfolio,DEFAULT_GENERATION_MODEL}=harness().load('web/lib/generation.ts');let requests=0,diagnostic;
 const result=await generatePortfolio({transcript},{apiKey:'test-placeholder-key',model:DEFAULT_GENERATION_MODEL,fetcher:async()=>{requests++;return envelope({projects:[{id:'project-1',highlights:['Compares stock','Tracks prices','Saves searches','Books test drives'],stack:['Next.js','React','TypeScript','PostgreSQL','Tailwind CSS','Node.js','Redis']}]});},onDiagnostic:value=>{diagnostic=value;}});
 assert.equal(requests,1);
 assert.equal(diagnostic.outcome,'model');
 assert.equal(result.portfolio.projects['project-1'].highlights.length,3);
 assert.ok(result.portfolio.projects['project-1'].stack.length<=6);
});
