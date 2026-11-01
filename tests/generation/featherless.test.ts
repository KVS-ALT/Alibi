import { describe, expect, it, vi } from 'vitest';
import { createBrief, validateUiSpec } from '../../src/generation';
import { createFeatherlessProvider, FEATHERLESS_ENDPOINT, FEATHERLESS_MODELS } from '../../src/generation/featherless';
const key = 'test-featherless-key-never-live';
function request() { const brief = createBrief('featherless-session', 1, 'Create a bakery called Sunday Bread. Let people plan a local pickup.'); return { sessionId: brief.sessionId, requestId: 'featherless-request', briefVersion: 1, brief }; }
function reply(plan: unknown, finish_reason = 'stop') { return new Response(JSON.stringify({ choices: [{ finish_reason, message: { role: 'assistant', content: JSON.stringify(plan) } }] })); }
const provider = (transport: typeof fetch, extra = {}) => createFeatherlessProvider({ enabled: true, apiKey: key, model: FEATHERLESS_MODELS[0], transport, ...extra });
function context(init?: RequestInit) { const payload = JSON.parse(String(init?.body)); return { payload, plan: JSON.parse(payload.messages[1].content).validExample }; }

describe('Featherless dedicated bounded inference', () => {
  it('does not call transport when disabled even if its dedicated key is present', async () => {
    const transport = vi.fn<typeof fetch>();
    expect(await createFeatherlessProvider({ apiKey: key, model: FEATHERLESS_MODELS[0], transport }).generate(request())).toMatchObject({ errorCode: 'PROVIDER_DISABLED' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('uses the exact official chat endpoint/protocol and composes safe model-selected output', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
      const { plan } = context(init);
      plan.templateId = 'restaurant'; // A genuine model choice can differ from the bakery heuristic.
      plan.content.headline = 'A place for the whole neighbourhood.';
      plan.style.palette = 'warm';
      return reply(plan);
    });
    const result = await provider(transport).generate(request());
    if (!('uiSpec' in result)) throw new Error(result.safeMessage);
    expect(result).toMatchObject({ provider: 'featherless', uiSpec: { templateId: 'restaurant' } });
    expect(validateUiSpec(result.uiSpec).success).toBe(true);
    expect(result.uiSpec.screens[0].components.find(c => c.id === 'hero-title')).toMatchObject({ properties: { text: 'A place for the whole neighbourhood.' } });
    const [url, init] = transport.mock.calls[0], { payload } = context(init);
    expect(url).toBe(FEATHERLESS_ENDPOINT);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ' + key);
    expect(init?.redirect).toBe('error');
    expect(payload).toMatchObject({ model: 'Qwen/Qwen2.5-7B-Instruct', max_tokens: 3000, temperature: 0.1, stream: false, response_format: { type: 'json_object' } });
    expect(payload).not.toHaveProperty('tools');
    expect(payload).not.toHaveProperty('service_tier');
    expect(new TextEncoder().encode(String(init?.body)).byteLength).toBeLessThanOrEqual(28000);
    expect(String(init?.body)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain(key);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects missing/different-provider keys, OpenAI model names and excessive limits before transport', async () => {
    const transport = vi.fn<typeof fetch>();
    for (const config of [{ apiKey: '' }, { model: 'gpt-6-sol' }, { model: undefined }, { maxOutputTokens: 3001 }]) {
      expect(await provider(transport, config).generate(request())).toMatchObject({ errorCode: 'PROVIDER_CONFIGURATION' });
    }
    const oversized = request(); oversized.brief.purpose = 'x'.repeat(501);
    expect(await provider(transport).generate(oversized)).toMatchObject({ errorCode: 'INVALID_PROVIDER_REQUEST' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('fails closed for malformed JSON, arbitrary executable properties, invalid styles and secret echoes', async () => {
    for (const kind of ['json', 'code', 'style', 'secret']) {
      const transport = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
        const { plan } = context(init);
        if (kind === 'json') return new Response('{broken');
        if (kind === 'code') plan.onclick = 'alert(1)';
        if (kind === 'style') plan.style.palette = 'url(javascript:bad)';
        if (kind === 'secret') plan.content.headline = key;
        return reply(plan);
      });
      const result = await provider(transport).generate(request());
      expect(result).toMatchObject({ errorCode: 'INVALID_PROVIDER_RESPONSE', retryable: false });
      expect(JSON.stringify(result)).not.toContain(key);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it('redacts provider/authentication/network failures and never retries', async () => {
    for (const status of [401, 403, 429, 503]) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(key, { status }));
      const result = await provider(transport).generate(request());
      expect(result).not.toHaveProperty('uiSpec');
      expect(JSON.stringify(result)).not.toContain(key);
      expect(transport).toHaveBeenCalledTimes(1);
    }
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error(key));
    expect(await provider(transport).generate(request())).toMatchObject({ errorCode: 'PROVIDER_UNAVAILABLE' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('handles length-limited output and oversized responses without automatic retries', async () => {
    const incomplete = vi.fn<typeof fetch>().mockImplementation(async (_, init) => reply(context(init).plan, 'length'));
    expect(await provider(incomplete).generate(request())).toMatchObject({ errorCode: 'PROVIDER_INCOMPLETE' });
    expect(incomplete).toHaveBeenCalledTimes(1);
    const large = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(65000)));
    expect(await provider(large).generate(request())).toMatchObject({ errorCode: 'PROVIDER_RESPONSE_TOO_LARGE' });
  });

  it('times out an uncooperative transport and cancels before a request starts', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(() => {}));
    expect(await provider(transport, { timeoutMs: 100 }).generate(request())).toMatchObject({ errorCode: 'PROVIDER_TIMEOUT' });
    expect(transport).toHaveBeenCalledTimes(1);
    const controller = new AbortController(); controller.abort();
    await expect(provider(transport).generate(request(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects browser invocation and mismatched history without transport', async () => {
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal('window', {});
    try { expect(await provider(transport).generate(request())).toMatchObject({ errorCode: 'PROVIDER_SERVER_ONLY' }); }
    finally { vi.unstubAllGlobals(); }
    const input = request(); input.brief.sessionId = 'different-session';
    expect(await provider(transport).generate(input)).toMatchObject({ errorCode: 'INVALID_PROVIDER_REQUEST' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('accepts empty compatibility tool metadata but never accepts a tool call', async () => {
    for (const toolCalls of [[], null, [{ id: 'unsafe-tool', type: 'function' }]]) {
      const transport = vi.fn<typeof fetch>().mockImplementation(async (_, init) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(context(init).plan), tool_calls: toolCalls } }] })));
      const result = await provider(transport).generate(request());
      if (Array.isArray(toolCalls) && toolCalls.length) expect(result).toMatchObject({ errorCode: 'INVALID_PROVIDER_RESPONSE' });
      else expect(result).toHaveProperty('uiSpec');
    }
  });
});
