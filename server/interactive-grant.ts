import { timingSafeEqual } from 'node:crypto';

/** A private link can be previewed safely; only explicit Start consumes the grant. */
export function createInteractiveGrant(config:{token:string;expiresAt:number},now:()=>number=Date.now){
 if(!/^[a-f0-9]{64}$/.test(config.token)||!Number.isFinite(config.expiresAt))throw new Error('Invalid interactive test grant.');
 let bound:{owner:string;sessionId:string;startedAt:number}|undefined;
 const matches=(token:string)=>{const a=Buffer.from(token),b=Buffer.from(config.token);return a.length===b.length&&timingSafeEqual(a,b);};
 const valid=()=>now()<config.expiresAt;
 return {
  pending(token:string){return valid()&&matches(token);},
  start(token:string,owner:string,sessionId:string){
   if(!valid()||bound||!matches(token))return false;
   bound={owner,sessionId,startedAt:now()};return true;
  },
  allows(owner:string,sessionId:string){return valid()&&!!bound&&bound.owner===owner&&bound.sessionId===sessionId&&now()-bound.startedAt<90000;},
 };
}
