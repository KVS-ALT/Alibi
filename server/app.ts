import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import { randomBytes,randomUUID,timingSafeEqual } from 'node:crypto';
import { readFile,realpath,stat } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
import { createProjectArchive } from '../src/export';
import { localRunner,parseJobInput,sessionIdSchema,type JobRunner,type PackageResult,type Progress } from './pipeline';
import { createEmailHandoff,createSourceArchiveAttachment } from './email';
import { createProviderBudget } from './provider-budget';
import { createInteractiveGrant } from './interactive-grant';
import type { createElevenLabsTranscriber } from './elevenlabs';
import type { publicProviderCapabilities } from './config';
import type { createSpeechmaticsTokenProvider } from './speechmatics';
import type { createSpeechmaticsProxy } from './speechmatics-proxy';

class HttpError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
type JobEvent={type:'stage';progress:Progress}|{type:'result';result:PackageResult['result']}|{type:'error';code:string;message:string};
interface Job {id:string;events:JobEvent[];listeners:Set<ServerResponse>;done:boolean;abort:AbortController}
interface Session {id:string;owner:string;expiresAt:number;jobs:Map<string,Job>;latest?:PackageResult;version:number;speechState?:'active'|'muted'|'ended';speechStreamId?:string}
export interface ServerOptions {interactiveTest?:{token:string;expiresAt:number};runner?:JobRunner;staticDir?:string;ttlMs?:number;maxSessions?:number;maxActiveJobs?:number;now?:()=>number;secureCookies?:boolean;rateLimit?:number;cookieName?:string;liveCallsAllowed?:boolean;forceLiveCallsDisabled?:boolean;providerCapabilities?:ReturnType<typeof publicProviderCapabilities>;speech?:ReturnType<typeof createElevenLabsTranscriber>;speechmatics?:ReturnType<typeof createSpeechmaticsTokenProvider>;speechProxy?:ReturnType<typeof createSpeechmaticsProxy>;email?:ReturnType<typeof createEmailHandoff>}
const constantEqual=(a:string,b:string)=>{const first=Buffer.from(a),second=Buffer.from(b);return first.length===second.length&&timingSafeEqual(first,second);};
function ownerCookie(req:IncomingMessage,name:string){return req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1)??'';}
async function readJson(req:IncomingMessage){
 if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'JSON_REQUIRED','Use application/json.');
 if(Number(req.headers['content-length']??0)>128*1024)throw new HttpError(413,'BODY_TOO_LARGE','Request exceeds 128 KiB.');
 const chunks:Buffer[]=[];let bytes=0;
 for await(const raw of req){const chunk=Buffer.from(raw);bytes+=chunk.length;if(bytes>128*1024)throw new HttpError(413,'BODY_TOO_LARGE','Request exceeds 128 KiB.');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'INVALID_JSON','Invalid JSON.');}
}
async function readAudio(req:IncomingMessage,maximum=2*1024*1024){
 if(Number(req.headers['content-length']??0)>maximum)throw new HttpError(413,'AUDIO_TOO_LARGE','Audio exceeds 2 MiB.');
 const chunks:Buffer[]=[];let size=0;
 for await(const raw of req){const chunk=Buffer.from(raw);size+=chunk.length;if(size>maximum)throw new HttpError(413,'AUDIO_TOO_LARGE','Audio exceeds 2 MiB.');chunks.push(chunk);}
 return new Uint8Array(Buffer.concat(chunks));
}
function json(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
function sameOrigin(req:IncomingMessage){if(req.headers['sec-fetch-site']==='cross-site')return false;const origin=req.headers.origin;if(!origin)return true;try{return new URL(origin).host===req.headers.host;}catch{return false;}}
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};

export function createApp(options:ServerOptions={}){
 const runner=options.runner??localRunner,now=options.now??Date.now,ttl=options.ttlMs??30*60*1000;
 const cookieName=options.cookieName??'larp_owner';
 if(!/^[a-zA-Z0-9_-]{1,40}$/.test(cookieName))throw new Error('Invalid server cookie name.');
 const sessions=new Map<string,Session>(),rates=new Map<string,{start:number;count:number}>();let activeJobs=0;
 const liveAllowed=options.liveCallsAllowed===true&&options.forceLiveCallsDisabled!==true;
 const email=liveAllowed&&options.email?options.email:createEmailHandoff();
 const budget=createProviderBudget(now);
 const grant=options.interactiveTest?createInteractiveGrant(options.interactiveTest,now):undefined;
 const publish=(job:Job,event:JobEvent)=>{job.events.push(event);const payload=`data: ${JSON.stringify(event)}\n\n`;for(const listener of job.listeners){if(listener.writableLength>256*1024){listener.destroy();job.listeners.delete(listener);}else listener.write(payload);}};
 const finish=(job:Job)=>{job.done=true;for(const listener of job.listeners)listener.end();job.listeners.clear();};
 const cleanup=()=>{for(const[id,session]of sessions)if(session.expiresAt<=now()){for(const job of session.jobs.values()){job.abort.abort();finish(job);}options.speech?.endSession(id);options.speechmatics?.cancelSession(id);sessions.delete(id);}for(const[key,value]of rates)if(now()-value.start>60000)rates.delete(key);};
 const timer=setInterval(cleanup,30000);timer.unref();
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  try{
   cleanup();const url=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`),path=url.pathname;
   const claim=path.match(/^\/test\/claim\/([a-f0-9]{64})$/);
   if(claim&&req.method==='GET'){
    if(!grant?.pending(claim[1]))throw new HttpError(404,'NOT_FOUND','Test link unavailable or expired.');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Set-Cookie',`${cookieName}_test=${claim[1]}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=600${options.secureCookies?'; Secure':''}`);
    res.writeHead(303,{Location:'/'});res.end();return;
   }
   if(path==='/api/health'){const providers=options.providerCapabilities?{...options.providerCapabilities,liveCallsEnabled:liveAllowed,generation:{...options.providerCapabilities.generation,enabled:options.providerCapabilities.generation.provider==='demo'||liveAllowed&&options.providerCapabilities.generation.enabled},speech:{...options.providerCapabilities.speech,enabled:options.providerCapabilities.speech.provider==='browser'||liveAllowed&&options.providerCapabilities.speech.enabled},email:{...options.providerCapabilities.email,enabled:liveAllowed&&options.providerCapabilities.email.enabled}}:undefined;json(res,200,{status:'ok',runner:runner.mode,generator:runner.generator??'Demo generator',storage:'ephemeral-memory',sessionTtlMinutes:ttl/60000,...(providers?{providers}:{})});return;}
   if(path.startsWith('/api/')){
    if(!sameOrigin(req))throw new HttpError(403,'ORIGIN_REJECTED','Same-origin requests only.');
    // Use the socket address, never an untrusted forwarded header.
    const key=req.socket.remoteAddress??'unknown';const rate=rates.get(key)??{start:now(),count:0};
    if(now()-rate.start>=60000){rate.start=now();rate.count=0;}rate.count++;rates.set(key,rate);
    if(rate.count>(options.rateLimit??120)){res.setHeader('Retry-After','60');throw new HttpError(429,'RATE_LIMIT','Too many requests; try again in a minute.');}
    if(rates.size>2048){const oldest=rates.keys().next().value;if(oldest)rates.delete(oldest);}
    if(path==='/api/sessions'&&req.method==='POST'){
     const raw=await readJson(req);const parsed=sessionIdSchema.safeParse(raw?.id);if(!parsed.success||Object.keys(raw).some(k=>k!=='id'))throw new HttpError(400,'INVALID_SESSION','Provide a session UUID.');
     let owner=ownerCookie(req,cookieName);const existing=sessions.get(parsed.data);
     if(existing){if(!constantEqual(existing.owner,owner))throw new HttpError(404,'SESSION_NOT_FOUND','Session not found.');json(res,200,{id:existing.id,expiresAt:existing.expiresAt,storage:'ephemeral-memory'});return;}
     if(sessions.size>=(options.maxSessions??100))throw new HttpError(503,'SESSION_CAPACITY','Session capacity reached; try again later.');
     if(!/^[a-f0-9]{64}$/.test(owner))owner=randomBytes(32).toString('hex');
     const session:Session={id:parsed.data,owner,expiresAt:now()+ttl,jobs:new Map(),version:0};sessions.set(session.id,session);
     res.setHeader('Set-Cookie',`${cookieName}=${owner}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${Math.floor(ttl/1000)}${options.secureCookies?'; Secure':''}`);
     json(res,201,{id:session.id,expiresAt:session.expiresAt,storage:'ephemeral-memory'});return;
    }
    const match=path.match(/^\/api\/sessions\/([^/]+)(?:\/(.*))?$/);if(!match)throw new HttpError(404,'NOT_FOUND','Route not found.');
    const session=sessions.get(match[1]);if(!session||!constantEqual(session.owner,ownerCookie(req,cookieName)))throw new HttpError(404,'SESSION_NOT_FOUND','Session not found or expired.');
    const route=match[2]??'';
    if(route===''&&req.method==='GET'){json(res,200,{id:session.id,expiresAt:session.expiresAt,storage:'ephemeral-memory',result:session.latest?.result});return;}
    if(route===''&&req.method==='DELETE'){for(const job of session.jobs.values()){job.abort.abort();finish(job);}options.speech?.endSession(session.id);options.speechmatics?.cancelSession(session.id);sessions.delete(session.id);json(res,200,{deleted:true});return;}
    if(route==='jobs'&&req.method==='POST'){
     const raw=await readJson(req);let input;try{input=parseJobInput(raw);}catch{throw new HttpError(400,'INVALID_REQUEST','Invalid generation request or brief.');}
     if(input.sessionId!==session.id)throw new HttpError(400,'SESSION_MISMATCH','Request belongs to another session.');
     if(input.briefVersion<session.version)throw new HttpError(409,'STALE_BRIEF','This brief is older than the current server version.');
     if([...session.jobs.values()].some(j=>!j.done)||activeJobs>=(options.maxActiveJobs??4))throw new HttpError(409,'BUSY','A build is already active; wait for it to finish.');
     if(runner.requiresLive&&grant&&!grant.allows(session.owner,session.id))throw new HttpError(403,'TEST_GRANT_REQUIRED','This live test is reserved for its approved browser session.');
     if(runner.requiresLive&&(!liveAllowed||options.providerCapabilities?.generation.enabled===false))throw new HttpError(503,'PROVIDER_DISABLED','The selected generation provider is disabled. No external request was made.');
     if(runner.requiresLive&&!budget.reserve('generation',session.id,key))throw new HttpError(429,'PROVIDER_BUDGET','The bounded generation allowance has been reached.');
     while(session.jobs.size>=5){const first=session.jobs.keys().next().value;if(first)session.jobs.delete(first);}
     const job:Job={id:randomUUID(),events:[],listeners:new Set(),done:false,abort:new AbortController()};session.jobs.set(job.id,job);session.version=input.briefVersion;activeJobs++;
     json(res,202,{jobId:job.id,runner:runner.mode,generator:runner.generator??'Demo generator'});
     const timeout=setTimeout(()=>job.abort.abort(),180000);timeout.unref();
     void runner.run(input,p=>publish(job,{type:'stage',progress:p}),job.abort.signal).then(bundle=>{
      if(job.abort.signal.aborted||!sessions.has(session.id))return;
      if('uiSpec'in bundle.result&&bundle.result.briefVersion===session.version)session.latest=bundle;
      publish(job,{type:'result',result:bundle.result});
     }).catch(()=>{if(sessions.has(session.id))publish(job,{type:'error',code:'BUILD_FAILED',message:job.abort.signal.aborted?'Build timed out or was canceled.':'Build failed. Retry the current brief.'});}).finally(()=>{clearTimeout(timeout);activeJobs--;finish(job);});return;
    }
    if(route==='speech/events'&&req.method==='GET'){
     const proxy=options.speechProxy,streamId=url.searchParams.get('streamId');
     if(!liveAllowed||!proxy?.isConfigured())throw new HttpError(503,'PROVIDER_DISABLED','Realtime transcription is disabled.');
     if(grant&&!grant.allows(session.owner,session.id))throw new HttpError(403,'TEST_GRANT_REQUIRED','This stream belongs to the approved test session.');
     if(!streamId||streamId!==session.speechStreamId)throw new HttpError(409,'STALE_STREAM','This speech stream is no longer current.');
     res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
     const unsubscribe=proxy.subscribe({sessionId:session.id,streamId},event=>{
      if(res.destroyed||res.writableLength>65536)return false;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if(event.type==='state'&&event.state==='ended'){if(session.speechStreamId===streamId)session.speechState='ended';res.end();}return true;
     });
     if(!unsubscribe){res.end();return;}
     res.on('close',()=>{unsubscribe();if(session.speechStreamId===streamId)session.speechState='ended';});return;
    }
    const speechRoute=route.match(/^speech\/(start|mute|resume|end|chunks|token|pcm|flush)$/);
    if(speechRoute&&req.method==='POST'){
     if(speechRoute[1]==='token')throw new HttpError(410,'DIRECT_TOKENS_DISABLED','Provider tokens are private. Use the bounded server speech proxy.');
     if(!liveAllowed)throw new HttpError(503,'PROVIDER_DISABLED','Provider transcription is disabled. No external request was made.');
     const speech=options.speech;
     const speechProvider=options.providerCapabilities?.speech.provider??(speech?'elevenlabs':options.speechmatics?'speechmatics':'browser');
     const configured=speechProvider==='speechmatics'?options.speechProxy?.isConfigured():speechProvider==='elevenlabs'&&speech?.isConfigured();
     if(!configured)throw new HttpError(503,'PROVIDER_UNCONFIGURED','Provider transcription is not configured.');
     const operation=speechRoute[1];
     if(grant&&operation!=='start'&&!grant.allows(session.owner,session.id))throw new HttpError(403,'TEST_GRANT_REQUIRED','This speech stream belongs to the approved test session.');
     if(speechProvider==='speechmatics'){
      const proxy=options.speechProxy!;
      if(operation==='pcm'){
       if(session.speechState!=='active'||req.headers['x-speech-stream-id']!==session.speechStreamId||!session.speechStreamId)throw new HttpError(409,'STALE_STREAM','This speech stream is no longer current.');
       if(req.headers['content-type']!=='application/octet-stream')throw new HttpError(415,'INVALID_PCM','Use raw PCM16 mono 16 kHz bytes.');
       const result=proxy.writePcm({sessionId:session.id,streamId:session.speechStreamId,audio:await readAudio(req,16384)});json(res,result.ok?200:422,result);return;
      }
      const raw=await readJson(req);
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(name=>!['consented','streamId'].includes(name)))throw new HttpError(400,'INVALID_CONSENT','Invalid speech control request.');
      if(operation==='start'){
       if(raw.consented!==true)throw new HttpError(400,'CONSENT_REQUIRED','Explicit speech consent is required.');
       if(grant&&!grant.start(ownerCookie(req,`${cookieName}_test`),session.owner,session.id))throw new HttpError(403,'TEST_GRANT_REQUIRED','This test link is expired, already used, or belongs to another browser.');
       const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
       const result=await proxy.start({sessionId:session.id,consented:true,signal:controller.signal});
       if(result.ok){session.speechState='active';session.speechStreamId=result.streamId;}json(res,result.ok?200:422,result);return;
      }
      if(typeof raw.streamId!=='string'||raw.streamId!==session.speechStreamId)throw new HttpError(409,'STALE_STREAM','This speech stream is no longer current.');
      if(operation==='flush'){const result=await proxy.flush({sessionId:session.id,streamId:raw.streamId});json(res,result.ok?200:422,result);return;}
      if(operation==='mute'||operation==='end'){proxy.endSession(session.id);session.speechState='ended';json(res,200,{ok:true,streamId:raw.streamId});return;}
      throw new HttpError(409,'SPEECH_INACTIVE','Start a fresh consented stream to resume.');
     }
     if(operation!=='chunks'){
      const raw=await readJson(req);
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(name=>!['consented','providerRetentionAccepted'].includes(name)))throw new HttpError(400,'INVALID_CONSENT','Invalid speech control request.');
      if(operation==='start'){
       if(raw.consented!==true||speechProvider==='elevenlabs'&&!speech!.startSession({sessionId:session.id,consented:true,providerRetentionAccepted:raw.providerRetentionAccepted===true}))throw new HttpError(400,'CONSENT_REQUIRED','Explicit speech and applicable provider-retention consent are required.');
       session.speechState='active';
      }else if(operation==='mute'){session.speechState='muted';speech?.muteSession(session.id);options.speechmatics?.cancelSession(session.id);}else if(operation==='resume'){if(session.speechState!=='muted')throw new HttpError(409,'SPEECH_INACTIVE','Start a consented speech session first.');session.speechState='active';speech?.resumeSession(session.id);}else{session.speechState='ended';speech?.endSession(session.id);options.speechmatics?.cancelSession(session.id);}
      json(res,200,{ok:true,provider:speechProvider,mode:'bounded',state:operation});return;
     }
     if(session.speechState!=='active')throw new HttpError(409,'SPEECH_INACTIVE','Start or resume a consented speech session first.');
     if(speechProvider!=='elevenlabs'||!speech)throw new HttpError(409,'PROVIDER_MISMATCH','The configured speech provider does not use batch audio uploads.');
     const chunkId=req.headers['x-chunk-id'],durationHeader=req.headers['x-audio-duration-ms'];
     const durationMs=Number(durationHeader),mimeType=(req.headers['content-type']??'').split(';')[0].trim().toLowerCase();
     if(typeof chunkId!=='string'||!/^[a-z0-9_-]{1,100}$/i.test(chunkId)||typeof durationHeader!=='string'||durationHeader.length>12||!Number.isFinite(durationMs)||durationMs<=0||durationMs>30000||mimeType!=='audio/wav')throw new HttpError(400,'INVALID_AUDIO','Use one bounded canonical PCM WAV segment.');
     const audio=await readAudio(req);
     if(!budget.reserve('speech',session.id,key,audio.byteLength))throw new HttpError(429,'PROVIDER_BUDGET','The bounded audio allowance has been reached.');
     const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
     const result=await speech.transcribe({sessionId:session.id,chunkId,audio,mimeType,durationMs,signal:controller.signal});
     json(res,result.ok?200:result.code==='cancelled'?409:422,result);return;
    }
    const events=route.match(/^jobs\/([^/]+)\/events$/);
    if(events&&req.method==='GET'){
     const job=session.jobs.get(events[1]);if(!job)throw new HttpError(404,'JOB_NOT_FOUND','Job not found.');
     if(job.listeners.size>=3)throw new HttpError(429,'STREAM_LIMIT','Too many event streams.');
     res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
     for(const event of job.events)res.write(`data: ${JSON.stringify(event)}\n\n`);
     if(job.done)res.end();else{job.listeners.add(res);const beat=setInterval(()=>res.write(': keepalive\n\n'),15000);beat.unref();res.on('close',()=>{clearInterval(beat);job.listeners.delete(res);});}return;
    }
    if(route==='email'&&req.method==='POST'){
     const raw=await readJson(req);
     if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['recipient','enabled','projectVersion','delivery'].includes(key))||typeof raw.recipient!=='string'||raw.recipient.length>254||raw.enabled!==true||!Number.isSafeInteger(raw.projectVersion)||raw.delivery!==undefined&&!['attachment','link'].includes(raw.delivery))throw new HttpError(400,'INVALID_HANDOFF','Provide an explicit recipient, enable consent, and the current project version.');
     const result=session.latest?.result;
     if(!result||!('uiSpec'in result))throw new HttpError(409,'NOT_READY','Build a prototype before preparing an email handoff.');
     if(raw.projectVersion!==result.uiSpec.version)throw new HttpError(409,'STALE_PROJECT','Email handoff must reference the latest completed project.');
     if(raw.delivery==='link')throw new HttpError(409,'PUBLIC_ARTIFACT_UNAVAILABLE','This local project has no public shareable URL. Source attachment delivery is available instead.');
     if(liveAllowed&&options.providerCapabilities?.email.enabled&&!budget.reserve('email',session.id,key))throw new HttpError(429,'PROVIDER_BUDGET','The bounded email allowance has been reached.');
     const sourceArchive=createSourceArchiveAttachment(createProjectArchive(result.uiSpec));
     const status=await email.handoff({eventId:result.requestId,sessionId:session.id,projectId:session.id,projectVersion:result.uiSpec.version,ready:true,explicitRecipient:true,recipient:raw.recipient,sourceArchive,summary:`Prototype source: ${result.uiSpec.screens[0].title}`.slice(0,1000)});
     json(res,status.status==='blocked'?400:200,{...status,publicLinkAvailable:false,artifactAccess:'source-attachment'});return;
    }
    if(route==='export'&&req.method==='GET'){
     const bundle=session.latest;if(!bundle||!('uiSpec'in bundle.result))throw new HttpError(409,'NOT_READY','Build a prototype before exporting.');
     const format=url.searchParams.get('format')??'json';
     if(format==='json'){res.setHeader('Content-Disposition','attachment; filename="prototype-config.json"');json(res,200,bundle.result.uiSpec);return;}
     if(format==='html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':'attachment; filename="prototype.html"'});res.end(bundle.files['standalone.html']??bundle.files['index.html']);return;}
     if(format==='source'){res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="prototype-source.zip"'});res.end(createProjectArchive(bundle.result.uiSpec));return;}
     throw new HttpError(400,'INVALID_FORMAT','Use json, html, or source.');
    }
    throw new HttpError(404,'NOT_FOUND','Route not found.');
   }
   if(req.method!=='GET'&&req.method!=='HEAD')throw new HttpError(405,'METHOD_NOT_ALLOWED','Method not allowed.');
   if(!options.staticDir)throw new HttpError(404,'NOT_FOUND','Frontend not built.');
   const root=await realpath(options.staticDir);let candidate=resolve(root,'.'+decodeURIComponent(path));
   if(candidate!==root&&!candidate.startsWith(root+sep))throw new HttpError(404,'NOT_FOUND','File not found.');
   try{if(!(await stat(candidate)).isFile())candidate=resolve(root,'index.html');}catch{if(extname(path))throw new HttpError(404,'NOT_FOUND','File not found.');candidate=resolve(root,'index.html');}
   const actual=await realpath(candidate);if(!actual.startsWith(root+sep))throw new HttpError(404,'NOT_FOUND','File not found.');
   const content=await readFile(actual);res.writeHead(200,{'Content-Type':mime[extname(actual)]??'application/octet-stream','Content-Length':content.byteLength});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){if(res.headersSent){res.end();return;}if(error instanceof HttpError)json(res,error.status,{error:{code:error.code,message:error.message}});else json(res,500,{error:{code:'INTERNAL_ERROR',message:'Request could not be completed.'}});}
 });
 server.requestTimeout=30000;server.headersTimeout=10000;
 server.on('close',()=>{clearInterval(timer);for(const session of sessions.values())for(const job of session.jobs.values()){job.abort.abort();finish(job);}options.speech?.dispose();options.speechProxy?.dispose();options.speechmatics?.dispose();});
 return server;
}
