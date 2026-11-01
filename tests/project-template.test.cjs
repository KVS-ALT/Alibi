const test = require('node:test');
const assert = require('node:assert/strict');
const { renderProjectTemplate } = require('../web/lib/project-template.cjs');
const { harness } = require('./helpers/harness.cjs');

test('the project page is its authored template without a description or checklist wrapper', () => {
  const project = { title: 'Studio', tagline: 'A focused workspace for Studio.', summary: 'A prototype with saved results and review history.', highlights: ['Tested the main workflow with a small pilot group'], mockHtml: '<div data-kit="dashboard"><main><h1>Overview</h1><p>A prototype with saved results and review history.</p><span>Assembly revision</span></main></div>' };
  const html = renderProjectTemplate(project);
  assert.ok(html.includes('<body><div data-kit="dashboard">'));
  assert.ok(html.includes('Assembly revision'));
  assert.ok(!html.includes(project.summary));
  assert.ok(!html.includes('Add item'));
  assert.ok(!html.includes('About Studio'));
  assert.ok(html.includes("script-src 'nonce-"));
});

test('new template specs use product labels instead of portfolio descriptions', () => {
  const { mockSpecForProject } = harness().load('web/lib/mock-kits.ts');
  const spec = mockSpecForProject({ title: 'Studio', category: 'CAD', tagline: 'A focused workspace for Studio.', summary: 'A prototype with saved results.', highlights: ['Tested with a pilot group'], metrics: [], details: [] });
  assert.equal(spec.heading, 'Overview');
  assert.equal(spec.callout, '');
  assert.ok(spec.items.every(item => item.subtitle === ''));
});
