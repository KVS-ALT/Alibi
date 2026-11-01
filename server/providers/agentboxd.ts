import { createAgentboxdTransport,createEmailHandoff,type EmailOutbox,type EmailLimits,type AgentboxdTransportOptions } from '../email';

/** Values are supplied by the central server configuration, never browser input. */
export interface AgentboxdProviderConfig {
 liveGate:boolean;
 apiKey?:string;
 inboxId?:string;
 allowedRecipients?:readonly string[];
 limits?:Partial<EmailLimits>;
}
export interface AgentboxdProviderDependencies {
 fetcher?:typeof fetch;
 outbox?:EmailOutbox;
 now?:()=>number;
 transportOptions?:AgentboxdTransportOptions;
}
/** Factory has no network or filesystem side effects. Keys alone never enable sending. */
export function createConfiguredAgentboxdHandoff(config:AgentboxdProviderConfig={liveGate:false},dependencies:AgentboxdProviderDependencies={}) {
 const gate=config.liveGate===true;
 const keyValid=typeof config.apiKey==='string'&&config.apiKey.length>0&&config.apiKey.length<=4096&&!/[\r\n\u0000]/.test(config.apiKey);
 const inboxValid=typeof config.inboxId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(config.inboxId);
 const configuredList=config.allowedRecipients??[];
 const allowlist=configuredList.length<=20?configuredList.filter(value=>typeof value==='string'&&value.length<=254&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(value.trim())):[];
 const transport=gate&&keyValid&&inboxValid&&dependencies.fetcher?createAgentboxdTransport(dependencies.fetcher,dependencies.transportOptions):undefined;
 const service=createEmailHandoff({enabled:gate,apiKey:keyValid?config.apiKey:undefined,inboxId:inboxValid?config.inboxId:undefined,allowedRecipients:allowlist,limits:config.limits},{transport,outbox:dependencies.outbox,now:dependencies.now});
 return {...service,capabilities:{provider:'agentboxd' as const,liveGate:gate,configured:Boolean(keyValid&&inboxValid&&allowlist.length&&dependencies.fetcher&&dependencies.outbox?.durable),deliveryTracking:false as const}};
}
