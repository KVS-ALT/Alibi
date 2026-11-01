import type { Action, Brief, GenerationResult, PreviewState, TranscriptSegment, UiSpec } from '../contracts';
export interface BuilderSession { id: string; transcript: TranscriptSegment[]; briefVersion: number; pending: { requestId: string; briefVersion: number } | null; spec: UiSpec | null; preview: PreviewState | null; error: string | null; }
export function createSession(): BuilderSession { return { id: crypto.randomUUID(), transcript: [], briefVersion: 0, pending: null, spec: null, preview: null, error: null }; }
export function addSegment(session: BuilderSession, segment: TranscriptSegment): BuilderSession { if (segment.sessionId !== session.id) return session; const transcript = session.transcript.filter(item => item.segmentId !== segment.segmentId); return { ...session, transcript: [...transcript, segment] }; }
export function transcriptText(session: BuilderSession): string { return session.transcript.filter(item => item.isFinal).map(item => item.text).join('\n'); }
export function beginBuild(session: BuilderSession): BuilderSession { const briefVersion = session.briefVersion + 1; return { ...session, briefVersion, pending: { requestId: crypto.randomUUID(), briefVersion }, error: null }; }
export function reconcilePreviewState(previous: PreviewState | null, spec: UiSpec, previousSpec?: UiSpec | null): PreviewState {
 const sameSession = previous?.sessionId === spec.sessionId;
 const screens = new Set(spec.screens.map(screen => screen.id));
 const oldComponents = new Map(previousSpec?.screens.flatMap(screen => screen.components).map(component => [component.id, component]) ?? []);
 const forms: PreviewState['forms'] = {};
 const submitted: PreviewState['submitted'] = {};
 for (const component of spec.screens.flatMap(screen => screen.components)) if (component.type === 'form') {
  const old = oldComponents.get(component.id);
  forms[component.id] = Object.fromEntries(component.properties.fields.map(field => {
   const compatible = old?.type === 'form' && old.properties.fields.some(oldField => oldField.id === field.id && oldField.type === field.type);
   return [field.id, sameSession && compatible ? previous!.forms[component.id]?.[field.id] ?? '' : ''];
  }));
  if (sameSession && old?.type === 'form' && previous!.submitted[component.id]) submitted[component.id] = previous!.submitted[component.id];
 }
 const actions = spec.screens.flatMap(screen => screen.components.flatMap(component => component.actions));
 const stateKeys = new Set(actions.flatMap(action => action.type === 'setState' ? [action.key] : action.type === 'filter' ? [action.stateKey] : action.type === 'submitDemoForm' ? [action.resultStateKey] : []));
 const values = sameSession ? Object.fromEntries(Object.entries(previous!.values).filter(([key]) => stateKeys.has(key))) : {};
 const filters = sameSession ? Object.fromEntries(Object.entries(previous!.filters).filter(([key,value]) => key in spec.demoData && stateKeys.has(value.stateKey))) : {};
 return { sessionId: spec.sessionId, activeScreenId: sameSession && screens.has(previous!.activeScreenId) ? previous!.activeScreenId : spec.screens[0].id, values, forms, filters, submitted };
}
export function acceptGeneration(session: BuilderSession, result: GenerationResult): BuilderSession {
 if (result.sessionId !== session.id || result.requestId !== session.pending?.requestId || result.briefVersion !== session.pending.briefVersion) return session;
 if ('errorCode' in result) return { ...session, pending: null, error: result.safeMessage };
 if (result.uiSpec.sessionId !== session.id || result.uiSpec.basedOnBriefVersion !== session.briefVersion) return { ...session, pending: null, error: 'The generated prototype did not match this session. Your previous preview is safe.' };
 return { ...session, pending: null, spec: result.uiSpec, preview: reconcilePreviewState(session.preview, result.uiSpec, session.spec), error: null };
}
export function applyAction(state: PreviewState, action: Action, spec: UiSpec): PreviewState {
 if (action.type === 'navigate') return spec.screens.some(screen => screen.id === action.screenId) ? { ...state, activeScreenId: action.screenId } : state;
 if (action.type === 'setState') return { ...state, values: { ...state.values, [action.key]: action.value } };
 if (action.type === 'filter') return { ...state, filters: { ...state.filters, [action.dataKey]: { field: action.field, stateKey: action.stateKey } } };
 const form = spec.screens.flatMap(screen => screen.components).find(component => component.id === action.formId && component.type === 'form');
 if (!form || form.type !== 'form' || form.properties.fields.some(field => field.required && !state.forms[form.id]?.[field.id]?.trim())) return state;
 return { ...state, submitted: { ...state.submitted, [action.formId]: 'Saved in this demo only. No real request was sent.' }, values: { ...state.values, [action.resultStateKey]: 'submitted' } };
}
export function briefSummary(brief: Brief): string { return brief.requirements.join(' · '); }
