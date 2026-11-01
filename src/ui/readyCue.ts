/** Optional local cue. Constructing this controller never opens an audio context. */
export function createReadyCue(enabled = false, factory: () => AudioContext = () => new AudioContext()) {
 let context: AudioContext | undefined;
 let disposed = false;
 let lastPlayed = '';
 return {
  async unlock() {
   if (!enabled || disposed) return;
   try { context ??= factory(); if (context.state === 'suspended') await context.resume(); } catch { /* The preview works without sound. */ }
  },
  play(resultKey: string) {
   if (!enabled || disposed || !context || context.state !== 'running' || lastPlayed === resultKey) return;
   try {
    const oscillator = context.createOscillator(), gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.035, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now); oscillator.stop(now + 0.13); lastPlayed = resultKey;
   } catch { /* Audio is optional and cannot fail generation. */ }
  },
  dispose() { disposed = true; if (context) void context.close().catch(() => {}); context = undefined; },
 };
}
