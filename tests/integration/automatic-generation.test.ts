import { afterEach, expect, it, vi } from 'vitest';
import { createAutomaticGenerationQueue } from '../../src/ui/automaticGeneration';
afterEach(() => vi.useRealTimers());
it('debounces final snapshots and ignores duplicate text', async () => {
 vi.useFakeTimers(); const run = vi.fn(async (_text: string) => {});
 const queue = createAutomaticGenerationQueue({ run });
 queue.update('A bakery'); await vi.advanceTimersByTimeAsync(1000);
 queue.update('A bakery with ordering'); await vi.advanceTimersByTimeAsync(1499);
 expect(run).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1);
 expect(run).toHaveBeenCalledTimes(1); expect(run.mock.calls[0][0]).toBe('A bakery with ordering');
 queue.update('A bakery with ordering'); await vi.advanceTimersByTimeAsync(7000);
 expect(run).toHaveBeenCalledTimes(1); queue.dispose();
});
it('keeps one request in flight, rejects obsolete commits, and drains only the newest snapshot', async () => {
 vi.useFakeTimers(); let finish!: () => void; const accepted: string[] = []; let active = 0, maximum = 0;
 const run = vi.fn(async (text: string, current: () => boolean) => {
  maximum = Math.max(maximum, ++active);
  if (text === 'first') await new Promise<void>(resolve => { finish = resolve; });
  if (current()) accepted.push(text); active--;
 });
 const queue = createAutomaticGenerationQueue({ run });
 queue.update('first'); await vi.advanceTimersByTimeAsync(1500);
 queue.update('second'); await vi.advanceTimersByTimeAsync(1000); queue.update('newest');
 await vi.advanceTimersByTimeAsync(1600); expect(run).toHaveBeenCalledTimes(1);
 finish(); await vi.advanceTimersByTimeAsync(1);
 expect(maximum).toBe(1); expect(accepted).toEqual(['newest']); expect(run).toHaveBeenCalledTimes(2); queue.dispose();
});
it('bounds continuous changes and snapshots the final text delivered by flush', async () => {
 vi.useFakeTimers(); const run = vi.fn(async (_text: string) => {});
 const queue = createAutomaticGenerationQueue({ run, prepare: async () => { queue.update('flushed final'); } });
 for (let i = 0; i < 6; i++) { queue.update(`segment ${i}`); await vi.advanceTimersByTimeAsync(1000); }
 expect(run).toHaveBeenCalledTimes(1); expect(run.mock.calls[0][0]).toBe('flushed final'); queue.dispose();
});
it('does not retry a failed flush forever or run after disposal', async () => {
 vi.useFakeTimers(); const prepare = vi.fn(async () => { throw new Error('offline'); }); const run = vi.fn(async (_text: string) => {});
 const queue = createAutomaticGenerationQueue({ run, prepare }); queue.update('first');
 await vi.advanceTimersByTimeAsync(10_000); expect(prepare).toHaveBeenCalledTimes(1);
 queue.update('second'); queue.dispose(); await vi.advanceTimersByTimeAsync(10_000); expect(run).not.toHaveBeenCalled();
});
it('retains newer speech when an older in-flight operation rejects', async () => {
 vi.useFakeTimers(); let reject!: (error: Error) => void;
 const run = vi.fn(async (text: string) => { if (text === 'old') await new Promise<void>((_resolve, fail) => { reject = fail; }); });
 const queue = createAutomaticGenerationQueue({ run }); queue.update('old');
 await vi.advanceTimersByTimeAsync(1500); queue.update('new');
 await vi.advanceTimersByTimeAsync(1600); reject(new Error('offline'));
 await vi.advanceTimersByTimeAsync(1); expect(run.mock.calls.map(call => call[0])).toEqual(['old', 'new']); queue.dispose();
});

