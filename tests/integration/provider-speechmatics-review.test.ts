// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSpeechmaticsTokenProvider } from '../../server/speechmatics';

describe('independent realtime token boundary review', () => {
  it('stops reading an oversized provider response at the byte boundary instead of buffering the entire body', async () => {
    let pulls = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(8192).fill(120)); if (pulls === 100) controller.close(); },
      cancel,
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    const provider = createSpeechmaticsTokenProvider({ enabled: true, liveCallsAllowed: true, apiKey: 'synthetic-realtime-secret' }, { fetcher });
    expect(await provider.issueToken({ sessionId: 'owned-session', consented: true })).toMatchObject({ ok: false, code: 'invalid_provider_response' });
    expect(pulls).toBeLessThanOrEqual(4);
    expect(cancel).toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('cancels only the ended owner session while another pending token request remains independent', async () => {
    const pending: ((value: Response) => void)[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(resolve => pending.push(resolve)));
    const now = 1_800_000_000_000;
    const provider = createSpeechmaticsTokenProvider({ enabled: true, liveCallsAllowed: true, apiKey: 'synthetic-realtime-secret' }, { fetcher, now: () => now });
    const old = provider.issueToken({ sessionId: 'owner-a', consented: true });
    const current = provider.issueToken({ sessionId: 'owner-b', consented: true });
    provider.cancelSession('owner-a');
    const token = 'header.' + Buffer.from(JSON.stringify({ exp: now / 1000 + 60 })).toString('base64url') + '.signature';
    pending.forEach(resolve => resolve(new Response(JSON.stringify({ key_value: token }))));
    expect(await old).toMatchObject({ ok: false, code: 'cancelled' });
    expect(await current).toMatchObject({ ok: true, token, expiresIn: 60 });
    provider.dispose();
  });
});
