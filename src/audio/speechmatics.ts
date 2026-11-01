import { useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptSegment } from '../contracts';
import type { CaptureSnapshot } from './capture';
import { encodeMonoPcmWav } from './provider';

export interface SpeechmaticsSocket {
  readyState: number; bufferedAmount: number;
  onopen: (() => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  send(data: string | Uint8Array): void;
  close(): void;
}
export interface PcmSource { stop(): void; flush(): void | Promise<void> }
export type SpeechmaticsTokenTransport = ((sessionId: string, signal: AbortSignal) => Promise<{ token: string; url: string }>) & {
  mute?(sessionId: string): Promise<void>; end?(sessionId: string): Promise<void>;
};
export interface SpeechmaticsCaptureOptions {
  sessionId: string; onSegment(segment: TranscriptSegment): void; onBuild?(): void;
  tokenTransport?: SpeechmaticsTokenTransport;
}
export interface SpeechmaticsCaptureDependencies {
  supported?: boolean;
  createSocket?: (url: string) => SpeechmaticsSocket;
  openAudio?: (send: (pcm: Uint8Array) => void, signal: AbortSignal) => Promise<PcmSource>;
}
const safeError = 'Speech recognition is unavailable. Try starting again.';
function bounded<T>(operation: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error(safeError)); };
    const timer = setTimeout(abort, timeoutMs);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    operation.then(value => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve(value); }, error => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(error); });
  });
}

export function createHttpSpeechmaticsTokenTransport(fetcher: typeof fetch = fetch): SpeechmaticsTokenTransport {
  const transport: SpeechmaticsTokenTransport = async (sessionId, signal) => {
    const request = async (url: string, body: unknown) => {
      const response = await fetcher(url, { method: 'POST', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(safeError);
      return response;
    };
    await request('/api/sessions', { id: sessionId });
    const base = `/api/sessions/${encodeURIComponent(sessionId)}/speech`;
    await request(`${base}/start`, { consented: true });
    const response = await request(`${base}/token`, { consented: true });
    const result = await response.json() as { ok?: unknown; token?: unknown; url?: unknown };
    if (result.ok !== true || typeof result.token !== 'string' || result.token.length > 4096 || result.url !== 'wss://eu.rt.speechmatics.com/v2/') throw new Error(safeError);
    return { token: result.token, url: result.url };
  };
  const control = async (id: string, action: string) => {
    await fetcher(`/api/sessions/${encodeURIComponent(id)}/speech/${action}`, { method: 'POST', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(3000), headers: { 'Content-Type': 'application/json' }, body: '{}' });
  };
  transport.mute = id => control(id, 'mute'); transport.end = id => control(id, 'end');
  return transport;
}

/** Silent AudioWorklet graph. Captures PCM only after an explicit authorized Start. */
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

export function createSpeechmaticsCapture(options: SpeechmaticsCaptureOptions, dependencies: SpeechmaticsCaptureDependencies = {}) {
  const supported = dependencies.supported ?? (typeof WebSocket !== 'undefined' && typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined' && !!globalThis.navigator?.mediaDevices?.getUserMedia);
  const getToken = options.tokenTransport ?? createHttpSpeechmaticsTokenTransport();
  const socketFactory = dependencies.createSocket ?? (url => new WebSocket(url) as unknown as SpeechmaticsSocket);
  const openAudio = dependencies.openAudio ?? openSpeechmaticsPcmSource;
  const listeners = new Set<() => void>();
  let snapshot: CaptureSnapshot & { errorCode?: string } = { status: 'idle', supported, starting: false, interimText: '' };
  let consented = false, active = false, disposed = false, epoch = 0, connections = 0, segmentNumber = 0;
  let abort = new AbortController(), source: PcmSource | undefined, socket: SpeechmaticsSocket | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined, retry: ReturnType<typeof setTimeout> | undefined;
  let flushComplete: (() => void) | undefined;
  let currentSegment = '', sent = 0, acknowledged = 0;
  const sentSizes: number[] = [];
  const finals = new Set<string>();
  const update = (patch: Partial<typeof snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  const valid = (version: number) => active && !disposed && epoch === version;
  function release() {
    epoch++; abort.abort();
    if (deadline) clearTimeout(deadline); deadline = undefined;
    if (retry) clearTimeout(retry); retry = undefined;
    source?.stop(); source = undefined;
    const previous = socket; socket = undefined;
    if (previous) { previous.onopen = previous.onmessage = previous.onclose = previous.onerror = null; try { previous.close(); } catch {} }
    flushComplete?.(); flushComplete = undefined;
    currentSegment = ''; sent = acknowledged = 0; sentSizes.length = 0; finals.clear();
  }
  function mute() {
    if (!consented || snapshot.status === 'ended' || (!active && !snapshot.starting)) return;
    active = false; release(); update({ status: 'muted', starting: false, interimText: '' });
    void getToken.mute?.(options.sessionId).catch(() => {});
  }
  function fail(code: string) { mute(); update({ status: 'muted', starting: false, errorCode: code, error: safeError, interimText: '' }); }
  function sendPcm(pcm: Uint8Array, version: number, current: SpeechmaticsSocket) {
    if (!valid(version) || socket !== current || current.readyState !== 1) return;
    if (!(pcm instanceof Uint8Array) || !pcm.byteLength || pcm.byteLength % 2 || pcm.byteLength > 32000
      || current.bufferedAmount > 160000 || sentSizes.reduce((sum, value) => sum + value, 0) + pcm.byteLength > 320000 || sent - acknowledged >= 500) { fail('audio_backpressure'); return; }
    try { current.send(pcm); sent++; sentSizes.push(pcm.byteLength); } catch { fail('connection_error'); }
  }
  async function connect() {
    release(); active = true; abort = new AbortController(); const version = epoch;
    update({ starting: true, error: undefined, errorCode: undefined, interimText: '' });
    try {
      const temporary = await bounded(getToken(options.sessionId, abort.signal), abort.signal, 15_000);
      if (!valid(version)) return;
      if (temporary.url !== 'wss://eu.rt.speechmatics.com/v2/' || !temporary.token || temporary.token.length > 4096) throw new Error(safeError);
      const url = new URL(temporary.url); url.searchParams.set('jwt', temporary.token);
      const current = socketFactory(url.toString()); socket = current;
      deadline = setTimeout(() => { if (valid(version)) fail('connection_timeout'); }, 15_000);
      let recognizing = false;
      current.onopen = () => {
        if (!valid(version)) return;
        try { current.send(JSON.stringify({ message: 'StartRecognition', audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: 16000 }, transcription_config: { language: 'en', enable_partials: true, model: 'enhanced', max_delay: 0.7 } })); } catch { fail('connection_error'); }
      };
      current.onmessage = event => {
        if (!valid(version) || socket !== current) return;
        try {
          if (typeof event.data !== 'string' || event.data.length > 65536) { fail('invalid_provider_response'); return; }
          const message = JSON.parse(event.data) as { message?: string; metadata?: { transcript?: unknown; start_time?: number; end_time?: number }; seq_no?: number };
          if (message.message === 'RecognitionStarted') {
            if (recognizing) return; recognizing = true;
            void (async () => {
              try {
                const acquired = await openAudio(pcm => sendPcm(pcm, version, current), abort.signal);
                if (!valid(version)) { acquired.stop(); return; }
                source = acquired; if (deadline) clearTimeout(deadline); deadline = undefined;
                update({ status: 'listening', starting: false });
              } catch { if (valid(version)) fail('microphone_unavailable'); }
            })();
          } else if (message.message === 'AudioAdded' && Number.isSafeInteger(message.seq_no) && message.seq_no! > acknowledged && message.seq_no! <= sent) {
            sentSizes.splice(0, message.seq_no! - acknowledged); acknowledged = message.seq_no!;
          } else if (message.message === 'AddPartialTranscript' || message.message === 'AddTranscript') {
            const text = message.metadata?.transcript;
            if (typeof text !== 'string' || text.length > 50_000 || text.includes('\0') || text.includes(temporary.token)) { fail('invalid_provider_response'); return; }
            const isFinal = message.message === 'AddTranscript';
            const identity = JSON.stringify([message.metadata?.start_time, message.metadata?.end_time, text]);
            if (isFinal && finals.has(identity)) return;
            if (!currentSegment) currentSegment = `${options.sessionId}:speechmatics:${++segmentNumber}`;
            const segment = { sessionId: options.sessionId, segmentId: currentSegment, text: text.trim(), isFinal };
            if (isFinal) { finals.add(identity); currentSegment = ''; if (finals.size > 10000) { fail('session_limit'); return; } }
            if (segment.text) options.onSegment(segment);
            if (valid(version)) update({ interimText: isFinal ? '' : segment.text });
          } else if (message.message === 'EndOfUtterance') { flushComplete?.(); flushComplete = undefined; }
          else if (message.message === 'Error') fail('provider_error');
        } catch { if (valid(version)) fail('invalid_provider_response'); }
      };
      const disconnected = (code: number) => {
        if (!valid(version)) return;
        if ([1006, 1011, 4005, 4013].includes(code) && connections < 1) {
          connections++; release(); update({ status: 'muted', starting: true, interimText: '' });
          retry = setTimeout(() => { retry = undefined; if (active && !disposed) void connect(); }, 5000);
        } else fail('connection_closed');
      };
      current.onerror = () => disconnected(1006);
      current.onclose = event => disconnected(event.code);
    } catch { if (valid(version)) fail('authorization_failed'); }
  }
  async function start() {
    if (consented || disposed || snapshot.status === 'ended') return;
    consented = true;
    if (!supported) { update({ status: 'muted', errorCode: 'unsupported', error: safeError }); return; }
    active = true; await connect();
  }
  async function resume() {
    if (!consented || active || disposed || snapshot.status === 'ended' || !supported) return;
    connections = 0; active = true; await connect();
  }
  async function flush() {
    if (!active || !source || socket?.readyState !== 1) return;
    try {
      await bounded(Promise.resolve(source.flush()), abort.signal, 1000);
      const pending = new Promise<void>(resolve => { flushComplete = resolve; });
      socket.send(JSON.stringify({ message: 'ForceEndOfUtterance' }));
      await bounded(pending, abort.signal, 5000);
    } catch { if (active) fail('flush_timeout'); throw new Error(safeError); }
  }
  function end() { if (snapshot.status === 'ended') return; const notify = consented; active = false; release(); update({ status: 'ended', starting: false, interimText: '' }); if (notify) void getToken.end?.(options.sessionId).catch(() => {}); }
  function dispose() { if (disposed) return; end(); disposed = true; listeners.clear(); }
  return { start, resume, mute, end, dispose, flush, getSnapshot: () => snapshot, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}

export function useSpeechmaticsCapture(options: SpeechmaticsCaptureOptions) {
  const callbacks = useRef(options), controller = useRef<ReturnType<typeof createSpeechmaticsCapture> | null>(null);
  const [snapshot, setSnapshot] = useState<CaptureSnapshot & { errorCode?: string }>({ status: 'idle', supported: true, starting: false, interimText: '' });
  useEffect(() => { callbacks.current = options; });
  useEffect(() => {
    const capture = createSpeechmaticsCapture({ sessionId: options.sessionId, tokenTransport: options.tokenTransport, onSegment: segment => callbacks.current.onSegment(segment) });
    controller.current = capture; const unsubscribe = capture.subscribe(() => setSnapshot(capture.getSnapshot())); setSnapshot(capture.getSnapshot());
    return () => { unsubscribe(); capture.dispose(); if (controller.current === capture) controller.current = null; };
  }, [options.sessionId, options.tokenTransport]);
  const actions = useMemo(() => ({ start: () => controller.current?.start(), resume: () => controller.current?.resume(), mute: () => controller.current?.mute(), end: () => controller.current?.end(), flush: async () => { await controller.current?.flush(); } }), []);
  return { ...snapshot, ...actions };
}
