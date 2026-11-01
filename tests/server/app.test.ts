// @vitest-environment node
import { afterEach,describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';
import { localRunner,type JobRunner } from '../../server/pipeline';
import { createBrief } from '../../src/generation';

const servers:Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise<void>(done=>{server.close(()=>done());server.closeAllConnections();})));});
async function setup(options:Parameters<typeof createApp>[0]={}){const server=createApp(options);servers.push(server);await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();if(!address||typeof address==='string')throw new Error('Missing address');const base=`http://127.0.0.1:${address.port}`;return{base,request:(path:string,init:RequestInit={})=>fetch(base+path,init)};}
const post=(body:unknown,cookie?:string):RequestInit=>({method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});
async function session(client:Awaited<ReturnType<typeof setup>>){const id=randomUUID();const response=await client.request('/api/sessions',post({id}));expect(response.status).toBe(201);const cookie=response.headers.get('set-cookie')!.split(';')[0];return{id,cookie};}
const input=(id:string,version=1)=>({sessionId:id,requestId:randomUUID(),briefVersion:version,brief:createBrief(id,version,'Build a modern restaurant called Juniper. Include a seasonal menu and table booking.')});

describe('anonymous builder API',()=>{
 it('runs real stages, replays events, and exports the actual generated configuration and ZIP',async()=>{
  const client=await setup();const{id,cookie}=await session(client);const response=await client.request(`/api/sessions/${id}/jobs`,post(input(id),cookie));expect(response.status).toBe(202);const {jobId}=await response.json() as {jobId:string};
  const stream=await client.request(`/api/sessions/${id}/jobs/${jobId}/events`,{headers:{cookie}});expect(stream.headers.get('content-type')).toBe('text/event-stream');const events=(await stream.text()).split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
  expect(events.filter(e=>e.type==='stage'&&e.progress.status==='completed').map(e=>e.progress.stage)).toEqual(['template','content','style','assets','validate','export']);
  const result=events.find(e=>e.type==='result').result;expect(result.uiSpec.templateId).toBe('restaurant');expect(result.uiSpec.screens[0].title).toContain('Juniper');
  const config=await client.request(`/api/sessions/${id}/export?format=json`,{headers:{cookie}});expect(await config.json()).toEqual(result.uiSpec);
  const archive=await client.request(`/api/sessions/${id}/export?format=source`,{headers:{cookie}});expect(archive.headers.get('content-type')).toBe('application/zip');expect(new Uint8Array(await archive.arrayBuffer()).slice(0,4)).toEqual(new Uint8Array([80,75,3,4]));
 });
 it('denies every session route to another browser and does not overwrite ownership',async()=>{
  const client=await setup();const a=await session(client),b=await session(client);
  for(const path of [`/api/sessions/${a.id}`,`/api/sessions/${a.id}/export`,`/api/sessions/${a.id}/jobs/not-a-job/events`])expect((await client.request(path,{headers:{cookie:b.cookie}})).status).toBe(404);
  expect((await client.request('/api/sessions',post({id:a.id},b.cookie))).status).toBe(404);
  expect((await client.request(`/api/sessions/${a.id}`,{headers:{cookie:a.cookie}})).status).toBe(200);
 });
 it('validates origins, input size, nested brief ownership, and reviewed templates',async()=>{
  const client=await setup();const{id,cookie}=await session(client);
  expect((await client.request(`/api/sessions/${id}/jobs`,{...post(input(id),cookie),headers:{'content-type':'application/json',cookie,origin:'https://evil.example'}})).status).toBe(403);
  expect((await client.request(`/api/sessions/${id}/jobs`,post({...input(id),templateId:'arbitrary-script'},cookie))).status).toBe(400);
  expect((await client.request(`/api/sessions/${id}/jobs`,post({...input(id),brief:createBrief(randomUUID(),1,'wrong session')},cookie))).status).toBe(400);
  expect((await client.request(`/api/sessions/${id}/jobs`,post({huge:'x'.repeat(140000)},cookie))).status).toBe(413);
 });
 it('expires ephemeral sessions, bounds capacity and rate limits',async()=>{
  let time=1000;const client=await setup({now:()=>time,ttlMs:100,maxSessions:1,rateLimit:10});const{id,cookie}=await session(client);
  expect((await client.request('/api/sessions',post({id:randomUUID()}))).status).toBe(503);time+=101;
  expect((await client.request(`/api/sessions/${id}`,{headers:{cookie}})).status).toBe(404);
  expect((await client.request('/api/sessions',post({id:randomUUID()}))).status).toBe(201);
  for(let i=0;i<8;i++)await client.request('/api/unknown');
  expect((await client.request('/api/unknown')).status).toBe(429);
 });
 it('rejects overlapping builds and safely reports a runner failure',async()=>{
  let fail:(reason:Error)=>void=()=>{};const runner:JobRunner={mode:'local-demo',run:()=>new Promise((_resolve,reject)=>{fail=reject;})};const client=await setup({runner});const{id,cookie}=await session(client);
  const first=await client.request(`/api/sessions/${id}/jobs`,post(input(id),cookie));const{jobId}=await first.json() as {jobId:string};expect((await client.request(`/api/sessions/${id}/jobs`,post(input(id),cookie))).status).toBe(409);
  fail(new Error('secret-provider-response'));const events=await client.request(`/api/sessions/${id}/jobs/${jobId}/events`,{headers:{cookie}});const text=await events.text();expect(text).toContain('BUILD_FAILED');expect(text).not.toContain('secret-provider-response');
 });
 it('keeps local fallback explicitly labeled',async()=>{const client=await setup();const response=await client.request('/api/health');expect(await response.json()).toMatchObject({runner:localRunner.mode,generator:'Demo generator',storage:'ephemeral-memory'});});
});
