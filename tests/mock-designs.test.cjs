const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers/harness.cjs');
const catalog=()=>harness().load('web/lib/mock-designs.ts');
const project={status:'ready',title:'Roadnest',category:'MARKETPLACE',year:2026,tagline:'Compare dealer inventory and book a test drive.',summary:'A car marketplace with price comparisons and saved searches.',highlights:['VIN matching','Price alerts','Test drive bookings'],metrics:[{label:'listings',value:'146'},{label:'dealers',value:'8'},{label:'search p95',value:'240 ms'}],stack:['TypeScript','PostgreSQL']};

test('catalog contains 100 designs across 25 distinct layout families and four structural modes',()=>{
 const {MOCK_DESIGNS}=catalog();
 assert.equal(MOCK_DESIGNS.length,100);
 assert.equal(new Set(MOCK_DESIGNS.map(design=>design.id)).size,100);
 assert.equal(new Set(MOCK_DESIGNS.map(design=>design.family)).size,25);
 assert.equal(new Set(MOCK_DESIGNS.map(design=>design.mode)).size,4);
 assert.ok(MOCK_DESIGNS.some(design=>/industrial/i.test(design.name)));
 assert.ok(MOCK_DESIGNS.some(design=>/sidebar/i.test(design.family)));
});

test('every design renders distinct static structure with project-specific content and no network dependency',()=>{
 const {MOCK_DESIGNS,renderDesignedProject}=catalog();
 const signatures=new Set();
 for(const design of MOCK_DESIGNS){
  const html=renderDesignedProject(project,'stable-project',design.id);
  assert.match(html,/h-full/);
  assert.match(html,/<h1\b/,'every mock has a real primary project heading');
  assert.match(html,/Roadnest/);
  assert.match(html,/146/);
  assert.match(html,/VIN matching|Price alerts|Test drive bookings/);
  assert.doesNotMatch(html,/<\s*(script|iframe|svg|img|object|embed|link|form|input)\b|\s(?:on\w+|src|href)\s*=|https?:|javascript:|@import|url\s*\(/i);
  signatures.add((html.match(/<\/?[a-z][a-z0-9-]*/gi)||[]).join('|'));
 }
 assert.equal(signatures.size,100,'variation must change structure rather than only preset IDs or colors');
});

test('stable project identity keeps its design through renames and content updates',()=>{
 const {getMockDesign}=catalog();
 const original=getMockDesign(project,'project-7').id;
 const renamed=getMockDesign({...project,title:'Motorlane',summary:'A new spoken summary.'},'project-7').id;
 assert.equal(renamed,original);
 assert.ok(new Set(Array.from({length:30},(_,index)=>getMockDesign(project,'project-'+index).id)).size>=15);
 const firstThree=['project-1','project-2','project-3'].map(id=>getMockDesign(project,id));
 assert.equal(new Set(firstThree.map(design=>design.family)).size,3);
 assert.equal(new Set(firstThree.map(design=>design.theme)).size,3);
});

test('all untrusted data remains inert and never becomes CSS, attributes, or markup',()=>{
 const {renderDesignedProject}=catalog();
 const malicious={...project,title:'<img src=x onerror=alert(1)>',tagline:'<script>alert(2)</script>',summary:'" style="background:url(https://evil.test)"',highlights:['<iframe src=x>','<svg onload=alert(3)>','Normal'],metrics:[{label:'<b>metric</b>',value:'<script>x</script>'}],stack:['<img src=x>']};
 const html=renderDesignedProject(malicious,'project-safe','industrial-ledger-compact');
 assert.doesNotMatch(html,/<(?:img|script|iframe|svg)\b|<[^>]+\sonerror\s*=/i);
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;script/);
});
