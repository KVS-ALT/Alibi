import type { RuntimeConfig } from './config';

/** Limits actual HTTP attempts, including retries, for this explicitly approved process lifetime. */
export function createBoundedLiveTransport(fetcher:typeof fetch,limits:RuntimeConfig['approvedRequests'],options:{enabled:boolean;supabaseOrigin?:string}) {
 const remaining={...limits};
 const transport:typeof fetch=async(input,init)=>{
  if(!options.enabled)throw new Error('Live provider requests are disabled.');
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Unapproved provider endpoint.');
  let kind:keyof typeof remaining,units=1;
  if(url.origin==='https://api.openai.com'&&url.pathname==='/v1/responses')kind='generation';
  else if(url.origin==='https://api.featherless.ai'&&url.pathname==='/v1/chat/completions')kind='generation';
  else if(url.origin==='https://mp.speechmatics.com'&&url.pathname==='/v1/api_keys'&&url.search==='?type=rt')kind='speechTokens';
  else if(url.origin==='https://api.agentboxd.com'&&/^\/v1\/inboxes\/[a-zA-Z0-9_-]+\/messages\/send$/.test(url.pathname))kind='email';
  else if(url.origin==='https://api.elevenlabs.io'&&url.pathname==='/v1/speech-to-text'){
   kind='audioSeconds';
   const form=init?.body;if(!(form instanceof FormData))throw new Error('Only bounded canonical audio is allowed.');
   const file=form.get('file');if(!(file instanceof Blob)||file.size<44||file.size>2*1024*1024)throw new Error('Invalid bounded audio.');
   const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
   if(view.getUint32(24,true)!==16000||view.getUint16(22,true)!==1||view.getUint16(34,true)!==16||view.getUint32(40,true)!==bytes.length-44)throw new Error('Invalid canonical PCM audio.');
   units=Math.ceil((bytes.length-44)/32000);if(units<1||units>30)throw new Error('Audio duration exceeds the approved segment bound.');
  }else if(options.supabaseOrigin&&url.origin===options.supabaseOrigin&&url.pathname.startsWith('/rest/v1/'))kind='database';
  else throw new Error('Unapproved provider endpoint.');
  if(remaining[kind]<units)throw new Error('The approved provider request budget is exhausted.');
  remaining[kind]-=units;
  return fetcher(input,{...init,redirect:'error'});
 };
 return {transport,remaining:()=>({...remaining})};
}
