/** Coalesces final speech snapshots; never runs two generations concurrently. */
export function createAutomaticGenerationQueue(options: {
  prepare?: () => Promise<void>;
  run: (text: string, isCurrent: () => boolean) => Promise<void>;
  onError?: (error: unknown) => void;
  delayMs?: number;
  maximumWaitMs?: number;
}) {
  const delay = options.delayMs ?? 1500;
  const maximum = options.maximumWaitMs ?? 6000;
  let latest = '', attempted = '', busy = false, disposed = false;
  let firstChange = 0, lastChange = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    if (disposed || !latest || latest === attempted) return;
    if (timer) clearTimeout(timer);
    const due = Math.min(lastChange + delay, firstChange + maximum);
    timer = setTimeout(() => { timer = undefined; void drain(); }, Math.max(0, due - Date.now()));
  }
  async function drain() {
    if (disposed || busy || !latest || latest === attempted) return;
    busy = true;
    attempted = latest;
    firstChange = 0;
    try {
      await options.prepare?.();
      if (disposed) return;
      const text = latest;
      attempted = text;
      firstChange = 0;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await options.run(text, () => !disposed && latest === text);
    } catch (error) { if (!disposed) options.onError?.(error); }
    finally { busy = false; if (!disposed && latest !== attempted) schedule(); }
  }
  return {
    update(text: string) {
      const normalized = text.trim();
      if (disposed || !normalized || normalized === latest) return;
      latest = normalized;
      lastChange = Date.now();
      if (!firstChange) firstChange = lastChange;
      schedule();
    },
    dispose() { disposed = true; if (timer) clearTimeout(timer); },
  };
}
