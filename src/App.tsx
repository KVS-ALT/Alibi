import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfiguredSpeechCapture } from './audio/configured';
import type { GenerationResult, TranscriptSegment } from './contracts';
import { createBrief, generatePrototype, validateUiSpec } from './generation';
import { TEMPLATE_CATALOG } from './templates';
import { Preview } from './ui/Preview';
import { TemplateCarousel } from './ui/TemplateCarousel';
import { createAutomaticGenerationQueue } from './ui/automaticGeneration';
import { createReadyCue } from './ui/readyCue';
import { acceptGeneration, addSegment, applyAction, beginBuild, conversationText, createSession, restoreSavedSession, type BuilderSession } from './integration/session';
import { detectExecutionMode, generateOnServer } from './integration/api';
import './ui/styles.css';
const STORAGE_KEY = 'forme.tab-session.v1';
function restoreSession(): BuilderSession {
 try { const raw = sessionStorage.getItem(STORAGE_KEY); if (raw) return restoreSavedSession(JSON.parse(raw)); } catch { /* In-memory mode remains available. */ }
 return createSession();
}
export default function App() {
 const inspection = window.location.pathname === '/inspect/templates';
 const [session, setSession] = useState<BuilderSession>(restoreSession);
 const sessionRef = useRef(session);
 const updateSession = useCallback((transform: (previous: BuilderSession) => BuilderSession) => {
  const next = transform(sessionRef.current); sessionRef.current = next; setSession(next);
 }, []);
 const [templateId, setTemplateId] = useState(session.spec?.templateId ?? TEMPLATE_CATALOG[0].id);
 const job = useRef<AbortController | null>(null);
 const mode = useRef<ReturnType<typeof detectExecutionMode> | null>(null);
 const queue = useRef<ReturnType<typeof createAutomaticGenerationQueue> | null>(null);
 const readyCue = useRef<ReturnType<typeof createReadyCue> | null>(null);
 useEffect(() => {
  const enabled = !inspection && import.meta.env.VITE_READY_CUE === 'true';
  const cue = createReadyCue(enabled); readyCue.current = cue;
  return () => { cue.dispose(); if (readyCue.current === cue) readyCue.current = null; };
 }, [inspection]);
 const addCaptureSegment = useCallback((segment: TranscriptSegment) => {
  if (segment.sessionId !== sessionRef.current.id) return;
  updateSession(previous => addSegment(previous, segment));
  if (segment.isFinal) queue.current?.update(conversationText(sessionRef.current));
 }, [updateSession]);
 const capture = useConfiguredSpeechCapture({ sessionId: session.id, onSegment: addCaptureSegment, onBuild: () => {} });
 const captureRef = useRef(capture); captureRef.current = capture;
 const startListening = useCallback(() => { void readyCue.current?.unlock(); void captureRef.current.start(); }, []);
 const ending = useRef(false);
 const endListening = useCallback(() => {
  if (ending.current) return;
  ending.current = true;
  void captureRef.current.flush().catch(() => {}).finally(() => {
   captureRef.current.end(); ending.current = false;
  });
 }, []);
 const selectionRef = useRef({ inspection, templateId }); selectionRef.current = { inspection, templateId };
 useEffect(() => {
  mode.current = detectExecutionMode();
  const automatic = createAutomaticGenerationQueue({
   prepare: async () => { await captureRef.current.flush(); },
   onError: () => updateSession(previous => ({ ...previous, error: 'Could not update the preview. Please resume listening to try again.' })),
   run: async (text, isCurrent) => {
    const controller = new AbortController(); job.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 185_000);
    const current = beginBuild(sessionRef.current);
    sessionRef.current = current; setSession(current);
    const pending = current.pending!;
    try {
     const executionMode = await mode.current;
     if (controller.signal.aborted) { if (timedOut) throw new Error('Updating took too long. Your previous preview is safe.'); return; }
     const brief = createBrief(current.id, pending.briefVersion, text);
     const request = { sessionId: current.id, requestId: pending.requestId, briefVersion: pending.briefVersion, brief, previousUiSpec: current.spec ?? undefined };
     const selected = selectionRef.current;
     const options = { ...(selected.inspection ? { templateId: selected.templateId } : {}), signal: controller.signal };
     const result = executionMode === 'browser-demo' ? await generatePrototype(request, options) : await generateOnServer(request, { ...options, onProgress: () => {} });
     if (controller.signal.aborted) { if (timedOut) throw new Error('Updating took too long. Your previous preview is safe.'); return; }
     let safeResult: GenerationResult = result;
     if ('uiSpec' in result) {
      const checked = validateUiSpec(result.uiSpec);
      safeResult = checked.success ? { ...result, uiSpec: checked.data } : { sessionId: current.id, requestId: pending.requestId, briefVersion: pending.briefVersion, errorCode: 'INVALID_SPEC', safeMessage: checked.error, retryable: true };
     }
     updateSession(previous => {
      if (!isCurrent()) return previous.pending?.requestId === pending.requestId ? { ...previous, pending: null } : previous;
      const next = acceptGeneration(previous, safeResult);
      if (next.spec && next.spec !== previous.spec && !next.error) readyCue.current?.play(`${next.id}:${next.spec.basedOnBriefVersion}`);
      return next;
     });
    } catch (error) {
     if (controller.signal.aborted && !timedOut) return;
     updateSession(previous => isCurrent() ? acceptGeneration(previous, { sessionId: current.id, requestId: pending.requestId, briefVersion: pending.briefVersion, errorCode: 'BUILD_ERROR', safeMessage: timedOut ? 'Updating took too long. Your previous preview is safe.' : error instanceof Error ? error.message : 'Could not update the preview.', retryable: true }) : previous.pending?.requestId === pending.requestId ? { ...previous, pending: null } : previous);
    } finally { clearTimeout(timeout); }
   },
  });
  queue.current = automatic;
  return () => { automatic.dispose(); if (queue.current === automatic) queue.current = null; job.current?.abort(); };
 }, [updateSession]);
 useEffect(() => { try { if (session.spec) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: session.id, briefVersion: session.briefVersion, spec: session.spec, preview: session.preview })); } catch { /* In-memory mode remains available. */ } }, [session]);
 const spec = session.spec;
 return <TemplateCarousel inspection={inspection} templates={TEMPLATE_CATALOG} selectedTemplateId={templateId} onSelectTemplate={setTemplateId} captureStatus={capture.status} starting={capture.starting} onStart={startListening} onMute={capture.mute} onResume={capture.resume} onEnd={endListening} building={!!session.pending} notice={capture.error || session.error || undefined} preview={spec && session.preview && (!inspection || spec.templateId === templateId) ? <Preview spec={spec} state={session.preview} onAction={(action, componentId) => updateSession(previous => previous.spec && previous.preview ? { ...previous, preview: applyAction(previous.preview, action, previous.spec, componentId) } : previous)} onFieldChange={(componentId, fieldId, value) => updateSession(previous => previous.preview ? { ...previous, preview: { ...previous.preview, forms: { ...previous.preview.forms, [componentId]: { ...previous.preview.forms[componentId], [fieldId]: value } } } } : previous)}/> : undefined}/>;
}

