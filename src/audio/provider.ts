import { useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptSegment } from '../contracts';
import type { CaptureSnapshot } from './capture';

export interface SpeechUpload { sessionId: string; chunkId: string; audio: Blob; durationMs: number; signal: AbortSignal }
export interface ProviderSpeechTransport {
  start(sessionId: string, signal: AbortSignal): Promise<void>;
  resume(sessionId: string, signal: AbortSignal): Promise<void>;
  mute(sessionId: string): Promise<void>;
  end(sessionId: string): Promise<void>;
  audio(input: SpeechUpload): Promise<{ ok: boolean; segment?: TranscriptSegment }>;
}
export interface ProviderCaptureOptions {
  sessionId: string;
  lifecycleKey?: number;
  onSegment: (segment: TranscriptSegment) => void;
  onBuild: () => void;
  transport?: ProviderSpeechTransport;
  buildPhrase?: string;
  pausePhrase?: string;
}
export interface RecorderLike {
  state: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
export interface ProviderCaptureDependencies {
  supported?: boolean;
  getUserMedia?: () => Promise<MediaStream>;
  createRecorder?: (stream: MediaStream) => RecorderLike;
  normalizeAudio?: (blob: Blob) => Promise<{ audio: Blob; durationMs: number }>;
  now?: () => number;
}
const fallbackMessage = 'Audio transcription is unavailable. Try starting again or end the session.';
function bounded<T>(operation: Promise<T>, signal: AbortSignal, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); reject(new Error(fallbackMessage)); };
    const timer = setTimeout(stop, milliseconds);
    if (signal.aborted) { stop(); return; }
    signal.addEventListener('abort', stop, { once: true });
    operation.then(value => { clearTimeout(timer); signal.removeEventListener('abort', stop); resolve(value); }, error => { clearTimeout(timer); signal.removeEventListener('abort', stop); reject(error); });
  });
}

/** Local downmix and linear resampling; produces the canonical format checked by the server. */
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
export async function normalizeRecordedAudio(blob: Blob) {
  if (!blob.size || blob.size > 2 * 1024 * 1024) throw new Error('Recording too large');
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const wav = encodeMonoPcmWav(Array.from({ length: decoded.numberOfChannels }, (_value, index) => decoded.getChannelData(index)), decoded.sampleRate);
    return { audio: new Blob([wav], { type: 'audio/wav' }), durationMs: (wav.length - 44) / 32 };
  } finally { await context.close(); }
}
export function createHttpSpeechTransport(fetcher: typeof fetch = fetch): ProviderSpeechTransport {
  const request = async (sessionId: string, action: string, signal?: AbortSignal, body?: BodyInit, headers?: HeadersInit) => {
    const response = await fetcher(`/api/sessions/${encodeURIComponent(sessionId)}/speech/${action}`, {
      method: 'POST', credentials: 'same-origin', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
      headers: headers ?? { 'Content-Type': 'application/json' }, body: body ?? '{}',
    });
    if (!response.ok) throw new Error(fallbackMessage);
    return response;
  };
  return {
    async start(sessionId, signal) {
      const response = await fetcher('/api/sessions', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sessionId }) });
      if (!response.ok) throw new Error(fallbackMessage);
      await request(sessionId, 'start', signal, JSON.stringify({ consented: true }));
    },
    async resume(id, signal) { await request(id, 'resume', signal); },
    async mute(id) { await request(id, 'mute', AbortSignal.timeout(3000)); },
    async end(id) { await request(id, 'end', AbortSignal.timeout(3000)); },
    async audio(input) {
      const response = await request(input.sessionId, 'chunks', input.signal, input.audio, { 'Content-Type': 'audio/wav', 'X-Chunk-Id': input.chunkId, 'X-Audio-Duration-Ms': String(input.durationMs) });
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || (result as { ok?: unknown }).ok !== true) throw new Error(fallbackMessage);
      const segment = (result as { segment?: TranscriptSegment }).segment;
      if (!segment || segment.sessionId !== input.sessionId || typeof segment.text !== 'string' || segment.text.length > 50_000 || typeof segment.segmentId !== 'string' || segment.isFinal !== true) throw new Error(fallbackMessage);
      return { ok: true, segment };
    },
  };
}

/** Fresh MediaRecorder containers per segment; memory only, with at most one outstanding upload. */
export function createProviderCapture(options: ProviderCaptureOptions, dependencies: ProviderCaptureDependencies = {}) {
  const supported = dependencies.supported ?? (typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined' && !!globalThis.navigator?.mediaDevices?.getUserMedia);
  const transport = options.transport ?? createHttpSpeechTransport();
  const acquire = dependencies.getUserMedia ?? (() => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }));
  const recorderFactory = dependencies.createRecorder ?? (stream => new MediaRecorder(stream) as unknown as RecorderLike);
  const normalize = dependencies.normalizeAudio ?? normalizeRecordedAudio;
  const listeners = new Set<() => void>();
  let snapshot: CaptureSnapshot = { status: 'idle', supported, starting: false, interimText: '' };
  let consented = false, disposed = false, live = false, epoch = 0, sequence = 0;
  let stream: MediaStream | undefined;
  let recorder: RecorderLike | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  let abort = new AbortController();
  let pendingUpload: Promise<void> | undefined;
  let stopDone: Promise<void> | undefined;
  let resolveStop: (() => void) | undefined;
  const update = (patch: Partial<CaptureSnapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  const valid = (version: number) => live && !disposed && epoch === version;
  function stopLocal() {
    live = false; epoch++; abort.abort(); pendingUpload = undefined;
    if (timer) clearTimeout(timer); timer = undefined;
    if (stopTimer) clearTimeout(stopTimer); stopTimer = undefined;
    const previous = recorder; recorder = undefined;
    if (previous) { previous.ondataavailable = previous.onstop = previous.onerror = null; if (previous.state !== 'inactive') { try { previous.stop(); } catch {} } }
    stream?.getTracks().forEach(track => track.stop()); stream = undefined;
    resolveStop?.(); resolveStop = undefined;
  }
  function mute() {
    if (!consented || snapshot.status === 'ended' || (!live && !snapshot.starting)) return;
    stopLocal(); update({ status: 'muted', starting: false });
    void transport.mute(options.sessionId).catch(() => {});
  }
  function failure() { mute(); update({ status: 'muted', starting: false, error: fallbackMessage }); }
  function requestStop(current: RecorderLike) {
    if (current.state === 'inactive') return;
    stopTimer = setTimeout(() => { stopTimer = undefined; failure(); }, 1000);
    try { current.stop(); } catch { failure(); }
  }
  function beginRecord(version: number) {
    if (!valid(version) || !stream) return;
    const current = recorderFactory(stream);
    recorder = current;
    const parts: Blob[] = [];
    let bytes = 0;
    stopDone = new Promise<void>(resolve => { resolveStop = resolve; });
    const complete = resolveStop;
    current.ondataavailable = event => {
      if (!valid(version) || !event.data.size) return;
      bytes += event.data.size;
      if (bytes > 2 * 1024 * 1024) { failure(); return; }
      parts.push(event.data);
    };
    current.onerror = () => failure();
    current.onstop = () => {
      if (!valid(version)) { complete?.(); return; }
      if (timer) clearTimeout(timer); timer = undefined;
      if (stopTimer) clearTimeout(stopTimer); stopTimer = undefined;
      recorder = undefined;
      if (pendingUpload) { failure(); complete?.(); return; }
      const blob = new Blob(parts, { type: parts[0]?.type || 'audio/webm' });
      parts.length = 0;
      let buildRequested = false;
      const upload = (async () => {
        try {
          if (!blob.size) return;
          const normalized = await bounded(normalize(blob), abort.signal, 10_000);
          if (!valid(version)) return;
          if (normalized.durationMs < 100) return;
          const response = await bounded(transport.audio({ sessionId: options.sessionId, chunkId: `chunk-${++sequence}`, ...normalized, signal: abort.signal }), abort.signal, 25_000);
          if (!valid(version)) return;
          if (!response.ok || !response.segment || response.segment.sessionId !== options.sessionId) throw new Error('Transcription unavailable');
          const command = response.segment.text.trim().toLowerCase().replace(/[.!?]+$/u, '').trim();
          if (options.pausePhrase !== '' && command === (options.pausePhrase ?? 'pause listening')) mute();
          else if (options.buildPhrase !== '' && command === (options.buildPhrase ?? 'build prototype')) buildRequested = true;
          else if (response.segment.text.trim()) options.onSegment(response.segment);
        } catch { if (valid(version)) failure(); }
      })();
      pendingUpload = upload;
      void upload.finally(() => { if (pendingUpload === upload) pendingUpload = undefined; complete?.(); if (buildRequested && valid(version)) options.onBuild(); });
      try { beginRecord(version); } catch { failure(); }
    };
    current.start();
    timer = setTimeout(() => { if (valid(version)) requestStop(current); }, 5000);
  }
  async function activate(resuming: boolean) {
    if (disposed || snapshot.status === 'ended' || live || snapshot.starting || (resuming && !consented)) return;
    if (!resuming && consented) return;
    consented = true;
    if (!supported) { update({ status: 'muted', error: fallbackMessage }); return; }
    live = true; const version = ++epoch; abort = new AbortController();
    update({ starting: true, error: undefined });
    try {
      if (resuming) await bounded(transport.resume(options.sessionId, abort.signal), abort.signal, 25_000); else await bounded(transport.start(options.sessionId, abort.signal), abort.signal, 25_000);
      if (!valid(version)) return;
      const acquired = await acquire();
      if (!valid(version)) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired; beginRecord(version); update({ status: 'listening', starting: false });
    } catch { if (valid(version)) failure(); }
  }
  async function flush() {
    if (!live) return;
    try {
      if (pendingUpload) await bounded(pendingUpload, abort.signal, 25_000);
      if (!live || !recorder) return;
      const done = stopDone;
      requestStop(recorder);
      if (done) await bounded(done, abort.signal, 25_000);
    } catch { if (live) failure(); }
  }
  function end() {
    if (snapshot.status === 'ended') return;
    const notify = consented; stopLocal(); update({ status: 'ended', starting: false });
    if (notify) void transport.end(options.sessionId).catch(() => {});
  }
  function dispose() { if (disposed) return; end(); disposed = true; listeners.clear(); }
  return { start: () => activate(false), resume: () => activate(true), mute, end, dispose, flush,
    getSnapshot: () => snapshot, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}

export function useProviderCapture(options: ProviderCaptureOptions) {
  const callbacks = useRef(options);
  const controller = useRef<ReturnType<typeof createProviderCapture> | null>(null);
  const [snapshot, setSnapshot] = useState<CaptureSnapshot>({ status: 'idle', supported: true, starting: false, interimText: '' });
  useEffect(() => { callbacks.current = options; });
  useEffect(() => {
    const capture = createProviderCapture({ sessionId: options.sessionId, transport: options.transport, buildPhrase: options.buildPhrase, pausePhrase: options.pausePhrase, onSegment: segment => callbacks.current.onSegment(segment), onBuild: () => callbacks.current.onBuild() });
    controller.current = capture;
    const unsubscribe = capture.subscribe(() => setSnapshot(capture.getSnapshot())); setSnapshot(capture.getSnapshot());
    return () => { unsubscribe(); capture.dispose(); if (controller.current === capture) controller.current = null; };
  }, [options.sessionId, options.transport, options.buildPhrase, options.pausePhrase, options.lifecycleKey]);
  const actions = useMemo(() => ({ start: () => controller.current?.start(), resume: () => controller.current?.resume(), mute: () => controller.current?.mute(), end: () => controller.current?.end(), flush: async () => { await controller.current?.flush(); } }), []);
  return { ...snapshot, ...actions };
}
