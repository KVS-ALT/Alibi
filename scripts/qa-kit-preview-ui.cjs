const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base=process.argv[2]||'http://127.0.0.1:3006';
const artifacts=path.resolve(root,'../../artifacts/ui-qa');
const policy=JSON.parse(fs.readFileSync(path.join(root,'ui-policy.json'),'utf8'));
(async()=>{
 const {checkPage}=await import('lintapple');fs.mkdirSync(artifacts,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
 try{for(const viewport of policy.viewports){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base))external.push(r.url());});
  await page.goto(base+'/preview/kits');await page.getByRole('heading',{name:'Mock UI kits',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('iframe').length===12);
  assert.equal(await page.locator('main h2').count(),12);
  const frames=[];
  for(const frame of page.frames().filter(f=>f.parentFrame())){
   await frame.locator('[data-kit]').waitFor();
   frames.push(await frame.locator('[data-kit]').evaluate(el=>({kit:el.getAttribute('data-kit'),background:getComputedStyle(el).backgroundColor,width:el.getBoundingClientRect().width})));
  }
  assert.equal(frames.length,12);assert.equal(new Set(frames.map(f=>f.kit)).size,6);
  assert.ok(frames.every(f=>f.width===960));
  for(const element of await page.locator('iframe').all()){
   const state=await element.evaluate(el=>({sandbox:el.getAttribute('sandbox'),html:el.srcdoc,opacity:getComputedStyle(el).opacity}));
   assert.equal(state.sandbox,'');assert.equal(state.opacity,'1');assert.doesNotMatch(state.html,/<script\b|https?:\/\//i);
  }
  assert.doesNotMatch(await page.locator('body').innerText(),/\b[\w-]+\.app\b/i);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(let index=0;index<12;index++){const section=page.locator('main section').nth(index);await section.scrollIntoViewIfNeeded();await section.screenshot({path:path.join(artifacts,`kit-shot-${viewport.width}-${index}.png`)});}
  const report=process.argv.includes('--shots-only')?{findings:[],suppressed:[]}:await checkPage(page,policy);
  await page.screenshot({path:path.join(artifacts,`kit-preview-${viewport.width}.png`),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  results.push({viewport,frames,errors,external,findings:report.findings,suppressed:report.suppressed});await context.close();
 }}finally{await browser.close();}
 const output=path.join(artifacts,process.argv.includes('--shots-only')?'kit-paint-check-report.json':'kit-preview-ui-report.json');fs.writeFileSync(output,JSON.stringify(results,null,2));
 console.log(JSON.stringify({output,states:results.map(r=>({width:r.viewport.width,previews:r.frames.length,findings:r.findings.length}))},null,2));
 if(results.some(r=>r.findings.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
