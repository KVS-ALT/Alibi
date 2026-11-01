import { expect, it, vi } from 'vitest';
import { createReadyCue } from '../../src/ui/readyCue';
function fakeContext() {
 const start = vi.fn();
 const context = {
  state: 'running', currentTime: 0, destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
  createOscillator: () => ({ frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn(), start, stop: vi.fn() }),
  createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }),
 } as unknown as AudioContext;
 return { context, start };
}
it('is off by default and creates no audio context before an explicit unlock', async () => {
 const { context, start } = fakeContext(); const factory = vi.fn(() => context);
 const off = createReadyCue(false, factory); await off.unlock(); off.play('session:1'); expect(factory).not.toHaveBeenCalled();
 const on = createReadyCue(true, factory); on.play('session:1'); expect(factory).not.toHaveBeenCalled();
 await on.unlock(); on.play('session:1'); on.play('session:1'); expect(start).toHaveBeenCalledTimes(1);
 on.play('session:2'); expect(start).toHaveBeenCalledTimes(2); on.dispose(); on.play('session:3'); expect(start).toHaveBeenCalledTimes(2);
});
it('silently tolerates unavailable audio without affecting the preview', async () => {
 const cue = createReadyCue(true, () => { throw new Error('unavailable'); });
 await expect(cue.unlock()).resolves.toBeUndefined(); expect(() => cue.play('session:1')).not.toThrow(); cue.dispose();
});
