import { useEffect, useMemo, useRef, useState } from 'react';
import { browserRecognitionFactory, createSpeechCapture, type CaptureSnapshot, type SpeechCapture, type SpeechCaptureOptions } from './capture';

export * from './capture';

/** Owns recognition only for this mounted session; rendering never opens the mic. */
export function useSpeechCapture(options: SpeechCaptureOptions) {
  const { sessionId, onSegment, onBuild, lang, buildPhrase, pausePhrase, createRecognition } = options;
  const explicitFactory = Object.hasOwn(options, 'createRecognition');
  const controller = useRef<SpeechCapture | null>(null);
  const callbacks = useRef({ onSegment, onBuild });
  const [snapshot, setSnapshot] = useState<CaptureSnapshot>(() => ({
    status: 'idle',
    supported: !!(explicitFactory ? createRecognition : browserRecognitionFactory()),
    starting: false,
    interimText: '',
  }));
  useEffect(() => { callbacks.current = { onSegment, onBuild }; }, [onSegment, onBuild]);
  useEffect(() => {
    const capture = createSpeechCapture({
      sessionId, lang, buildPhrase, pausePhrase,
      ...(explicitFactory ? { createRecognition } : {}),
      onSegment: segment => callbacks.current.onSegment(segment),
      onBuild: () => callbacks.current.onBuild(),
    });
    controller.current = capture;
    const unsubscribe = capture.subscribe(() => setSnapshot(capture.getSnapshot()));
    setSnapshot(capture.getSnapshot());
    return () => {
      unsubscribe();
      capture.dispose();
      if (controller.current === capture) controller.current = null;
    };
  }, [sessionId, lang, buildPhrase, pausePhrase, createRecognition, explicitFactory]);
  const actions = useMemo(() => ({
    start: () => controller.current?.start(),
    resume: () => controller.current?.resume(),
    mute: () => controller.current?.mute(),
    end: () => controller.current?.end(),
  }), []);
  return { ...snapshot, ...actions };
}
