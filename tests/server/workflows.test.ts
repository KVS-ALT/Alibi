// @vitest-environment node
import { describe,expect,it,vi,afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TaskContext } from '@renderinc/sdk/workflows';
import { buildPrototype } from '../../server/workflows';
import { createRenderLocalRunner } from '../../server/render-runner';
import { createBrief } from '../../src/generation';
import { localRunner } from '../../server/pipeline';

afterEach(()=>vi.unstubAllEnvs());
describe('registered Render task graph',()=>{
 it('executes actual registered task functions with the documented in-process test context',async()=>{
  const names:string[]=[];
  const context:TaskContext={async run(task,...args){names.push(task.name);return task.func(context,...args);}};
  const sessionId=randomUUID();const input={sessionId,requestId:randomUUID(),briefVersion:1,brief:createBrief(sessionId,1,'Create a warm photography studio called Paperhouse. Show booking information.')};
  const bundle=await buildPrototype.func(context,input);
  expect(names).toEqual(['chooseTemplate','writeContent','reviewStyle','reviewAssets','validatePrototype','buildExport']);
  expect(bundle.generator).toBe('Demo generator');expect('uiSpec'in bundle.result&&bundle.result.uiSpec.templateId).toBe('studio-booking');expect(bundle.files['index.html']).toContain('Paperhouse');
  const local=await localRunner.run(input,()=>{},new AbortController().signal);expect(bundle).toEqual(local);
 });
 it('blocks any live Render execution and non-loopback local URL',()=>{
  vi.stubEnv('RENDER_USE_LOCAL_DEV','false');expect(()=>createRenderLocalRunner()).toThrow('Live execution is disabled');
  vi.stubEnv('RENDER_USE_LOCAL_DEV','true');vi.stubEnv('RENDER_LOCAL_DEV_URL','https://api.render.com');expect(()=>createRenderLocalRunner()).toThrow('Only a loopback');
 });
});
