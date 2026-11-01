import { expect,it,vi } from 'vitest';
import { createBoundedLiveTransport } from '../../server/live-transport';
import { createOpenAIProvider } from '../../src/generation/provider';
import { createBrief } from '../../src/generation';
const limits={generation:1,speechTokens:1,audioSeconds:1,email:1,database:0};
it('counts actual transport attempts across callers and refuses unknown endpoints',async()=>{
 const network=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('{}'));
 const bounded=createBoundedLiveTransport(network,limits,{enabled:true});
 await bounded.transport('https://api.openai.com/v1/responses',{method:'POST'});
 await expect(bounded.transport('https://api.openai.com/v1/responses',{method:'POST'})).rejects.toThrow('budget');
 await expect(bounded.transport('https://api.openai.com.evil.example/v1/responses')).rejects.toThrow('endpoint');
 expect(network).toHaveBeenCalledTimes(1);expect(bounded.remaining().generation).toBe(0);
});
it('never calls network when the process gate is disabled',async()=>{
 const network=vi.fn<typeof fetch>();const bounded=createBoundedLiveTransport(network,limits,{enabled:false});
 await expect(bounded.transport('https://api.openai.com/v1/responses')).rejects.toThrow('disabled');expect(network).not.toHaveBeenCalled();
});
it('prevents provider retry logic from exceeding a one-request approval',async()=>{
 const network=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('{"error":{"code":"rate_limit_exceeded"}}',{status:429,headers:{'Retry-After':'0'}}));
 const bounded=createBoundedLiveTransport(network,limits,{enabled:true});
 const provider=createOpenAIProvider({enabled:true,apiKey:'synthetic-test-key',transport:bounded.transport,maxRetries:1});
 const brief=createBrief('budget-session',1,'Build a bakery called Budget Demo.');
 const result=await provider.generate({sessionId:brief.sessionId,requestId:'budget-request',briefVersion:1,brief});
 expect(result).toHaveProperty('errorCode');expect(network).toHaveBeenCalledTimes(1);
});
