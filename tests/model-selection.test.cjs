const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers/harness.cjs');

test('DeepSeek receives the actual generation request and structured extra fields survive validation',async()=>{
 const h=harness(),{generatePortfolio}=h.load('web/lib/generation.ts');
 let sent,diagnostic;
 const output={claims:{speakerName:'Priya Shah',vibe:'showcase',skills:['TypeScript'],projects:[{id:'project-1',name:'Roadnest',saidAbout:['A car marketplace']}]},portfolio:{templateId:'showcase',hero:{name:'Priya Shah',handle:'priya',roles:['builder'],bio:'Builds a car marketplace.',currently:['building Roadnest']},skills:['TypeScript'],projects:{'project-1':{status:'ready',title:'Roadnest',category:'MARKETPLACE',year:2026,tagline:'Compare discounted cars.',summary:'A marketplace for comparing dealer stock.',highlights:['Compares stock','Tracks price drops','Saves searches'],metrics:[{label:'listings',value:'146'},{label:'test dealers',value:'8'},{label:'search',value:'240 ms'}],stack:['TypeScript'],details:[{label:'Target buyer',value:'First-time car buyers'},{label:'Inventory refresh',value:'Every 15 minutes'}]}},contradictions:[]}};
 const result=await generatePortfolio({transcript:"My name is Priya Shah. I built a car marketplace called Roadnest."},{apiKey:'test-placeholder-key',model:'deepseek-ai/DeepSeek-V3.2',fetcher:async(_,init)=>{sent=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]});},onDiagnostic:event=>{diagnostic=event;}});
 assert.equal(sent?.model,'deepseek-ai/DeepSeek-V3.2');
 assert.equal(sent?.chat_template_kwargs?.thinking,false);
 assert.equal(diagnostic.outcome,'model');
 assert.equal(result.portfolio.projects['project-1'].details[0].value,'First-time car buyers');
});
