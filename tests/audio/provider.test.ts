import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderCapture, encodeMonoPcmWav } from '../../src/audio/provider';

function setup() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const recorders: any[] = [];
  const createRecorder = vi.fn(() => {
    const recorder = { state: 'inactive', ondataavailable: null as any, onstop: null as any, onerror: null as any,
      start: vi.fn(() => { recorder.state = 'recording'; }),
      stop: vi.fn(() => { recorder.state = 'inactive'; recorder.ondataavailable?.({ data: new Blob(['self-contained-media']) }); recorder.onstop?.(); }),
    };
    recorders.push(recorder); return recorder;
  });
  const transport = { start: vi.fn(async () => {}), resume: vi.fn(async () => {}), mute: vi.fn(async () => {}), end: vi.fn(async () => {}),
    audio: vi.fn(async (request: any) => ({ ok: true, segment: { sessionId: 's1', segmentId: request.chunkId, text: 'Add a booking form', isFinal: true } })),
  };
  const getUserMedia = vi.fn(async () => stream as unknown as MediaStream);
  const onSegment = vi.fn();
  const normalizeAudio = vi.fn(async (_blob: Blob) => ({ audio: new Blob(['wav'], { type: 'audio/wav' }), durationMs: 5000 }));
  const capture = createProviderCapture({ sessionId: 's1', onSegment, onBuild: vi.fn(), transport }, { getUserMedia, createRecorder, normalizeAudio, supported: true, now: () => 5000 });
  return { capture, track, transport, getUserMedia, onSegment, normalizeAudio, recorders };
}
afterEach(() => vi.useRealTimers());
describe('bounded browser recording adapter', () => {
  it('does no microphone acquisition or network until Start and never records after a disabled response', async () => {
    const { capture, getUserMedia, transport } = setup();
    expect(getUserMedia).not.toHaveBeenCalled(); expect(transport.start).not.toHaveBeenCalled();
    transport.start.mockRejectedValueOnce(new Error('disabled'));
    await capture.resume(); expect(transport.start).not.toHaveBeenCalled();
    await capture.start();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(capture.getSnapshot()).toMatchObject({ status: 'muted', error: expect.stringMatching(/typ/i) });
  });
  it('flushes the active self-contained recording before returning and starts a fresh recorder', async () => {
    vi.useFakeTimers();
    const { capture, recorders, transport, onSegment, normalizeAudio, track } = setup();
    await capture.start(); await capture.start();
    expect(recorders).toHaveLength(1);
    await capture.flush();
    expect(recorders[0].stop).toHaveBeenCalledTimes(1);
    expect(recorders).toHaveLength(2);
    expect(normalizeAudio).toHaveBeenCalledWith(expect.any(Blob));
    expect(transport.audio).toHaveBeenCalledTimes(1);
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({ text: 'Add a booking form' }));
    expect(capture.getSnapshot().status).toBe('listening');
    capture.dispose(); expect(track.stop).toHaveBeenCalledTimes(1);
  });
  it('stops every track and ignores late audio/results after mute/end', async () => {
    const { capture, recorders, transport, track, onSegment } = setup();
    await capture.start();
    const lateData = recorders[0].ondataavailable;
    const lateStop = recorders[0].onstop;
    capture.mute(); capture.mute(); capture.end(); capture.end();
    lateData?.({ data: new Blob(['late']) }); lateStop?.();
    await capture.flush(); await capture.resume();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(transport.audio).not.toHaveBeenCalled(); expect(onSegment).not.toHaveBeenCalled();
    expect(capture.getSnapshot().status).toBe('ended');
  });
  it('stops a microphone granted after session end without recording or uploading', async () => {
    let grant!: (stream: any) => void;
    const track = { stop: vi.fn() };
    const createRecorder = vi.fn();
    const transport = { start: vi.fn(async () => {}), mute: vi.fn(async () => {}), resume: vi.fn(async () => {}), end: vi.fn(async () => {}), audio: vi.fn() };
    const capture = createProviderCapture({ sessionId: 's1', onSegment: vi.fn(), onBuild: vi.fn(), transport }, { supported: true, createRecorder, getUserMedia: () => new Promise(resolve => { grant = resolve; }) });
    const pending = capture.start(); await Promise.resolve();
    capture.end(); grant({ getTracks: () => [track] }); await pending;
    expect(track.stop).toHaveBeenCalledTimes(1); expect(createRecorder).not.toHaveBeenCalled(); expect(transport.audio).not.toHaveBeenCalled();
  });
  it('encodes actual mono 16kHz PCM16 WAV duration, downmixes channels and clamps amplitudes', () => {
    const pcm = encodeMonoPcmWav([new Float32Array([2, -2, 0, 1]), new Float32Array([2, -2, 0, 1])], 16000);
    const view = new DataView(pcm.buffer);
    expect(pcm.byteLength).toBe(52); expect(view.getUint32(24, true)).toBe(16000); expect(view.getUint16(22, true)).toBe(1);
    expect(view.getInt16(44, true)).toBe(32767); expect(view.getInt16(46, true)).toBe(-32768); expect(view.getUint32(40, true)).toBe(8);
  });
  it('bounds flush when a recorder never fires its stop callback', async () => {
    vi.useFakeTimers();
    const { capture, recorders, track } = setup();
    await capture.start();
    recorders[0].stop.mockImplementation(() => { recorders[0].state = 'inactive'; });
    const pending = capture.flush();
    await vi.advanceTimersByTimeAsync(1100);
    await pending;
    expect(capture.getSnapshot()).toMatchObject({ status: 'muted', error: expect.stringMatching(/typ/i) });
    expect(track.stop).toHaveBeenCalledTimes(1);
  }, 1000);
});
