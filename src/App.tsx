import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechCapture } from './audio';
import type { GenerationResult, TranscriptSegment } from './contracts';
import { createBrief, generatePrototype, validateUiSpec } from './generation';
import { downloadConfig, downloadProject } from './export';
import { TEMPLATE_CATALOG } from './templates';
import { Preview } from './ui/Preview';
import { acceptGeneration, addSegment, applyAction, beginBuild, createSession, restoreSavedSession, transcriptText, type BuilderSession } from './integration/session';
import './ui/styles.css';
const EXAMPLE = 'Build a fictional studio booking app for a small creative studio. Let visitors browse and filter services, then fill in a demo booking form. Use a calm, clear design.';
const STORAGE_KEY = 'forme.tab-session.v1';
function restoreSession(): BuilderSession {
 try { const raw = sessionStorage.getItem(STORAGE_KEY); if (raw) return restoreSavedSession(JSON.parse(raw)); } catch { /* Storage may be unavailable. */ }
 return createSession();
}
export default function App() {
 const [session, setSession] = useState<BuilderSession>(restoreSession);
 const sessionRef = useRef(session); sessionRef.current = session;
 const [draft, setDraft] = useState('');
 const [templateId, setTemplateId] = useState('auto');
 const [present, setPresent] = useState(false);
 const [events, setEvents] = useState<string[]>([]);
 const job = useRef<AbortController | null>(null);
 const buildRef = useRef<() => void>(() => {});
 const addCaptureSegment = useCallback((segment: TranscriptSegment) => { const next = addSegment(sessionRef.current, segment); sessionRef.current = next; setSession(next); }, []);
 const capture = useSpeechCapture({ sessionId: session.id, onSegment: addCaptureSegment, onBuild: () => buildRef.current() });
 useEffect(() => { try { if (session.spec) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: session.id, briefVersion: session.briefVersion, spec: session.spec, preview: session.preview })); } catch { /* In-memory mode still works. */ } }, [session]);
 useEffect(() => () => job.current?.abort(), []);
 async function build() {
  let current = sessionRef.current;
  if (draft.trim()) current = addSegment(current, { sessionId: current.id, segmentId: crypto.randomUUID(), text: draft.trim(), isFinal: true });
  const text = transcriptText(current);
  if (!text.trim()) { setSession({ ...current, error: 'Add a brief or use the example to build a prototype.' }); return; }
  job.current?.abort(); const controller = new AbortController(); job.current = controller;
  current = beginBuild(current); setSession(current); setDraft('');
  const pending = current.pending!;
  setEvents(['Brief snapshot saved', `Brief version ${pending.briefVersion} extracted`, 'Selecting and configuring a reviewed template…']);
  const brief = createBrief(current.id, pending.briefVersion, text);
  try {
   const result = await generatePrototype({ sessionId: current.id, requestId: pending.requestId, briefVersion: pending.briefVersion, brief, previousUiSpec: current.spec ?? undefined }, { templateId: templateId === 'auto' ? undefined : templateId, signal: controller.signal });
   if (controller.signal.aborted) return;
   let safeResult: GenerationResult = result;
   if ('uiSpec' in result) { const checked = validateUiSpec(result.uiSpec); safeResult = checked.success ? { ...result, uiSpec: checked.data } : { sessionId: current.id, requestId: pending.requestId, briefVersion: pending.briefVersion, errorCode: 'INVALID_SPEC', safeMessage: checked.error, retryable: true }; }
   setSession(previous => acceptGeneration(previous, safeResult));
   setEvents(previous => [...previous, 'uiSpec' in safeResult ? 'Configuration validated · interactive preview ready' : 'Build failed · previous preview retained']);
  } catch (error) {
   if (controller.signal.aborted) return;
   setSession(previous => acceptGeneration(previous, { sessionId: current.id, requestId: pending.requestId, briefVersion: pending.briefVersion, errorCode: 'BUILD_ERROR', safeMessage: error instanceof Error ? error.message : 'Build failed. Please retry.', retryable: true }));
   setEvents(previous => [...previous, 'Build failed · previous preview retained']);
  }
 }
 buildRef.current = () => { void build(); };
 function freshSession() { capture.end(); job.current?.abort(); try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* In-memory mode still works. */ } const next = createSession(); sessionRef.current = next; setSession(next); setDraft(''); setEvents([]); setPresent(false); }
 const spec = session.spec;
 const status = session.pending ? 'Building' : session.error ? 'Needs attention' : spec ? 'Preview ready' : 'Ready to build';
 return <div className={`studio ${present ? 'present-mode' : ''}`}>
  <header className="studio-header"><a className="brand" href="#" onClick={event => event.preventDefault()} aria-label="Forme home">forme<span>✳</span></a><span className="project-name">Untitled project <span>/ {spec?.templateId ?? 'New prototype'}</span></span><div className="header-actions"><span className="status-pill">{status}</span>{spec && <button onClick={() => setPresent(!present)}>{present ? '← Back to builder' : 'Present ↗'}</button>}<button onClick={freshSession}>New session</button></div></header>
  <div className="studio-workspace">
   {!present && <aside className="studio-sidebar"><div className="eyebrow">YOUR NEXT IDEA</div><h1>Talk it through.<br/>Make it real.</h1><p className="sidebar-intro">Turn a conversation into a prototype you can actually use.</p>
    <label htmlFor="brief">Describe what you’re building</label><textarea id="brief" className="brief-input" value={draft} onChange={event => setDraft(event.target.value)} placeholder="A booking app for my creative studio, with services and a simple request form…" rows={7}/>
    <button className="example-button" onClick={() => setDraft(EXAMPLE)}>↗ Try a studio booking brief</button>
    <label htmlFor="template">Starting point</label><select id="template" className="template-picker" value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="auto">Let the brief choose</option>{TEMPLATE_CATALOG.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select>
    <button className="build-button" onClick={() => void build()} disabled={!!session.pending}>{session.pending ? 'Building your prototype…' : spec ? 'Update prototype ↗' : 'Build prototype ↗'}</button>
    <section className="capture-panel" aria-label="Microphone controls"><div className="capture-heading"><strong>Voice briefing</strong><span className={`capture-indicator ${capture.status}`}>{capture.status}</span></div><p>Your microphone may hear nearby people. Start only with their consent. Browser speech processing may use your browser provider.</p><div className="capture-controls">{!capture.starting && (capture.status === 'idle' || capture.status === 'ended') ? <button onClick={capture.start}>Start session</button> : <><button onClick={capture.status === 'muted' ? capture.resume : capture.mute}>{capture.status === 'muted' ? 'Resume' : 'Mute'}</button><button onClick={capture.end}>End</button></>}</div>{capture.interimText && <p className="interim">{capture.interimText}</p>}{capture.error && <p role="status">{capture.error}</p>}<small>Say “build prototype” or “pause listening”. Build keeps listening active. Typed input always works.</small></section>
    <p className="demo-label">Deterministic demo generator · synthetic data<br/>Saved in this browser tab only. No cloud account.</p>
   </aside>}
   <main className="studio-canvas"><div className="canvas-toolbar"><div><span className="eyebrow">LIVE PREVIEW</span><strong>{spec ? TEMPLATE_CATALOG.find(template => template.id === spec.templateId)?.name ?? 'Your prototype' : 'Your idea starts here'}</strong></div><div className="canvas-meta">{spec ? `Revision ${spec.version} · Brief ${spec.basedOnBriefVersion}` : 'Interactive · Responsive'}</div></div>
    {session.error && <div className="notice" role="alert">{session.error} <button onClick={() => void build()}>Retry build</button></div>}
    {spec && session.preview ? <Preview spec={spec} state={session.preview} onAction={(action, componentId) => setSession(previous => previous.spec && previous.preview ? { ...previous, preview: applyAction(previous.preview, action, previous.spec, componentId) } : previous)} onFieldChange={(componentId, fieldId, value) => setSession(previous => previous.preview ? { ...previous, preview: { ...previous.preview, forms: { ...previous.preview.forms, [componentId]: { ...previous.preview.forms[componentId], [fieldId]: value } } } } : previous)}/> : <div className="empty-preview"><div className="empty-art">✳</div><span className="eyebrow">FROM WHAT IF TO HERE IT IS</span><h2>A little context.<br/>A working prototype.</h2><p>Describe an idea on the left, or start with the studio example. Your interactive app will appear here.</p><div className="empty-tags"><span>20 starting points</span><span>Real local interactions</span><span>Export your source</span></div></div>}
    {!present && <section className="project-details"><details open={!!session.pending}><summary>Build activity <span>{events.length ? `${events.length} events` : 'Waiting for your brief'}</span></summary><ol className="progress-log" aria-live="polite">{events.map((event,index) => <li key={`${index}-${event}`}>{event}</li>)}</ol><p>Events report completed local operations. This demo does not stream AI-generated code.</p></details>{spec && <><details><summary>Configuration & source</summary><p>This is the actual validated configuration powering your preview.</p><div className="export-actions"><button onClick={() => downloadConfig(spec)}>Download config JSON</button><button onClick={() => downloadProject(spec)}>Download standalone project</button></div><pre>{JSON.stringify(spec, null, 2)}</pre></details><details><summary>Project README & next steps</summary><p>Open the exported HTML in a browser. It includes this configuration, local navigation, filters and demo forms. No install or API key is required.</p><p>Demo submissions stay on this device; no real booking, payment, account or external request is created. A production version still needs your approved backend, authentication, data policy and deployment.</p><ul><li>Connect a chosen generation provider through a server adapter.</li><li>Review the content and accessibility for your real users.</li><li>Replace synthetic data and local demo persistence with an authorized backend.</li></ul></details></>}</section>}
   </main>
  </div>
 </div>;
}
