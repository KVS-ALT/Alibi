import { expect, it } from 'vitest';
import { createBrief, generatePrototype } from '../../src/generation';
import { createSession, reconcilePreviewState, restoreSavedSession, applyAction } from '../../src/integration/session';
import { createProjectFiles } from '../../src/export';
it('keeps waitlist fields and latest receipt tab-local while exporting no visitor entries',async()=>{
 const session=createSession();const brief=createBrief(session.id,1,'Build a bakery launch waitlist named Quiet Bakery.');
 const result=await generatePrototype({sessionId:session.id,requestId:'waitlist-review',briefVersion:1,brief},{templateId:'bakery'});
 if(!('uiSpec' in result))throw new Error(result.safeMessage);const spec=result.uiSpec;
 const form=spec.screens.flatMap(s=>s.components).find(c=>c.type==='form'&&c.actions.some(a=>a.type==='submitDemoForm'));
 expect(form?.type).toBe('form');if(form?.type!=='form')return;
 expect(form.properties.fields.map(f=>f.id)).toEqual(['visitor-name','visitor-email']);
 expect(form.properties.fields.find(f=>f.id==='visitor-email')?.required).toBe(true);
 let state=reconcilePreviewState(null,spec);state.forms[form.id]['visitor-name']='Unique QA Subscriber';state.forms[form.id]['visitor-email']='uniquesubscriber@example.test';
 state=applyAction(state,form.actions[0],spec,form.id);expect(state.submitted[form.id]).toMatch(/demo only/);
 const saved=JSON.parse(JSON.stringify({id:session.id,briefVersion:1,spec,preview:state}));const restored=restoreSavedSession(saved);
 expect(restored.preview?.forms[form.id]['visitor-email']).toBe('uniquesubscriber@example.test');expect(restored.preview?.submitted[form.id]).toMatch(/demo only/);
 expect(createSession().preview).toBeNull();expect(reconcilePreviewState(restored.preview,{...spec,sessionId:'fresh-session'},spec).forms[form.id]['visitor-email']).toBe('');
 const files=Object.values(createProjectFiles(spec)).join('\n');expect(files).not.toContain('Unique QA Subscriber');expect(files).not.toContain('uniquesubscriber@example.test');
});
