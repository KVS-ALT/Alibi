import { task, type TaskContext } from '@renderinc/sdk/workflows';
import { generatePortfolio, DEFAULT_GENERATION_MODEL, type GenerationInput } from '../web/lib/generation';

export const buildPortfolio = task({ name: 'buildPortfolio', plan: 'flex', timeoutSeconds: 180, retry: { maxRetries: 0 } }, async (_ctx: TaskContext, input: Omit<GenerationInput, 'signal'>) => {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) throw new Error('Workflow inference credentials are missing.');
  return generatePortfolio(input, { apiKey, model: process.env.FEATHERLESS_MODEL || DEFAULT_GENERATION_MODEL, fetcher: (url, init) => fetch(url, { ...init, redirect: 'error' }) });
});
