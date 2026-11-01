import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeechmaticsTokenProvider } from '../../server/speechmatics';
const now = 1_800_000_000_000;
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: now / 1000 + 60 })).toString('base64url')}.synthetic-signature`;
const config = { enabled: true, liveCallsAllowed: true, apiKey: 'synthetic-permanent-key' };
const input = { sessionId: 's1', consented: true };
afterEach(() => vi.useRealTimers());
describe('Speechmatics server temporary token boundary', () => {
  it('never requests a token without both gates, consent and an injected transport', async () => {
    const fetcher = vi.fn();
    for (const options of [{}, { ...config, liveCallsAllowed: false }]) expect(await createSpeechmaticsTokenProvider(options, { fetcher }).issueToken(input)).toMatchObject({ ok: false });
    expect(await createSpeechmaticsTokenProvider(config, { fetcher }).issueToken({ ...input, consented: false })).toMatchObject({ ok: false, code: 'consent_required' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requests the documented sixty-second rt token without returning the permanent key', async () => {
    const fetcher = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => new Response(JSON.stringify({ key_value: token })));
    const provider = createSpeechmaticsTokenProvider(config, { fetcher, now: () => now });
    const result = await provider.issueToken(input);
    expect(result).toEqual({ ok: true, token, expiresIn: 60, url: 'wss://eu.rt.speechmatics.com/v2/' });
    expect(fetcher.mock.calls[0][0]).toBe('https://mp.speechmatics.com/v1/api_keys?type=rt');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer synthetic-permanent-key' }, body: '{"ttl":60}' });
    expect(JSON.stringify(result)).not.toContain('synthetic-permanent-key');
  });
  it('limits minting and rejects permanent-key echoes or malformed upstream output', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ key_value: 'synthetic-permanent-key' })));
    const provider = createSpeechmaticsTokenProvider(config, { fetcher, now: () => now });
    expect(await provider.issueToken(input)).toMatchObject({ ok: false, code: 'invalid_provider_response' });
    await provider.issueToken(input);
    expect(await provider.issueToken(input)).toMatchObject({ ok: false, code: 'rate_limited' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('settles a stalled transport by deadline and sanitizes errors', async () => {
    vi.useFakeTimers();
    const provider = createSpeechmaticsTokenProvider({ ...config, timeoutMs: 100 }, { fetcher: async () => new Promise<Response>(() => {}) });
    const pending = provider.issueToken(input); await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ ok: false, code: 'provider_timeout' });
  }, 1000);
});
