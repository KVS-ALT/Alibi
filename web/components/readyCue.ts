/** Optional, local-only audio. No context or sound until the explicit Start gesture. */
export function createReadyCue(enabled: boolean) {
 let context: AudioContext | undefined;
 let disposed = false, lastVersion = "";
 return {
  async unlock() {
   if (!enabled || disposed) return;
   try { context ??= new AudioContext(); if (context.state === "suspended") await context.resume(); } catch { /* Sound is optional. */ }
  },
  play(version: string) {
   if (!enabled || disposed || !context || context.state !== "running" || lastVersion === version) return;
   try {
    const oscillator = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
    oscillator.type = "sine"; oscillator.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.035, now + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now); oscillator.stop(now + 0.13); lastVersion = version;
   } catch { /* Sound must never interrupt the preview. */ }
  },
  dispose() { disposed = true; if (context) void context.close().catch(() => {}); context = undefined; },
 };
}
