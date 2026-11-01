import { requireOwnedSession, routeError, sessionPayload, wipeLiveSession } from '@/lib/live-sessions';
import { getSpeechProxy } from '@/lib/speech/runtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(sessionPayload(await requireOwnedSession(request,(await params).id)),{headers:{'Cache-Control':'no-store'}});}catch(error){return routeError(error);}}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;await wipeLiveSession(request,id,()=>getSpeechProxy().endSession(id));return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});}catch(error){return routeError(error);}}
