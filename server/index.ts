import { resolve } from 'node:path';
import { createApp } from './app';
import { readRuntimeConfig } from './config';
import { createConfiguredBackend } from './runtime';
import type { ProxySocket } from './speechmatics-proxy';

const config=readRuntimeConfig(process.env,process.argv.slice(2));
const backend=createConfiguredBackend(config,{fetcher:config.liveCallsAllowed?fetch:undefined,createSpeechSocket:config.liveCallsAllowed?url=>new WebSocket(url) as unknown as ProxySocket:undefined});
const runner=config.renderLocal?(await import('./render-runner')).createRenderLocalRunner():backend.runner;
const {port,host}=config;
const server=createApp({...backend,runner,staticDir:resolve(process.cwd(),config.candidate?'dist-candidate':'dist'),secureCookies:config.secureCookies,cookieName:config.cookieName});
server.listen(port,host,()=>console.log(`Builder API listening on ${host}:${port}; runner=${runner.mode}; sessions=ephemeral-memory`));
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{server.close();server.closeAllConnections();});
