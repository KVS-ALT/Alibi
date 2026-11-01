// @vitest-environment jsdom
import { StrictMode, createElement, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSpeechCapture } from '../../src/audio';
import type { RecognitionLike } from '../../src/audio/capture';

class Recognition implements RecognitionLike {
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: RecognitionLike['onstart'] = null;
  onend: RecognitionLike['onend'] = null;
  onerror: RecognitionLike['onerror'] = null;
  onresult: RecognitionLike['onresult'] = null;
  start = vi.fn();
  abort = vi.fn();
}

describe('capture hook resource ownership', () => {
  it('survives StrictMode and stops microphone access on unmount', () => {
    const instances: Recognition[] = [];
    const factory = () => { const value = new Recognition(); instances.push(value); return value; };
    const onSegment = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    const { result, unmount } = renderHook(() => useSpeechCapture({ sessionId: 's1', onSegment, onBuild: vi.fn(), createRecognition: factory }), { wrapper });
    expect(instances).toHaveLength(0);
    expect(result.current.status).toBe('idle');
    act(() => result.current.start());
    expect(instances).toHaveLength(1);
    act(() => instances[0].onstart?.());
    expect(result.current.status).toBe('listening');
    const lateResult = instances[0].onresult;
    unmount();
    expect(instances[0].abort).toHaveBeenCalledTimes(1);
    lateResult?.({ resultIndex: 0, results: [{ 0: { transcript: 'late' }, isFinal: true }] });
    expect(onSegment).not.toHaveBeenCalled();
  });

  it('uses current callbacks without reacquisition, and releases the old session when replaced', () => {
    const instances: Recognition[] = [];
    const factory = () => { const value = new Recognition(); instances.push(value); return value; };
    const first = vi.fn();
    const second = vi.fn();
    const onBuild = vi.fn();
    const { result, rerender, unmount } = renderHook(({ sessionId, onSegment }) => useSpeechCapture({ sessionId, onSegment, onBuild, createRecognition: factory }), {
      initialProps: { sessionId: 's1', onSegment: first },
    });
    act(() => result.current.start());
    rerender({ sessionId: 's1', onSegment: second });
    act(() => instances[0].onresult?.({ resultIndex: 0, results: [{ 0: { transcript: 'requirements' }, isFinal: true }] }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1', text: 'requirements' }));
    expect(instances).toHaveLength(1);
    rerender({ sessionId: 's2', onSegment: second });
    expect(instances[0].abort).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
    expect(instances).toHaveLength(1);
    act(() => result.current.resume());
    expect(instances).toHaveLength(1);
    act(() => result.current.start());
    expect(instances).toHaveLength(2);
    unmount();
  });
});
