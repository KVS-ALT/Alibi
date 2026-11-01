// This is the actual Render Workflows task registration entry point.
// Run with: render workflows dev -- npx tsx server/workflows.ts
import { task, type TaskContext } from '@renderinc/sdk/workflows';
import { parseJobInput,selectTemplate,generateContent,resolveStyle,resolveAssets,validateBuild,packageBuild,type JobInput } from './pipeline';
import type { UiSpec } from '../src/contracts';

const options=(name:string)=>({name,plan:'flex' as const,timeoutSeconds:60,retry:{maxRetries:1,waitDurationMs:250,backoffScaling:2}});
export const chooseTemplate=task(options('chooseTemplate'),(_ctx:TaskContext,input:JobInput)=>selectTemplate(parseJobInput(input)));
export const writeContent=task(options('writeContent'),(_ctx:TaskContext,input:JobInput,templateId:string)=>generateContent(parseJobInput(input),templateId));
export const reviewStyle=task(options('reviewStyle'),(_ctx:TaskContext,templateId:string)=>resolveStyle(templateId));
export const reviewAssets=task(options('reviewAssets'),(_ctx:TaskContext,templateId:string)=>resolveAssets(templateId));
export const validatePrototype=task(options('validatePrototype'),(_ctx:TaskContext,spec:UiSpec,style:ReturnType<typeof resolveStyle>,assets:ReturnType<typeof resolveAssets>)=>validateBuild(spec,style,assets));
export const buildExport=task(options('buildExport'),(_ctx:TaskContext,input:JobInput,spec:UiSpec)=>packageBuild(parseJobInput(input),spec));
export const buildPrototype=task({...options('buildPrototype'),timeoutSeconds:180},async(ctx:TaskContext,raw:JobInput)=>{
 const input=parseJobInput(raw);
 const templateId=await ctx.run(chooseTemplate,input);
 const [spec,style,assets]=await Promise.all([ctx.run(writeContent,input,templateId),ctx.run(reviewStyle,templateId),ctx.run(reviewAssets,templateId)]);
 const checked=await ctx.run(validatePrototype,spec,style,assets);
 return ctx.run(buildExport,input,checked);
});
