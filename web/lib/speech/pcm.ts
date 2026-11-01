export interface PcmSource { stop(): void; flush(): void | Promise<void> }
const safeError = 'Microphone capture is unavailable. Check access and try again.';
function bounded<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error(safeError)); };
    const timer = setTimeout(abort, timeoutMs);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    operation.then(value => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(value); }, error => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(error); });
  });
}
export function encodeMonoPcmWav(channels: readonly Float32Array[], sampleRate: number): Uint8Array<ArrayBuffer> {
  const length = channels[0]?.length ?? 0;
  if (!channels.length || channels.length > 8 || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000
    || !length || length / sampleRate > 30 || channels.some(channel => channel.length !== length)) throw new Error('Invalid decoded audio');
  const count = Math.floor(length * 16000 / sampleRate);
  const bytes = new Uint8Array(44 + count * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
  for (let index = 0; index < count; index++) {
    const position = index * sampleRate / 16000;
    const left = Math.floor(position), right = Math.min(left + 1, length - 1), fraction = position - left;
    let sample = 0;
    for (const channel of channels) sample += channel[left] * (1 - fraction) + channel[right] * fraction;
    sample = Math.max(-1, Math.min(1, sample / channels.length));
    view.setInt16(44 + index * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
  }
  return bytes;
}

export async function openSpeechmaticsPcmSource(send: (pcm: Uint8Array) => void, signal: AbortSignal): Promise<PcmSource> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); throw new Error(safeError); }
  let context: AudioContext | undefined;
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let gain: GainNode | undefined;
  let stopped = false, nextFlush = 0;
  const flushes = new Map<number, () => void>();
  const stop = () => {
    if (stopped) return; stopped = true;
    signal.removeEventListener('abort', stop);
    if (node) { node.port.onmessage = null; node.port.close(); node.disconnect(); }
    source?.disconnect(); gain?.disconnect(); stream.getTracks().forEach(track => track.stop());
    void context?.close().catch(() => {}); flushes.forEach(resolve => resolve()); flushes.clear();
  };
  const moduleUrl = URL.createObjectURL(new Blob([`
    class SpeechPcm extends AudioWorkletProcessor {
      constructor(){super();this.samples=[];this.port.onmessage=e=>{if(e.data.flush){this.emit();this.port.postMessage({flushed:e.data.flush});}};}
      emit(){if(this.samples.length){const data=new Float32Array(this.samples);this.samples=[];this.port.postMessage({samples:data},[data.buffer]);}}
      process(inputs){const channels=inputs[0];if(channels?.length){for(let i=0;i<channels[0].length;i++){let sum=0;for(const channel of channels)sum+=channel[i];this.samples.push(sum/channels.length);}if(this.samples.length>=2048)this.emit();}return true;}
    } registerProcessor('speechmatics-pcm',SpeechPcm);
  `], { type: 'text/javascript' }));
  try {
    context = new AudioContext({ sampleRate: 16000 });
    await bounded(context.audioWorklet.addModule(moduleUrl), signal, 10_000);
    if (signal.aborted) throw new Error(safeError);
    node = new AudioWorkletNode(context, 'speechmatics-pcm');
    const sampleRate = context.sampleRate;
    node.port.onmessage = event => {
      if (stopped || signal.aborted) return;
      if (event.data.samples instanceof Float32Array && event.data.samples.length) send(encodeMonoPcmWav([event.data.samples], sampleRate).subarray(44));
      if (typeof event.data.flushed === 'number') { flushes.get(event.data.flushed)?.(); flushes.delete(event.data.flushed); }
    };
    source = context.createMediaStreamSource(stream); gain = context.createGain(); gain.gain.value = 0;
    source.connect(node); node.connect(gain); gain.connect(context.destination);
    signal.addEventListener('abort', stop, { once: true });
    await bounded(context.resume(), signal, 10_000);
    if (signal.aborted) throw new Error(safeError);
    return { stop, flush: () => {
      if (stopped || !node) return Promise.resolve();
      const id = ++nextFlush;
      const pending = new Promise<void>(resolve => { flushes.set(id, resolve); node!.port.postMessage({ flush: id }); });
      return bounded(pending, signal, 1000);
    } };
  } catch { stop(); throw new Error(safeError); }
  finally { URL.revokeObjectURL(moduleUrl); }
}


