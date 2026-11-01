import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElevenLabsTranscriber } from '../../server/elevenlabs';

function wav(seconds = 1) {
  const result = new Uint8Array(44 + seconds * 32000);
  const view = new DataView(result.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, result.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, result.length - 44, true);
  return result;
}
const audio = wav();
const chunk = { sessionId: 's1', chunkId: 'c1', audio, mimeType: 'audio/wav', durationMs: 1000 };
const live = { enabled: true, liveCallsAllowed: true, apiKey: 'synthetic-secret' };
const response = () => new Response(JSON.stringify({ text: 'Add a booking form.', language_code: 'en' }), { status: 200 });
afterEach(() => vi.useRealTimers());

describe('server bounded ElevenLabs transcription', () => {
  it('performs no request when disabled, even with a configured key', async () => {
    const fetcher = vi.fn(async () => response());
    for (const config of [{ apiKey: 'synthetic-secret' }, { ...live, liveCallsAllowed: false }]) {
      const provider = createElevenLabsTranscriber(config, { fetcher });
      provider.startSession({ sessionId: 's1', consented: true });
      expect(await provider.transcribe(chunk)).toMatchObject({ ok: false, code: 'provider_disabled' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('requires explicit session consent and rejects invalid or oversized audio before upload', async () => {
    const fetcher = vi.fn(async () => response());
    const provider = createElevenLabsTranscriber({ ...live, maxAudioBytes: 10 }, { fetcher });
    provider.startSession({ sessionId: 's1', consented: false });
    expect(await provider.transcribe(chunk)).toMatchObject({ ok: false, code: 'session_not_active' });
    provider.startSession({ sessionId: 's1', consented: true });
    for (const request of [{ ...chunk, audio: new Uint8Array(11) }, { ...chunk, durationMs: 31000 }, { ...chunk, mimeType: 'text/plain' }, { ...chunk, audio: new Uint8Array() }]) {
      expect(await provider.transcribe(request)).toMatchObject({ ok: false, code: 'invalid_audio' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('makes the documented authenticated multipart request and returns one final segment without secrets', async () => {
    const fetcher = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => response());
    const provider = createElevenLabsTranscriber(live, { fetcher });
    provider.startSession({ sessionId: 's1', consented: true });
    const result = await provider.transcribe(chunk);
    expect(result).toEqual({ ok: true, provider: 'elevenlabs', mode: 'bounded', segment: { sessionId: 's1', segmentId: 's1:elevenlabs:c1', text: 'Add a booking form.', isFinal: true } });
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text?enable_logging=false');
    expect(init?.headers).toEqual({ 'xi-api-key': 'synthetic-secret' });
    expect(init?.redirect).toBe('error');
    const form = init?.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('diarize')).toBe('false');
    expect(form.get('tag_audio_events')).toBe('false');
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(await (form.get('file') as Blob).arrayBuffer()).toEqual(audio.buffer);
    expect(form.has('source_url')).toBe(false);
  });
  it.each(['muteSession', 'endSession', 'dispose'] as const)('aborts pending upload and discards late response on %s', async method => {
    let release!: (value: Response) => void;
    const fetcher = vi.fn((_url: Parameters<typeof fetch>[0], _init?: RequestInit) => new Promise<Response>(resolve => { release = resolve; }));
    const provider = createElevenLabsTranscriber(live, { fetcher });
    provider.startSession({ sessionId: 's1', consented: true });
    const pending = provider.transcribe(chunk);
    provider[method]('s1');
    expect((fetcher.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    release(response());
    expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
    provider.resumeSession('s1');
    if (method !== 'muteSession') expect(await provider.transcribe({ ...chunk, chunkId: 'c2' })).toMatchObject({ ok: false, code: 'session_not_active' });
  });
  it('does not auto-retry duplicate chunks, provider denial or uncertain failures', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ detail: 'synthetic-secret' }), { status: 401 }));
    const provider = createElevenLabsTranscriber(live, { fetcher });
    provider.startSession({ sessionId: 's1', consented: true });
    const first = await provider.transcribe(chunk);
    expect(first).toMatchObject({ ok: false, code: 'provider_auth', retryable: false });
    expect(JSON.stringify(first)).not.toContain('synthetic-secret');
    expect(await provider.transcribe(chunk)).toMatchObject({ ok: false, code: 'duplicate_chunk' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('cancels via caller signal and preserves a typed fallback on malformed provider output', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ text: { unsafe: true } }), { status: 200 }));
    const provider = createElevenLabsTranscriber(live, { fetcher });
    provider.startSession({ sessionId: 's1', consented: true });
    const controller = new AbortController(); controller.abort();
    expect(await provider.transcribe({ ...chunk, signal: controller.signal })).toMatchObject({ ok: false, code: 'cancelled' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await provider.transcribe({ ...chunk, chunkId: 'c2' })).toMatchObject({ ok: false, code: 'invalid_provider_response', safeMessage: expect.stringMatching(/try/i) });
  });
  it('rejects missing container headers and requires separate acceptance before provider logging', async () => {
    const fetcher = vi.fn(async () => response());
    const provider = createElevenLabsTranscriber({ ...live, allowProviderLogging: true }, { fetcher });
    expect(provider.startSession({ sessionId: 's1', consented: true })).toBe(false);
    expect(await provider.transcribe(chunk)).toMatchObject({ ok: false, code: 'session_not_active' });
    provider.startSession({ sessionId: 's1', consented: true, providerRetentionAccepted: true });
    expect(await provider.transcribe({ ...chunk, audio: new Uint8Array([1, 2, 3, 4]) })).toMatchObject({ ok: false, code: 'invalid_audio' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('derives the duration from exact canonical PCM WAV bytes instead of trusting reported metadata', async () => {
    const fetcher = vi.fn(async () => response());
    const provider = createElevenLabsTranscriber(live, { fetcher });
    provider.startSession({ sessionId: 's1', consented: true });
    const wrongLength = wav(); new DataView(wrongLength.buffer).setUint32(40, 10, true);
    for (const bytes of [wav(31), wrongLength]) expect(await provider.transcribe({ ...chunk, audio: bytes })).toMatchObject({ ok: false, code: 'invalid_audio' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('frees ended session slots and only restarts with fresh consent', () => {
    const provider = createElevenLabsTranscriber();
    for (let index = 0; index < 201; index++) {
      expect(provider.startSession({ sessionId: `s${index}`, consented: true })).toBe(true);
      provider.endSession(`s${index}`);
    }
    expect(provider.startSession({ sessionId: 's1', consented: false })).toBe(false);
    expect(provider.startSession({ sessionId: 's1', consented: true })).toBe(true);
  });
  it('settles the deadline even if an injected transport ignores abort', async () => {
    vi.useFakeTimers();
    const provider = createElevenLabsTranscriber({ ...live, timeoutMs: 100 }, { fetcher: async () => new Promise<Response>(() => {}) });
    provider.startSession({ sessionId: 's1', consented: true });
    const pending = provider.transcribe(chunk);
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ ok: false, code: 'provider_timeout' });
  }, 1000);
  it('rejects a provider transcript that echoes the configured server key', async () => {
    const provider = createElevenLabsTranscriber(live, { fetcher: async () => new Response(JSON.stringify({ text: 'untrusted synthetic-secret response' })) });
    provider.startSession({ sessionId: 's1', consented: true });
    const result = await provider.transcribe(chunk);
    expect(result).toMatchObject({ ok: false, code: 'invalid_provider_response' });
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
  });
});
