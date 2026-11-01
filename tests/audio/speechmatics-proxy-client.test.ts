import { describe, expect, it, vi } from 'vitest';
import { createHttpSpeechmaticsProxyTransport, createSpeechmaticsProxyCapture } from '../../src/audio/speechmatics-proxy';
function setup() {
  let receive!: (event: any) => void, pcm!: (bytes: Uint8Array) => void;
  const close = vi.fn(), source = { stop: vi.fn(), flush: vi.fn() };
  const transport = { start: vi.fn(async () => ({ streamId: 'stream1' })),
    subscribe: vi.fn(async (_identity: any, onEvent: (event: any) => void) => { receive = onEvent; return { close }; }),
    writePcm: vi.fn(async (_identity: any, _bytes: Uint8Array, _signal: AbortSignal) => {}), flush: vi.fn(async () => {}), end: vi.fn(async () => {}) };
  const openAudio = vi.fn(async (send: (bytes: Uint8Array) => void) => { pcm = send; return source; });
  const onSegment = vi.fn();
  const capture = createSpeechmaticsProxyCapture({ sessionId: 's1', onSegment, transport }, { supported: true, openAudio });
  return { capture, transport, close, source, openAudio, onSegment, receive: (event: any) => receive(event), pcm: (bytes: Uint8Array) => pcm(bytes) };
}
describe('server-owned Speechmatics browser bridge', () => {
  it('uses only owned same-origin endpoints, raw PCM and stream-bound cleanup, never a provider JWT', async () => {
    const fetcher = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => new Response(JSON.stringify({ ok: true, streamId: 'stream1', token: 'must-not-forward' })));
    const transport = createHttpSpeechmaticsProxyTransport(fetcher);
    const signal = new AbortController().signal;
    const ready = await transport.start('s1', signal); expect(ready).toEqual({ streamId: 'stream1' });
    await transport.writePcm({ sessionId: 's1', ...ready }, new Uint8Array([1, 2, 3, 4]), signal);
    await transport.end({ sessionId: 's1', ...ready });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/sessions', '/api/sessions/s1/speech/start', '/api/sessions/s1/speech/pcm', '/api/sessions/s1/speech/end']);
    expect(fetcher.mock.calls[2][1]).toMatchObject({ credentials: 'same-origin', redirect: 'error', headers: { 'Content-Type': 'application/octet-stream', 'X-Speech-Stream-Id': 'stream1' }, body: new Uint8Array([1, 2, 3, 4]) });
    expect(fetcher.mock.calls[3][1]?.body).toBe('{"streamId":"stream1"}');
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/speechmatics\.com|jwt|Authorization/);
  });
  it('waits for explicit consent, server readiness and owned event subscription before the microphone', async () => {
    const { capture, transport, openAudio } = setup(); await capture.resume();
    expect(transport.start).not.toHaveBeenCalled(); expect(openAudio).not.toHaveBeenCalled();
    transport.start.mockRejectedValueOnce(new Error('unconfigured'));
    await capture.start(); expect(openAudio).not.toHaveBeenCalled(); expect(transport.subscribe).not.toHaveBeenCalled();
    expect(capture.getSnapshot()).toMatchObject({ status: 'muted', errorCode: 'capture_unavailable' });
  });
  it('forwards raw PCM to the owned product transport and receives final transcripts without any browser token', async () => {
    const { capture, transport, pcm, receive, onSegment } = setup(); await capture.start();
    pcm(new Uint8Array([1, 2, 3, 4])); await Promise.resolve(); await Promise.resolve();
    expect(transport.writePcm).toHaveBeenCalledWith({ sessionId: 's1', streamId: 'stream1' }, expect.any(Uint8Array), expect.any(AbortSignal));
    receive({ id: 'stream1:1', type: 'segment', segment: { sessionId: 's1', segmentId: 'stable1', text: 'A bakery booking page', isFinal: true } });
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({ text: 'A bakery booking page', isFinal: true })); capture.dispose();
  });
  it('flushes pending PCM writes before asking the server to finalize and does not send queued bytes after end', async () => {
    const { capture, transport, pcm, source } = setup(); let complete!: () => void;
    transport.writePcm.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
    await capture.start(); pcm(new Uint8Array(4096)); await vi.waitFor(() => expect(transport.writePcm).toHaveBeenCalledTimes(1));
    const flushing = capture.flush(); await Promise.resolve(); expect(source.flush).toHaveBeenCalledTimes(1); expect(transport.flush).not.toHaveBeenCalled();
    complete(); await flushing; expect(transport.flush).toHaveBeenCalledTimes(1); capture.end();
    pcm(new Uint8Array(4096)); await Promise.resolve(); expect(transport.writePcm).toHaveBeenCalledTimes(1);
  });
  it('stops microphone/SSE/uploads on server limit, ignores late transcripts and never automatically reconnects', async () => {
    const { capture, transport, receive, source, close, onSegment } = setup(); await capture.start();
    receive({ id: 'stream1:2', type: 'state', state: 'ended', code: 'audio_limit' });
    receive({ id: 'stream1:3', type: 'segment', segment: { sessionId: 's1', segmentId: 'late', text: 'discard', isFinal: true } });
    expect(source.stop).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1); expect(onSegment).not.toHaveBeenCalled();
    expect(transport.start).toHaveBeenCalledTimes(1); expect(capture.getSnapshot()).toMatchObject({ status: 'muted', errorCode: 'audio_limit' }); capture.dispose();
  });
  it('bounds an upload backlog to one second of PCM rather than retaining an unbounded audio queue', async () => {
    const { capture, transport, pcm, source } = setup(); transport.writePcm.mockImplementation(() => new Promise<void>(() => {}));
    await capture.start(); pcm(new Uint8Array(16384)); pcm(new Uint8Array(16384));
    expect(capture.getSnapshot()).toMatchObject({ status: 'muted', errorCode: 'audio_backpressure' }); expect(source.stop).toHaveBeenCalledTimes(1); capture.dispose();
  });
});
