import type { CaptureStatus, TranscriptSegment } from '../contracts';

export interface RecognitionResult {
  readonly 0: { readonly transcript: string };
  readonly isFinal: boolean;
}
export interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}
/** The browser recognition API owns microphone access and may use a remote service. */
export interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  start(): void;
  stop?(): void;
  abort(): void;
}
export type RecognitionFactory = () => RecognitionLike;
export interface CaptureSnapshot {
  status: CaptureStatus;
  supported: boolean;
  starting: boolean;
  interimText: string;
  error?: string;
}
export interface SpeechCaptureOptions {
  sessionId: string;
  lifecycleKey?: number;
  onSegment: (segment: TranscriptSegment) => void;
  onBuild: () => void;
  createRecognition?: RecognitionFactory;
  lang?: string;
  /** Exact final utterances only. Empty strings disable the respective command. */
  buildPhrase?: string;
  pausePhrase?: string;
}

export function browserRecognitionFactory(): RecognitionFactory | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  const Constructor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return Constructor ? () => new Constructor() : undefined;
}

const normalizeCommand = (text: string) => text.trim().toLowerCase().replace(/[.!?]+$/u, '').trim();

/** No audio buffers, recorder, storage, or provider credentials are retained here. */
export function createSpeechCapture(options: SpeechCaptureOptions) {
  const factory = Object.hasOwn(options, 'createRecognition') ? options.createRecognition : browserRecognitionFactory();
  let snapshot: CaptureSnapshot = { status: 'idle', supported: !!factory, starting: false, interimText: '' };
  const listeners = new Set<() => void>();
  let consented = false;
  let disposed = false;
  let wantsAudio = false;
  let recognition: RecognitionLike | undefined;
  let restart: ReturnType<typeof setTimeout> | undefined;
  let nextSegment = 0;
  let flushPromise: Promise<void> | undefined;
  let flushResolve: (() => void) | undefined;
  let flushDeadline: ReturnType<typeof setTimeout> | undefined;
  const buildPhrase = normalizeCommand(options.buildPhrase ?? 'build prototype');
  const pausePhrase = normalizeCommand(options.pausePhrase ?? 'pause listening');

  function update(patch: Partial<CaptureSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  }
  function release() {
    completeFlush();
    if (restart !== undefined) clearTimeout(restart);
    restart = undefined;
    const previous = recognition;
    recognition = undefined;
    if (previous) {
      previous.onstart = previous.onend = previous.onerror = previous.onresult = null;
      try { previous.abort(); } catch { /* Already ended by the browser. */ }
    }
  }
  function mute() {
    if (!consented || disposed || snapshot.status === 'ended' || (!wantsAudio && snapshot.status === 'muted')) return;
    wantsAudio = false;
    release();
    update({ status: 'muted', starting: false, interimText: '' });
  }
  function fail(message: string) {
    wantsAudio = false;
    release();
    update({ status: 'muted', starting: false, interimText: '', error: message });
  }
  function open() {
    if (!wantsAudio || disposed || recognition) return;
    if (!factory) {
      fail('Speech recognition is unavailable in this browser. Try another supported browser.');
      return;
    }
    update({ starting: true, error: undefined });
    let current: RecognitionLike;
    try { current = factory(); } catch {
      fail('Speech recognition could not start. Try starting again or end the session.');
      return;
    }
    recognition = current;
    const pending = new Map<number, { id: string; text: string }>();
    const finalized = new Map<number, string>();
    const valid = () => recognition === current && wantsAudio && !disposed;
    current.continuous = true;
    current.interimResults = true;
    current.lang = options.lang ?? 'en-US';
    current.onstart = () => { if (valid()) update({ status: 'listening', starting: false }); };
    current.onresult = event => {
      if (!valid()) return;
      for (let index = event.resultIndex; index < event.results.length; index++) {
        if (!valid()) break;
        const result = event.results[index];
        const text = result[0]?.transcript?.trim();
        if (!text || (result.isFinal && finalized.get(index) === text)) continue;
        let segment = pending.get(index);
        if (!segment) {
          segment = { id: `${options.sessionId}:speech:${++nextSegment}`, text };
          pending.set(index, segment);
        }
        segment.text = text;
        if (result.isFinal) {
          pending.delete(index);
          finalized.set(index, text);
          const command = normalizeCommand(text);
          if (pausePhrase && command === pausePhrase) { mute(); break; }
          if (buildPhrase && command === buildPhrase) { options.onBuild(); continue; }
        }
        options.onSegment({ sessionId: options.sessionId, segmentId: segment.id, text, isFinal: result.isFinal });
      }
      if (valid()) update({ interimText: [...pending.values()].map(segment => segment.text).join(' ') });
    };
    current.onerror = event => {
      if (!valid()) return;
      if (event.error === 'no-speech') return;
      const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
      fail(denied
        ? 'Microphone permission was denied. Allow access, then try starting again.'
        : 'Speech recognition stopped. Try starting again or end the session.');
    };
    current.onend = () => {
      if (!valid()) return;
      completeFlush();
      recognition = undefined;
      current.onstart = current.onend = current.onerror = current.onresult = null;
      update({ status: 'muted', starting: true, interimText: '' });
      restart = setTimeout(() => { restart = undefined; open(); }, 250);
    };
    try { current.start(); } catch {
      if (valid()) fail('Microphone access could not start. Check microphone access, then try starting again.');
    }
  }
  function start() {
    if (consented || disposed || snapshot.status === 'ended') return;
    consented = true;
    wantsAudio = true;
    open();
  }
  function completeFlush() {
    if (flushDeadline !== undefined) clearTimeout(flushDeadline);
    flushDeadline = undefined; const resolve = flushResolve;
    flushResolve = undefined; flushPromise = undefined; resolve?.();
  }
  function flush(): Promise<void> {
    if (flushPromise) return flushPromise;
    if (!recognition?.stop || !wantsAudio || disposed) return Promise.resolve();
    flushPromise = new Promise<void>(resolve => { flushResolve = resolve; });
    const pending = flushPromise;
    flushDeadline = setTimeout(() => { fail('Speech recognition did not finish in time. Try starting again.'); }, 4000);
    try { recognition.stop(); } catch { fail('Speech recognition could not finish. Try starting again.'); }
    return pending;
  }
  function resume() {
    if (!consented || disposed || snapshot.status === 'ended' || wantsAudio) return;
    wantsAudio = true;
    open();
  }
  function end() {
    if (snapshot.status === 'ended') return;
    wantsAudio = false;
    release();
    update({ status: 'ended', starting: false, interimText: '' });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    end();
    listeners.clear();
  }
  return {
    start, resume, mute, end, dispose, flush,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export type SpeechCapture = ReturnType<typeof createSpeechCapture>;
