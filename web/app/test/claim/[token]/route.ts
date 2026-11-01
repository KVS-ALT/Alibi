import { claimInteractiveTest, routeError } from '@/lib/live-sessions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){try{return new Response(null,{status:303,headers:{Location:new URL('/',request.url).href,'Set-Cookie':claimInteractiveTest((await params).token),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}catch(error){return routeError(error);}}
