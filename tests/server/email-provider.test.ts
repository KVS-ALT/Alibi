// @vitest-environment node
import { afterEach,describe,expect,it,vi } from 'vitest';
import { mkdtemp,readFile,rm,writeFile,access } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createConfiguredAgentboxdHandoff } from '../../server/providers/agentboxd';
import { createAgentboxdTransport,createFileEmailOutbox,createMemoryEmailOutbox,createSourceArchiveAttachment } from '../../server/email';
import { createProjectArchive } from '../../src/export';
import { createBrief,generatePrototype } from '../../src/generation';

const input={eventId:'event1',sessionId:'session1',projectId:'project1',projectVersion:1,ready:true,explicitRecipient:true,recipient:'owner@example.com',projectUrl:'https://projects.example.com/review/project1',summary:'A restaurant prototype with a seasonal menu.'};
const config={liveGate:true,apiKey:'test-only-secret',inboxId:'inbox_1',allowedRecipients:['owner@example.com']};
const directories:string[]=[];
async function privatePath(){const dir=await mkdtemp(join(tmpdir(),'larp-email-provider-'));directories.push(dir);return join(dir,'outbox.json');}
afterEach(async()=>{for(const dir of directories.splice(0)){if(!resolve(dir).startsWith(resolve(tmpdir(),'larp-email-provider-')))throw new Error('Unsafe test cleanup path');await rm(dir,{recursive:true,force:true});}});
const response=(status:number,body:unknown,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers});
const refusal=(code:string,details:unknown={})=>({error:{code,message:'Provider details containing test-only-secret',details}});

describe('configured official Agentboxd adapter',()=>{
 it('leaves all I/O disabled when keys exist but the central live gate is false',async()=>{
  const path=await privatePath(),fetcher=vi.fn();
  const service=createConfiguredAgentboxdHandoff({...config,liveGate:false},{fetcher,outbox:createFileEmailOutbox(path)});
  expect(service.capabilities).toMatchObject({liveGate:false,deliveryTracking:false});
  expect(await service.handoff(input)).toMatchObject({status:'ready',notSent:true,reason:'email_disabled'});
  expect(fetcher).not.toHaveBeenCalled();await expect(access(path)).rejects.toMatchObject({code:'ENOENT'});await expect(access(path+'.lock')).rejects.toMatchObject({code:'ENOENT'});
 });
 it('requires complete server config, approved recipient, consent, readiness and durability before fetch',async()=>{
  const fetcher=vi.fn(),durable=createFileEmailOutbox(await privatePath());
  for(const [settings,request,outbox] of [
   [{...config,apiKey:undefined},input,durable],
   [{...config,inboxId:'../bad'},input,durable],
   [{...config,allowedRecipients:[]},input,durable],
   [config,{...input,recipient:'someone-else@example.com'},durable],
   [config,{...input,explicitRecipient:false},durable],
   [config,{...input,ready:false},durable],
   [config,input,createMemoryEmailOutbox()],
  ] as const)expect(await createConfiguredAgentboxdHandoff(settings,{fetcher,outbox}).handoff(request)).toMatchObject({status:'blocked',notSent:true});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('uses official HTTP auth/body, records queued acceptance, and deduplicates after restart',async()=>{
  const path=await privatePath();const fetcher=vi.fn(async()=>response(202,{id:'message_1',status:'queued'}));
  const service=createConfiguredAgentboxdHandoff(config,{fetcher,outbox:createFileEmailOutbox(path)});
  expect(await service.handoff(input)).toEqual({status:'queued',messageId:'message_1'});
  expect(fetcher).toHaveBeenCalledTimes(1);const [url,request]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://api.agentboxd.com/v1/inboxes/inbox_1/messages/send');expect(request).toMatchObject({method:'POST',redirect:'error',headers:{Authorization:'Bearer test-only-secret','Content-Type':'application/json'}});
  expect(JSON.parse(request.body as string)).toEqual({to:'owner@example.com',subject:'Your prototype is ready',text:input.summary+'\n\nOpen your prototype: '+input.projectUrl});
  const restart=createConfiguredAgentboxdHandoff(config,{fetcher,outbox:createFileEmailOutbox(path)});
  expect(await restart.handoff({...input,eventId:'replayed-event'})).toEqual({status:'queued',messageId:'message_1'});expect(fetcher).toHaveBeenCalledTimes(1);
  const stored=await readFile(path,'utf8');expect(stored).not.toContain('test-only-secret');expect(stored).not.toContain(input.summary);expect(stored).not.toContain(input.projectUrl);
 });
 it('honors short Retry-After and retries an in-progress request with identical key and payload',async()=>{
  const path=await privatePath(),sleep=vi.fn(async()=>{});
  const fetcher=vi.fn().mockResolvedValueOnce(response(429,refusal('rate_limited'),{'Retry-After':'1'})).mockResolvedValueOnce(response(409,refusal('idempotency_in_progress'))).mockResolvedValueOnce(response(202,{id:'message_2',status:'queued'}));
  const service=createConfiguredAgentboxdHandoff(config,{fetcher,outbox:createFileEmailOutbox(path),transportOptions:{maxAttempts:3,sleep}});
  expect(await service.handoff(input)).toEqual({status:'queued',messageId:'message_2'});expect(sleep.mock.calls).toEqual([[1000],[1000]]);
  const calls=fetcher.mock.calls as unknown as [string,RequestInit][];expect(calls).toHaveLength(3);expect(new Set(calls.map(([,request])=>request.body)).size).toBe(1);expect(new Set(calls.map(([,request])=>(request.headers as Record<string,string>)['Idempotency-Key'])).size).toBe(1);
 });
 it('attaches only the trusted fixed-name source ZIP without inventing a public project URL',async()=>{
  const generated=await generatePrototype({sessionId:'s1',requestId:'r1',briefVersion:1,brief:createBrief('s1',1,'Create a restaurant called Juniper.')});
  if(!('uiSpec'in generated))throw new Error('Missing fixture');
  const bytes=createProjectArchive(generated.uiSpec),sourceArchive=createSourceArchiveAttachment(bytes);
  const fetcher=vi.fn(async()=>response(202,{id:'message_zip',status:'queued'}));
  const service=createConfiguredAgentboxdHandoff(config,{fetcher,outbox:createFileEmailOutbox(await privatePath())});
  expect(await service.handoff({...input,projectUrl:undefined,sourceArchive})).toEqual({status:'queued',messageId:'message_zip'});
  const [,request]=fetcher.mock.calls[0] as unknown as [string,RequestInit];const payload=JSON.parse(request.body as string);
  expect(payload.attachments).toEqual([{filename:'prototype-source.zip',content_type:'application/zip',content_base64:Buffer.from(bytes).toString('base64')}]);
  expect(payload.text).toBe(input.summary+'\n\nAttached: prototype-source.zip');expect(payload.text).not.toContain('localhost');
  expect(await service.handoff({...input,projectUrl:undefined,sourceArchive:{...sourceArchive,content_base64:createSourceArchiveAttachment(new Uint8Array([80,75,3,4,1])).content_base64}})).toMatchObject({status:'blocked',reason:'idempotency_conflict'});
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('rejects invalid, oversized, renamed or non-ZIP attachments before fetch',async()=>{
  const fetcher=vi.fn(),service=createConfiguredAgentboxdHandoff(config,{fetcher,outbox:createFileEmailOutbox(await privatePath())});
  const sourceArchive=createSourceArchiveAttachment(new Uint8Array([80,75,3,4]));
  expect(()=>createSourceArchiveAttachment(new Uint8Array(2*1024*1024+1))).toThrow('2 MiB');expect(()=>createSourceArchiveAttachment(new Uint8Array([1,2,3,4]))).toThrow('Invalid source ZIP');
  for(const attachment of [{...sourceArchive,filename:'other.zip'},{...sourceArchive,content_type:'text/javascript'},{...sourceArchive,content_base64:'invalid!!!'}])expect(await service.handoff({...input,sourceArchive:attachment as typeof sourceArchive})).toMatchObject({status:'blocked',reason:'invalid_source_archive'});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it.each([
  [429,'rate_limited',{'Retry-After':'60'},60],
  [429,'org_daily_limit_exceeded',{'Retry-After':'3600'},3600],
  [402,'plan_limit_emails',{},undefined],
  [422,'idempotency_key_reused',{},undefined],
 ])('does not retry terminal or long-delay refusal %s/%s',async(status,code,headers,wait)=>{
  const sleep=vi.fn(async()=>{}),fetcher=vi.fn(async()=>response(status,refusal(code),headers));
  const service=createConfiguredAgentboxdHandoff(config,{fetcher,outbox:createFileEmailOutbox(await privatePath()),transportOptions:{sleep}});
  const result=await service.handoff(input);expect(result).toMatchObject({status:'blocked',notSent:true,reason:code});expect(result.retryAfterSeconds).toBe(wait);expect(fetcher).toHaveBeenCalledTimes(1);expect(sleep).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toContain('test-only-secret');
 });
 it.each([
  [()=>response(503,{error:{code:'temporary_failure'}}),'delivery_unknown'],
  [()=>{throw new Error('network failed with test-only-secret');},'delivery_unknown'],
  [()=>new Response('x'.repeat(33000),{status:202}),'delivery_unknown'],
 ])('keeps ambiguous outcomes unknown and does not resend across process reconstruction',async(makeResponse,reason)=>{
  const path=await privatePath(),fetcher=vi.fn(async()=>makeResponse());
  const service=()=>createConfiguredAgentboxdHandoff(config,{fetcher,outbox:createFileEmailOutbox(path)});
  expect(await service().handoff(input)).toMatchObject({status:'unknown',reason});expect(await service().handoff(input)).toMatchObject({status:'unknown',reason});expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('bounds exhaustion and reads retry delay from error details',async()=>{
  const sleep=vi.fn(async()=>{}),fetcher=vi.fn(async()=>response(429,refusal('rate_limited',{retry_after_seconds:1})));
  const service=createConfiguredAgentboxdHandoff(config,{fetcher,outbox:createFileEmailOutbox(await privatePath()),transportOptions:{maxAttempts:2,sleep}});
  expect(await service.handoff(input)).toMatchObject({status:'blocked',reason:'rate_limited',retryAfterSeconds:1});expect(fetcher).toHaveBeenCalledTimes(2);expect(sleep.mock.calls).toEqual([[1000]]);
 });
 it('fails closed for corrupt state or a crash lock without replacing either',async()=>{
  const path=await privatePath(),fetcher=vi.fn();await writeFile(path,'invalid durable state');
  const service=createConfiguredAgentboxdHandoff(config,{fetcher,outbox:createFileEmailOutbox(path)});
  expect(await service.handoff(input)).toMatchObject({status:'blocked',reason:'outbox_unavailable'});expect(await readFile(path,'utf8')).toBe('invalid durable state');
  await writeFile(path+'.lock','crash marker');expect(await service.handoff(input)).toMatchObject({status:'blocked',reason:'outbox_unavailable'});expect(await readFile(path+'.lock','utf8')).toBe('crash marker');expect(fetcher).not.toHaveBeenCalled();
 });
 it('retains recipient binding and rate caps when the file outbox is reconstructed',async()=>{
  const path=await privatePath(),fetcher=vi.fn(async()=>response(202,{id:'message_caps',status:'queued'}));
  const make=()=>createConfiguredAgentboxdHandoff({...config,allowedRecipients:['owner@example.com','other@example.com']},{fetcher,outbox:createFileEmailOutbox(path),now:()=>1000});
  await make().handoff(input);
  expect(await make().handoff({...input,projectVersion:2,recipient:'other@example.com'})).toMatchObject({status:'blocked',reason:'recipient_locked'});
  expect(await make().handoff({...input,projectVersion:2})).toMatchObject({status:'blocked',reason:'rate_limited'});expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('blocks wrong endpoints or missing stable keys before invoking fetch',async()=>{
  const fetcher=vi.fn(),transport=createAgentboxdTransport(fetcher);
  const request={url:'https://evil.example/v1/inboxes/i/messages/send',headers:{'Idempotency-Key':'larp-email-'+'a'.repeat(64)},body:{to:input.recipient,subject:'Ready',text:'Ready'}};
  await expect(transport(request)).rejects.toThrow('Unapproved');await expect(transport({...request,url:'https://api.agentboxd.com/v1/inboxes/i/messages/send',headers:{}})).rejects.toThrow('idempotency');expect(fetcher).not.toHaveBeenCalled();
 });
});
