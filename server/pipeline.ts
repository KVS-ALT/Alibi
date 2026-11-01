import { z } from 'zod';
import type { GenerationRequest, GenerationResult, UiSpec } from '../src/contracts';
import { generatePrototype, validateUiSpec } from '../src/generation';
import { createProjectFiles } from '../src/export';
import { TEMPLATE_CATALOG } from '../src/templates';

const boundedText = z.string().max(12000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
export const sessionIdSchema = z.string().uuid();
const briefSchema = z.object({sessionId:sessionIdSchema,version:z.number().int().positive(),purpose:boundedText.min(1),audience:boundedText,requirements:z.array(boundedText).max(20),style:z.array(boundedText).max(20),unknowns:z.array(boundedText).max(20)}).strict();
const inputSchema = z.object({sessionId:sessionIdSchema,requestId:z.string().min(1).max(100),briefVersion:z.number().int().positive(),brief:briefSchema,previousUiSpec:z.unknown().optional(),templateId:z.string().max(80).optional()}).strict();
export type JobInput = GenerationRequest & {templateId?:string};
export type StageName = 'template'|'content'|'style'|'assets'|'validate'|'export';
export type Progress = {stage:StageName|'workflow';status:'running'|'completed';message:string;runId?:string};
export interface PackageResult {result:GenerationResult;files:Record<string,string>;completedStages:StageName[];generator:'Demo generator'|'OpenAI'|'Featherless'}
export interface JobRunner {mode:'local-demo'|'render-local'|'openai'|'featherless';requiresLive?:boolean;generator?:'Demo generator'|'OpenAI'|'Featherless';run(input:JobInput,emit:(event:Progress)=>void,signal:AbortSignal):Promise<PackageResult>}

export function parseJobInput(value:unknown):JobInput {
 const parsed=inputSchema.parse(value);
 if(parsed.brief.sessionId!==parsed.sessionId||parsed.brief.version!==parsed.briefVersion)throw new Error('Brief and session versions must match.');
 if(parsed.templateId&&!TEMPLATE_CATALOG.some(t=>t.id===parsed.templateId))throw new Error('Choose a reviewed template.');
 if(parsed.previousUiSpec!==undefined){const previous=validateUiSpec(parsed.previousUiSpec);if(!previous.success||previous.data.sessionId!==parsed.sessionId||previous.data.basedOnBriefVersion>parsed.briefVersion)throw new Error('Invalid previous prototype.');parsed.previousUiSpec=previous.data;}
 return parsed as JobInput;
}
export function selectTemplate(input:JobInput):string {
 if(input.templateId)return input.templateId;
 const words=[input.brief.purpose,...input.brief.requirements].join(' ').toLowerCase();
 const hints:Record<string,string[]>={'studio-booking':['studio','photography','booking'],'restaurant':['restaurant','dining','food','menu'],'conference':['conference','speakers','event'],'portfolio':['portfolio','designer','artist'],'marketplace':['marketplace','shop','store'],'course':['course','learn','education'],'wellness':['wellness','meditation','therapy'],'property':['property','real estate','apartments'],'travel':['travel','trip','hotel'],'nonprofit':['nonprofit','charity','donation'],'journal':['journal','blog','news'],'fitness':['fitness','gym','workout'],'salon':['salon','hair','beauty'],'music':['music','band','album'],'coworking':['coworking','workspace'],'bakery':['bakery','bread','cake'],'agency':['agency','marketing','consulting'],'recipe':['recipe','cooking'],'job-board':['jobs','hiring','career'],'wedding':['wedding','bride','rsvp']};
 let chosen='studio-booking',score=0;
 for(const [id,terms] of Object.entries(hints)){const matches=terms.filter(term=>words.includes(term)).length;if(matches>score){score=matches;chosen=id;}}
 return chosen;
}
export async function generateContent(input:JobInput,templateId:string):Promise<UiSpec>{const generated=await generatePrototype(input,{templateId});if(!('uiSpec'in generated))throw new Error('Demo generation failed.');return generated.uiSpec;}
export function resolveStyle(templateId:string){const template=TEMPLATE_CATALOG.find(t=>t.id===templateId);if(!template||!/^#[0-9a-f]{3,8}$/i.test(template.accent))throw new Error('Unreviewed template style.');return {templateId,accent:template.accent};}
export function resolveAssets(templateId:string){if(!TEMPLATE_CATALOG.some(t=>t.id===templateId))throw new Error('Unknown template assets.');return {templateId,policy:'reviewed-template-presentation',externalFetches:0};}
export function validateBuild(spec:UiSpec,style:ReturnType<typeof resolveStyle>,assets:ReturnType<typeof resolveAssets>):UiSpec {const checked=validateUiSpec(spec);if(!checked.success||spec.templateId!==style.templateId||spec.templateId!==assets.templateId)throw new Error('Prototype validation failed.');return checked.data;}
export function packageBuild(input:JobInput,spec:UiSpec):PackageResult {return {result:{sessionId:input.sessionId,requestId:input.requestId,briefVersion:input.briefVersion,uiSpec:spec},files:createProjectFiles(spec),completedStages:['template','content','style','assets','validate','export'],generator:'Demo generator'};}
export const localRunner:JobRunner={mode:'local-demo',async run(raw,emit,signal){
 const input=parseJobInput(raw);
 const step=async<T>(stage:StageName,fn:()=>T|Promise<T>):Promise<T>=>{signal.throwIfAborted();emit({stage,status:'running',message:`Running ${stage} locally`});const value=await fn();signal.throwIfAborted();emit({stage,status:'completed',message:`Completed ${stage} locally`});return value;};
 const template=await step('template',()=>selectTemplate(input));
 const [spec,style,assets]=await Promise.all([step('content',()=>generateContent(input,template)),step('style',()=>resolveStyle(template)),step('assets',()=>resolveAssets(template))]);
 const valid=await step('validate',()=>validateBuild(spec,style,assets));return step('export',()=>packageBuild(input,valid));
}};

export function createProviderRunner(provider:{generate(request:GenerationRequest,options:{templateId?:string;signal?:AbortSignal}):Promise<GenerationResult>},label:'OpenAI'|'Featherless'='OpenAI'):JobRunner {
 return {mode:label==='Featherless'?'featherless':'openai',generator:label,requiresLive:true,async run(raw,emit,signal){
  const input=parseJobInput(raw);signal.throwIfAborted();
  emit({stage:'template',status:'running',message:'Selecting a reviewed template'});
  emit({stage:'content',status:'running',message:`Requesting bounded structured content from ${label}`});
  const generated=await provider.generate({sessionId:input.sessionId,requestId:input.requestId,briefVersion:input.briefVersion,brief:input.brief,previousUiSpec:input.previousUiSpec},{templateId:input.templateId,signal});
  signal.throwIfAborted();
  if(!('uiSpec'in generated))return {result:generated,files:{},completedStages:['template'],generator:label};
  if(generated.sessionId!==input.sessionId||generated.requestId!==input.requestId||generated.briefVersion!==input.briefVersion||generated.uiSpec.sessionId!==input.sessionId||generated.uiSpec.basedOnBriefVersion!==input.briefVersion)throw new Error('Provider result does not match this build.');
  const templateId=generated.uiSpec.templateId;
  emit({stage:'template',status:'completed',message:'Reviewed template selected'});
  emit({stage:'content',status:'completed',message:'Structured content received'});
  const style=resolveStyle(templateId),assets=resolveAssets(templateId);
  emit({stage:'style',status:'completed',message:'Reviewed template styling retained'});
  emit({stage:'assets',status:'completed',message:'Reviewed local assets retained'});
  emit({stage:'validate',status:'running',message:'Validating the complete prototype configuration'});
  const valid=validateBuild(generated.uiSpec,style,assets);
  emit({stage:'validate',status:'completed',message:'Prototype schema and references validated'});
  emit({stage:'export',status:'running',message:'Building matching standalone and source exports'});
  const bundle=packageBuild(input,valid);
  emit({stage:'export',status:'completed',message:'Matching exports ready'});
  return {...bundle,result:{...generated,uiSpec:valid},generator:label};
 }};
}
