// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createBrief, generatePrototype, validateUiSpec } from '../../src/generation';
import { renderStandaloneHtml } from '../../src/export';
const cases=[
 ['studio-booking','space','booking-date'],['restaurant','dish','reservation-guests'],['conference','session','conference-pass'],['portfolio','project','portfolio-scope'],['marketplace','product','bag-quantity'],['course','class','course-pace'],['wellness','session','wellness-session'],['property','home','property-viewing'],['travel','journey','travel-departure'],['nonprofit','opportunity','volunteer-availability'],['journal','story','journal-topic'],['fitness','class','fitness-places'],['salon','service','salon-time'],['music','event','music-tickets'],['coworking','plan','workspace-tour'],['bakery','item','pickup-date'],['agency','service','agency-scope'],['recipe','recipe','recipe-servings'],['job-board','role','job-note'],['wedding','moment','rsvp-attendance'],
] as const;
describe('twenty meaningful local prototype scenarios',()=>{
 it.each(cases)('%s has relevant data and a usable validated local form',async(templateId,column,fieldId)=>{
  const brief=createBrief('domain-review',1,'Build a fictional local prototype named Northstar.');
  const result=await generatePrototype({sessionId:brief.sessionId,requestId:'review-request',briefVersion:1,brief},{templateId});
  expect('uiSpec' in result).toBe(true);if(!('uiSpec' in result))throw new Error(result.safeMessage);
  const spec=result.uiSpec;expect(validateUiSpec(spec).success).toBe(true);
  const table=spec.screens.flatMap(s=>s.components).find(c=>c.type==='table');expect(table?.type).toBe('table');if(table?.type!=='table')return;
  expect(table.properties.columns).toContain(column);expect(spec.demoData[table.properties.dataKey].every(row=>Object.hasOwn(row,column))).toBe(true);
  const form=spec.screens.flatMap(s=>s.components).find(c=>c.type==='form'&&c.properties.fields.some(f=>f.id===fieldId));expect(form?.type).toBe('form');if(form?.type!=='form')return;
  expect(form.actions).toContainEqual({type:'submitDemoForm',formId:form.id,resultStateKey:'contact-result'});
  const dom=new JSDOM(renderStandaloneHtml(spec),{runScripts:'dangerously'});const d=dom.window.document;
  const filter=d.querySelector('select')!;const category=filter.options[2].value;filter.value=category;filter.dispatchEvent(new dom.window.Event('change'));d.querySelector('form')!.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  expect(d.querySelectorAll('tbody tr').length).toBe(spec.demoData[table.properties.dataKey].filter(row=>row.category===category).length);
  (d.querySelector('#contact-button') as HTMLButtonElement).click();const formNode=d.getElementById(form.id) as HTMLFormElement;
  formNode.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));expect(d.querySelector('[role=status]')?.textContent??null).toBeNull();
  for(const f of form.properties.fields){const input=formNode.querySelector(`[name="${f.id}"]`) as HTMLInputElement|HTMLSelectElement;input.value=f.type==='select'?f.options![0]:f.type==='date'?'2026-12-01':f.type==='number'?'2':f.type==='email'?'qa@example.test':'Fictional QA';input.dispatchEvent(new dom.window.Event('input'));}
  formNode.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));expect(d.querySelector('[role=status]')?.textContent).toMatch(/locally|demo only/);dom.window.close();
 });
});
