import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechCapture } from './audio';
import type { GenerationResult, TranscriptSegment } from './contracts';
import { createBrief, generatePrototype, validateUiSpec } from './generation';
import { TEMPLATE_CATALOG } from './templates';
import { Preview } from './ui/Preview';
import { TemplateCarousel } from './ui/TemplateCarousel';
import { acceptGeneration, addSegment, applyAction, beginBuild, createSession, restoreSavedSession, transcriptText, type BuilderSession } from './integration/session';
import './ui/styles.css';
import { detectExecutionMode, downloadServerExport, endServerSession, generateOnServer, type ExecutionMode } from './integration/api';
const EXAMPLE = 'Build a fictional studio booking app for a small creative studio. Let visitors browse and filter services, then fill in a demo booking form. Use a calm, clear design.';
const STORAGE_KEY = 'forme.tab-session.v1';
function restoreSession(): BuilderSession {
 try { const raw = sessionStorage.getItem(STORAGE_KEY); if (raw) return restoreSavedSession(JSON.parse(raw)); } catch { /* Storage may be unavailable. */ }
 return createSession();
}
export default function App() {
 const [session, setSession] = useState<BuilderSession>(restoreSession);
 const sessionRef = useRef(session); sessionRef.current = session;
 const updateSession = useCallback((transform: (previous: BuilderSession) => BuilderSession) => { const next = transform(sessionRef.current); sessionRef.current = next; setSession(next); }, []);
 const [draft, setDraft] = useState('');
 const [templateId, setTemplateId] = useState(session.spec?.templateId ?? TEMPLATE_CATALOG[0].id);
 const [present, setPresent] = useState(false);
 const [events, setEvents] = useState<string[]>([]);
 const [executionMode, setExecutionMode] = useState<ExecutionMode>('browser-demo');
 const [serverPreview, setServerPreview] = useState(false);
 const [exportError, setExportError] = useState('');
 const job = useRef<AbortController | null>(null);
 const buildRef = useRef<() => void>(() => {});
 const typedDisclosure = useRef<HTMLDetailsElement>(null);
 const previewCanvas = useRef<HTMLElement>(null);
 const revealOnCommit = useRef(false);
 const addCaptureSegment = useCallback((segment: TranscriptSegment) => { const next = addSegment(sessionRef.current, segment); sessionRef.current = next; setSession(next); }, []);
 const capture = useSpeechCapture({ sessionId: session.id, onSegment: addCaptureSegment, onBuild: () => buildRef.current() });
 useEffect(() => { try { if (session.spec) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: session.id, briefVersion: session.briefVersion, spec: session.spec, preview: session.preview })); } catch { /* In-memory mode still works. */ } }, [session]);
 useEffect(() => () => job.current?.abort(), []);
 useEffect(() => { let active = true; void detectExecutionMode().then(mode => { if (active) setExecutionMode(mode); }); return () => { active = false; }; }, []);
 useEffect(() => { if (revealOnCommit.current && session.spec) { revealOnCommit.current = false; previewCanvas.current?.focus({ preventScroll: true }); previewCanvas.current?.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } }, [session.spec]);
 async function build(revealPreview = false) {
  let current = sessionRef.current;
  if (current.pending) return;
  if (draft.trim()) current = addSegment(current, { sessionId: current.id, segmentId: crypto.randomUUID(), text: draft.trim(), isFinal: true });
  const text = transcriptText(current);
  if (!text.trim()) { setSession({ ...current, error: 'Add a brief or use the example to build a prototype.' }); return; }
  job.current?.abort(); const controller = new AbortController(); job.current = controller;
  current = beginBuild(current); sessionRef.current = current; setSession(current); setDraft(''); setExportError('');
  const pending = current.pending!;
  setEvents(['Brief snapshot saved', `Brief version ${pending.briefVersion} extracted`, 'Selecting and configuring a reviewed template…']);
  const brief = createBrief(current.id, pending.briefVersion, text);
  try {
   const request = { sessionId: current.id, requestId: pending.requestId, briefVersion: pending.briefVersion, brief, previousUiSpec: current.spec ?? undefined };
   const options = { templateId: templateId === 'auto' ? undefined : templateId, signal: controller.signal };
   const result = executionMode === 'browser-demo' ? await generatePrototype(request, options) : await generateOnServer(request, { ...options, onProgress: message => { if (!controller.signal.aborted) setEvents(previous => [...previous, message]); } });
   if (controller.signal.aborted) return;
   let safeResult: GenerationResult = result;
   if ('uiSpec' in result) { const checked = validateUiSpec(result.uiSpec); safeResult = checked.success ? { ...result, uiSpec: checked.data } : { sessionId: current.id, requestId: pending.requestId, briefVersion: pending.briefVersion, errorCode: 'INVALID_SPEC', safeMessage: checked.error, retryable: true }; }
   updateSession(previous => acceptGeneration(previous, safeResult));
   if ('uiSpec' in safeResult) { setServerPreview(executionMode !== 'browser-demo'); if (revealPreview && capture.status !== 'listening') { if (typedDisclosure.current) typedDisclosure.current.open = false; revealOnCommit.current = true; } }
   setEvents(previous => [...previous, 'uiSpec' in safeResult ? 'Configuration validated · interactive preview ready' : 'Build failed · previous preview retained']);
  } catch (error) {
   if (controller.signal.aborted) return;
   updateSession(previous => acceptGeneration(previous, { sessionId: current.id, requestId: pending.requestId, briefVersion: pending.briefVersion, errorCode: 'BUILD_ERROR', safeMessage: error instanceof Error ? error.message : 'Build failed. Please retry.', retryable: true }));
   setEvents(previous => [...previous, 'Build failed · previous preview retained']);
  }
 }
 buildRef.current = () => { void build(); };
 function freshSession() { capture.end(); job.current?.abort(); if (executionMode !== 'browser-demo') endServerSession(session.id); try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* In-memory mode still works. */ } const next = createSession(); sessionRef.current = next; setSession(next); setDraft(''); setEvents([]); setPresent(false); setServerPreview(false); setExportError(''); }
 async function exportProject(format: 'json' | 'source') { if (!session.spec) return; setExportError(''); try { if (serverPreview) await downloadServerExport(session.id, format); else { const exporter = await import('./export'); if (format === 'json') exporter.downloadConfig(session.spec); else exporter.downloadProject(session.spec); } } catch (error) { setExportError(error instanceof Error ? error.message : 'Export failed. Please retry.'); } }
 const spec = session.spec;
 const status = session.pending ? 'Building' : session.error ? 'Needs attention' : spec ? 'Preview ready' : 'Ready to build';
 return <TemplateCarousel templates={TEMPLATE_CATALOG} selectedTemplateId={templateId} onSelectTemplate={setTemplateId} captureStatus={capture.status} starting={capture.starting} onStart={capture.start} onMute={capture.mute} onResume={capture.resume} onEnd={capture.end} building={!!session.pending} notice={capture.error || session.error || undefined} preview={spec && session.preview && spec.templateId===templateId ? <Preview spec={spec} state={session.preview} onAction={(action, componentId) => updateSession(previous => previous.spec && previous.preview ? { ...previous, preview: applyAction(previous.preview, action, previous.spec, componentId) } : previous)} onFieldChange={(componentId, fieldId, value) => updateSession(previous => previous.preview ? { ...previous, preview: { ...previous.preview, forms: { ...previous.preview.forms, [componentId]: { ...previous.preview.forms[componentId], [fieldId]: value } } } } : previous)}/> : undefined}/>;
}
