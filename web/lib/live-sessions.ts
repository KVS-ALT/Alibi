import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Claims, Portfolio, type Claims as ClaimsData, type Portfolio as PortfolioData } from '@alibi/shared';
import { db, hasDb } from './db';
import { generatePortfolio } from './generation';

export class LiveHttpError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
export interface LiveSession {
 id:string;slug:string;owner:string;status:'idle'|'listening'|'building'|'ready'|'error';
 portfolio:PortfolioData;claims?:ClaimsData;version:number;active:boolean;error?:string;
 createdAt:number;updatedAt:number;segments:Map<string,string>;revision:number;acceptedRevision:number;
 building:boolean;timer?:ReturnType<typeof setTimeout>;firstDirtyAt?:number;abort?:AbortController;
}
interface State {
 sessions:Map<string,LiveSession>;generationAttempts:number;tokenAttempts:number;
 grant?:{owner:string;sessionId:string;startedAt:number};
}
declare global { var __alibiLiveSessions:State|undefined; }
const state:State=globalThis.__alibiLiveSessions??={sessions:new Map(),generationAttempts:0,tokenAttempts:0};
const OWNER_COOKIE='alibi_team_owner',TEST_COOKIE='alibi_team_test';
const EMPTY:PortfolioData={templateId:'showcase',skills:[],projects:{},contradictions:[]};
const hash=(value:string)=>createHash('sha256').update(value,'utf8').digest();
function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1)??'';}
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function expiry(){return Date.parse(process.env.INTERACTIVE_TEST_EXPIRES_AT??'');}
function grantConfigured(){return /^[a-f0-9]{64}$/.test(process.env.INTERACTIVE_TEST_TOKEN_SHA256??'')&&Number.isFinite(expiry())&&expiry()>Date.now();}
function grantTokenValid(token:string){return grantConfigured()&&/^[a-f0-9]{64}$/.test(token)&&timingSafeEqual(hash(token),Buffer.from(process.env.INTERACTIVE_TEST_TOKEN_SHA256!,'hex'));}
function limit(name:string,max:number){const value=Number(process.env[name]??0);return Number.isSafeInteger(value)&&value>0?Math.min(value,max):0;}
export function getLiveRuntime(){
 const liveEnabled=process.env.LIVE_PROVIDER_CALLS_ENABLED==='true'&&process.env.TEAM_LIVE_TEST_ENABLED==='true'&&grantConfigured();
 const audio=liveEnabled?limit('APPROVED_AUDIO_SECONDS',30):0;
 return {liveEnabled,speechKey:process.env.SPEECHMATICS_API_KEY||undefined,
  limits:{maxSessionAudioSeconds:audio,maxGlobalAudioSeconds:audio,maxWallMs:audio>0?40000:0,maxStreams:1,maxStartsGlobal:liveEnabled?limit('APPROVED_SPEECH_TOKENS',1):0},
  speechFetch:liveEnabled?async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   if(url.href!=='https://mp.speechmatics.com/v1/api_keys?type=rt'||state.tokenAttempts>=limit('APPROVED_SPEECH_TOKENS',1)||!grantConfigured())throw new Error('Approved speech allowance unavailable.');
   state.tokenAttempts++;return fetch(input,{...init,redirect:'error'});
  }:undefined,
 };
}
export function providerMetadata(){const runtime=getLiveRuntime();return {
 generation:{provider:'featherless',configured:!!process.env.FEATHERLESS_API_KEY?.trim(),enabled:runtime.liveEnabled&&limit('APPROVED_GENERATION_REQUESTS',3)>0},
 speech:{provider:'speechmatics',transport:'proxy',configured:!!process.env.SPEECHMATICS_API_KEY?.trim(),enabled:runtime.liveEnabled&&runtime.limits.maxStartsGlobal>0&&runtime.limits.maxSessionAudioSeconds>0},
};}
export function storageMode(){return hasDb()?'postgres':'memory';}
export function sessionPayload(session:LiveSession){return {id:session.id,slug:session.slug,url:'/p/'+session.slug,status:session.status,portfolio:session.portfolio,version:session.version,error:session.error,active:session.active,storage:storageMode(),providers:providerMetadata()};}
async function save(session:LiveSession){
 if(!hasDb())return;
 await db().query('insert into sessions (id,slug,transcript,claims,portfolio,metrics) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb) on conflict(id) do update set transcript=excluded.transcript,claims=excluded.claims,portfolio=excluded.portfolio,metrics=excluded.metrics',
  [session.id,session.slug,conversation(session),session.claims?JSON.stringify(Claims.parse(session.claims)):null,JSON.stringify(Portfolio.parse(session.portfolio)),JSON.stringify({startedAt:session.createdAt,...(session.version?{readyAt:session.updatedAt}:{}),tasks:[],parallelTaskCount:0,version:session.version,active:session.active})]);
}
export async function createLiveSession(request:Request){
 const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==new URL(request.url).host)throw new LiveHttpError(403,'ORIGIN_REJECTED','Same-origin requests only.');
 for(const[id,session]of state.sessions)if(Date.now()-session.updatedAt>30*60*1000&&!session.building){if(session.timer)clearTimeout(session.timer);state.sessions.delete(id);}
 if(state.sessions.size>=100)throw new LiveHttpError(503,'CAPACITY','Session capacity reached.');
 let owner=cookie(request,OWNER_COOKIE);if(!/^[a-f0-9]{64}$/.test(owner))owner=randomBytes(32).toString('hex');
 const session:LiveSession={id:randomUUID(),slug:randomBytes(18).toString('hex'),owner,status:'idle',portfolio:{...EMPTY,skills:[],projects:{},contradictions:[]},version:0,active:false,createdAt:Date.now(),updatedAt:Date.now(),segments:new Map(),revision:0,acceptedRevision:0,building:false};
 await save(session);state.sessions.set(session.id,session);
 return {session,cookie:`${OWNER_COOKIE}=${owner}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=1800${process.env.NODE_ENV==='production'&&process.env.ALIBI_LOCAL_PROFILE!=='true'?'; Secure':''}`};
}
export async function requireOwnedSession(request:Request,id:string){
 const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==new URL(request.url).host)throw new LiveHttpError(403,'ORIGIN_REJECTED','Same-origin requests only.');
 const session=state.sessions.get(id);if(!session||!equal(session.owner,cookie(request,OWNER_COOKIE)))throw new LiveHttpError(404,'NOT_FOUND','Session not found or expired.');return session;
}
function grantAllows(session:LiveSession){const grant=state.grant;return getLiveRuntime().liveEnabled&&!!grant&&grant.owner===session.owner&&grant.sessionId===session.id&&Date.now()-grant.startedAt<90000;}
export function authorizeSpeechStart(request:Request,session:LiveSession){
 if(!getLiveRuntime().liveEnabled)throw new LiveHttpError(503,'LIVE_DISABLED','The protected live session has not been enabled.');
 if(state.grant||!grantTokenValid(cookie(request,TEST_COOKIE)))throw new LiveHttpError(403,'TEST_GRANT_REQUIRED','Use the approved private test link; this one-session allowance may already be used.');
 state.grant={owner:session.owner,sessionId:session.id,startedAt:Date.now()};session.active=true;session.status='listening';session.updatedAt=Date.now();
}
export function setSpeechState(id:string,status:'listening'|'idle'){
 const session=state.sessions.get(id);if(!session)return;session.active=status==='listening';session.updatedAt=Date.now();
 if(!session.building)session.status=session.version?'ready':status;
 if(!session.active&&session.revision>session.acceptedRevision){if(session.timer)clearTimeout(session.timer);void build(session);}
 void save(session).catch(()=>{session.error='Portfolio persistence failed.';});
}
export function conversation(session:LiveSession){return [...session.segments.values()].join(' ').replace(/\s+([,.;:!?])/g,'$1').replace(/\s+/g,' ').trim();}
export function ingestTranscript(id:string,segment:{id:string;text:string;isFinal:boolean}){
 const session=state.sessions.get(id);if(!session||!segment.isFinal||!grantAllows(session)||typeof segment.text!=='string'||!segment.text.trim()||segment.text.length>4000)return;
 if(session.segments.has(segment.id)&&session.segments.get(segment.id)===segment.text.trim())return;
 if(!session.segments.has(segment.id)&&session.segments.size>=128)return;
 session.segments.set(segment.id,segment.text.trim());if(conversation(session).length>12000){session.segments.delete(segment.id);session.error='Conversation length allowance reached.';return;}
 session.revision++;session.updatedAt=Date.now();session.firstDirtyAt??=Date.now();
 if(session.timer)clearTimeout(session.timer);session.timer=setTimeout(()=>void build(session),Math.min(1500,Math.max(0,6000-(Date.now()-session.firstDirtyAt))));
}
async function build(session:LiveSession){
 if(session.building||session.revision<=session.acceptedRevision||!grantAllows(session))return;
 if(state.generationAttempts>=limit('APPROVED_GENERATION_REQUESTS',3)){session.error='The approved inference allowance has been reached. Your last completed portfolio is preserved.';session.status='error';return;}
 session.firstDirtyAt=undefined;const revision=session.revision,transcript=conversation(session),key=process.env.FEATHERLESS_API_KEY;
 if(!key){session.error='Featherless credentials are not configured.';session.status='error';return;}
 session.building=true;session.status='building';session.error=undefined;session.abort=new AbortController();
 try {
  const result=await generatePortfolio({transcript,previous:session.version?session.portfolio:undefined,signal:session.abort.signal},{apiKey:key,model:process.env.FEATHERLESS_MODEL||'Qwen/Qwen2.5-7B-Instruct',fetcher:async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   if(url.href!=='https://api.featherless.ai/v1/chat/completions'||!grantAllows(session)||state.generationAttempts>=limit('APPROVED_GENERATION_REQUESTS',3))throw new Error('Approved inference allowance reached.');
   state.generationAttempts++;return fetch(input,{...init,redirect:'error'});
  }});
  if(revision!==session.revision)return;
  const portfolio=Portfolio.parse(result.portfolio),claims=Claims.parse(result.claims);
  const prior={portfolio:session.portfolio,claims:session.claims,version:session.version};
  session.portfolio=portfolio;session.claims=claims;session.version++;session.updatedAt=Date.now();
  try{await save(session);}catch(error){Object.assign(session,prior);throw error;}
  session.acceptedRevision=revision;session.status='ready';
 }catch{session.error='The live generation could not finish. Your last completed portfolio is preserved.';session.status='error';}
 finally{session.building=false;session.abort=undefined;if(session.revision>revision&&grantAllows(session)){if(session.timer)clearTimeout(session.timer);session.timer=setTimeout(()=>void build(session),300);}}
}
export async function getPublicPortfolio(slug:string){
 const session=[...state.sessions.values()].find(item=>item.slug===slug);
 if(session)return {portfolio:Portfolio.parse(session.portfolio),ready:session.version>0,active:session.active||session.building,version:session.version,storage:storageMode()};
 if(!hasDb())return undefined;
 const {rows}=await db().query('select portfolio,metrics from sessions where slug=$1',[slug]);if(!rows[0])return undefined;
 return {portfolio:Portfolio.parse(rows[0].portfolio),ready:Boolean(rows[0].metrics?.readyAt),active:false,version:rows[0].metrics?.version??0,storage:'postgres'};
}
export function claimInteractiveTest(token:string){
 if(!grantTokenValid(token))throw new LiveHttpError(404,'NOT_FOUND','Test link unavailable or expired.');
 return `${TEST_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=900${process.env.NODE_ENV==='production'&&process.env.ALIBI_LOCAL_PROFILE!=='true'?'; Secure':''}`;
}
export function routeError(error:unknown){return Response.json({error:{code:error instanceof LiveHttpError?error.code:'UNAVAILABLE',message:error instanceof LiveHttpError?error.message:'The request could not be completed.'}},{status:error instanceof LiveHttpError?error.status:503,headers:{'Cache-Control':'no-store'}});}
