import { createHash,randomUUID } from 'node:crypto';
import { lstat,mkdir,open,readFile,rename,unlink } from 'node:fs/promises';
import { dirname,isAbsolute } from 'node:path';
import { z } from 'zod';

export interface EmailHandoffInput {
  eventId: string;
  sessionId: string;
  projectId: string;
  projectVersion: number;
  ready: boolean;
  explicitRecipient: boolean;
  recipient: string;
  /** Backend constructs these from the successful artifact, never from transcript addresses. */
  projectUrl?: string;
  sourceArchive?:SourceArchiveAttachment;
  summary: string;
}
export interface SourceArchiveAttachment {filename:'prototype-source.zip';content_type:'application/zip';content_base64:string}
const maxArchiveBytes=2*1024*1024;
function validSourceArchive(value:unknown):value is SourceArchiveAttachment {
 if(!value||typeof value!=='object')return false;
 const item=value as Record<string,unknown>;
 if(Object.keys(item).some(key=>!['filename','content_type','content_base64'].includes(key))||item.filename!=='prototype-source.zip'||item.content_type!=='application/zip'||typeof item.content_base64!=='string'||item.content_base64.length>Math.ceil(maxArchiveBytes/3)*4||!item.content_base64.length||!/^[A-Za-z0-9+/]*={0,2}$/.test(item.content_base64))return false;
 const bytes=Buffer.from(item.content_base64,'base64');
 return bytes.length>=4&&bytes.length<=maxArchiveBytes&&bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]))&&bytes.toString('base64')===item.content_base64;
}
/** Only call with the latest validated server-generated archive; never a browser upload. */
export function createSourceArchiveAttachment(bytes:Uint8Array):SourceArchiveAttachment {
 if(bytes.byteLength<4||bytes.byteLength>maxArchiveBytes)throw new Error('Source ZIP must be at most 2 MiB');
 const result:SourceArchiveAttachment={filename:'prototype-source.zip',content_type:'application/zip',content_base64:Buffer.from(bytes).toString('base64')};
 if(!validSourceArchive(result))throw new Error('Invalid source ZIP');return result;
}
export interface EmailHandoffResult {
  status: 'ready' | 'queued' | 'blocked' | 'unknown';
  notSent?: true;
  reason?: string;
  messageId?: string;
  retryAfterSeconds?: number;
}
export interface EmailLimits {
  perSessionPerMinute: number;
  perSessionPerDay: number;
  globalPerFiveMinutes: number;
  globalPerDay: number;
}
export interface EmailConfig {
  enabled?: boolean;
  apiKey?: string;
  inboxId?: string;
  allowedRecipients?: readonly string[];
  limits?: Partial<EmailLimits>;
}
export interface EmailTransportRequest {
  url: string;
  headers: Record<string, string>;
  body: { to: string; subject: string; text: string;attachments?:SourceArchiveAttachment[] };
}
export type EmailTransport = (request: EmailTransportRequest) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }>;
export interface EmailOutboxEntry {
  key: string;
  scopeKey: string;
  payloadHash: string;
  eventId: string;
  sessionId: string;
  projectId: string;
  projectVersion: number;
  recipient: string;
  createdAt: number;
}
export type EmailReservation = { kind: 'reserved' } | { kind: 'existing'; result: EmailHandoffResult } | { kind: 'blocked'; reason: string; retryAfterSeconds?: number };
/** A live implementation must atomically persist reservation, recipient binding and caps. */
export interface EmailOutbox {
  readonly durable: boolean;
  reserve(entry: EmailOutboxEntry, limits: EmailLimits): Promise<EmailReservation>;
  complete(key: string, result: EmailHandoffResult): Promise<void>;
}
export interface EmailDependencies {
  outbox?: EmailOutbox;
  transport?: EmailTransport;
  now?: () => number;
}
const defaults: EmailLimits = { perSessionPerMinute: 1, perSessionPerDay: 5, globalPerFiveMinutes: 10, globalPerDay: 20 };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const blocked = (reason: string, retryAfterSeconds?: number): EmailHandoffResult => ({ status: 'blocked', notSent: true, reason, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });
const mailbox = (value: string) => value.trim().toLowerCase();
const validMailbox = (value: string) => value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

/** Ephemeral simulation only. It cannot enable sending after a process restart. */
export function createMemoryEmailOutbox(): EmailOutbox {
  const entries = new Map<string, { entry: EmailOutboxEntry; result: EmailHandoffResult }>();
  const recipients = new Map<string, string>();
  return {
    durable: false,
    async reserve(entry, limits) {
      const bound = recipients.get(entry.scopeKey);
      if (bound && bound !== entry.recipient) return { kind: 'blocked', reason: 'recipient_locked' };
      const existing = entries.get(entry.key);
      if (existing) return existing.entry.payloadHash === entry.payloadHash
        ? { kind: 'existing', result: { ...existing.result } }
        : { kind: 'blocked', reason: 'idempotency_conflict' };
      const dayStart = Math.floor(entry.createdAt / 86_400_000) * 86_400_000;
      const rows = [...entries.values()].map(value => value.entry);
      const count = (since: number, sessionOnly: boolean) => rows.filter(row => row.createdAt >= since && (!sessionOnly || row.sessionId === entry.sessionId)).length;
      if (count(dayStart, true) >= limits.perSessionPerDay || count(dayStart, false) >= limits.globalPerDay) {
        return { kind: 'blocked', reason: 'rate_limited', retryAfterSeconds: Math.ceil((dayStart + 86_400_000 - entry.createdAt) / 1000) };
      }
      if (count(entry.createdAt - 60_000, true) >= limits.perSessionPerMinute || count(entry.createdAt - 300_000, false) >= limits.globalPerFiveMinutes) {
        return { kind: 'blocked', reason: 'rate_limited', retryAfterSeconds: 300 };
      }
      if (entries.size >= 1000) return { kind: 'blocked', reason: 'outbox_full' };
      recipients.set(entry.scopeKey, entry.recipient);
      entries.set(entry.key, { entry: { ...entry }, result: { status: 'unknown', reason: 'in_progress' } });
      return { kind: 'reserved' };
    },
    async complete(key, result) {
      const record = entries.get(key);
      if (!record) throw new Error('Missing outbox reservation');
      record.result = { ...result };
    },
  };
}

const outboxEntrySchema=z.object({key:z.string().regex(/^larp-email-[a-f0-9]{64}$/),scopeKey:z.string().regex(/^[a-f0-9]{64}$/),payloadHash:z.string().regex(/^[a-f0-9]{64}$/),eventId:z.string().min(1).max(200),sessionId:z.string().min(1).max(200),projectId:z.string().min(1).max(200),projectVersion:z.number().int().positive(),recipient:z.string().max(254).refine(validMailbox),createdAt:z.number().int().nonnegative()}).strict();
const outboxResultSchema=z.object({status:z.enum(['ready','queued','blocked','unknown']),notSent:z.literal(true).optional(),reason:z.string().max(200).optional(),messageId:z.string().max(200).optional(),retryAfterSeconds:z.number().int().nonnegative().max(86400).optional()}).strict();
const outboxStateSchema=z.object({version:z.literal(1),rows:z.array(z.object({entry:outboxEntrySchema,result:outboxResultSchema}).strict()).max(1000)}).strict();
type OutboxState=z.infer<typeof outboxStateSchema>;
/**
 * Durable single-host outbox, not a distributed production database. Reservations are
 * fsynced before transport and never automatically expire: unknown sends must not be
 * duplicated after restart. Capacity exhaustion or a stale crash lock fails closed.
 * Construction is lazy: no file is read or created until an approved handoff reserves.
 */
export function createFileEmailOutbox(filePath:string):EmailOutbox {
 if(!isAbsolute(filePath)||!filePath.endsWith('.json'))throw new Error('Email outbox requires an absolute private JSON file path');
 const lockPath=filePath+'.lock';
 async function locked<T>(mutate:(state:OutboxState)=>Promise<{value:T;write:boolean}>):Promise<T>{
  await mkdir(dirname(filePath),{recursive:true,mode:0o700});
  const lock=await open(lockPath,'wx',0o600);
  let temporary:string|undefined;
  try{
   let state:OutboxState={version:1,rows:[]};
   try{const info=await lstat(filePath);if(!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)throw new Error('Invalid outbox file');state=outboxStateSchema.parse(JSON.parse(await readFile(filePath,'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
   const {value,write}=await mutate(state);
   if(write){
    const serialized=JSON.stringify(outboxStateSchema.parse(state));if(Buffer.byteLength(serialized)>2*1024*1024)throw new Error('Email outbox full');
    temporary=filePath+'.'+randomUUID()+'.tmp';const target=await open(temporary,'wx',0o600);
    try{await target.writeFile(serialized,'utf8');await target.sync();}finally{await target.close();}
    await rename(temporary,filePath);temporary=undefined;
   }
   return value;
  }finally{
   if(temporary)await unlink(temporary).catch(()=>{});
   await lock.close();await unlink(lockPath);
  }
 }
 return {durable:true,
  async reserve(entry,limits){
   const valid=outboxEntrySchema.parse(entry);
   return locked<EmailReservation>(async state=>{
    const existing=state.rows.find(row=>row.entry.key===valid.key);
    if(existing)return {value:existing.entry.payloadHash===valid.payloadHash?{kind:'existing',result:{...existing.result}}:{kind:'blocked',reason:'idempotency_conflict'},write:false};
    if(state.rows.some(row=>row.entry.scopeKey===valid.scopeKey&&row.entry.recipient!==valid.recipient))return {value:{kind:'blocked',reason:'recipient_locked'},write:false};
    const dayStart=Math.floor(valid.createdAt/86400000)*86400000;
    const count=(since:number,sessionOnly:boolean)=>state.rows.filter(row=>row.entry.createdAt>=since&&(!sessionOnly||row.entry.sessionId===valid.sessionId)).length;
    if(count(dayStart,true)>=limits.perSessionPerDay||count(dayStart,false)>=limits.globalPerDay)return {value:{kind:'blocked',reason:'rate_limited',retryAfterSeconds:Math.ceil((dayStart+86400000-valid.createdAt)/1000)},write:false};
    if(count(valid.createdAt-60000,true)>=limits.perSessionPerMinute||count(valid.createdAt-300000,false)>=limits.globalPerFiveMinutes)return {value:{kind:'blocked',reason:'rate_limited',retryAfterSeconds:300},write:false};
    if(state.rows.length>=1000)return {value:{kind:'blocked',reason:'outbox_full'},write:false};
    state.rows.push({entry:valid,result:{status:'unknown',reason:'in_progress'}});
    return {value:{kind:'reserved'},write:true};
   });
  },
  async complete(key,result){await locked(async state=>{const row=state.rows.find(value=>value.entry.key===key);if(!row)throw new Error('Missing outbox reservation');row.result=outboxResultSchema.parse(result);return {value:undefined,write:true};});},
 };
}

export interface AgentboxdTransportOptions {
  maxAttempts?:number;
  timeoutMs?:number;
  maxRetryDelayMs?:number;
  now?:()=>number;
  sleep?:(ms:number)=>Promise<void>;
}
function retryAfterSeconds(headers:Record<string,string>|undefined,payload:unknown,now:number):number|undefined {
 const header=headers?.['retry-after']?.trim();
 const details=object(object(object(payload).error).details);
 const value=header&&/^\d+(?:\.\d+)?$/.test(header)?Number(header):header?Math.ceil((Date.parse(header)-now)/1000):Number(details.retry_after_seconds);
 return Number.isFinite(value)&&value>=0?Math.min(Math.ceil(value),86400):undefined;
}
async function boundedResponse(response:Response):Promise<unknown>{
 if(Number(response.headers.get('content-length')??0)>32768){await response.body?.cancel();throw new Error('Provider response exceeds limit');}
 if(!response.body)return {};
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>32768){await reader.cancel();throw new Error('Provider response exceeds limit');}chunks.push(next.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('Invalid provider response');}
}
/** Official fixed-host HTTP transport. No global fetch, automatic key generation, or ambiguous network retries. */
export function createAgentboxdTransport(fetcher: typeof fetch,options:AgentboxdTransportOptions={}): EmailTransport {
  const boundedInt=(value:number|undefined,fallback:number,min:number,max:number)=>Number.isFinite(value)?Math.min(max,Math.max(min,Math.floor(value!))):fallback;
  const maxAttempts=boundedInt(options.maxAttempts,2,1,3);
  const timeoutMs=boundedInt(options.timeoutMs,10000,100,10000);
  const maxDelay=boundedInt(options.maxRetryDelayMs,2000,0,5000);
  const now=options.now??Date.now,sleep=options.sleep??(ms=>new Promise(done=>setTimeout(done,ms)));
  return async request => {
    const endpoint=new URL(request.url);
    if(endpoint.origin!=='https://api.agentboxd.com'||!/^\/v1\/inboxes\/[^/]+\/messages\/send$/.test(endpoint.pathname)||endpoint.search||endpoint.hash||endpoint.username||endpoint.password)throw new Error('Unapproved email endpoint');
    if(!/^larp-email-[a-f0-9]{64}$/.test(request.headers['Idempotency-Key']??''))throw new Error('Stable email idempotency key required');
    const attachments=request.body.attachments;
    if(attachments!==undefined&&(!Array.isArray(attachments)||attachments.length!==1||!validSourceArchive(attachments[0])))throw new Error('Unapproved email attachment');
    const body=JSON.stringify(request.body);if(Buffer.byteLength(body)>Math.ceil(maxArchiveBytes/3)*4+8192||Object.keys(request.body).some(key=>!['to','subject','text','attachments'].includes(key)))throw new Error('Email payload exceeds approved shape');
    // Snapshot once: every permitted retry uses exactly the same recipient, body and key.
    const headers={...request.headers};
    for(let attempt=0;;attempt++){
      const response=await fetcher(request.url,{method:'POST',redirect:'error',headers:{...headers},body,signal:AbortSignal.timeout(timeoutMs)});
      const payload=await boundedResponse(response),responseHeaders={'retry-after':response.headers.get('retry-after')??''};
      const code=object(object(payload).error).code;
      const seconds=retryAfterSeconds(responseHeaders,payload,now());
      const delay=response.status===409&&code==='idempotency_in_progress'?Math.max(1000,(seconds??1)*1000):response.status===429&&code==='rate_limited'&&seconds!==undefined?seconds*1000:undefined;
      // Daily/quota/recipient/422 refusals and network/5xx uncertainty never retry here.
      if(attempt+1>=maxAttempts||delay===undefined||delay>maxDelay)return {status:response.status,body:payload,headers:responseHeaders};
      await sleep(delay);
    }
  };
}

/** Optional backend capability. Default configuration performs no network request. */
export function createEmailHandoff(config: EmailConfig = {}, dependencies: EmailDependencies = {}) {
  const outbox = dependencies.outbox ?? createMemoryEmailOutbox();
  const now = dependencies.now ?? Date.now;
  const allowed = new Set((config.allowedRecipients ?? []).map(mailbox).filter(validMailbox));
  // Every provider field is untrusted, including IDs on successful responses.
  // Never reflect or persist the configured credential inside a nominal message ID.
  const safeMessageId=(value:unknown):value is string=>typeof value==='string'&&/^[a-z0-9_-]{1,200}$/i.test(value)&&!(config.apiKey&&value.includes(config.apiKey));
  const limits = { ...defaults };
  for (const name of Object.keys(defaults) as (keyof EmailLimits)[]) {
    const value = config.limits?.[name];
    if (Number.isSafeInteger(value) && value! > 0) limits[name] = Math.min(value!, defaults[name]);
  }
  async function handoff(input: EmailHandoffInput): Promise<EmailHandoffResult> {
    if (input.ready!==true) return blocked('project_not_ready');
    if (input.explicitRecipient!==true) return blocked('recipient_consent_required');
    const recipient = mailbox(input.recipient);
    if (!validMailbox(recipient)) return blocked('invalid_recipient');
    if (![input.eventId, input.sessionId, input.projectId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 200)
      || !Number.isSafeInteger(input.projectVersion) || input.projectVersion < 1
      || typeof input.summary !== 'string' || input.summary.length > 2000 || input.summary.includes('\0')) return blocked('invalid_handoff');
    if(input.sourceArchive!==undefined){if(!validSourceArchive(input.sourceArchive))return blocked('invalid_source_archive');}
    else try {
      const url = new URL(input.projectUrl??'');
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length>2000) return blocked('invalid_project_url');
    } catch { return blocked('invalid_project_url'); }
    if (config.enabled !== true) return { status: 'ready', notSent: true, reason: 'email_disabled' };
    if (!config.apiKey || !config.inboxId || !dependencies.transport) return blocked('email_unconfigured');
    if (!allowed.has(recipient)) return blocked('recipient_not_allowed');
    if (!outbox.durable) return blocked('durable_outbox_required');
    const body:EmailTransportRequest['body'] = { to: recipient, subject: 'Your prototype is ready', text: `${input.summary.trim()}\n\n${input.sourceArchive?'Attached: prototype-source.zip':'Open your prototype: '+input.projectUrl}`,...(input.sourceArchive?{attachments:[{...input.sourceArchive}]}:{}) };
    const scopeKey = hash([input.sessionId, input.projectId]);
    const key = `larp-email-${hash([scopeKey, input.projectVersion])}`;
    let reservation: EmailReservation;
    try {
      reservation = await outbox.reserve({ key, scopeKey, payloadHash: hash(body), eventId: input.eventId, sessionId: input.sessionId, projectId: input.projectId, projectVersion: input.projectVersion, recipient, createdAt: now() }, limits);
    } catch { return blocked('outbox_unavailable'); }
    if (reservation.kind === 'existing') return reservation.result.messageId!==undefined&&!safeMessageId(reservation.result.messageId)?{status:'unknown',reason:'delivery_unknown'}:{...reservation.result};
    if (reservation.kind === 'blocked') return blocked(reservation.reason, reservation.retryAfterSeconds);
    let result: EmailHandoffResult;
    try {
      const response = await dependencies.transport({
        url: `https://api.agentboxd.com/v1/inboxes/${encodeURIComponent(config.inboxId)}/messages/send`,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body,
      });
      const payload = object(response.body);
      if (response.status === 202 && safeMessageId(payload.id)) {
        result = { status: 'queued', messageId: payload.id };
      } else if (response.status >= 400 && response.status < 500) {
        const code = object(payload.error).code;
        const known = new Set(['rate_limited', 'org_daily_limit_exceeded', 'daily_send_limit_exceeded', 'plan_limit_emails', 'idempotency_in_progress', 'idempotency_key_reused', 'recipient_suppressed', 'recipient_blocked', 'insufficient_permissions', 'api_key_expired', 'inbox_paused', 'workspace_stopped']);
        const reason = typeof code === 'string' && known.has(code) ? code : 'provider_refused';
      const retry = retryAfterSeconds(response.headers,response.body,now());
        result = response.status === 409 ? { status: 'unknown', reason } : blocked(reason, retry);
      } else result = { status: 'unknown', reason: 'delivery_unknown' };
    } catch { result = { status: 'unknown', reason: 'delivery_unknown' }; }
    try { await outbox.complete(key, result); } catch { return { status: 'unknown', reason: 'outbox_unavailable' }; }
    return result;
  }
  return { handoff };
}
