// @vitest-environment node
import { afterEach,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';
import { readRuntimeConfig } from '../../server/config';
import { createConfiguredBackend } from '../../server/runtime';
import { createBrief } from '../../src/generation';
const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(done=>{server.close(()=>done());server.closeAllConnections();})));});
async function start(options:Parameters<typeof createApp>[0]){const server=createApp(options);servers.push(server);await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();if(!address||typeof address==='string')throw new Error('Missing address');const base=`http://127.0.0.1:${address.port}`;return(path:string,init?:RequestInit)=>fetch(base+path,init);}
const post=(body:unknown,cookie?:string):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
async function owner(request:Awaited<ReturnType<typeof start>>){const id=randomUUID(),response=await request('/api/sessions',post({id}));return{id,cookie:response.headers.get('set-cookie')!.split(';')[0]};}
const input=(id:string,version=1)=>({sessionId:id,requestId:randomUUID(),briefVersion:version,brief:createBrief(id,version,'Build a bakery called Route Demo.')});
async function build(request:Awaited<ReturnType<typeof start>>,id:string,cookie:string){const response=await request(`/api/sessions/${id}/jobs`,post(input(id),cookie));expect(response.status).toBe(202);const{jobId}=await response.json();return(await(await request(`/api/sessions/${id}/jobs/${jobId}/events`,{headers:{Cookie:cookie}})).text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));}
it('constructor force-off dominates populated keys, runtime authorization and positive request approvals',async()=>{
 const config=readRuntimeConfig({LIVE_PROVIDER_CALLS_ENABLED:'true',GENERATION_PROVIDER:'openai',OPENAI_API_KEY:'synthetic-route-secret'},['--allow-live-providers','--approved-generation-requests=1']);
 const network=vi.fn<typeof fetch>();const backend=createConfiguredBackend(config,{fetcher:network});
 const request=await start({...backend,forceLiveCallsDisabled:true});const{id,cookie}=await owner(request);
 const denied=await request(`/api/sessions/${id}/jobs`,post(input(id),cookie));expect(denied.status).toBe(503);
 const health=await(await request('/api/health')).json();expect(health.providers.liveCallsEnabled).toBe(false);expect(health.providers.generation.enabled).toBe(false);expect(JSON.stringify(health)).not.toContain('synthetic-route-secret');expect(network).not.toHaveBeenCalled();
 const override=await request(`/api/sessions/${id}/jobs`,post({...input(id),liveCallsAllowed:true},cookie));expect(override.status).toBe(400);expect(network).not.toHaveBeenCalled();
});
it('uses the real OpenAI adapter through the route and returns its honest failure without demo fallback',async()=>{
 const config=readRuntimeConfig({LIVE_PROVIDER_CALLS_ENABLED:'true',GENERATION_PROVIDER:'openai',OPENAI_API_KEY:'synthetic-route-secret'},['--allow-live-providers','--approved-generation-requests=1']);
 const network=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('{"error":{"message":"untrusted provider text"}}',{status:401}));
 const request=await start(createConfiguredBackend(config,{fetcher:network}));const{id,cookie}=await owner(request);
 const events=await build(request,id,cookie),result=events.find(event=>event.type==='result')?.result;
 expect(result).toHaveProperty('errorCode');expect(result).not.toHaveProperty('uiSpec');expect(JSON.stringify(events)).not.toContain('synthetic-route-secret');expect(JSON.stringify(events)).not.toContain('untrusted provider text');expect(network).toHaveBeenCalledTimes(1);
 expect(network.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
});
it('never exposes a reusable Speechmatics token even with keys and positive live approval budgets',async()=>{
 const config=readRuntimeConfig({LIVE_PROVIDER_CALLS_ENABLED:'true',SPEECH_PROVIDER:'speechmatics',SPEECHMATICS_ENABLED:'true',SPEECHMATICS_API_KEY:'synthetic-speech-secret'},['--allow-live-providers','--approved-speech-tokens=1','--approved-audio-seconds=5']);
 const network=vi.fn<typeof fetch>();const request=await start(createConfiguredBackend(config,{fetcher:network}));const first=await owner(request),other=await owner(request);
 expect((await request(`/api/sessions/${first.id}/speech/token`,post({consented:true},other.cookie))).status).toBe(404);
 const response=await request(`/api/sessions/${first.id}/speech/token`,post({consented:true},first.cookie));expect(response.status).toBe(410);
 expect(JSON.stringify(await response.json())).not.toContain('synthetic-speech-secret');expect(network).not.toHaveBeenCalled();
});
it('constructs an owned generated ZIP attachment and never accepts browser-supplied attachments or a fake public link',async()=>{
 const handoff=vi.fn().mockResolvedValue({status:'queued',messageId:'mock-message'});
 const config=readRuntimeConfig({LIVE_PROVIDER_CALLS_ENABLED:'true'},['--allow-live-providers']);
 const request=await start({...createConfiguredBackend(config),email:{handoff},liveCallsAllowed:true});const first=await owner(request),other=await owner(request);
 const events=await build(request,first.id,first.cookie),version=events.find(event=>event.type==='result').result.uiSpec.version;
 const body={recipient:'approved@example.test',enabled:true,projectVersion:version};
 expect((await request(`/api/sessions/${first.id}/email`,post(body,other.cookie))).status).toBe(404);
 expect((await request(`/api/sessions/${first.id}/email`,post({...body,sourceArchive:'caller-data'},first.cookie))).status).toBe(400);
 expect((await request(`/api/sessions/${first.id}/email`,post({...body,delivery:'link'},first.cookie))).status).toBe(409);expect(handoff).not.toHaveBeenCalled();
 const response=await request(`/api/sessions/${first.id}/email`,post(body,first.cookie));expect(response.status).toBe(200);expect(handoff).toHaveBeenCalledTimes(1);
 const supplied=handoff.mock.calls[0][0];expect(supplied.sourceArchive).toMatchObject({filename:'prototype-source.zip',content_type:'application/zip'});expect(Buffer.from(supplied.sourceArchive.content_base64,'base64').subarray(0,4)).toEqual(Buffer.from([80,75,3,4]));expect(supplied.projectUrl).toBeUndefined();
});

it('runs the selected Featherless factory through the real owned job route and accepts its model-selected template',async()=>{
 const config=readRuntimeConfig({LIVE_PROVIDER_CALLS_ENABLED:'true',GENERATION_PROVIDER:'featherless',FEATHERLESS_API_KEY:'synthetic-featherless-key',FEATHERLESS_MODEL:'Qwen/Qwen2.5-7B-Instruct'},['--allow-live-providers','--approved-generation-requests=1']);
 const network=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>{
  const payload=JSON.parse(String(init?.body)),plan=JSON.parse(payload.messages[1].content).validExample;plan.templateId='restaurant';plan.content.headline='A model-selected restaurant.';
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(plan),tool_calls:[]}}]}));
 });
 const request=await start(createConfiguredBackend(config,{fetcher:network}));const{id,cookie}=await owner(request);const events=await build(request,id,cookie),result=events.find(event=>event.type==='result')?.result;
 expect(result?.uiSpec?.templateId).toBe('restaurant');expect(result?.provider).toBe('featherless');expect(network).toHaveBeenCalledTimes(1);
 expect(network.mock.calls[0][0]).toBe('https://api.featherless.ai/v1/chat/completions');expect(JSON.stringify(events)).not.toContain('synthetic-featherless-key');
});