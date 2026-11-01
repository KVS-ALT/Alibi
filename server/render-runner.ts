import { Render } from '@renderinc/sdk';
import { validateUiSpec } from '../src/generation';
import { parseJobInput,type JobRunner,type PackageResult } from './pipeline';

/** Local task-server adapter only. Live Render usage requires a separate authorized configuration change. */
export function createRenderLocalRunner(taskSlug=process.env.RENDER_BUILD_TASK??'buildPrototype'):JobRunner {
 if(process.env.RENDER_USE_LOCAL_DEV!=='true')throw new Error('Render local mode requires RENDER_USE_LOCAL_DEV=true. Live execution is disabled.');
 const localUrl=new URL(process.env.RENDER_LOCAL_DEV_URL??'http://localhost:8120');
 if(!['localhost','127.0.0.1','[::1]'].includes(localUrl.hostname)||localUrl.protocol!=='http:')throw new Error('Only a loopback Render task server is allowed.');
 // The SDK reads these documented local-development environment variables.
 const render=new Render();
 return {mode:'render-local',async run(raw,emit,signal){
  const input=parseJobInput(raw);
  emit({stage:'workflow',status:'running',message:'Starting actual Render local task run'});
  const started=await render.workflows.startTask(taskSlug,[input],signal);
  emit({stage:'workflow',status:'running',message:'Render local task run accepted; waiting for recorded completion',runId:started.taskRunId});
  const finished=await started.get();
  if(finished.status!=='completed')throw new Error('Render local workflow did not complete.');
  const bundle=finished.results[0] as PackageResult|undefined;
  if(!bundle||!('uiSpec'in bundle.result)||bundle.result.sessionId!==input.sessionId||bundle.result.requestId!==input.requestId||bundle.result.briefVersion!==input.briefVersion||!validateUiSpec(bundle.result.uiSpec).success||!bundle.files||bundle.generator!=='Demo generator')throw new Error('Invalid workflow result.');
  emit({stage:'workflow',status:'completed',message:'Actual Render local task run completed; all task stages validated',runId:finished.id});
  return bundle;
 }};
}
