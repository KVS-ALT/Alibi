const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/harness.cjs');

test('missing Workflow configuration fails closed before any remote work', async () => {
  let started = false;
  const h = harness({ '@renderinc/sdk': { Render: class { constructor() { started = true; } } } });
  await assert.rejects(h.load('web/lib/workflow-generation.ts').generateViaWorkflow({ transcript: 'Synthetic test' }), /required/);
  assert.equal(started, false);
});

test('Workflow dispatch strips the signal from retained input and rejects failed runs', async () => {
  const signal = new AbortController().signal;
  let received;
  const h = harness({ '@renderinc/sdk': { Render: class { workflows = { async startTask(...args) { received = args; return { async get() { return { status: 'failed' }; } }; } }; } } }, { RENDER_API_KEY: 'synthetic', RENDER_BUILD_TASK: 'alibi-workflows/buildPortfolio' });
  await assert.rejects(h.load('web/lib/workflow-generation.ts').generateViaWorkflow({ transcript: 'Synthetic test', signal }), /did not complete/);
  assert.equal(received[0], 'alibi-workflows/buildPortfolio');
  assert.equal(received[1][0].transcript, 'Synthetic test');
  assert.equal('signal' in received[1][0], false);
  assert.equal(received[2], signal);
});
