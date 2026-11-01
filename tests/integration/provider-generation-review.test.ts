// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createBrief, generatePrototype } from '../../src/generation';
import { createOpenAIProvider } from '../../src/generation/provider';
import { createProjectFiles, renderStandaloneHtml } from '../../src/export';

const secret = 'synthetic-review-ai-secret';
const input = () => ({ sessionId: 'review-owner', requestId: 'review-request', briefVersion: 1, brief: createBrief('review-owner', 1, 'Create a bakery called Morning Bread.') });

describe('independent generation-to-export boundaries', () => {
  it('keeps model-authored script and template closures inert through the actual runnable export', async () => {
    const request = input();
    const baseline = await generatePrototype(request, { templateId: 'bakery' });
    if (!('uiSpec' in baseline)) throw new Error('Invalid fixture');
    const hostile = '</template><script>window.reviewExecuted=true</script><img src=x onerror="window.reviewExecuted=true">';
    const draft = {
      templateId: 'bakery',
      brief: { purpose: 'A fictional bakery', audience: 'Local visitors', requirements: [], style: [], unknowns: [] },
      content: {
        brand: 'Morning Bread', headline: hostile, description: hostile,
        cards: baseline.uiSpec.screens.flatMap(screen => screen.components).filter(component => component.type === 'card').map(component => ({ id: component.id, title: hostile, body: hostile })),
        rows: baseline.uiSpec.demoData.listings.map(row => ({ cells: Object.values({ ...row, item: hostile + row.item }).map(String) })),
      },
      structure: { sections: ['overview', 'collection', 'filter', 'primary-action', 'form'], extraSections: [{ kind: 'text', title: 'Review information', body: hostile }] },
      form: { fieldOverrides: [], extraFields: [{ type: 'select', label: hostile, required: true, options: ['One', 'Two'] }], submitLabel: 'Save demo request' },
      style: { palette: 'warm', layout: 'stacked', typography: 'sans', density: 'compact' },
    };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] })));
    const generated = await createOpenAIProvider({ enabled: true, apiKey: secret, transport }).generate(request, { templateId: 'bakery' });
    if (!('uiSpec' in generated)) throw new Error(generated.safeMessage);
    const html = renderStandaloneHtml(generated.uiSpec);
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://offline.example.test/' });
    try {
      expect(dom.window.reviewExecuted).toBeUndefined();
      expect(dom.window.document.querySelectorAll('[onerror]')).toHaveLength(0);
      expect(dom.window.document.querySelector('h1')?.textContent).toBe(hostile);
      expect(dom.window.document.querySelectorAll('table tbody tr')).toHaveLength(3);
      expect(dom.window.document.querySelector('.template-preview')?.classList.contains('presentation-palette-warm')).toBe(true);
      expect(dom.window.getComputedStyle(dom.window.document.querySelector('.template-preview')!).backgroundColor).toBe('rgb(255, 247, 237)');
      expect(dom.window.getComputedStyle(dom.window.document.querySelector('.template-hero')!).display).toBe('flex');
      expect([...dom.window.document.querySelectorAll('.content-text')].map(node => node.textContent)).not.toContain('warm');
      const extraField = generated.uiSpec.screens.flatMap(screen => screen.components).filter(component => component.type === 'form').flatMap(component => component.properties.fields).find(field => field.id === 'generated-field-0');
      expect(extraField).toMatchObject({ type: 'select', label: hostile, required: true, options: ['One', 'Two'] });
      const files = createProjectFiles(generated.uiSpec);
      expect(JSON.stringify(files)).not.toContain(secret);
      expect(JSON.stringify(files)).not.toContain('Authorization');
      expect(JSON.parse(files['config.json'])).toEqual(generated.uiSpec);
    } finally { dom.window.close(); }
  });

  it('allows model-selected layout changes while removing every reference to an omitted form screen', async () => {
    const request = input();
    const baseline = await generatePrototype(request, { templateId: 'fitness' });
    if (!('uiSpec' in baseline)) throw new Error('Invalid fixture');
    const draft = {
      templateId: 'fitness', brief: { purpose: 'A fitness concept', audience: 'Local visitors', requirements: [], style: [], unknowns: [] },
      content: { brand: 'Model chosen fitness', headline: 'Move together', description: 'A fictional fitness concept.', cards: [], rows: baseline.uiSpec.demoData.listings.map(row => ({ cells: Object.values(row).map(String) })) },
      structure: { sections: ['overview'], extraSections: [] },
      form: { fieldOverrides: [], extraFields: [], submitLabel: 'Save demo request' },
      style: { palette: 'template', layout: 'template', typography: 'template', density: 'template' },
    };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] })));
    const generated = await createOpenAIProvider({ enabled: true, apiKey: secret, transport }).generate(request);
    if (!('uiSpec' in generated)) throw new Error(generated.safeMessage);
    expect(generated.uiSpec.templateId).toBe('fitness');
    expect(generated.uiSpec.screens).toHaveLength(1);
    expect(generated.uiSpec.screens[0].components.some(component => component.type === 'form' || component.type === 'table')).toBe(false);
    for (const component of generated.uiSpec.screens[0].components) {
      expect(component.actions.some(action => action.type === 'navigate' && action.screenId === 'contact')).toBe(false);
      if (component.type === 'navigation') expect(component.properties.items.every(item => item.screenId === 'home')).toBe(true);
    }
    const context = JSON.parse(JSON.parse(String(transport.mock.calls[0][1]?.body)).input[1].content);
    expect(context.catalog).toHaveLength(20);
    expect(context).not.toHaveProperty('templateId');
    expect(context).not.toHaveProperty('template');
  });

  it('rejects another anonymous session\'s prototype before transmitting the prompt', async () => {
    const request = input();
    const other = await generatePrototype({ ...request, sessionId: 'other-owner', brief: { ...request.brief, sessionId: 'other-owner' } });
    if (!('uiSpec' in other)) throw new Error('Invalid fixture');
    const transport = vi.fn<typeof fetch>();
    expect(await createOpenAIProvider({ enabled: true, apiKey: secret, transport }).generate({ ...request, previousUiSpec: other.uiSpec })).toMatchObject({ errorCode: 'INVALID_PROVIDER_REQUEST' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('terminates a stalled response stream without retrying or returning partial provider data', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"status":"completed","secret":"' + secret)); } });
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    const result = await createOpenAIProvider({ enabled: true, apiKey: secret, transport, timeoutMs: 100 }).generate(input());
    expect(result).toMatchObject({ errorCode: 'PROVIDER_TIMEOUT' });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
