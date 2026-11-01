import { resolve } from 'node:path';
import { createApp } from './app';
import { localRunner } from './pipeline';

const runner=process.env.RENDER_USE_LOCAL_DEV==='true'?(await import('./render-runner')).createRenderLocalRunner():localRunner;
const port=Number(process.env.PORT??3001);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be a valid port.');
const server=createApp({runner,staticDir:resolve(process.cwd(),'dist'),secureCookies:process.env.NODE_ENV==='production'});
server.listen(port,'0.0.0.0',()=>console.log(`Builder API listening on port ${port}; runner=${runner.mode}; sessions=ephemeral-memory`));
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{server.close();server.closeAllConnections();});
