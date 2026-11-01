const test = require('node:test');
const assert = require('node:assert/strict');
const { Script } = require('node:vm');
const { demoModel, renderProjectDemo } = require('../web/lib/project-demo.cjs');

test('project demos choose a coherent product workflow instead of a feature checklist', () => {
  for (const [title, kind] of [['Car marketplace', 'market'], ['CAD design', 'studio'], ['Appointment booking', 'booking'], ['AI assistant', 'assistant'], ['Desk shop', 'market']]) {
    const project = { title, summary: 'A focused product', tagline: 'Build something useful' };
    assert.equal(demoModel(project).kind, kind);
    const html = renderProjectDemo(project);
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    assert.doesNotThrow(() => new Script(script));
    assert.ok(html.includes('aria-label="Product workspace"'));
    assert.ok(!html.includes('Complete</button>'));
  }
});

test('untrusted project text cannot escape the HTML or executable data boundary', () => {
  const html = renderProjectDemo({ title: '</script><script>alert(1)</script>', summary: '<img src=x onerror=alert(1)>', tagline: 'test' });
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.ok(!html.includes('<img src=x'));
  assert.doesNotThrow(() => new Script(html.match(/<script>([\s\S]*)<\/script>/)[1]));
});
