// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import * as jsdomRuntime from 'jsdom';
import { createBrief, generatePrototype } from '../../src/generation';
import { createProjectFiles } from '../../src/export';
import { TEMPLATE_CATALOG } from '../../src/templates';
import type { UiSpec } from '../../src/contracts';

async function fixture(templateId: string) {
  const brief = createBrief('plain-export-session', 1, 'Create a useful concept called Everyday. Use synthetic example data.');
  const generated = await generatePrototype({ sessionId: brief.sessionId, requestId: 'plain-export-request', briefVersion: 1, brief }, { templateId });
  if (!('uiSpec' in generated)) throw new Error(generated.safeMessage);
  return generated.uiSpec;
}

/** Only these two in-memory local files may load. No network transport exists. */
async function openProject(spec: UiSpec) {
  const files = createProjectFiles(spec), requests: string[] = [], errors: Error[] = [];
  // The installed jsdom runtime exposes the legacy loader; installed v30 types
  // describe its newer dispatcher replacement. Keep this bridge test-local.
  const ResourceLoader = (jsdomRuntime as unknown as { ResourceLoader: new () => object }).ResourceLoader;
  class LocalFiles extends ResourceLoader {
    fetch(url: string) {
      requests.push(url);
      const source = url === 'file:///plain-export/styles.css' ? files['styles.css'] : url === 'file:///plain-export/app.js' ? files['app.js'] : undefined;
      if (source === undefined) throw new Error('Unexpected resource: ' + url);
      return Object.assign(Promise.resolve(Buffer.from(source)), { abort() {} });
    }
  }
  const console = new VirtualConsole();
  console.on('jsdomError', (error: Error) => errors.push(error));
  const resources = new LocalFiles() as unknown as NonNullable<ConstructorParameters<typeof JSDOM>[1]>['resources'];
  const dom = new JSDOM(files['index.html'], { url: 'file:///plain-export/index.html', runScripts: 'dangerously', resources, virtualConsole: console });
  await new Promise<void>(resolve => dom.window.document.readyState === 'complete' ? resolve() : dom.window.addEventListener('load', () => resolve(), { once: true }));
  expect(errors).toEqual([]);
  return { dom, files, requests };
}

describe('plain source project', () => {
  it('contains editable HTML/CSS/JavaScript and configuration without framework or build dependencies', async () => {
    const spec = await fixture('bakery'), files = createProjectFiles(spec);
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['index.html', 'styles.css', 'app.js', 'configuration.json', 'README.md', 'ROADMAP.md', 'standalone.html']));
    expect(Object.keys(files).some(path => /package\.json|vite|\.tsx?$|node_modules|^source\//.test(path))).toBe(false);
    expect(JSON.parse(files['configuration.json'])).toEqual(spec);
    expect(files['styles.css']).toContain('.layout-bakery');
    expect(files['app.js']).not.toMatch(/\bimport\s|\brequire\s*\(|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|createRoot|ReactDOM/);
    expect(files['index.html']).toContain('href="./styles.css"');
    expect(files['index.html']).toContain('src="./app.js"');
    expect(files['index.html']).not.toMatch(/type="module"|https?:\/\//);
    expect(files['standalone.html']).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
    expect(files['README.md']).toMatch(/no.*build|without.*build/i);
    expect(files['README.md']).toMatch(/not connected|no.*database/i);
  });

  it('executes local files, filters, navigation and validated domain submissions for all twenty scenarios', async () => {
    for (const template of TEMPLATE_CATALOG) {
      const spec = await fixture(template.id), { dom, requests } = await openProject(spec), d = dom.window.document;
      expect(requests).toEqual(['file:///plain-export/styles.css', 'file:///plain-export/app.js']);
      expect(d.querySelector('.template-preview')?.classList.contains('layout-' + template.id), template.id).toBe(true);
      expect(d.querySelectorAll('tbody tr')).toHaveLength(spec.demoData.listings.length);
      const category = String(spec.demoData.listings[0].category), select = d.querySelector('select')!;
      select.value = category;
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      d.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      expect(d.querySelectorAll('tbody tr')).toHaveLength(spec.demoData.listings.filter(row => row.category === category).length);
      (d.querySelector('.content-nav button:last-child') as HTMLButtonElement).click();
      expect(d.querySelector('.section-heading h2')?.textContent).toBe(spec.screens[1].title);
      const form = d.querySelector('form')!;
      form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      expect(Boolean(d.querySelector('.form-success'))).toBe(false);
      for (const input of Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'))) {
        input.value = input.tagName === 'SELECT' ? (input as HTMLSelectElement).options[1].value : input.type === 'email' ? 'visitor@example.test' : input.type === 'date' ? '2026-12-01' : input.type === 'number' ? '1' : 'Demo visitor';
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      }
      form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      expect(d.querySelector('.form-success')?.textContent, template.id).toMatch(/locally.*nothing was sent/i);
      dom.window.close();
    }
  }, 20000);

  it('keeps hostile copy inert when the actual separate JavaScript file runs', async () => {
    const spec = await fixture('portfolio'), hostile = '</script></template><img src=x onerror="window.pwned=1"><script>window.pwned=2</script>';
    const hero = spec.screens[0].components.find(component => component.id === 'hero-title')!;
    if (hero.type === 'text') hero.properties.text = hostile;
    const { dom, files } = await openProject(spec), d = dom.window.document;
    expect((dom.window as unknown as { pwned?: number }).pwned).toBeUndefined();
    expect(d.querySelector('h1')?.textContent).toBe(hostile);
    expect(d.querySelectorAll('img')).toHaveLength(0);
    expect(JSON.parse(files['configuration.json'])).toEqual(spec);
    expect(JSON.parse(d.querySelector('script[type="application/json"]')!.textContent!)).toEqual(spec);
    dom.window.close();
  });
});
