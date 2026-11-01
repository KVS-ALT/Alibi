const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {harness}=require('../tests/helpers/harness.cjs');
const root=path.resolve(__dirname,'..'),base=process.argv[2]||'http://127.0.0.1:3006';
const artifacts=path.resolve(root,'../../artifacts/ui-qa');
const policy=JSON.parse(fs.readFileSync(path.join(root,'ui-policy.json'),'utf8'));
const project={status:'ready',title:'Roadnest',category:'MARKETPLACE',year:2026,tagline:'Compare dealer stock and book a test drive.',summary:'A car marketplace that compares dealer inventory and puts price history beside each vehicle.',highlights:['Sends WhatsApp price-drop alerts','Books test drives with local dealers','Checks vehicle history before enquiry'],metrics:[{label:'listings',value:'146'},{label:'pilot dealers',value:'8'},{label:'search p95',value:'240 ms'}],stack:['Next.js','TypeScript','PostgreSQL'],details:[{label:'Audience',value:'Buyers comparing local dealer overstock'},{label:'Main workflow',value:'Compare inventory, save a search, and request a test drive'}],repo:'fabricated/example',commitGraph:[1,2,0,3,1,0,2]};
project.mockHtml=harness().load('web/lib/mock-designs.ts').renderDesignedProject(project,'project-1','left-sidebar-spacious');
const session={id:'static-mock-ui-fixture',slug:'static-mock-ui-fixture',url:'/p/static-mock-ui-fixture'};
(async()=>{
 const {checkPage}=await import('lintapple');fs.mkdirSync(artifacts,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
 try{for(const templateId of ['showcase','lowercase','geist'])for(const viewport of policy.viewports){
  const context=await browser.newContext({viewport,colorScheme:'light'}),page=await context.newPage();const errors=[],external=[],frames=[];let speechCalls=0;
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith(base))external.push(request.url());});
  await page.addInitScript(value=>{if(window.top===window)sessionStorage.setItem('portfolio.capture.session',JSON.stringify(value));},session);
  await page.route('**/api/live/config',route=>route.fulfill({json:{providers:{generation:{configured:true,enabled:true},speech:{configured:true,enabled:true}}}}));
  await page.route('**/api/sessions/**/speech/**',route=>{speechCalls++;return route.fulfill({status:503,json:{error:'No speech in static preview QA'}});});
  const portfolio={templateId,hero:{name:'Harsh Anand',handle:'harsh',roles:['student developer'],bio:'Building practical tools for comparing cars.',currently:['building Roadnest']},skills:['TypeScript'],projects:{'project-1':project},contradictions:[]};
  await page.route('**/api/sessions/static-mock-ui-fixture',route=>route.fulfill({json:{...session,portfolio,version:1,status:'ready',active:false}}));
  await page.goto(base);await page.getByRole('heading',{name:/Harsh Anand’s portfolio/i,exact:true}).waitFor();
  await page.locator('main article button[aria-expanded]').first().click();await page.getByText('Audience',{exact:true}).waitFor();
  const iframe=page.frameLocator('iframe').first();await iframe.locator('[data-mock-design]').waitFor();
  const frameStyle=await iframe.locator('[data-mock-design]').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,design:el.getAttribute('data-mock-design')}));
  assert.notEqual(frameStyle.background,'rgba(0, 0, 0, 0)');
  const frameMarkup=await page.locator('iframe').first().evaluate(el=>({sandbox:el.getAttribute('sandbox'),html:el.srcdoc,opacity:getComputedStyle(el).opacity}));
  assert.equal(frameMarkup.sandbox,'');assert.equal(frameMarkup.opacity,'1');assert.doesNotMatch(frameMarkup.html,/<script\b|https?:\/\//i);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  const body=await page.locator('body').innerText();assert.doesNotMatch(body,/\b[a-z0-9-]+\.app\b|fabricated\/example/i);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const report=await checkPage(page,policy);frames.push(frameStyle);
  await page.screenshot({path:path.join(artifacts,`static-mock-${templateId}-${viewport.width}.png`),fullPage:true});
  assert.equal(speechCalls,0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  results.push({templateId,viewport,frames,errors,external,speechCalls,findings:report.findings,suppressed:report.suppressed});await context.close();
 }}finally{await browser.close();}
 const output=path.join(artifacts,'static-mock-ui-report.json');fs.writeFileSync(output,JSON.stringify(results,null,2));console.log(JSON.stringify({output,states:results.map(row=>({template:row.templateId,width:row.viewport.width,findings:row.findings.length}))},null,2));
 if(results.some(row=>row.findings.length))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
