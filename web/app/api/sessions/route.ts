import { createLiveSession, routeError, sessionPayload } from '@/lib/live-sessions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{const {session,cookie}=await createLiveSession(request);return Response.json(sessionPayload(session),{status:201,headers:{'Set-Cookie':cookie,'Cache-Control':'no-store'}});}catch(error){return routeError(error);}}
