import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeechmaticsProxy } from '../../server/speechmatics-proxy';
class Socket {
  readyState = 0; bufferedAmount = 0;
  onopen: (() => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  send = vi.fn((_data: string | Uint8Array) => {}); close = vi.fn(() => { this.readyState = 3; });
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
function setup(overrides: Record<string, unknown> = {}) {
  const sockets: Socket[] = [];
  const tokenProvider = { issueToken: vi.fn(async () => ({ ok: true, token: 'private.jwt.synthetic', url: 'wss://eu.rt.speechmatics.com/v2/' })), cancelSession: vi.fn() };
  const createSocket = vi.fn((_url: string) => { const socket = new Socket(); sockets.push(socket); return socket; });
  const proxy = createSpeechmaticsProxy({ enabled: true, liveCallsAllowed: true, maxSessionAudioSeconds: 2, maxGlobalAudioSeconds: 3, maxWallMs: 10000, maxStartsGlobal: 10, ...overrides }, { tokenProvider, createSocket });
  const start = async (sessionId = 's1') => {
    const before = sockets.length;
    const pending = proxy.start({ sessionId, consented: true });
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(before));
    const socket = sockets.at(-1)!; socket.open(); socket.message({ message: 'RecognitionStarted' });
    const ready = await pending; expect(ready.ok).toBe(true); return { sessionId, streamId: ready.streamId, socket };
  };
  return { proxy, tokenProvider, sockets, createSocket, start };
}
afterEach(() => vi.useRealTimers());
describe('server-owned Speechmatics proxy', () => {
  it('requires enabled live gate, explicit approved byte/wall limits and consent before any provider request', async () => {
    for (const config of [{ liveCallsAllowed: false }, { maxGlobalAudioSeconds: 0 }, { maxSessionAudioSeconds: 0 }, { maxWallMs: 0 }]) {
      const { proxy, tokenProvider, createSocket } = setup(config);
      expect(await proxy.start({ sessionId: 's1', consented: true })).toMatchObject({ ok: false });
      expect(tokenProvider.issueToken).not.toHaveBeenCalled(); expect(createSocket).not.toHaveBeenCalled();
    }
    const { proxy, tokenProvider } = setup(); expect(await proxy.start({ sessionId: 's1', consented: false })).toMatchObject({ ok: false });
    expect(tokenProvider.issueToken).not.toHaveBeenCalled();
  });
  it('keeps the provider token private and accepts audio only for the current owned stream identity', async () => {
    const { proxy, start, tokenProvider } = setup(); const stream = await start();
    expect(JSON.stringify(stream)).not.toContain('private.jwt.synthetic');
    expect(proxy.writePcm({ ...stream, streamId: 'wrong', audio: new Uint8Array(4096) })).toMatchObject({ ok: false });
    expect(proxy.writePcm({ ...stream, audio: new Uint8Array(4096) })).toMatchObject({ ok: true });
    expect(tokenProvider.issueToken).toHaveBeenCalledTimes(1);
    expect(stream.socket.send).toHaveBeenLastCalledWith(expect.any(Uint8Array)); proxy.dispose();
  });
  it('caps cumulative PCM bytes across restarts and rejects the chunk exceeding the approved duration', async () => {
    const { proxy, start } = setup({ maxSessionAudioSeconds: 1 }); const first = await start();
    expect(proxy.writePcm({ ...first, audio: new Uint8Array(16000) })).toMatchObject({ ok: true }); proxy.endSession('s1');
    const second = await start(); expect(second.streamId).not.toBe(first.streamId);
    expect(proxy.writePcm({ ...second, audio: new Uint8Array(16000) })).toMatchObject({ ok: true });
    expect(proxy.writePcm({ ...second, audio: new Uint8Array(2) })).toMatchObject({ ok: false, code: 'audio_limit' });
    expect(second.socket.send.mock.calls.filter(call => call[0] instanceof Uint8Array)).toHaveLength(1); proxy.dispose();
  });
  it('enforces a global audio byte cap across sessions without forwarding excess data', async () => {
    const { proxy, start } = setup({ maxSessionAudioSeconds: 10, maxGlobalAudioSeconds: 1, maxStreams: 2 });
    const first = await start('s1'), second = await start('s2');
    proxy.writePcm({ ...first, audio: new Uint8Array(16000) }); proxy.writePcm({ ...second, audio: new Uint8Array(16000) });
    expect(proxy.writePcm({ ...first, audio: new Uint8Array(2) })).toMatchObject({ ok: false, code: 'audio_limit' });
    expect(first.socket.send.mock.calls.filter(call => call[0] instanceof Uint8Array)).toHaveLength(1); proxy.dispose();
  });
  it('closes upstream at the wall deadline and never automatically reconnects', async () => {
    vi.useFakeTimers(); const { proxy, sockets, tokenProvider } = setup({ maxWallMs: 1000 });
    const pending = proxy.start({ sessionId: 's1', consented: true }); await Promise.resolve(); await Promise.resolve();
    sockets[0].open(); sockets[0].message({ message: 'RecognitionStarted' }); await pending;
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets[0].close).toHaveBeenCalledTimes(1); expect(tokenProvider.issueToken).toHaveBeenCalledTimes(1);
    expect(proxy.writePcm({ sessionId: 's1', streamId: 'stale', audio: new Uint8Array(2) })).toMatchObject({ ok: false }); proxy.dispose();
  });
  it('emits stable transcripts without credentials, cancels late callbacks and closes upstream when SSE unsubscribes', async () => {
    const { proxy, start } = setup(); const stream = await start(); const events: any[] = [];
    const unsubscribe = proxy.subscribe(stream, (event: unknown) => { events.push(event); });
    stream.socket.message({ message: 'AddPartialTranscript', metadata: { transcript: 'booking' } });
    stream.socket.message({ message: 'AddTranscript', metadata: { transcript: 'booking page', start_time: 0, end_time: 1 } });
    const segments = events.filter(event => event.type === 'segment').map(event => event.segment);
    expect(segments[0].segmentId).toBe(segments[1].segmentId);
    const stale = stream.socket.onmessage; unsubscribe();
    stale?.({ data: JSON.stringify({ message: 'AddTranscript', metadata: { transcript: 'late' } }) });
    expect(events.filter(event => event.type === 'segment')).toHaveLength(2); expect(stream.socket.close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(events)).not.toContain('private.jwt.synthetic'); proxy.dispose();
  });
  it('caps idle connection attempts globally even if they send no PCM bytes', async () => {
    const { proxy, start, tokenProvider } = setup({ maxStartsGlobal: 1 }); await start('s1'); proxy.endSession('s1');
    const second = proxy.start({ sessionId: 's2', consented: true }); await Promise.resolve(); proxy.dispose();
    expect(tokenProvider.issueToken).toHaveBeenCalledTimes(1);
    expect(await second).toMatchObject({ ok: false, code: 'stream_start_limit' });
  });
});
