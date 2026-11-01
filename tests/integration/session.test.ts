import { describe, expect, it } from 'vitest';
import { acceptGeneration, addSegment, beginBuild, createSession, reconcilePreviewState, transcriptText } from '../../src/integration/session';
import type { UiSpec } from '../../src/contracts';
const spec = (sessionId: string, version = 1): UiSpec => ({sessionId, version, basedOnBriefVersion:version, templateId:'studio-booking',templateVersion:1,screens:[{id:'home',title:'Demo',components:[{id:'contact',type:'form',properties:{fields:[{id:'email',label:'Email',type:'email',required:true}]},actions:[]}]}],demoData:{},demoDataLabel:'Demo data'});
describe('session lifecycle integration', () => {
 it('deduplicates interim segments and isolates foreign sessions', () => {
  const a=createSession(), b=createSession();
  let state=addSegment(a,{sessionId:a.id,segmentId:'1',text:'draft',isFinal:false});
  expect(transcriptText(state)).toBe('');
  state=addSegment(state,{sessionId:a.id,segmentId:'1',text:'final',isFinal:true});
  expect(state.transcript).toHaveLength(1);
  expect(transcriptText(state)).toBe('final');
  expect(addSegment(state,{sessionId:b.id,segmentId:'2',text:'foreign',isFinal:true})).toBe(state);
 });
 it('ignores a superseded result and retains last good preview on failure', () => {
  let state=beginBuild(createSession());
  const first={sessionId:state.id,requestId:state.pending!.requestId,briefVersion:1,uiSpec:spec(state.id)};
  state=acceptGeneration(state,first);
  const good=state.spec;
  state=beginBuild(state);
  const second=state.pending!;
  state=beginBuild(state);
  expect(acceptGeneration(state,{...first,requestId:second.requestId,briefVersion:2,uiSpec:spec(state.id,2)})).toBe(state);
  state=acceptGeneration(state,{sessionId:state.id,requestId:state.pending!.requestId,briefVersion:3,errorCode:'INVALID',safeMessage:'Try again',retryable:true});
  expect(state.spec).toBe(good);
  expect(state.error).toBe('Try again');
  expect(state.pending).toBeNull();
 });
 it('preserves compatible form values and clears cross-session values', () => {
  const old=spec('session-a');
  const state=reconcilePreviewState(null,old);
  state.forms.contact.email='person@example.test';
  expect(reconcilePreviewState(state,spec('session-a',2),old).forms.contact.email).toBe('person@example.test');
  expect(reconcilePreviewState(state,spec('session-b'),old).forms.contact.email).toBe('');
  const next=spec('session-a',2);
  const form=next.screens[0].components[0];
  if(form.type==='form') form.properties.fields[0].type='number';
  expect(reconcilePreviewState(state,next,old).forms.contact.email).toBe('');
 });
});


describe('changed category options',()=>{
 it('drops a saved filter choice that is unavailable in the replacement template',()=>{
  const old=spec('session-a');const form=old.screens[0].components[0];if(form.type!=='form')throw new Error('fixture');
  form.properties.fields=[{id:'category',label:'Category',type:'select',required:false,options:['All','Bread']}];
  form.actions=[{type:'filter',dataKey:'items',field:'category',stateKey:'category'}];old.demoData={items:[{category:'Bread'}]};
  const state=reconcilePreviewState(null,old);state.forms.contact.category='Bread';state.values.category='Bread';state.filters.items={field:'category',stateKey:'category'};
  const next=structuredClone(old);const nextForm=next.screens[0].components[0];if(nextForm.type!=='form')throw new Error('fixture');nextForm.properties.fields[0].options=['All','Acoustic'];next.demoData={items:[{category:'Acoustic'}]};
  const reconciled=reconcilePreviewState(state,next,old);expect(reconciled.forms.contact.category).toBe('');expect(reconciled.values.category??'').toBe('');
 });
});
