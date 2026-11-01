import { providerMetadata, storageMode } from '@/lib/live-sessions';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({providers:providerMetadata(),storage:storageMode()},{headers:{'Cache-Control':'no-store'}});}
