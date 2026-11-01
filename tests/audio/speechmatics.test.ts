import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeechmaticsCapture, openSpeechmaticsPcmSource } from '../../src/audio/speechmatics';
class Socket {
  readyState = 0; bufferedAmount = 0;
  onopen: (() => void) | null = null; onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null; onerror: (() => void) | null = null;
  send = vi.fn((_data: string | Uint8Array) => {}); close = vi.fn(() => { this.readyState = 3; });
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
function setup() {
  const sockets: Socket[] = [];
  const tokenTransport = vi.fn(async () => ({ token: 'temporary.jwt.signature', url: 'wss://eu.rt.speechmatics.com/v2/' }));
  let sendAudio!: (value: Uint8Array) => void;
  const source = { stop: vi.fn(), flush: vi.fn() };
  const openAudio = vi.fn(async (send: (value: Uint8Array) => void) => { sendAudio = send; return source; });
  const onSegment = vi.fn();
  const capture = createSpeechmaticsCapture({ sessionId: 's1', onSegment, onBuild: vi.fn(), tokenTransport }, { supported: true, createSocket: () => { const socket = new Socket(); sockets.push(socket); return socket; }, openAudio });
  return { capture, sockets, tokenTransport, openAudio, source, onSegment, audio: (value: Uint8Array) => sendAudio(value) };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('Speechmatics realtime consented lifecycle', () => {
  it('uses fresh segment identities for a new controller in the same project session', async () => {
    const first = setup(), second = setup();
    for (const value of [first, second]) {
      await value.capture.start(); value.sockets[0].open();
      value.sockets[0].message({ message: 'AddTranscript', metadata: { transcript: 'A new requirement', start_time: 0, end_time: 1 } });
      value.capture.dispose();
    }
    expect(second.onSegment.mock.calls[0][0].segmentId).not.toBe(first.onSegment.mock.calls[0][0].segmentId);
  });
  it('waits for explicit Start and RecognitionStarted before microphone/audio transmission', async () => {
    const { capture, tokenTransport, sockets, openAudio, audio } = setup();
    await capture.resume(); expect(tokenTransport).not.toHaveBeenCalled();
    await capture.start(); await capture.start(); expect(tokenTransport).toHaveBeenCalledTimes(1);
    expect(openAudio).not.toHaveBeenCalled(); sockets[0].open();
    expect(JSON.parse(sockets[0].send.mock.calls[0][0] as string)).toMatchObject({ message: 'StartRecognition', audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: 16000 } });
    sockets[0].message({ message: 'RecognitionStarted' }); await vi.waitFor(() => expect(openAudio).toHaveBeenCalledTimes(1));
    audio(new Uint8Array([1, 2, 3, 4])); expect(sockets[0].send).toHaveBeenLastCalledWith(expect.any(Uint8Array));
    capture.dispose();
  });
  it('keeps interim/final IDs stable and rejects late callbacks after mute/end', async () => {
    const { capture, sockets, source, onSegment } = setup(); await capture.start(); sockets[0].open();
    sockets[0].message({ message: 'RecognitionStarted' }); await Promise.resolve();
    sockets[0].message({ message: 'AddPartialTranscript', metadata: { transcript: 'hello' } });
    sockets[0].message({ message: 'AddTranscript', metadata: { transcript: 'hello world', start_time: 0, end_time: 1 } });
    expect(onSegment.mock.calls[0][0].segmentId).toBe(onSegment.mock.calls[1][0].segmentId);
    expect(onSegment.mock.calls[1][0]).toMatchObject({ text: 'hello world', isFinal: true });
    const late = sockets[0].onmessage;
    capture.mute(); capture.mute(); capture.end(); await capture.resume();
    late?.({ data: JSON.stringify({ message: 'AddTranscript', metadata: { transcript: 'late' } }) });
    expect(onSegment).toHaveBeenCalledTimes(2); expect(source.stop).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
  });
  it('flushes the PCM source and waits for the final utterance boundary before Build', async () => {
    const { capture, sockets, source, onSegment } = setup(); await capture.start(); sockets[0].open(); sockets[0].message({ message: 'RecognitionStarted' }); await Promise.resolve();
    const flushed = capture.flush();
    expect(source.flush).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(sockets[0].send).toHaveBeenLastCalledWith(JSON.stringify({ message: 'ForceEndOfUtterance' })));
    sockets[0].message({ message: 'AddTranscript', metadata: { transcript: 'booking page', start_time: 0, end_time: 1 } });
    sockets[0].message({ message: 'EndOfUtterance' }); await flushed;
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({ text: 'booking page', isFinal: true })); capture.dispose();
  });
  it('reconnects only an active consented session with a fresh token and cancels scheduled retry on mute', async () => {
    vi.useFakeTimers();
    const { capture, sockets, tokenTransport } = setup(); await capture.start(); sockets[0].open();
    const close = sockets[0].onclose;
    sockets[0].onerror?.(); close?.({ code: 1006 }); await vi.advanceTimersByTimeAsync(5000);
    expect(tokenTransport).toHaveBeenCalledTimes(2); expect(sockets).toHaveLength(2);
    sockets[1].onclose?.({ code: 1011 }); capture.mute(); await vi.advanceTimersByTimeAsync(10000);
    expect(tokenTransport).toHaveBeenCalledTimes(2); capture.dispose();
  });
  it('sanitizes provider errors, never acquires a mic after token refusal, and bounds connection startup', async () => {
    vi.useFakeTimers();
    const { capture, tokenTransport, openAudio, sockets } = setup();
    tokenTransport.mockRejectedValueOnce(new Error('private provider data'));
    await capture.start(); expect(openAudio).not.toHaveBeenCalled(); expect(capture.getSnapshot().error).not.toContain('private');
    await capture.resume(); sockets[0].open(); await vi.advanceTimersByTimeAsync(15000);
    expect(capture.getSnapshot()).toMatchObject({ status: 'muted', starting: false }); expect(openAudio).not.toHaveBeenCalled(); capture.dispose();
  });
  it('converts worklet float samples to headerless PCM16 and closes every local resource', async () => {
    const track = { stop: vi.fn() };
    const disconnect = vi.fn(), close = vi.fn(async () => {}), resume = vi.fn(async () => {});
    let port!: { onmessage: ((event: { data: unknown }) => void) | null; close: ReturnType<typeof vi.fn>; postMessage: (value: { flush: number }) => void };
    const context = { sampleRate: 16000, destination: {}, audioWorklet: { addModule: vi.fn(async () => {}) },
      createMediaStreamSource: () => ({ connect: vi.fn(), disconnect }), createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect }), close, resume };
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } });
    vi.stubGlobal('AudioContext', class { constructor() { return context; } });
    vi.stubGlobal('AudioWorkletNode', class { port = port = { onmessage: null, close: vi.fn(), postMessage: (value: { flush: number }) => { port.onmessage?.({ data: { flushed: value.flush } }); } }; connect = vi.fn(); disconnect = disconnect; });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:offline-module'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const send = vi.fn(); const controller = new AbortController();
    const source = await openSpeechmaticsPcmSource(send, controller.signal);
    port.onmessage?.({ data: { samples: new Float32Array([1, -1]) } });
    expect(send).toHaveBeenCalledTimes(1);
    const bytes = send.mock.calls[0][0] as Uint8Array;
    expect([...bytes]).toEqual([255, 127, 0, 128]); // Raw little-endian samples, without RIFF header.
    await source.flush(); controller.abort(); source.stop();
    expect(track.stop).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1); expect(port.close).toHaveBeenCalledTimes(1);
  });
  it('emits every final requirement as transcript data for automatic generation without keyword interception', async () => {
    const { capture, sockets, onSegment } = setup(); await capture.start(); sockets[0].open();
    sockets[0].message({ message: 'AddTranscript', metadata: { transcript: 'Build prototype.', start_time: 0, end_time: 1 } });
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({ text: 'Build prototype.', isFinal: true }));
    capture.dispose();
  });
});
