const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');
const api = () => harness().load('web/lib/mock-kits.ts');
const project = { status:'ready', title:'Roadnest', category:'MARKETPLACE', year:2026, tagline:'Compare dealer inventory', summary:'A car marketplace with saved searches.', highlights:['VIN matching','Price alerts','Test drive bookings'], metrics:[{label:'listings',value:'146'},{label:'dealers',value:'8'},{label:'search p95',value:'240 ms'}], stack:['TypeScript'], details:[{label:'Workflow',value:'Compare prices before booking a test drive'}] };

test('all six original kits include compiled layout and accent CSS with no scripts or network', () => {
  const { KITS, ACCENTS, mockSpecForProject, renderMock } = api();
  assert.equal(KITS.length, 6);
  for(const kit of KITS) for(const accent of ACCENTS) {
    const html = renderMock({...mockSpecForProject(project), kit, accent});
    assert.match(html, new RegExp(`data-kit="${kit}" data-accent="${accent}"`));
    assert.match(html, /\.flex\{display:flex\}/);
    assert.match(html, /grid-template-columns/);
    assert.match(html, /Roadnest/);
    assert.doesNotMatch(html, /<\s*(?:script|iframe|svg|img|link|object|embed)\b|\s(?:src|href|on\w+)\s*=|https?:|javascript:|@import|url\(/i);
  }
});

test('platform evidence selects the matching hand-built kit', () => {
  const { mockSpecForProject } = api();
  for(const [context,kit] of [['An iOS mobile app','phone'],['A Discord bot','chat'],['A developer SDK','terminal'],['A Chrome extension','extension'],['A marketplace','cards']]) assert.equal(mockSpecForProject(project,context).kit,kit);
  assert.equal(mockSpecForProject({...project,title:'Library inventory',category:'OPERATIONS',summary:'Tracks library loans',tagline:'Manage book returns',highlights:[],details:[]},'').kit,'dashboard');
});

test('project facts populate bounded fields without leaking sample brands or inventing URLs', () => {
  const { mockSpecForProject, renderMock } = api();
  const spec = mockSpecForProject(project,'','stable-identity');
  assert.equal(spec.appName, 'Roadnest');
  assert.equal(spec.stats[0].value, '146');
  assert.match(spec.items[0].subtitle,/Compare prices/);
  assert.match(spec.items[0].title,/hatchback/);
  assert.doesNotMatch(renderMock(spec),/shipit|studymatch|uw-robotics|https?:|\.com\b/);
  assert.equal(spec.accent,mockSpecForProject({...project,title:'Renamed'},'','stable-identity').accent);
  assert.ok(mockSpecForProject({...project,title:'x'.repeat(300)}).appName.length<=24);
});

test('untrusted project content stays escaped across every kit', () => {
  const { KITS, mockSpecForProject, renderMock } = api();
  const payload = '<script>alert(1)</script>"';
  const spec = mockSpecForProject({...project,title:payload,tagline:payload,summary:payload,highlights:[payload],details:[]});
  for(const kit of KITS) {
    const html = renderMock({...spec,kit});
    assert.doesNotMatch(html,/<script|<img|onerror\s*=/i);
    assert.match(html,/&lt;script&gt;/);
  }
  const invalid = renderMock({...spec,kit:'<script>',accent:'" onload="oops'});
  assert.match(invalid,/data-kit="dashboard" data-accent="indigo"/);
});
