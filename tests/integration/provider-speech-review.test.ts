// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createElevenLabsTranscriber } from '../../server/elevenlabs';
import { createProviderCapture, encodeMonoPcmWav } from '../../src/audio/provider';

const live = { enabled: true, liveCallsAllowed: true, apiKey: 'synthetic-speech-review-secret' };
const audio = encodeMonoPcmWav([new Float32Array(48000), new Float32Array(48000)], 48000);
const chunk = { sessionId: 'same-builder', chunkId: 'same-chunk', audio, mimeType: 'audio/wav', durationMs: 1000 };

describe('independent consent and session lifetime review', () => {
  it('never lets an ended session\'s late transcript contaminate a freshly consented session with the same builder ID', async () => {
    let oldResponse!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { oldResponse = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'Current session only.' })));
    const provider = createElevenLabsTranscriber(live, { fetcher });
    expect(provider.startSession({ sessionId: chunk.sessionId, consented: true })).toBe(true);
    const previous = provider.transcribe(chunk);
    provider.endSession(chunk.sessionId);
    expect(provider.startSession({ sessionId: chunk.sessionId, consented: false })).toBe(false);
    expect(provider.startSession({ sessionId: chunk.sessionId, consented: true })).toBe(true);
    const current = provider.transcribe(chunk);
    oldResponse(new Response(JSON.stringify({ text: 'Old private conversation.' })));
    expect(await previous).toMatchObject({ ok: false, code: 'cancelled' });
    expect(await current).toMatchObject({ ok: true, segment: { text: 'Current session only.' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    provider.dispose();
  });

  it('accepts locally normalized WAV but rejects a modified stereo declaration before provider transmission', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ text: 'A local sample.' })));
    const provider = createElevenLabsTranscriber(live, { fetcher });
    provider.startSession({ sessionId: chunk.sessionId, consented: true });
    const forged = audio.slice(); new DataView(forged.buffer).setUint16(22, 2, true);
    expect(await provider.transcribe({ ...chunk, audio: forged })).toMatchObject({ ok: false, code: 'invalid_audio' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await provider.transcribe(chunk)).toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('does not ask for the microphone when the server refuses explicit session start', async () => {
    const acquire = vi.fn();
    const transport = { start: vi.fn(async () => { throw new Error('Synthetic refusal'); }), resume: vi.fn(), mute: vi.fn(async () => {}), end: vi.fn(async () => {}), audio: vi.fn() };
    const capture = createProviderCapture({ sessionId: 'owned-builder', onSegment: vi.fn(), onBuild: vi.fn(), transport }, { supported: true, getUserMedia: acquire });
    expect(transport.start).not.toHaveBeenCalled(); expect(acquire).not.toHaveBeenCalled();
    await capture.start();
    expect(capture.getSnapshot()).toMatchObject({ status: 'muted', starting: false });
    expect(acquire).not.toHaveBeenCalled(); expect(transport.audio).not.toHaveBeenCalled();
    capture.dispose();
  });
});
