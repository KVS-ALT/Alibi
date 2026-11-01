import 'server-only';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Claims, Portfolio, type Claims as ClaimsData, type Portfolio as PortfolioData } from '@alibi/shared';
import { db, hasDb } from './db';
import { DEFAULT_GENERATION_MODEL, generatePortfolio } from './generation';
import { applyConversationFacts } from './portfolio-facts';
import { createDraftPortfolio, renderProjectMock } from './draft';
import { updateConversationIdentity, type ConversationIdentity } from './conversation-identity';
import type { ProjectIdentityRegistry } from './project-identity';

export class LiveHttpError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
export interface LiveSession {
 id:string;slug:string;owner:string;status:'idle'|'listening'|'building'|'ready'|'error';
 portfolio:PortfolioData;claims?:ClaimsData;version:number;active:boolean;error?:string;
 createdAt:number;updatedAt:number;segments:Map<string,string>;revision:number;acceptedRevision:number;
 building:boolean;timer?:ReturnType<typeof setTimeout>;firstDirtyAt?:number;abort?:AbortController;
 deleted?:boolean;persistence?:Promise<void>;
 identity?:ConversationIdentity;projectRegistry?:ProjectIdentityRegistry;
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
function assertOrigin(request:Request){
 if(request.headers.get('sec-fetch-site')==='cross-site')throw new LiveHttpError(403,'ORIGIN_REJECTED','Same-origin requests only.');
 const raw=request.headers.get('origin');if(!raw)return;
 let origin:URL;try{origin=new URL(raw);}catch{throw new LiveHttpError(403,'ORIGIN_REJECTED','Same-origin requests only.');}
 // Next's internal request.url can use localhost even when the browser uses 127.0.0.1.
 // Host is supplied by the actual HTTP request; never trust an arbitrary forwarded-host header.
 const host=request.headers.get('host')?.toLowerCase();
 if(!host||origin.host.toLowerCase()!==host||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw new LiveHttpError(403,'ORIGIN_REJECTED','Same-origin requests only.');
 if(process.env.ALIBI_LOCAL_PROFILE==='true'&&!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw new LiveHttpError(403,'ORIGIN_REJECTED','Use the local test hostname.');
 if(process.env.NODE_ENV==='production'&&process.env.ALIBI_LOCAL_PROFILE!=='true'){
  if(origin.protocol!=='https:')throw new LiveHttpError(403,'ORIGIN_REJECTED','Use the secure public site.');
  if(process.env.RENDER_EXTERNAL_URL&&origin.origin!==new URL(process.env.RENDER_EXTERNAL_URL).origin)throw new LiveHttpError(403,'ORIGIN_REJECTED','Use the configured public site.');
 }
}
function expiry(){return Date.parse(process.env.INTERACTIVE_TEST_EXPIRES_AT??'');}
function unlimitedUsage(){return process.env.ALIBI_UNLIMITED_USAGE==='true';}
function grantConfigured(){return /^[a-f0-9]{64}$/.test(process.env.INTERACTIVE_TEST_TOKEN_SHA256??'')&&(unlimitedUsage()||Number.isFinite(expiry())&&expiry()>Date.now());}
function grantTokenValid(token:string){return grantConfigured()&&/^[a-f0-9]{64}$/.test(token)&&timingSafeEqual(hash(token),Buffer.from(process.env.INTERACTIVE_TEST_TOKEN_SHA256!,'hex'));}
function limit(name:string,max:number){const value=Number(process.env[name]??0);return Number.isSafeInteger(value)&&value>0?Math.min(value,max):0;}
function continuousCapture(){return unlimitedUsage()||process.env.ALIBI_LOCAL_PROFILE==='true'&&process.env.ALIBI_CONTINUOUS_CAPTURE==='true';}
export function getLiveRuntime(){
 const continuous=continuousCapture();
 const liveEnabled=process.env.LIVE_PROVIDER_CALLS_ENABLED==='true'&&process.env.TEAM_LIVE_TEST_ENABLED==='true'&&(continuous||grantConfigured());
 const audio=liveEnabled?continuous?Infinity:limit('APPROVED_AUDIO_SECONDS',30):0;
 return {liveEnabled,continuousCapture:continuous,speechKey:process.env.SPEECHMATICS_API_KEY||undefined,
  limits:{continuousCapture:continuous,maxSessionAudioSeconds:audio,maxGlobalAudioSeconds:audio,maxWallMs:audio>0?40000:0,maxStreams:1,maxStartsGlobal:liveEnabled?continuous?Infinity:limit('APPROVED_SPEECH_TOKENS',1):0},
  speechFetch:liveEnabled?async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   if(url.href!=='https://mp.speechmatics.com/v1/api_keys?type=rt'||!continuous&&(state.tokenAttempts>=limit('APPROVED_SPEECH_TOKENS',1)||!grantConfigured()))throw new Error('Approved speech allowance unavailable.');
   state.tokenAttempts++;return fetch(input,{...init,redirect:'error'});
  }:undefined,
 };
}
export function providerMetadata(){const runtime=getLiveRuntime();return {
 generation:{provider:'featherless',model:process.env.FEATHERLESS_MODEL||DEFAULT_GENERATION_MODEL,configured:!!process.env.FEATHERLESS_API_KEY?.trim(),enabled:runtime.liveEnabled&&(runtime.continuousCapture||limit('APPROVED_GENERATION_REQUESTS',3)>0)},
 speech:{provider:'speechmatics',transport:'proxy',configured:!!process.env.SPEECHMATICS_API_KEY?.trim(),enabled:runtime.liveEnabled&&runtime.limits.maxStartsGlobal>0&&runtime.limits.maxSessionAudioSeconds>0},
};}
export function storageMode(){return hasDb()?'postgres':'memory';}
export function sessionPayload(session:LiveSession){return {id:session.id,slug:session.slug,url:'/p/'+session.slug,status:session.status,portfolio:session.portfolio,version:session.version,error:session.error,active:session.active,storage:storageMode(),providers:providerMetadata()};}
async function save(session:LiveSession){
 const pending=(session.persistence??Promise.resolve()).catch(()=>{}).then(async()=>{
  if(session.deleted||!hasDb())return;
  await db().query('insert into sessions (id,slug,transcript,claims,portfolio,metrics) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb) on conflict(id) do update set transcript=excluded.transcript,claims=excluded.claims,portfolio=excluded.portfolio,metrics=excluded.metrics',
   [session.id,session.slug,conversation(session),session.claims?JSON.stringify(Claims.parse(session.claims)):null,JSON.stringify(Portfolio.parse(session.portfolio)),JSON.stringify({startedAt:session.createdAt,...(session.version?{readyAt:session.updatedAt}:{}),tasks:[],parallelTaskCount:0,version:session.version,active:session.active})]);
 });
 session.persistence=pending;await pending;
}
export async function createLiveSession(request:Request){
 assertOrigin(request);
 for(const[id,session]of state.sessions)if(Date.now()-session.updatedAt>30*60*1000&&!session.building&&!session.active){if(session.timer)clearTimeout(session.timer);state.sessions.delete(id);}
 if(state.sessions.size>=100)throw new LiveHttpError(503,'CAPACITY','Session capacity reached.');
 let owner=cookie(request,OWNER_COOKIE);if(!/^[a-f0-9]{64}$/.test(owner))owner=randomBytes(32).toString('hex');
 const session:LiveSession={id:randomUUID(),slug:randomBytes(18).toString('hex'),owner,status:'idle',portfolio:{...EMPTY,skills:[],projects:{},contradictions:[]},version:0,active:false,createdAt:Date.now(),updatedAt:Date.now(),segments:new Map(),revision:0,acceptedRevision:0,building:false};
 await save(session);state.sessions.set(session.id,session);
 return {session,cookie:`${OWNER_COOKIE}=${owner}; HttpOnly; SameSite=Strict; Path=/api${continuousCapture()?'':'; Max-Age=1800'}${process.env.NODE_ENV==='production'&&process.env.ALIBI_LOCAL_PROFILE!=='true'?'; Secure':''}`};
}
export async function requireOwnedSession(request:Request,id:string,allowDeleted=false){
 assertOrigin(request);
 const session=state.sessions.get(id);if(!session||session.deleted&&!allowDeleted||!equal(session.owner,cookie(request,OWNER_COOKIE)))throw new LiveHttpError(404,'NOT_FOUND','Session not found or expired.');return session;
}
export async function wipeLiveSession(request:Request,id:string,stopCapture?:()=>void){
 const session=await requireOwnedSession(request,id,true);
 session.deleted=true;session.abort?.abort();if(session.timer)clearTimeout(session.timer);
 stopCapture?.();
 session.active=false;session.segments.clear();session.portfolio={...EMPTY,skills:[],projects:{},contradictions:[]};session.claims=undefined;
 session.identity=undefined;session.projectRegistry=undefined;
 session.version=0;session.revision=0;session.acceptedRevision=0;session.status='idle';session.error=undefined;
 // Drain an already-running write before deleting, so an upsert cannot resurrect the result.
 await session.persistence?.catch(()=>{});
 if(hasDb())await db().query('delete from sessions where id=$1',[id]);
 state.sessions.delete(id);
}
function grantAllows(session:LiveSession){const grant=state.grant;return getLiveRuntime().liveEnabled&&(continuousCapture()||!!grant&&grant.owner===session.owner&&grant.sessionId===session.id&&Date.now()-grant.startedAt<90000);}
export function authorizeSpeechStart(request:Request,session:LiveSession){
 if(session.deleted)throw new LiveHttpError(404,'NOT_FOUND','Session not found or expired.');
 if(!getLiveRuntime().liveEnabled)throw new LiveHttpError(503,'LIVE_DISABLED','The protected live session has not been enabled.');
 if(unlimitedUsage()&&!grantTokenValid(cookie(request,TEST_COOKIE)))throw new LiveHttpError(403,'TEST_GRANT_REQUIRED','Open your private demo link before starting.');
 if(!continuousCapture()&&(state.grant||!grantTokenValid(cookie(request,TEST_COOKIE))))throw new LiveHttpError(403,'TEST_GRANT_REQUIRED','Use the approved private test link; this one-session allowance may already be used.');
 state.grant={owner:session.owner,sessionId:session.id,startedAt:Date.now()};session.active=true;session.status='listening';session.updatedAt=Date.now();
}
export function setSpeechState(id:string,status:'listening'|'idle'){
 const session=state.sessions.get(id);if(!session||session.deleted)return;session.active=status==='listening';session.updatedAt=Date.now();
 if(!session.building)session.status=session.version?'ready':status;
 if(!session.active&&session.revision>session.acceptedRevision){if(session.timer)clearTimeout(session.timer);void build(session);}
 void save(session).catch(()=>{session.error='Portfolio persistence failed.';});
}
export function conversation(session:LiveSession){return [...session.segments.values()].join(' ').replace(/\s+([,.;:!?])/g,'$1').replace(/\s+/g,' ').trim();}
export function ingestTranscript(id:string,segment:{id:string;text:string;isFinal:boolean;speaker?:string}){
 const session=state.sessions.get(id);if(!session||session.deleted||!segment.isFinal||!grantAllows(session)||typeof segment.text!=='string'||!segment.text.trim()||segment.text.length>4000)return;
 const speaker=segment.speaker&&/^(?:S[1-9]\d{0,3}|UU)$/.test(segment.speaker)?`[${segment.speaker}] `:'';
 const content=speaker+segment.text.trim();
 if(session.segments.has(segment.id)&&session.segments.get(segment.id)===content)return;
 const scope=segment.id.match(/:speechmatics:([^:]+):/)?.[1];
 session.identity=updateConversationIdentity(session.identity,{text:segment.text,speaker:segment.speaker,scope});
 if(!session.segments.has(segment.id)&&session.segments.size>=128){if(continuousCapture())session.segments.delete(session.segments.keys().next().value!);else return;}
 session.segments.set(segment.id,content);
 if(continuousCapture()){while(session.segments.size>1&&conversation(session).length>12000)session.segments.delete(session.segments.keys().next().value!);}
 else if(conversation(session).length>12000){session.segments.delete(segment.id);session.error='Conversation length allowance reached.';return;}
 try{
  const draft=createDraftPortfolio(conversation(session),session.portfolio,{projectRegistry:session.projectRegistry,builderName:session.identity.name,builderSpeaker:session.identity.builderSpeaker});
  session.projectRegistry=draft.projectRegistry;
  for(const entry of session.projectRegistry.projects){entry.designKey??=session.id+':'+entry.id;const project=draft.portfolio.projects[entry.id];if(project)project.mockHtml=renderProjectMock(project,entry.designKey);}
  if(JSON.stringify(draft.portfolio)!==JSON.stringify(session.portfolio)){session.portfolio=draft.portfolio;session.claims=draft.claims;session.version++;session.updatedAt=Date.now();void save(session).catch(()=>{if(!session.deleted)session.error='Portfolio persistence failed.';});}
 }catch{console.info('[alibi:understanding] draft_update_failed');}
 session.revision++;session.updatedAt=Date.now();session.firstDirtyAt??=Date.now();
 if(session.timer)clearTimeout(session.timer);session.timer=setTimeout(()=>void build(session),Math.min(350,Math.max(0,1000-(Date.now()-session.firstDirtyAt))));
}
async function build(session:LiveSession){
 if(session.deleted||session.building||session.revision<=session.acceptedRevision||!grantAllows(session))return;
 if(!continuousCapture()&&state.generationAttempts>=limit('APPROVED_GENERATION_REQUESTS',3)){session.error='The approved inference allowance has been reached. Your last completed portfolio is preserved.';session.status='error';return;}
 session.firstDirtyAt=undefined;const revision=session.revision,transcript=conversation(session),key=process.env.FEATHERLESS_API_KEY;
 if(!key){session.error='Featherless credentials are not configured.';session.status='error';return;}
 session.building=true;session.status='building';session.error=undefined;session.abort=new AbortController();
 const publish=async(incoming:{portfolio:PortfolioData;claims:ClaimsData})=>{
  if(session.deleted)return;
  const result=applyConversationFacts(incoming,session.projectRegistry,session.identity?.name,session.portfolio);
  const portfolio=Portfolio.parse(result.portfolio),claims=Claims.parse(result.claims);
  if(JSON.stringify(portfolio)===JSON.stringify(session.portfolio)){session.claims=claims;return;}
  const prior={portfolio:session.portfolio,claims:session.claims,version:session.version};
  session.portfolio=portfolio;session.claims=claims;session.version++;session.updatedAt=Date.now();
  try{await save(session);}catch(error){if(!session.deleted)Object.assign(session,prior);throw error;}
 };
 try {
  const result=await generatePortfolio({transcript,previous:session.version?session.portfolio:undefined,signal:session.abort.signal,identity:structuredClone(session.identity),projectRegistry:structuredClone(session.projectRegistry)},{apiKey:key,model:process.env.FEATHERLESS_MODEL||DEFAULT_GENERATION_MODEL,onDraft:publish,onDiagnostic:event=>console.info('[alibi:generation]',JSON.stringify({revision,...event})),fetcher:async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
   if(url.href!=='https://api.featherless.ai/v1/chat/completions'||!grantAllows(session)||!continuousCapture()&&state.generationAttempts>=limit('APPROVED_GENERATION_REQUESTS',3))throw new Error('Approved inference allowance reached.');
   state.generationAttempts++;return fetch(input,{...init,redirect:'error'});
  }});
  // One build runs per session. Publish this completed snapshot, then catch up
  // with queued words; continuous speech must not discard every completed build.
  if(session.deleted)return;
  await publish(result);
  session.acceptedRevision=revision;session.status='ready';
 }catch{if(!session.deleted){session.error='The live generation could not finish. Your last completed portfolio is preserved.';session.status='error';}}
 finally{session.building=false;session.abort=undefined;if(!session.deleted&&session.revision>revision&&grantAllows(session)){if(session.timer)clearTimeout(session.timer);session.timer=setTimeout(()=>void build(session),300);}}
}
export async function getPublicPortfolio(slug:string){
 const session=[...state.sessions.values()].find(item=>item.slug===slug);
 if(session?.deleted)return undefined;
 if(session)return {portfolio:Portfolio.parse(session.portfolio),ready:session.version>0,active:session.active||session.building,version:session.version,storage:storageMode()};
 if(!hasDb())return undefined;
 const {rows}=await db().query('select portfolio,metrics from sessions where slug=$1',[slug]);if(!rows[0])return undefined;
 return {portfolio:Portfolio.parse(rows[0].portfolio),ready:Boolean(rows[0].metrics?.readyAt),active:false,version:rows[0].metrics?.version??0,storage:'postgres'};
}
export function claimInteractiveTest(token:string){
 if(!grantTokenValid(token))throw new LiveHttpError(404,'NOT_FOUND','Test link unavailable or expired.');
 return `${TEST_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api${unlimitedUsage()?'':'; Max-Age=900'}${process.env.NODE_ENV==='production'&&process.env.ALIBI_LOCAL_PROFILE!=='true'?'; Secure':''}`;
}
export function routeError(error:unknown){return Response.json({error:{code:error instanceof LiveHttpError?error.code:'UNAVAILABLE',message:error instanceof LiveHttpError?error.message:'The request could not be completed.'}},{status:error instanceof LiveHttpError?error.status:503,headers:{'Cache-Control':'no-store'}});}
