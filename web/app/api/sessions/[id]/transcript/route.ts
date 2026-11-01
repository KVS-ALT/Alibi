import { ingestTypedTranscript, LiveHttpError, requireOwnedSession, routeError, sessionPayload } from '@/lib/live-sessions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Append typed/pasted text to a session's transcript. Runs the same pipeline as live speech.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const session=await requireOwnedSession(request,(await params).id);
 const body=await request.json().catch(()=>null) as {text?:unknown}|null;
 if(typeof body?.text!=='string'||!body.text.trim()||body.text.length>4000)throw new LiveHttpError(400,'INVALID_TEXT','Provide text (1-4000 chars).');
 ingestTypedTranscript(session,body.text);
 return Response.json(sessionPayload(session),{headers:{'Cache-Control':'no-store'}});
}catch(error){return routeError(error);}}
