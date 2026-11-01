// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createBrief, generatePrototype } from '../../src/generation';
import { createProjectArchive, createProjectFiles, renderStandaloneHtml } from '../../src/export';
import { TEMPLATE_CATALOG } from '../../src/templates';
import { getTemplatePresentation } from '../../src/templates/presentation';
import type { UiSpec } from '../../src/contracts';

async function fixture(templateId = 'bakery'): Promise<UiSpec> {
  const brief = createBrief('export-session', 1, 'Create a bakery called Sunday Bread. Browse fresh sourdough and make a local demo enquiry.');
  const result = await generatePrototype({ sessionId: brief.sessionId, requestId: 'export-request', briefVersion: 1, brief }, { templateId });
  if (!('uiSpec' in result)) throw new Error(result.safeMessage);
  return result.uiSpec;
}

function open(spec: UiSpec) {
  const errors: Error[] = [];
  const console = new VirtualConsole();
  console.on('jsdomError', (error: Error) => errors.push(error));
  const dom = new JSDOM(renderStandaloneHtml(spec), { runScripts: 'dangerously', virtualConsole: console });
  expect(errors).toEqual([]);
  return dom;
}

describe('the exported project', () => {
  it('uses each of the twenty actual template layouts and shared authored copy', async () => {
    for (const template of TEMPLATE_CATALOG) {
      const spec = await fixture(template.id);
      const dom = open(spec), d = dom.window.document;
      expect(d.querySelector('.template-preview')?.classList.contains('layout-' + template.id), template.id).toBe(true);
      expect(d.querySelector('h1')?.textContent).toBe(getTemplatePresentation(spec).title);
      expect(d.querySelector('.template-brand')?.textContent).toContain('Sunday Bread');
      expect(d.querySelector('.template-art')?.classList.contains('art-' + template.id)).toBe(true);
      expect(d.querySelector('style')?.textContent).toContain(template.id === 'studio-booking' ? '.template-preview' : '.layout-' + template.id);
      dom.window.close();
    }
  });

  it('runs search, category filtering, page navigation, browser validation and local receipts', async () => {
    const dom = open(await fixture()), d = dom.window.document;
    expect(d.querySelectorAll('tbody tr')).toHaveLength(3);
    const select = d.querySelector('select')!;
    expect(select.value).toBe('');
    select.value = 'Featured';
    select.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    d.querySelector('form')!.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    expect(d.querySelectorAll('tbody tr')).toHaveLength(2);
    const search = d.querySelector('input[aria-label="Search demo items"]') as HTMLInputElement;
    search.value = 'Upcoming';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(d.querySelectorAll('tbody tr')).toHaveLength(1);
    (Array.from(d.querySelectorAll('nav button')).find(b => b.textContent === 'Get in touch') as HTMLButtonElement).click();
    expect(d.querySelector('.section-heading h2')?.textContent).toBe('Connect with Sunday Bread');
    const form = d.querySelector('form')!;
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    expect(d.querySelector('.form-success')).toBeNull();
    for (const [name, value] of [['visitor-name', 'Test Visitor'], ['visitor-email', 'visitor@example.test']]) {
      const input = form.querySelector('[name="' + name + '"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    expect(d.querySelector('.form-success')?.textContent).toMatch(/locally.*nothing was sent/i);
    (d.querySelector('.template-brand') as HTMLButtonElement).click();
    expect(d.querySelector('select')?.value).toBe('Featured');
    expect(d.querySelectorAll('tbody tr')).toHaveLength(1);
    dom.window.close();
  });

  it('keeps script terminators, template terminators and event handlers inert', async () => {
    const spec = await fixture();
    const hostile = '</script></template><img src=x onerror="window.pwned=1"><script>window.pwned=2</script>';
    const component = spec.screens[0].components.find(c => c.id === 'hero-title')!;
    if (component.type === 'text') component.properties.text = hostile;
    spec.demoData.listings[0].name = hostile;
    const dom = open(spec), d = dom.window.document;
    expect((dom.window as unknown as { pwned?: number }).pwned).toBeUndefined();
    expect(d.querySelector('h1')?.textContent).toBe(hostile);
    expect(d.querySelectorAll('img')).toHaveLength(0);
    expect(d.querySelector('tbody')?.textContent).toContain(hostile);
    expect(JSON.parse(d.getElementById('prototype-config')!.textContent!)).toEqual(spec);
    dom.window.close();
  });

  it('includes the actual renderer source, exact config, stylesheet, dependency manifest and handoff', async () => {
    const spec = await fixture(), files = createProjectFiles(spec);
    expect(JSON.parse(files['config.json'])).toEqual(spec);
    expect(JSON.parse(files['source/config.json'])).toEqual(spec);
    expect(files['source/src/ui/Preview.tsx']).toContain('export function Preview');
    expect(files['source/src/ui/preview.css']).toContain('.layout-bakery');
    expect(files['source/src/templates/presentation.ts']).toContain('getTemplatePresentation');
    expect(JSON.parse(files['source/package.json']).scripts).toHaveProperty('build');
    expect(files['README.md']).toMatch(/fresh|new.*session/i);
    expect(files['ROADMAP.md']).toMatch(/backend/i);
    expect(files['index.html']).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
  });

  it('extracts every ZIP member with its exact original UTF-8 content and valid CRC', async () => {
    const spec = await fixture(), expected = createProjectFiles(spec), archive = createProjectArchive(spec);
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength), decoder = new TextDecoder();
    const extracted: Record<string, string> = {};
    let offset = 0;
    while (view.getUint32(offset, true) === 0x04034b50) {
      const size = view.getUint32(offset + 18, true), nameSize = view.getUint16(offset + 26, true), extraSize = view.getUint16(offset + 28, true);
      const name = decoder.decode(archive.slice(offset + 30, offset + 30 + nameSize));
      const start = offset + 30 + nameSize + extraSize, bytes = archive.slice(start, start + size);
      let crc = 0xffffffff;
      for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
      expect(view.getUint32(offset + 14, true), name).toBe((crc ^ 0xffffffff) >>> 0);
      expect(name).not.toMatch(/(^\/|\.\.)/);
      extracted[name] = decoder.decode(bytes);
      offset = start + size;
    }
    expect(extracted).toEqual(expected);
    expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(archive.length - 12, true)).toBe(Object.keys(expected).length);
  });
});
