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
      brief: { purpose: 'A fictional bakery', audience: 'Local visitors', requirements: [], style: [], unknowns: [] },
      content: {
        brand: 'Morning Bread', headline: hostile, description: hostile,
        cards: baseline.uiSpec.screens.flatMap(screen => screen.components).filter(component => component.type === 'card').map(component => ({ id: component.id, title: hostile, body: hostile })),
        rows: baseline.uiSpec.demoData.listings.map(row => ({ ...row, item: hostile + row.item })),
      },
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
      const files = createProjectFiles(generated.uiSpec);
      expect(JSON.stringify(files)).not.toContain(secret);
      expect(JSON.stringify(files)).not.toContain('Authorization');
      expect(JSON.parse(files['config.json'])).toEqual(generated.uiSpec);
    } finally { dom.window.close(); }
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
