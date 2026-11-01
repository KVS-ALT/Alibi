import { describe, expect, it, vi } from 'vitest';
import type { GenerationRequest } from '../../src/contracts';
import { createBrief, generatePrototype, validateUiSpec } from '../../src/generation';
import { createOpenAIProvider } from '../../src/generation/provider';

function request(): GenerationRequest {
  const brief = createBrief('provider-session', 1, 'Build a bakery called Sunday Bread. Let people plan a pickup.');
  return { sessionId: brief.sessionId, requestId: 'provider-request', briefVersion: brief.version, brief };
}
async function fixture() {
  const input = request(), result = await generatePrototype(input, { templateId: 'bakery' });
  if (!('uiSpec' in result)) throw new Error(result.safeMessage);
  const draft = {
    brief: { purpose: 'A neighbourhood bakery preorder concept', audience: 'Local bread lovers', requirements: ['Browse sample bread', 'Plan a local demo pickup'], style: ['warm'], unknowns: ['Real availability is unknown'] },
    content: { brand: 'Sunday Bread', headline: 'A little goodness, fresh each morning.', description: 'Explore a fictional bake and plan your local demo pickup.', cards: result.uiSpec.screens.flatMap(s => s.components).filter(c => c.type === 'card').map(c => ({ id: c.id, title: 'Plan your next bake', body: 'A local demo, with no real order or reservation.' })), rows: result.uiSpec.demoData.listings },
  };
  return { input, baseline: result.uiSpec, draft };
}
function response(draft: unknown) { return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }] }), { status: 200 }); }
const configured = (transport: typeof fetch, extra = {}) => createOpenAIProvider({ enabled: true, apiKey: 'test-secret-never-live', model: 'gpt-6-sol', transport, ...extra });

describe('server-only OpenAI structured generation', () => {
  it('does not invoke transport when disabled, even with a key present', async () => {
    const transport = vi.fn<typeof fetch>();
    expect(await createOpenAIProvider({ apiKey: 'test-secret-never-live', transport }).generate(request())).toMatchObject({ errorCode: 'PROVIDER_DISABLED', retryable: false });
    expect(transport).not.toHaveBeenCalled();
  });

  it('sends a bounded strict structured request and applies validated model copy to the reviewed UI', async () => {
    const { input, baseline, draft } = await fixture();
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response(draft));
    const result = await configured(transport).generate(input, { templateId: 'bakery' });
    expect(result).toHaveProperty('uiSpec');
    if (!('uiSpec' in result)) throw new Error(result.safeMessage);
    expect(validateUiSpec(result.uiSpec).success).toBe(true);
    expect(result).toMatchObject({ provider: 'openai', brief: { sessionId: input.sessionId, version: 1, audience: draft.brief.audience } });
    expect(result.uiSpec.templateId).toBe('bakery');
    expect(result.uiSpec.screens[0].components.find(c => c.id === 'hero-title')).toMatchObject({ properties: { text: draft.content.headline } });
    expect(result.uiSpec.screens.map(s => [s.id, s.components.map(c => [c.id, c.type, c.actions])])).toEqual(baseline.screens.map(s => [s.id, s.components.map(c => [c.id, c.type, c.actions])]));
    const [url, init] = transport.mock.calls[0], payload = JSON.parse(String(init?.body));
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(payload).toMatchObject({ model: 'gpt-6-sol', reasoning: { effort: 'none' }, store: false, max_output_tokens: 3000, text: { format: { type: 'json_schema', strict: true } } });
    expect(payload).not.toHaveProperty('tools');
    expect(String(init?.body)).not.toContain('test-secret-never-live');
    expect(JSON.stringify(result)).not.toContain('test-secret-never-live');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-secret-never-live');
    expect(init?.redirect).toBe('error');
  });

  it('rejects unapproved endpoints, models, missing keys and oversized requests before transport', async () => {
    const transport = vi.fn<typeof fetch>();
    for (const config of [{ baseUrl: 'https://other.example/v1' }, { baseUrl: 'https://api.openai.com.evil.example/v1' }, { model: 'unapproved-model' }, { apiKey: '' }, { maxOutputTokens: 999999 }]) {
      expect(await configured(transport, config).generate(request())).toMatchObject({ errorCode: 'PROVIDER_CONFIGURATION', retryable: false });
    }
    const huge = request(); huge.brief.purpose = 'x'.repeat(24001);
    expect(await configured(transport).generate(huge)).toMatchObject({ errorCode: 'INVALID_PROVIDER_REQUEST', retryable: false });
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects invalid structured fields, executable additions and unknown card identifiers', async () => {
    const { input, draft } = await fixture();
    for (const bad of [{ ...draft, onclick: 'alert(1)' }, { ...draft, content: { ...draft.content, brand: 7 } }, { ...draft, content: { ...draft.content, cards: [{ id: 'missing', title: 'bad', body: 'bad' }] } }]) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response(bad));
      expect(await configured(transport).generate(input, { templateId: 'bakery' })).toMatchObject({ errorCode: 'INVALID_PROVIDER_RESPONSE', retryable: false });
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps literal hostile copy as validated text without adding executable properties', async () => {
    const { input, draft } = await fixture();
    draft.content.headline = '</script><img src=x onerror="alert(1)">';
    const result = await configured(vi.fn<typeof fetch>().mockResolvedValue(response(draft))).generate(input, { templateId: 'bakery' });
    expect(result).toHaveProperty('uiSpec');
    if ('uiSpec' in result) expect(result.uiSpec.screens[0].components.find(c => c.id === 'hero-title')).toMatchObject({ type: 'text', properties: { text: draft.content.headline } });
  });

  it('returns redacted authentication/provider errors without an implicit demo fallback', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"error":{"message":"test-secret-never-live"}}', { status: 401 }));
    const result = await configured(transport).generate(request());
    expect(result).toMatchObject({ errorCode: 'PROVIDER_AUTHENTICATION', retryable: false });
    expect(result).not.toHaveProperty('uiSpec');
    expect(JSON.stringify(result)).not.toContain('test-secret-never-live');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('retries one explicit transient HTTP failure and obeys the retry bound', async () => {
    const { input, draft } = await fixture();
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 503, headers: { 'Retry-After': '0' } })).mockResolvedValueOnce(response(draft));
    expect(await configured(transport).generate(input, { templateId: 'bakery' })).toHaveProperty('uiSpec');
    expect(transport).toHaveBeenCalledTimes(2);
    const failing = vi.fn<typeof fetch>().mockImplementation(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }));
    expect(await configured(failing).generate(input)).toMatchObject({ errorCode: 'PROVIDER_RATE_LIMIT', retryable: true });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('does not automatically repeat quota, refusal, incomplete or ambiguous network failures', async () => {
    const { input } = await fixture();
    for (const [body, status, code] of [
      [{ error: { code: 'insufficient_quota' } }, 429, 'PROVIDER_QUOTA'],
      [{ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'No' }] }] }, 200, 'PROVIDER_REFUSED'],
      [{ status: 'incomplete', output: [] }, 200, 'PROVIDER_INCOMPLETE'],
    ] as const) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
      expect(await configured(transport).generate(input)).toMatchObject({ errorCode: code });
      expect(transport).toHaveBeenCalledTimes(1);
    }
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('network test-secret-never-live'));
    const result = await configured(transport).generate(input);
    expect(result).toMatchObject({ errorCode: 'PROVIDER_UNAVAILABLE' });
    expect(JSON.stringify(result)).not.toContain('test-secret-never-live');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('enforces the deadline even when injected transport ignores abort and cancels without starting a request', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(() => {}));
    expect(await configured(transport, { timeoutMs: 100 }).generate(request())).toMatchObject({ errorCode: 'PROVIDER_TIMEOUT', retryable: true });
    expect(transport).toHaveBeenCalledTimes(1);
    const controller = new AbortController(); controller.abort();
    await expect(configured(transport).generate(request(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('bounds response bytes and rejects broken response JSON', async () => {
    for (const body of ['x'.repeat(65001), '{broken-json']) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
      expect(await configured(transport).generate(request())).toMatchObject({ errorCode: body.length > 64000 ? 'PROVIDER_RESPONSE_TOO_LARGE' : 'INVALID_PROVIDER_RESPONSE' });
    }
  });

  it('does not expose an echoed server secret through successful structured content', async () => {
    const { input, draft } = await fixture();
    draft.content.description = 'Echoed secret: test-secret-never-live';
    const result = await configured(vi.fn<typeof fetch>().mockResolvedValue(response(draft))).generate(input);
    expect(result).toMatchObject({ errorCode: 'INVALID_PROVIDER_RESPONSE', retryable: false });
    expect(JSON.stringify(result)).not.toContain('test-secret-never-live');
  });

  it('keeps renamed synthetic product choices aligned with the table and preserves revisions', async () => {
    const { input, baseline, draft } = await fixture();
    const before = JSON.stringify(input);
    draft.content.rows = draft.content.rows.map((row, index) => ({ ...row, item: 'Synthetic bake ' + (index + 1) }));
    input.previousUiSpec = baseline;
    const result = await configured(vi.fn<typeof fetch>().mockResolvedValue(response(draft))).generate(input, { templateId: 'bakery' });
    if (!('uiSpec' in result)) throw new Error(result.safeMessage);
    expect(result.uiSpec.version).toBe(2);
    const form = result.uiSpec.screens[1].components.find(c => c.type === 'form')!;
    if (form.type === 'form') expect(form.properties.fields.find(f => f.id === 'bakery-item')?.options).toEqual(['Synthetic bake 1', 'Synthetic bake 2', 'Synthetic bake 3']);
    expect(JSON.stringify({ ...input, previousUiSpec: undefined })).toBe(before);
  });

  it('refuses browser invocation even if a caller provides a key and enables the adapter', async () => {
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal('window', {});
    try { expect(await configured(transport).generate(request())).toMatchObject({ errorCode: 'PROVIDER_SERVER_ONLY' }); }
    finally { vi.unstubAllGlobals(); }
    expect(transport).not.toHaveBeenCalled();
  });

  it('does not retry earlier than a long provider Retry-After', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '30' } }));
    expect(await configured(transport).generate(request())).toMatchObject({ errorCode: 'PROVIDER_RATE_LIMIT', retryable: true });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
