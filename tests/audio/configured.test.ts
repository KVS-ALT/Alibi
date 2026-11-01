// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConfiguredSpeechCapture } from '../../src/audio/configured';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete (window as any).SpeechRecognition; });
const options = () => ({ sessionId: 's1', onSegment: vi.fn(), onBuild: vi.fn() });
describe('configured capture selection', () => {
  it('blocks a selected disabled provider without microphone acquisition or browser fallback', async () => {
    const factory = vi.fn(); (window as any).SpeechRecognition = factory;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ providers: { speech: { provider: 'speechmatics', configured: true, enabled: false } } })));
    vi.stubGlobal('fetch', fetcher);
    const { result, unmount } = renderHook(() => useConfiguredSpeechCapture(options()));
    await act(async () => { await result.current.start(); });
    expect(result.current).toMatchObject({ provider: 'speechmatics', providerEnabled: false, status: 'muted', error: expect.any(String) });
    expect(factory).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1); unmount();
  });
  it('awaits metadata before starting browser recognition and treats speech keywords as ordinary requirements', async () => {
    let resolve!: (response: Response) => void;
    const instances: any[] = [];
    (window as any).SpeechRecognition = class {
      continuous = false; interimResults = false; lang = ''; onstart: any = null; onend: any = null; onerror: any = null; onresult: any = null;
      start = vi.fn(); abort = vi.fn(); constructor() { instances.push(this); }
    };
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const props = options(); const { result, unmount } = renderHook(() => useConfiguredSpeechCapture(props));
    let pending!: Promise<void>;
    act(() => { pending = result.current.start(); });
    expect(instances).toHaveLength(0);
    await act(async () => { resolve(new Response(JSON.stringify({ providers: { speech: { provider: 'browser', configured: true, enabled: true } } }))); await pending; });
    expect(instances).toHaveLength(1);
    act(() => instances[0].onresult({ resultIndex: 0, results: [{ 0: { transcript: 'Build prototype.' }, isFinal: true }] }));
    expect(props.onSegment).toHaveBeenCalledWith(expect.objectContaining({ text: 'Build prototype.', isFinal: true }));
    expect(props.onBuild).not.toHaveBeenCalled(); unmount();
  });
  it('bounds a metadata body that never resolves without starting any microphone', async () => {
    vi.useFakeTimers();
    const factory = vi.fn(); (window as any).SpeechRecognition = factory;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })));
    const { result, unmount } = renderHook(() => useConfiguredSpeechCapture(options()));
    await act(async () => { const pending = result.current.start(); await vi.advanceTimersByTimeAsync(5000); await pending; });
    expect(factory).not.toHaveBeenCalled(); expect(result.current.error).toEqual(expect.any(String)); unmount();
  }, 1000);
});
