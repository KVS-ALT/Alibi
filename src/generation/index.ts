import { z } from 'zod';
import type { Brief, GenerationRequest, GenerationResult, UiSpec } from '../contracts';
import { TEMPLATE_CATALOG } from '../templates';
import { getTemplateScenario } from './scenarios';
import { STYLE_METADATA_IDS, validStyleMetadata } from '../templates/styleTokens';

export const GENERATOR_MODE = 'Demo generator';
const text = z.string().max(12000).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), 'Unsupported control character');
const reservedIdentifiers = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/).refine(v => !reservedIdentifiers.has(v), 'Reserved identifier');
const primitive = z.union([text, z.number().finite(), z.boolean(), z.null()]);
const action = z.discriminatedUnion('type', [
  z.object({type:z.literal('setState'),key:id,value:primitive}).strict(),
  z.object({type:z.literal('navigate'),screenId:id}).strict(),
  z.object({type:z.literal('submitDemoForm'),formId:id,resultStateKey:id}).strict(),
  z.object({type:z.literal('filter'),dataKey:id,field:id,stateKey:id}).strict(),
]);
const field = z.object({id,label:text,type:z.enum(['text','email','number','date','select']),required:z.boolean(),options:z.array(text).max(30).optional()}).strict();
const base = {id,actions:z.array(action).max(10)};
const component = z.discriminatedUnion('type',[
  z.object({...base,type:z.literal('text'),properties:z.object({text}).strict()}).strict(),
  z.object({...base,type:z.literal('card'),properties:z.object({title:text,body:text}).strict()}).strict(),
  z.object({...base,type:z.literal('button'),properties:z.object({label:text}).strict()}).strict(),
  z.object({...base,type:z.literal('form'),properties:z.object({fields:z.array(field).min(1).max(20),submitLabel:text.optional()}).strict()}).strict(),
  z.object({...base,type:z.literal('table'),properties:z.object({columns:z.array(id).min(1).max(20),dataKey:id}).strict()}).strict(),
  z.object({...base,type:z.literal('navigation'),properties:z.object({items:z.array(z.object({label:text,screenId:id}).strict()).min(1).max(20)}).strict()}).strict(),
]);
const schema = z.object({sessionId:text.min(1),version:z.number().int().positive(),basedOnBriefVersion:z.number().int().positive(),templateId:text,templateVersion:z.literal(1),screens:z.array(z.object({id,title:text,components:z.array(component).max(60)}).strict()).min(1).max(20),demoData:z.record(id,z.array(z.record(id,primitive)).max(100)),demoDataLabel:text.min(1)}).strict();
export function validateUiSpec(value:unknown): {success:true;data:UiSpec}|{success:false;error:string} {
  const result=schema.safeParse(value);
  if(!result.success) return {success:false,error:result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')};
  const s=result.data;
  if(!TEMPLATE_CATALOG.some(t=>t.id===s.templateId)) return {success:false,error:'Unknown reviewed template'};
  const ids=new Set<string>(); const screenIds=new Set(s.screens.map(v=>v.id));
  const formIds=new Set(s.screens.flatMap(v=>v.components.filter(c=>c.type==='form').map(c=>c.id)));
  let error='';
  const unique=(value:string)=>{if(ids.has(value))error='Duplicate ID';ids.add(value);};
  for(const screen of s.screens){ unique(screen.id); for(const c of screen.components){unique(c.id);
    if(STYLE_METADATA_IDS.has(c.id) && (c.type!=='text'||!validStyleMetadata(c.id,c.properties.text)))error='Invalid generated presentation token';
    if(c.type==='form') for(const f of c.properties.fields) unique(f.id);
    if(c.type==='navigation') for(const n of c.properties.items) if(!screenIds.has(n.screenId))error='Unknown navigation destination';
    if(c.type==='table') {
      if(!Object.hasOwn(s.demoData,c.properties.dataKey))error='Unknown table data';
      else if(s.demoData[c.properties.dataKey].some(row=>c.properties.columns.some(column=>!Object.hasOwn(row,column))))error='Unknown table column';
    }
    for(const a of c.actions){
      if(a.type==='navigate'&&!screenIds.has(a.screenId))error='Unknown action destination';
      if(a.type==='submitDemoForm'&&!formIds.has(a.formId))error='Unknown form';
      if(a.type==='filter'&&(!Object.hasOwn(s.demoData,a.dataKey)||s.demoData[a.dataKey].some(row=>!Object.hasOwn(row,a.field))))error='Unknown filter data or field';
    }
  }}
  return error?{success:false,error}:{success:true,data:s as UiSpec};
}
const clean=(s:string)=>s.replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
export function createBrief(sessionId:string,version:number,input:string):Brief {
 const content=input.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0009\u000b-\u001f]/g,' ').replace(/[^\S\n]+/g,' ').trim().slice(0,12000);
 const clauses=content.split(/(?<=[.!?])\s+|\n|;|\b(?:also|and then)\b/i).map(clean).filter(Boolean);
 const audience=content.match(/(?:for|aimed at|targeting)\s+([^.!?]{3,90})/i)?.[1] ?? 'Visitors exploring this concept';
 const style=['minimal','warm','bold','dark','playful','elegant','modern','colorful','calm','editorial'].filter(word=>new RegExp(`\\b${word}\\b`,'i').test(content));
 return {sessionId,version,purpose:clauses[0]?.slice(0,500)||'A new interactive prototype',audience,requirements:clauses.slice(0,12),style,unknowns:['Synthetic demo data only; no backend or real submissions.']};
}
const hints:Record<string,string[]>={ 'studio-booking':['studio','photography','booking'],'restaurant':['restaurant','dining','menu','food'],'conference':['conference','event','speakers'],'portfolio':['portfolio','designer','artist'],'marketplace':['marketplace','shop','store','products'],'course':['course','learn','education'],'wellness':['wellness','meditation','therapy'],'property':['property','real estate','apartments'],'travel':['travel','trip','hotel'],'nonprofit':['nonprofit','charity','donation'],'journal':['journal','blog','news'],'fitness':['fitness','gym','workout'],'salon':['salon','hair','beauty'],'music':['music','band','album'],'coworking':['coworking','workspace'],'bakery':['bakery','bread','cake'],'agency':['agency','marketing','consulting'],'recipe':['recipe','cooking'],'job-board':['jobs','hiring','career'],'wedding':['wedding','bride','rsvp']};
function chooseTemplate(input:string):string {let best='studio-booking',score=0;for(const [key,words]of Object.entries(hints)){const n=words.reduce((sum,w)=>sum+(input.toLowerCase().includes(w)?1:0),0);if(n>score){best=key;score=n;}}return best;}
function titleFrom(input:string, fallback:string):string {
 const named=input.match(/(?:called|named|brand(?:\s+name)?(?:\s+is)?|titled)\s+["“']?([^.!?,;"”'\n]{2,60})/i)?.[1];
 if(named)return clean(named).replace(/\s+(?:for|with|that)\s+.*$/i,'');
 return clean(input).replace(/^(?:please\s+)?(?:build|create|make|design|i want|i need)\s+(?:me\s+)?(?:a|an|the)?\s*/i,'').split(/[.!?]/)[0].slice(0,64)||fallback;
}
export async function generatePrototype(request:GenerationRequest, options:{templateId?:string;signal?:AbortSignal}={}):Promise<GenerationResult>{
 const envelope={sessionId:request.sessionId,requestId:request.requestId,briefVersion:request.briefVersion};
 if(options.signal?.aborted) throw new DOMException('Generation aborted','AbortError');
 try {
 if(request.brief.sessionId!==request.sessionId||request.brief.version!==request.briefVersion)throw new Error('Brief/session mismatch');
 const input=[request.brief.purpose,...request.brief.requirements].join(' ');
 const templateId=options.templateId??chooseTemplate(input);
 const template=TEMPLATE_CATALOG.find(t=>t.id===templateId); if(!template)throw new Error('Choose a reviewed template');
 if(request.previousUiSpec && (request.previousUiSpec.sessionId!==request.sessionId || request.previousUiSpec.basedOnBriefVersion>request.briefVersion || !validateUiSpec(request.previousUiSpec).success))throw new Error('Previous prototype does not belong to this session or brief history');
 const title=titleFrom(input,template.name);
 const requirement=request.brief.requirements.slice(1,4);
 const scenario=getTemplateScenario(templateId,input);
 const spec:UiSpec={
   sessionId:request.sessionId,version:(request.previousUiSpec?.version??0)+1,basedOnBriefVersion:request.briefVersion,
   templateId,templateVersion:1,demoDataLabel:'Synthetic demo data - local interactions only',demoData:{listings:scenario.data},
   screens:[
     {id:'home',title:scenario.sectionTitle,components:[
       {id:'site-navigation',type:'navigation',properties:{items:[{label:'Explore',screenId:'home'},{label:scenario.actionLabel,screenId:'contact'}]},actions:[]},
       {id:'hero-brand',type:'text',properties:{text:title},actions:[]},
       {id:'hero-title',type:'text',properties:{text:title},actions:[]},
       {id:'hero-description',type:'text',properties:{text:requirement.join(' ')||scenario.description},actions:[]},
       {id:'audience',type:'card',properties:{title:scenario.actionLabel,body:scenario.description},actions:[{type:'navigate',screenId:'contact'}]},
       ...requirement.slice(1).map((body,i)=>({id:`feature-${i}`,type:'card' as const,properties:{title:`Your requirement ${i+1}`,body},actions:[]})),
       {id:'category-filter',type:'form',properties:{fields:[{id:'category',label:'Filter by category',type:'select',required:false,options:['All',...new Set(scenario.data.map(row=>String(row.category)))]}],submitLabel:'Apply filter'},actions:[{type:'filter',dataKey:'listings',field:'category',stateKey:'category'}]},
       {id:'results',type:'table',properties:{columns:scenario.columns,dataKey:'listings'},actions:[]},
       {id:'contact-button',type:'button',properties:{label:scenario.actionLabel},actions:[{type:'navigate',screenId:'contact'}]},
     ]},
     {id:'contact',title:scenario.actionLabel,components:[
       {id:'back',type:'button',properties:{label:'Back to explore'},actions:[{type:'navigate',screenId:'home'}]},
       {id:'contact-form',type:'form',properties:{fields:scenario.fields,submitLabel:scenario.submitLabel},actions:[{type:'submitDemoForm',formId:'contact-form',resultStateKey:'contact-result'}]},
       {id:'demo-notice',type:'text',properties:{text:scenario.description+' This is a local demo. Nothing is sent or stored on a server.'},actions:[]},
     ]},
   ],
 };
 const checked=validateUiSpec(spec);if(!checked.success)throw new Error(checked.error);
 return {...envelope,uiSpec:checked.data};
 }catch(error){return {...envelope,errorCode:'INVALID_GENERATION',safeMessage:error instanceof Error?error.message:'Could not generate this prototype.',retryable:true};}
}

