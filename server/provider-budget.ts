type Kind = 'generation' | 'speech' | 'email';
interface Entry { at: number; kind: Kind; session: string; address: string; units: number }
const limits: Record<Kind, { session: number; address: number; global: number }> = {
 generation: { session: 3, address: 6, global: 20 },
 // Speech units are upload bytes, independent of untrusted duration headers.
 speech: { session: 6 * 1024 * 1024, address: 12 * 1024 * 1024, global: 24 * 1024 * 1024 },
 email: { session: 2, address: 3, global: 10 },
};
export function createProviderBudget(now = Date.now) {
 let entries: Entry[] = [];
 return {
  reserve(kind: Kind, session: string, address: string, units = 1): boolean {
   if (!Number.isSafeInteger(units) || units < 1) return false;
   const at = now(); entries = entries.filter(entry => at - entry.at < 3_600_000);
   const relevant = entries.filter(entry => entry.kind === kind), cap = limits[kind];
   const sum = (items: Entry[]) => items.reduce((total, entry) => total + entry.units, 0);
   if (entries.length >= 2048 || sum(relevant) + units > cap.global || sum(relevant.filter(entry => entry.session === session)) + units > cap.session || sum(relevant.filter(entry => entry.address === address)) + units > cap.address) return false;
   entries.push({ at, kind, session, address, units }); return true;
  },
 };
}
