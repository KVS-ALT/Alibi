const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
 const { checkPage } = await import('lintapple');
 const policy = JSON.parse(fs.readFileSync('ui-policy.json', 'utf8'));
 const browser = await chromium.launch({channel:'chrome',headless:true});
 const results=[];
 try {
 for (const viewport of policy.viewports) {
  const page=await browser.newPage({viewport});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:3012';
  const data=await (await page.request.get(base+'/api/p/demo-backup')).json();
  const id=Object.keys(data.portfolio.projects)[0];
  await page.goto(base+'/p/demo-backup/project/'+encodeURIComponent(id));
  await page.getByRole('heading',{level:1}).waitFor();
  const inspect=async state=>{const report=await checkPage(page,policy);results.push({viewport,state,report});};
  await inspect('workspace');
  await page.getByLabel('New item',{exact:true}).fill('QA saved task');
  await page.getByRole('button',{name:'Add item',exact:true}).click();
  await page.getByRole('button',{name:'Complete QA saved task',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Reopen QA saved task',exact:true}).waitFor();
  await page.getByLabel('Search items').fill('no match exists');
  await page.getByText('No matching items.',{exact:true}).waitFor();
  await inspect('empty search');
  await page.getByRole('button',{name:'Product preview',exact:true}).click();
  await page.locator('iframe').waitFor();
  await page.waitForTimeout(500);
  assert.ok(await page.frameLocator('iframe').locator('body').innerText());
  await inspect('preview');
  await page.getByRole('button',{name:'About',exact:true}).click();
  await inspect('about');
  await page.screenshot({path:`ui-qa/project-${viewport.width}.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.close();
 }
 assert.equal((await (await browser.newPage()).request.get('http://127.0.0.1:3012/p/no-such-portfolio/project/no-project')).status(),404);
 fs.mkdirSync('ui-qa',{recursive:true});fs.writeFileSync('ui-qa/project-apps.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(({viewport,state,report})=>({viewport,state,report})),null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

