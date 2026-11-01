import { resolve } from 'node:path';
import { createApp } from './app';
import { localRunner } from './pipeline';
import { readRuntimeConfig } from './config';

const config=readRuntimeConfig(process.env,process.argv.slice(2));
const runner=config.renderLocal?(await import('./render-runner')).createRenderLocalRunner():localRunner;
const {port,host}=config;
const server=createApp({runner,staticDir:resolve(process.cwd(),config.candidate?'dist-candidate':'dist'),secureCookies:config.secureCookies,cookieName:config.cookieName});
server.listen(port,host,()=>console.log(`Builder API listening on ${host}:${port}; runner=${runner.mode}; sessions=ephemeral-memory`));
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{server.close();server.closeAllConnections();});
