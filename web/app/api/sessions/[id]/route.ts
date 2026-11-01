import { requireOwnedSession, routeError, sessionPayload } from '@/lib/live-sessions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(sessionPayload(await requireOwnedSession(request,(await params).id)),{headers:{'Cache-Control':'no-store'}});}catch(error){return routeError(error);}}
