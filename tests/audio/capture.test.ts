import { describe, expect, it, vi } from 'vitest';
import { createSpeechCapture, type RecognitionLike } from '../../src/audio/capture';

class BrowserRecognition implements RecognitionLike {
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: RecognitionLike['onstart'] = null;
  onend: RecognitionLike['onend'] = null;
  onerror: RecognitionLike['onerror'] = null;
  onresult: RecognitionLike['onresult'] = null;
  start = vi.fn();
  abort = vi.fn();
  result(text: string, isFinal = true) {
    this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal }] });
  }
}
function setup(available = true) {
  const instances: BrowserRecognition[] = [];
  const factory = vi.fn(() => { const recognition = new BrowserRecognition(); instances.push(recognition); return recognition; });
  const onSegment = vi.fn();
  const onBuild = vi.fn();
  const capture = createSpeechCapture({ sessionId: 's1', createRecognition: available ? factory : undefined, onSegment, onBuild });
  return { capture, factory, instances, onSegment, onBuild };
}

describe('consented browser capture lifecycle', () => {
  it('does not acquire audio before Start and ignores duplicate starts', () => {
    const { capture, factory, instances } = setup();
    expect(factory).not.toHaveBeenCalled();
    expect(capture.getSnapshot().status).toBe('idle');
    capture.resume();
    expect(factory).not.toHaveBeenCalled();
    capture.start(); capture.start();
    expect(instances).toHaveLength(1);
    expect(instances[0].start).toHaveBeenCalledTimes(1);
    instances[0].onstart?.();
    expect(capture.getSnapshot().status).toBe('listening');
  });
  it('aborts on mute/end, rejects late results, and resumes only a live session', () => {
    const { capture, instances, onSegment } = setup();
    capture.start();
    const staleResult = instances[0].onresult;
    capture.mute(); capture.mute();
    expect(instances[0].abort).toHaveBeenCalledTimes(1);
    expect(capture.getSnapshot().status).toBe('muted');
    staleResult?.({ resultIndex: 0, results: [{ 0: { transcript: 'late' }, isFinal: true }] });
    expect(onSegment).not.toHaveBeenCalled();
    capture.resume(); capture.resume();
    expect(instances).toHaveLength(2);
    capture.end(); capture.end(); capture.resume();
    expect(instances[1].abort).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(2);
    expect(capture.getSnapshot().status).toBe('ended');
  });
  it('keeps capture running for spoken Build and mutes on the exact pause phrase', () => {
    const { capture, instances, onBuild, onSegment } = setup();
    capture.start(); instances[0].onstart?.();
    instances[0].result('Build prototype.');
    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(capture.getSnapshot().status).toBe('listening');
    expect(instances[0].abort).not.toHaveBeenCalled();
    instances[0].result('we might build prototype tomorrow');
    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(onSegment).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1', text: 'we might build prototype tomorrow', isFinal: true }));
    instances[0].result('Pause listening');
    expect(capture.getSnapshot().status).toBe('muted');
  });
  it('emits stable interim/final segment IDs without persisting audio', () => {
    const { capture, instances, onSegment } = setup();
    capture.start(); instances[0].onstart?.();
    instances[0].result('hello', false);
    expect(capture.getSnapshot().interimText).toBe('hello');
    const interim = onSegment.mock.calls[0][0];
    instances[0].result('hello world');
    expect(onSegment.mock.calls[1][0]).toEqual({ ...interim, text: 'hello world', isFinal: true });
    expect(capture.getSnapshot().interimText).toBe('');
  });
  it('fails gracefully on mic denial, retaining a live typed session', () => {
    const { capture, instances } = setup();
    capture.start();
    instances[0].onerror?.({ error: 'not-allowed' });
    expect(capture.getSnapshot()).toMatchObject({ status: 'muted', supported: true });
    expect(capture.getSnapshot().error).toMatch(/permission|denied/i);
    expect(instances[0].abort).toHaveBeenCalledTimes(1);
  });
  it('offers honest typed fallback without creating a recognition instance', () => {
    const { capture, factory } = setup(false);
    capture.start();
    expect(capture.getSnapshot()).toMatchObject({ status: 'muted', supported: false });
    expect(capture.getSnapshot().error).toMatch(/speech|browser/i);
    expect(factory).not.toHaveBeenCalled();
  });
  it('cleans up on dispose and cannot be restarted', () => {
    const { capture, instances, onSegment } = setup();
    capture.start(); capture.dispose(); capture.start();
    expect(instances[0].abort).toHaveBeenCalledTimes(1);
    instances[0].result('discard');
    expect(onSegment).not.toHaveBeenCalled();
    expect(instances).toHaveLength(1);
  });
  it('restarts after a normal browser end, but cancels pending restart on mute', () => {
    vi.useFakeTimers();
    const { capture, instances } = setup();
    capture.start(); instances[0].onstart?.(); instances[0].onend?.();
    vi.runOnlyPendingTimers();
    expect(instances).toHaveLength(2);
    instances[1].onend?.(); capture.mute(); vi.runOnlyPendingTimers();
    expect(instances).toHaveLength(2);
    capture.dispose(); vi.useRealTimers();
  });
});
