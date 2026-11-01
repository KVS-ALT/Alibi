const fs=require('node:fs');
const {parseEnv}=require('node:util');
const {harness}=require('../tests/helpers/harness.cjs');

(async()=>{
 if(!process.argv[2])throw new Error('Pass the path to the existing local provider environment file.');
 const env=parseEnv(fs.readFileSync(process.argv[2],'utf8'));
 const {generatePortfolio,DEFAULT_GENERATION_MODEL}=harness({}, {}, {realTimers:true}).load('web/lib/generation.ts');
 const started=Date.now(),diagnostics=[];let draftMs,requests=0;
 const result=await generatePortfolio({transcript:"Hey, my name's Priya Shah. I'm building a car marketplace called Roadnest. It also sends price-drop alerts. Users can book test drives. We compare dealer overstock for first-time buyers."},{
  apiKey:env.FEATHERLESS_API_KEY,model:process.argv[3]||DEFAULT_GENERATION_MODEL,
  fetcher:async(input,init)=>{requests++;return fetch(input,init);},
  onDraft:()=>{draftMs=Date.now()-started;},onDiagnostic:event=>diagnostics.push(event),
 });
 console.log(JSON.stringify({model:process.argv[3]||DEFAULT_GENERATION_MODEL,draftMs,totalMs:Date.now()-started,requests,name:result.portfolio.hero?.name,projects:Object.values(result.portfolio.projects).map(project=>({title:project.title,details:project.details?.length??0})),diagnostics}));
})().catch(error=>{console.error(JSON.stringify({error:error.name}));process.exitCode=1;});
