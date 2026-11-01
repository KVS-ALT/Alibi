import 'server-only';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Claims, Portfolio, type Claims as ClaimsData, type Metrics, type Portfolio as PortfolioData } from '@alibi/shared';
import { db, hasDb } from './db';
import { extractClaims, generationConfigured, heroFrom, makeMock, pendingSection, projectId, readySection, writeProject } from './generation';

export class LiveHttpError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
export interface LiveSession {
 id:string;slug:string;owner:string;status:'idle'|'listening'|'building'|'ready'|'error';
 portfolio:PortfolioData;claims?:ClaimsData;version:number;active:boolean;error?:string;
 createdAt:number;updatedAt:number;segments:Map<string,string>;revision:number;acceptedRevision:number;
 building:boolean;timer?:ReturnType<typeof setTimeout>;firstDirtyAt?:number;abort?:AbortController;
 builds:number;metrics:Metrics;generatedFrom:Map<string,number>;
}
interface State { sessions:Map<string,LiveSession> }
declare global { var __alibiLiveSessions:State|undefined; }
const state:State=globalThis.__alibiLiveSessions??={sessions:new Map()};
const OWNER_COOKIE='alibi_team_owner';
const EMPTY:PortfolioData={templateId:'showcase',skills:[],projects:{},contradictions:[]};
function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='))?.slice(name.length+1)??'';}
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function envInt(name:string,fallback:number){const value=Number(process.env[name]);return Number.isSafeInteger(value)&&value>0?value:fallback;}

// Usage caps are per session and configurable; defaults comfortably cover a demo and rehearsals.
const MAX_BUILDS_PER_SESSION=()=>envInt('MAX_BUILDS_PER_SESSION',30);
export function getLiveRuntime(){
 const liveEnabled=process.env.LIVE_PROVIDER_CALLS_ENABLED==='true';
 const speechEnabled=liveEnabled&&process.env.SPEECHMATICS_ENABLED!=='false'&&!!process.env.SPEECHMATICS_API_KEY?.trim();
 const audio=envInt('MAX_AUDIO_SECONDS_PER_SESSION',600);
 return {liveEnabled,speechEnabled,speechKey:process.env.SPEECHMATICS_API_KEY?.trim()||undefined,
  limits:{maxSessionAudioSeconds:audio,maxGlobalAudioSeconds:envInt('MAX_AUDIO_SECONDS_GLOBAL',3*3600),maxWallMs:audio*1000+60_000,maxStreams:envInt('MAX_SPEECH_STREAMS',4),maxStartsGlobal:envInt('MAX_SPEECH_STARTS_GLOBAL',100)},
 };
}
export function providerMetadata(){const runtime=getLiveRuntime();return {
 generation:{provider:'featherless',configured:generationConfigured(),enabled:runtime.liveEnabled&&generationConfigured()},
 speech:{provider:'speechmatics',transport:'proxy',configured:!!runtime.speechKey,enabled:runtime.speechEnabled},
};}
export function storageMode(){return hasDb()?'postgres':'memory';}
export function sessionPayload(session:LiveSession){return {id:session.id,slug:session.slug,url:'/p/'+session.slug,status:session.status,portfolio:session.portfolio,version:session.version,error:session.error,active:session.active,transcript:conversation(session),metrics:session.metrics,contradictions:session.portfolio.contradictions,storage:storageMode(),providers:providerMetadata()};}
async function save(session:LiveSession){
 if(!hasDb())return;
 await db().query('insert into sessions (id,slug,transcript,claims,portfolio,metrics) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb) on conflict(id) do update set transcript=excluded.transcript,claims=excluded.claims,portfolio=excluded.portfolio,metrics=excluded.metrics',
  [session.id,session.slug,conversation(session),session.claims?JSON.stringify(Claims.parse(session.claims)):null,JSON.stringify(Portfolio.parse(session.portfolio)),JSON.stringify({...session.metrics,version:session.version,active:session.active})]);
}
export async function createLiveSession(request:Request){
 const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==new URL(request.url).host)throw new LiveHttpError(403,'ORIGIN_REJECTED','Same-origin requests only.');
 for(const[id,session]of state.sessions)if(Date.now()-session.updatedAt>2*60*60*1000&&!session.building){if(session.timer)clearTimeout(session.timer);state.sessions.delete(id);}
 if(state.sessions.size>=200)throw new LiveHttpError(503,'CAPACITY','Session capacity reached.');
 let owner=cookie(request,OWNER_COOKIE);if(!/^[a-f0-9]{64}$/.test(owner))owner=randomBytes(32).toString('hex');
 const now=Date.now();
 const session:LiveSession={id:randomUUID(),slug:randomBytes(6).toString('base64url'),owner,status:'idle',portfolio:{...EMPTY,skills:[],projects:{},contradictions:[]},version:0,active:false,createdAt:now,updatedAt:now,segments:new Map(),revision:0,acceptedRevision:0,building:false,builds:0,metrics:{startedAt:now,tasks:[],parallelTaskCount:0},generatedFrom:new Map()};
 await save(session);state.sessions.set(session.id,session);
 return {session,cookie:`${OWNER_COOKIE}=${owner}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=7200${process.env.NODE_ENV==='production'&&process.env.ALIBI_LOCAL_PROFILE!=='true'?'; Secure':''}`};
}
export async function requireOwnedSession(request:Request,id:string){
 const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==new URL(request.url).host)throw new LiveHttpError(403,'ORIGIN_REJECTED','Same-origin requests only.');
 const session=state.sessions.get(id);if(!session||!equal(session.owner,cookie(request,OWNER_COOKIE)))throw new LiveHttpError(404,'NOT_FOUND','Session not found or expired.');return session;
}
export function authorizeSpeechStart(_request:Request,session:LiveSession){
 if(!getLiveRuntime().speechEnabled)throw new LiveHttpError(503,'LIVE_DISABLED','Live speech capture is not enabled.');
 session.active=true;session.status=session.building?'building':'listening';session.updatedAt=Date.now();
}
export function setSpeechState(id:string,status:'listening'|'idle'){
 const session=state.sessions.get(id);if(!session)return;session.active=status==='listening';session.updatedAt=Date.now();
 if(!session.building)session.status=session.version?'ready':status;
 if(!session.active&&session.revision>session.acceptedRevision){if(session.timer)clearTimeout(session.timer);void build(session);}
 void save(session).catch(()=>{session.error='Portfolio persistence failed.';});
}
export function conversation(session:LiveSession){return [...session.segments.values()].join(' ').replace(/\s+([,.;:!?])/g,'$1').replace(/\s+/g,' ').trim();}
export function ingestTranscript(id:string,segment:{id:string;text:string;isFinal:boolean}){
 const session=state.sessions.get(id);if(!session||!segment.isFinal||typeof segment.text!=='string'||!segment.text.trim()||segment.text.length>4000)return;
 if(session.segments.has(segment.id)&&session.segments.get(segment.id)===segment.text.trim())return;
 if(!session.segments.has(segment.id)&&session.segments.size>=512)return;
 session.segments.set(segment.id,segment.text.trim());if(conversation(session).length>12000){session.segments.delete(segment.id);session.error='Conversation length limit reached.';return;}
 session.revision++;session.updatedAt=Date.now();session.firstDirtyAt??=Date.now();
 // Debounce: wait for a pause, but never hold a change longer than ~6s.
 if(session.timer)clearTimeout(session.timer);session.timer=setTimeout(()=>void build(session),Math.min(1500,Math.max(0,6000-(Date.now()-session.firstDirtyAt))));
}

async function timed<T extends {ok:boolean}>(session:LiveSession,name:string,run:()=>Promise<T>):Promise<T>{
 const started=Date.now();
 try{const result=await run();session.metrics.tasks.push({name,ms:Date.now()-started,ok:result.ok});return result;}
 catch(error){session.metrics.tasks.push({name,ms:Date.now()-started,ok:false});throw error;}
}
async function publish(session:LiveSession,portfolio:PortfolioData){
 session.portfolio=Portfolio.parse(portfolio);session.version++;session.updatedAt=Date.now();
 if(Object.values(session.portfolio.projects).some(p=>p.status==='ready')||session.portfolio.hero)session.metrics.firstSectionAt??=Date.now();
 await save(session).catch(()=>{session.error='Portfolio persistence failed.';});
}

/** build_portfolio: extract claims, then write each new/changed project in parallel, publishing each section as it lands. */
async function build(session:LiveSession){
 if(session.building||session.revision<=session.acceptedRevision||!providerMetadata().generation.enabled)return;
 if(session.builds>=MAX_BUILDS_PER_SESSION()){session.error='Build limit for this session reached. Your last portfolio is preserved.';return;}
 session.builds++;session.firstDirtyAt=undefined;
 const revision=session.revision,transcript=conversation(session);
 session.building=true;session.status='building';session.error=undefined;session.abort=new AbortController();
 const signal=session.abort.signal;
 try{
  const extracted=(await timed(session,'extract_claims',()=>extractClaims(transcript,session.claims,signal))).value;
  const claims=Claims.parse({
   ...(extracted.speakerName?{speakerName:extracted.speakerName}:{}),...(extracted.role?{role:extracted.role}:{}),
   vibe:session.claims?.vibe??extracted.vibe,skills:extracted.skills,
   projects:extracted.projects.map(p=>({id:projectId(p.name),name:p.name,saidAbout:p.saidAbout})),
   ...(extracted.contactEmail&&transcript.toLowerCase().includes(extracted.contactEmail.toLowerCase())?{contactEmail:extracted.contactEmail}:{}),
  });
  session.claims=claims;
  const hero=heroFrom(extracted)??session.portfolio.hero;
  const handle=hero?.handle??'builder';
  // Claims are pinned: keep sections we already built, add new ones as pending skeletons.
  const projects={...session.portfolio.projects};
  const todo=claims.projects.filter(p=>!projects[p.id]&&!session.generatedFrom.has(p.id));
  for(const p of todo)if(!projects[p.id])projects[p.id]=pendingSection(p.name);
  await publish(session,{templateId:claims.vibe,...(hero?{hero}:{}),skills:claims.skills.length?claims.skills:session.portfolio.skills,projects,contradictions:extracted.contradictions});
  session.metrics.parallelTaskCount=Math.max(session.metrics.parallelTaskCount,todo.length*2);

  // Card and mock UI are independent, so both run at once; each publishes the moment it lands.
  await Promise.all(todo.map(async p=>{
   session.generatedFrom.set(p.id,p.saidAbout.length);
   const card=timed(session,`write_project:${p.id}`,()=>writeProject(p,{role:claims.role,skills:claims.skills},signal)).then(async({value})=>{
    const previousMock=session.portfolio.projects[p.id]?.mockHtml;
    await publish(session,{...session.portfolio,projects:{...session.portfolio.projects,[p.id]:readySection(p.name,handle,value,previousMock)}});
   });
   const mock=timed(session,`make_mock:${p.id}`,()=>makeMock(p,{skills:claims.skills},signal));
   const [,{value:html}]=await Promise.all([card,mock]);
   if(html)await publish(session,{...session.portfolio,projects:{...session.portfolio.projects,[p.id]:{...session.portfolio.projects[p.id],mockHtml:html}}});
  }));
  session.acceptedRevision=revision;session.status=session.active?'listening':'ready';session.metrics.readyAt=Date.now();
  await save(session).catch(()=>{});
 }catch(error){
  if(!signal.aborted)console.error('[alibi] build failed',error);
  session.error='The live generation could not finish. Your last portfolio is preserved.';session.status='error';
 }finally{
  session.building=false;session.abort=undefined;
  if(session.revision>session.acceptedRevision&&session.status!=='error'){if(session.timer)clearTimeout(session.timer);session.timer=setTimeout(()=>void build(session),300);}
 }
}

/** Typed-transcript path (no microphone): same pipeline as speech, used for testing and as a demo fallback. */
export function ingestTypedTranscript(session:LiveSession,text:string){
 ingestTranscript(session.id,{id:`typed:${randomUUID()}`,text,isFinal:true});
}
export async function getPublicPortfolio(slug:string){
 const session=[...state.sessions.values()].find(item=>item.slug===slug);
 if(session)return {portfolio:Portfolio.parse(session.portfolio),ready:session.version>0&&!session.building&&!session.active,active:session.active||session.building,version:session.version,storage:storageMode()};
 if(!hasDb())return undefined;
 const {rows}=await db().query('select portfolio,metrics from sessions where slug=$1',[slug]);if(!rows[0])return undefined;
 return {portfolio:Portfolio.parse(rows[0].portfolio),ready:Boolean(rows[0].metrics?.readyAt),active:false,version:rows[0].metrics?.version??0,storage:'postgres'};
}
export function routeError(error:unknown){return Response.json({error:{code:error instanceof LiveHttpError?error.code:'UNAVAILABLE',message:error instanceof LiveHttpError?error.message:'The request could not be completed.'}},{status:error instanceof LiveHttpError?error.status:503,headers:{'Cache-Control':'no-store'}});}
