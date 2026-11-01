const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { harness } = require('../tests/helpers/harness.cjs');

const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(root, '../../artifacts/ui-qa');
const base = process.argv[2] || 'http://127.0.0.1:3005';
const policy = JSON.parse(fs.readFileSync(path.join(root, 'ui-policy.json'), 'utf8'));
const session = { id: 'wipe-ui-fixture', slug: 'wipe-ui-fixture', url: '/p/wipe-ui-fixture' };
const portfolio = {
  templateId: 'showcase',
  hero: { name: 'Sam Rivera', handle: 'samrivera', roles: ['student developer'], bio: 'Building practical tools for finding a better car.', currently: ['building Lotline'] },
  skills: ['TypeScript', 'PostgreSQL'], contradictions: [],
  projects: { lotline: { status: 'ready', title: 'Lotline', category: 'MARKETPLACE', year: 2026,
    tagline: 'Find dealer-overstock cars below the usual asking price.',
    summary: 'A searchable car marketplace with saved searches and vehicle price history.',
    highlights: ['Deduplicated inventory by VIN', 'Built price-drop alerts', 'Added vehicle-history checks'],
    metrics: [{ label: 'listings', value: '146' }, { label: 'pilot dealers', value: '8' }, { label: 'search p95', value: '240 ms' }],
    stack: ['Next.js', 'TypeScript', 'PostgreSQL'],
  } },
};
portfolio.projects.lotline.mockHtml = harness().load('web/lib/draft.ts').renderProjectMock(portfolio.projects.lotline);

(async () => {
  const { checkPage } = await import('lintapple');
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const viewport of policy.viewports) {
      portfolio.templateId = 'showcase';
      const context = await browser.newContext({ viewport, colorScheme: 'light' });
      const page = await context.newPage();
      const pageErrors = [], reports = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      let deleted = false, deleteAttempts = 0, holdPoll = false, heldRoute, pendingCreate, speechRequests = 0;
      await page.route('**/api/live/config', route => route.fulfill({ json: { providers: { generation: { configured: true, enabled: true }, speech: { configured: true, enabled: true } } } }));
      await page.route('**/api/sessions/**/speech/**', route => { speechRequests++; return route.fulfill({ status: 503, json: { error: 'No live speech in UI QA' } }); });
      await page.route('**/api/sessions', route => { pendingCreate = route; });
      await page.route('**/api/sessions/wipe-ui-fixture', async route => {
        if (route.request().method() === 'DELETE') {
          deleteAttempts++;
          if (deleteAttempts === 1) return route.fulfill({ status: 503, json: { error: { message: 'Could not wipe this session. Recording is stopped; try Wipe again.' } } });
          deleted = true;
          return route.fulfill({ status: 204, body: '' });
        }
        if (holdPoll && !heldRoute) { heldRoute = route; return; }
        return route.fulfill({ status: deleted ? 404 : 200, json: deleted ? { error: 'gone' } : { ...session, portfolio, version: 1, status: 'building' } });
      });
      async function inspect(state) {
        await page.evaluate(async () => {
          document.body.getBoundingClientRect();
          await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        });
        await page.screenshot({ path: path.join(artifacts, `microphone-wipe-${viewport.width}-${state}.png`), fullPage: true });
        const report = await checkPage(page, policy);
        reports.push({ state, findings: report.findings, suppressed: report.suppressed });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${state}: horizontal overflow`);
      }
      await page.goto(base);
      await page.getByRole('button', { name: 'Start microphone', exact: true }).waitFor({ state: 'visible' });
      await inspect('empty');
      assert.equal(await page.getByRole('button', { name: 'Wipe portfolio and transcript' }).isDisabled(), true);
      await page.waitForFunction(() => !document.querySelector('button[aria-label="Start microphone"]').disabled);
      await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('button[aria-label="Wipe portfolio and transcript"]').disabled);
      assert.ok(pendingCreate);
      await page.getByRole('button', { name: 'Wipe portfolio and transcript' }).click();
      await pendingCreate.fulfill({ status: 201, json: { ...session, providers: { speech: { enabled: true } } } }).catch(() => {});
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('portfolio.capture.session')), null, 'late create response must not resurrect a wiped session');
      await inspect('creation-cancelled');
      await page.evaluate(value => sessionStorage.setItem('portfolio.capture.session', JSON.stringify(value)), session);
      await page.reload();
      await page.getByRole('heading', { name: 'Lotline', exact: true }).waitFor();
      await page.frameLocator('iframe').getByRole('heading', { name: 'Lotline', exact: true }).waitFor();
      await inspect('populated');
      await page.getByRole('button', { name: /Lotline.*MARKETPLACE/ }).click();
      await page.getByText('how it works', { exact: true }).waitFor();
      await inspect('expanded');
      holdPoll = true;
      await page.waitForTimeout(650);
      assert.ok(heldRoute, 'fixture must leave an old poll in flight before Wipe');
      await page.getByRole('button', { name: 'Wipe portfolio and transcript' }).click();
      await page.getByRole('alert').filter({ hasText: 'Could not wipe' }).waitFor();
      assert.equal(await page.getByRole('heading', { name: 'Lotline', exact: true }).count(), 1, 'failed DELETE keeps result recoverable');
      assert.equal(await page.getByRole('button', { name: 'Start microphone', exact: true }).isDisabled(), true, 'cannot start a tombstoned session while Wipe needs retry');
      assert.notEqual(await page.evaluate(() => sessionStorage.getItem('portfolio.capture.session')), null, 'failed wipe keeps the session reference for retry');
      await inspect('wipe-error');
      await page.getByRole('button', { name: 'Wipe portfolio and transcript' }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Lotline', exact: true }).waitFor({ state: 'detached' });
      if (heldRoute) await heldRoute.fulfill({ json: { ...session, portfolio, version: 9, status: 'ready' } }).catch(() => {});
      await page.waitForTimeout(650);
      assert.equal(await page.getByRole('heading', { name: 'Lotline', exact: true }).count(), 0, 'late poll cannot resurrect wiped portfolio');
      assert.equal(await page.evaluate(() => sessionStorage.getItem('portfolio.capture.session')), null);
      assert.equal(deleteAttempts, 2);
      assert.equal(speechRequests, 0);
      assert.deepEqual(pageErrors, []);
      await inspect('wiped');
      for (const template of process.env.SKIP_ALTERNATE_TEMPLATES === 'true' ? [] : ['lowercase', 'geist']) {
        portfolio.templateId = template; deleted = false; holdPoll = false; heldRoute = undefined;
        await page.evaluate(value => sessionStorage.setItem('portfolio.capture.session', JSON.stringify(value)), session);
        await page.reload();
        await page.getByRole('heading', { name: /^lotline$/i }).waitFor();
        await inspect(`${template}-collapsed`);
        await page.locator('button[aria-expanded]').first().click();
        await page.getByText('how it works', { exact: true }).waitFor();
        await page.frameLocator('iframe').getByRole('heading', { name: 'Lotline', exact: true }).waitFor();
        await inspect(`${template}-expanded`);
        await page.locator('button[aria-expanded]').first().click();
        assert.equal(await page.getByText('how it works', { exact: true }).count(), 0, `${template}: closed details leave the accessibility tree`);
      }
      results.push({ viewport, deleteAttempts, speechRequests, pageErrors, reports });
      await context.close();
    }
  } finally { await browser.close(); }
  const output = path.join(artifacts, process.env.SKIP_ALTERNATE_TEMPLATES === 'true' ? 'microphone-wipe-main-ui-report.json' : 'microphone-wipe-ui-report.json');
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ functional: 'passed', output, states: results.flatMap(result => result.reports.map(report => ({ width: result.viewport.width, state: report.state, findings: report.findings.length, rules: [...new Set(report.findings.map(item => item.rule))] }))) }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
