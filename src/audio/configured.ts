import { useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptSegment } from '../contracts';
import { useSpeechCapture } from './index';
import { useProviderCapture } from './provider';
import { useSpeechmaticsCapture } from './speechmatics';

type Provider = 'browser' | 'elevenlabs' | 'speechmatics';
interface Metadata { provider: Provider; configured: boolean; enabled: boolean }
export interface ConfiguredSpeechOptions { sessionId: string; onSegment(segment: TranscriptSegment): void; onBuild?: () => void }
const safeError = 'Speech recognition is unavailable. Try starting again.';
const noop = () => {};

/** Provider selection is server metadata, never inferred from missing client credentials. */
export function useConfiguredSpeechCapture(options: ConfiguredSpeechOptions) {
  const [lifecycleKey, setLifecycleKey] = useState(0);
  const restarted = useRef<(() => void) | null>(null);
  const browser = useSpeechCapture({ ...options, lifecycleKey, onBuild: noop, buildPhrase: '', pausePhrase: '' });
  const elevenlabs = useProviderCapture({ ...options, lifecycleKey, onBuild: noop, buildPhrase: '', pausePhrase: '' });
  const speechmatics = useSpeechmaticsCapture({ ...options, lifecycleKey });
  const controls = useRef({ browser, elevenlabs, speechmatics }); controls.current = { browser, elevenlabs, speechmatics };
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [selectionError, setSelectionError] = useState<string | undefined>();
  const [selecting, setSelecting] = useState(false);
  const [locallyMuted, setLocallyMuted] = useState(false);
  const mounted = useRef(false), ended = useRef(false), operation = useRef(0);
  const selectedProvider = useRef<Provider | null>(null);
  const metadataPromise = useRef<Promise<Metadata | null> | null>(null);
  const metadataAbort = useRef<AbortController | null>(null);
  function readMetadata(): Promise<Metadata | null> {
    if (metadataPromise.current) return metadataPromise.current;
    const controller = new AbortController(); metadataAbort.current = controller;
    setMetadataLoading(true);
    const task = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const guarded = <T>(request: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
          const cancel = () => { controller.signal.removeEventListener('abort', cancel); reject(new Error(safeError)); };
          if (controller.signal.aborted) { cancel(); return; }
          controller.signal.addEventListener('abort', cancel, { once: true });
          request.then(value => { controller.signal.removeEventListener('abort', cancel); resolve(value); }, error => { controller.signal.removeEventListener('abort', cancel); reject(error); });
        });
        timer = setTimeout(() => controller.abort(), 5000);
        const response = await guarded(fetch('/api/health', { credentials: 'same-origin', redirect: 'error', signal: controller.signal }));
        if (!response.ok) throw new Error(safeError);
        const body = await guarded(response.json()) as { providers?: { speech?: Partial<Metadata> } };
        const speech = body.providers?.speech;
        if (!speech || !['browser', 'elevenlabs', 'speechmatics'].includes(speech.provider ?? '') || typeof speech.enabled !== 'boolean' || typeof speech.configured !== 'boolean') throw new Error(safeError);
        if (!mounted.current || controller.signal.aborted) return null;
        const result = speech as Metadata; setMetadata(result); setSelectionError(undefined); return result;
      } catch {
        if (mounted.current && metadataAbort.current === controller) { setSelectionError(safeError); metadataPromise.current = null; }
        return null;
      } finally { if (timer) clearTimeout(timer); if (mounted.current && metadataAbort.current === controller) setMetadataLoading(false); }
    })();
    metadataPromise.current = task; return task;
  }
  useEffect(() => {
    mounted.current = true; ended.current = false; selectedProvider.current = null; metadataPromise.current = null;
    setMetadata(null); setLocallyMuted(false); setSelectionError(undefined); void readMetadata();
    return () => { mounted.current = false; operation.current++; metadataAbort.current?.abort(); metadataPromise.current = null; restarted.current?.(); restarted.current = null; };
  }, [options.sessionId]);
  useEffect(() => { restarted.current?.(); restarted.current = null; }, [lifecycleKey]);
  const actions = useMemo(() => {
    const begin = async (resuming: boolean) => {
      if (!mounted.current) return;
      if (ended.current) {
        if (resuming) return;
        ended.current = false; selectedProvider.current = null; metadataPromise.current = null;
        await new Promise<void>(resolve => { restarted.current = resolve; setLifecycleKey(value => value + 1); });
        if (!mounted.current) return;
      }
      const version = ++operation.current; setSelecting(true);
      try {
        const speech = await readMetadata();
        if (!speech || version !== operation.current || ended.current || !mounted.current) return;
        if (!speech.enabled || !speech.configured) { setSelectionError('The selected speech provider is disabled for this session.'); setLocallyMuted(true); return; }
        const previous = selectedProvider.current; selectedProvider.current = speech.provider;
        setSelectionError(undefined); setLocallyMuted(false);
        const capture = controls.current[speech.provider];
        if (resuming && previous) await capture.resume(); else await capture.start();
      } finally { if (mounted.current) setSelecting(false); }
    };
    return {
      start: () => begin(false), resume: () => begin(true),
      mute: () => { operation.current++; setLocallyMuted(true); if (selectedProvider.current) controls.current[selectedProvider.current].mute(); },
      end: () => { operation.current++; ended.current = true; metadataAbort.current?.abort(); Object.values(controls.current).forEach(capture => capture.end()); setLocallyMuted(false); },
      flush: async () => { const provider = selectedProvider.current; if (!ended.current && provider && provider !== 'browser') await controls.current[provider].flush(); },
    };
  }, []);
  const selected = metadata ? controls.current[metadata.provider] : browser;
  return {
    ...selected, ...actions,
    provider: metadata?.provider, providerEnabled: !!metadata?.enabled && !!metadata?.configured, metadataLoading,
    status: ended.current ? 'ended' as const : locallyMuted && selected.status === 'idle' ? 'muted' as const : selected.status,
    starting: selecting || selected.starting,
    error: selectionError ?? (selected.error ? safeError : undefined),
  };
}
