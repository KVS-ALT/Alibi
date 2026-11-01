const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { harness } = require('../tests/helpers/harness.cjs');

const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(root, '../../artifacts/ui-qa');
const base = process.argv[2] || 'http://127.0.0.1:3006';
const policy = JSON.parse(fs.readFileSync(path.join(root, 'ui-policy.json'), 'utf8'));
const session = { id: 'silent-identity-fixture', slug: 'silent-identity-fixture', url: '/p/silent-identity-fixture' };
const h = harness();
const { createDraftPortfolio } = h.load('web/lib/draft.ts');
const { updateConversationIdentity } = h.load('web/lib/conversation-identity.ts');

let identity = updateConversationIdentity(undefined, { text: "I'm Harsh Anand." });
const intro = createDraftPortfolio("I'm Harsh Anand.", undefined, { builderName: identity.name });
const initialProject = createDraftPortfolio('I built a CAD review tool called Modelmate.', intro.portfolio, { builderName: identity.name, projectRegistry: intro.projectRegistry });
const project = createDraftPortfolio('Modelmate supports STEP export.', initialProject.portfolio, { builderName: identity.name, projectRegistry: initialProject.projectRegistry });
identity = updateConversationIdentity(identity, { text: 'Actually, my name is Harsha Anand.' });
const renamed = createDraftPortfolio('Actually, the CAD review tool is now called Draftcheck.', project.portfolio, { builderName: identity.name, projectRegistry: project.projectRegistry });
const projectId = Object.keys(project.portfolio.projects)[0];
assert.equal(intro.portfolio.hero?.name, 'Harsh Anand');
assert.equal(Object.keys(intro.portfolio.projects).length, 0);
assert.equal(project.portfolio.projects[projectId].title, 'Modelmate');
assert.equal(renamed.portfolio.projects[projectId].title, 'Draftcheck');
assert.equal(renamed.portfolio.hero.name, 'Harsha Anand');
assert.deepEqual(Object.keys(renamed.portfolio.projects), [projectId]);

(async () => {
  const { checkPage } = await import('lintapple');
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    for (const viewport of policy.viewports) {
      const context = await browser.newContext({ viewport, colorScheme: 'light' });
      const page = await context.newPage();
      const pageErrors = [], reports = [];
      let current = intro, version = 1, speechRequests = 0;
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.addInitScript(value => { if (window.top === window) sessionStorage.setItem('portfolio.capture.session', JSON.stringify(value)); }, session);
      await page.route('**/api/live/config', route => route.fulfill({ json: { providers: { generation: { configured: true, enabled: true }, speech: { configured: true, enabled: true } } } }));
      await page.route('**/api/sessions/**/speech/**', route => { speechRequests++; return route.fulfill({ status: 503, json: { error: 'No live speech in silent identity UI QA' } }); });
      await page.route('**/api/sessions/silent-identity-fixture', route => route.fulfill({ json: { ...session, portfolio: current.portfolio, version, status: 'ready', active: false } }));

      async function inspect(state, expectedName, expectedTitle) {
        await page.waitForFunction(name => document.querySelector('main h1')?.textContent.replace(/\s/g, '') === name.replace(/\s/g, ''), expectedName);
        await page.evaluate(async () => {
          document.body.getBoundingClientRect();
          await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
        });
        assert.equal(await page.locator('dialog, [role="dialog"], [aria-modal="true"]').count(), 0, `${state}: no dialogue/confirmation modal`);
        assert.equal(await page.locator('input, textarea, select').count(), 0, `${state}: no correction/confirmation input`);
        assert.equal(await page.getByText(/Is this a new project|Same project\?|Confirm project|Did you mean/i).count(), 0, `${state}: no AI questions`);
        const controls = await page.locator('section[aria-label="Microphone controls"] button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')).sort());
        assert.deepEqual(controls, ['Start microphone', 'Wipe portfolio and transcript'], `${state}: existing capture controls only`);
        assert.equal(await page.locator('main article').count(), expectedTitle ? 1 : 0, `${state}: exactly the supported portfolio projects`);
        assert.equal(await page.locator('main button').count(), expectedTitle ? 1 : 0, `${state}: no extra confirmation or correction controls`);
        if (expectedTitle) await page.getByRole('heading', { name: expectedTitle, exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${state}: no horizontal overflow`);
        const report = await checkPage(page, policy);
        reports.push({ state, projectIds: Object.keys(current.portfolio.projects), findings: report.findings, suppressed: report.suppressed });
        await page.screenshot({ path: path.join(artifacts, `silent-identity-${viewport.width}-${state}.png`), fullPage: true });
      }

      await page.goto(base);
      await inspect('introduction', 'Harsh Anand');
      assert.equal(await page.getByText('Your portfolio', { exact: true }).count(), 0);
      current = project; version++;
      await page.getByRole('heading', { name: 'Modelmate', exact: true }).waitFor();
      assert.equal(await page.getByText('Draftcheck', { exact: true }).count(), 0, 'future spoken rename must not appear early');
      assert.equal(await page.getByText('Counterflow', { exact: true }).count(), 0, 'recipe names must not leak into project identity');
      await inspect('project', 'Harsh Anand', 'Modelmate');
      await page.locator('main article button[aria-expanded]').click();
      await page.getByText('how it works', { exact: true }).waitFor();
      await page.getByText('Modelmate supports STEP export', { exact: true }).waitFor();
      await page.frameLocator('iframe').getByRole('heading', { name: 'Modelmate', exact: true }).waitFor();
      await inspect('expanded', 'Harsh Anand', 'Modelmate');
      current = renamed; version++;
      await page.getByRole('heading', { name: 'Draftcheck', exact: true }).waitFor();
      await inspect('spoken-rename', 'Harsha Anand', 'Draftcheck');
      assert.equal(await page.getByRole('heading', { name: 'Modelmate', exact: true }).count(), 0);
      await page.locator('main article button[aria-expanded]').click();
      assert.equal(await page.getByText('how it works', { exact: true }).count(), 0, 'existing project detail collapse still works');
      assert.equal(speechRequests, 0);
      assert.deepEqual(pageErrors, []);
      results.push({ viewport, speechRequests, pageErrors, reports });
      await context.close();
    }
  } finally { await browser.close(); }
  const output = path.join(artifacts, 'silent-identity-ui-report.json');
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ functional: 'passed', output, states: results.flatMap(result => result.reports.map(report => ({ width: result.viewport.width, state: report.state, findings: report.findings.length }))) }, null, 2));
  assert.equal(results.flatMap(result => result.reports.flatMap(report => report.findings)).length, 0, 'rendered UI findings remain');
})().catch(error => { console.error(error); process.exitCode = 1; });
