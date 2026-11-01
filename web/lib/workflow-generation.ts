import { Render } from '@renderinc/sdk';
import { Claims, Portfolio } from '@alibi/shared';
import type { GenerationInput, GenerationOutput } from './generation';

export async function generateViaWorkflow(input: GenerationInput): Promise<GenerationOutput> {
  if (!process.env.RENDER_API_KEY || !process.env.RENDER_BUILD_TASK) throw new Error('Render Workflow is required and is not configured.');
  const { signal, ...payload } = input;
  const run = await new Render().workflows.startTask(process.env.RENDER_BUILD_TASK, [payload], signal);
  const completed = await run.get();
  if (completed.status !== 'completed') throw new Error('Render Workflow did not complete.');
  const result = completed.results[0] as GenerationOutput;
  return { ...result, portfolio: Portfolio.parse(result.portfolio), claims: Claims.parse(result.claims) };
}
