import { resolve } from 'node:path';
import { createOpenAIProvider } from '../src/generation/provider';
import type { RuntimeConfig } from './config';
import { publicProviderCapabilities } from './config';
import { createProviderRunner,localRunner } from './pipeline';
import { createElevenLabsTranscriber } from './elevenlabs';
import { createSpeechmaticsTokenProvider } from './speechmatics';
import { createConfiguredAgentboxdHandoff } from './providers/agentboxd';
import { createFileEmailOutbox,type EmailOutbox } from './email';
import { createBoundedLiveTransport } from './live-transport';
import { createFeatherlessProvider } from '../src/generation/featherless';
import { createSpeechmaticsProxy,type ProxySocket } from './speechmatics-proxy';

/** Side-effect-free composition. A transport must be explicitly supplied after runtime authorization. */
export function createConfiguredBackend(config:RuntimeConfig,dependencies:{fetcher?:typeof fetch;now?:()=>number;emailOutbox?:EmailOutbox;createSpeechSocket?:(url:string)=>ProxySocket}={}) {
 const fetcher=config.liveCallsAllowed&&dependencies.fetcher?createBoundedLiveTransport(dependencies.fetcher,config.approvedRequests,{enabled:true}).transport:undefined;
 const provider=config.generation.provider==='featherless'?createFeatherlessProvider({enabled:config.generation.enabled,apiKey:config.generation.apiKey,model:config.generation.model,transport:fetcher,maxOutputTokens:3000}):createOpenAIProvider({enabled:config.generation.enabled,apiKey:config.generation.apiKey,model:config.generation.model,transport:fetcher,maxOutputTokens:3000});
 const runner=config.generation.provider==='demo'?localRunner:createProviderRunner(provider,config.generation.provider==='featherless'?'Featherless':'OpenAI');
 const speech=config.speech.provider==='elevenlabs'?createElevenLabsTranscriber(config.speech,{fetcher}):undefined;
 const speechmatics=config.speech.provider==='speechmatics'?createSpeechmaticsTokenProvider(config.speech,{fetcher,now:dependencies.now}):undefined;
 const speechProxy=speechmatics?createSpeechmaticsProxy({enabled:config.speech.enabled,liveCallsAllowed:config.liveCallsAllowed,maxSessionAudioSeconds:Math.min(30,config.approvedRequests.audioSeconds),maxGlobalAudioSeconds:config.approvedRequests.audioSeconds,maxWallMs:config.approvedRequests.audioSeconds>0?Math.min(40000,config.approvedRequests.audioSeconds*1000+10000):0,maxStreams:1,maxStartsGlobal:config.approvedRequests.speechTokens},{tokenProvider:speechmatics,createSocket:config.liveCallsAllowed?dependencies.createSpeechSocket:undefined,now:dependencies.now}):undefined;
 const outbox=config.email.liveGate?(dependencies.emailOutbox??(config.email.outboxPath?createFileEmailOutbox(resolve(process.cwd(),config.email.outboxPath)):undefined)):undefined;
 const email=createConfiguredAgentboxdHandoff(config.email,{fetcher,outbox,now:dependencies.now});
 return {runner,speech,speechmatics,speechProxy,email,interactiveTest:config.interactiveTest,liveCallsAllowed:config.liveCallsAllowed,forceLiveCallsDisabled:config.candidate,providerCapabilities:publicProviderCapabilities(config)};
}
