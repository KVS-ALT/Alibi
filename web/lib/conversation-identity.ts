/** Spoken identity is remembered independently of generated portfolio details. */
export interface SpeakerIdentity { name?: string; projectClaim?: boolean }
export interface ConversationIdentity {
 name?: string;
 builderSpeaker?: string;
 builderScope?: string;
 /** Internal scoped key; anonymous speech must not be confused with a recycled S1. */
 builderKey?: string;
 scope?: string;
 speakers?: Record<string, SpeakerIdentity>;
}
export interface IdentityUtterance { text: string; speaker?: string; scope?: string }

const nonNames = new Set(('a an the from in at on with for to of and but or so i we you he she they it this that my our your his her their name ' +
 'building designing working making developing creating developing a developer designer engineer student founder researcher ' +
 'happy excited sorry glad here going based really just also fine good well okay ok interested ready tired looking doing not ' +
 "thinking asking talking trying using testing running currently basically learning studying i'm i've i'd i'll we're we've hey hello um uh").split(/\s+/));
const normalized = (text: string) => text.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

/** Conservative self-reference only; a mention of somebody else's name is not an introduction. */
export function extractSelfIntroduction(text: string): string | undefined {
 const value=normalized(text);let latest:string|undefined;
 for(const match of value.matchAll(/\b(?:my name(?: is|'s)|call me|i'm|i am)\s+/gi)){
  const preceding=value.slice(0,match.index).split(/[.!?]/).at(-1)??'';
  if(/^\s*(?:if|suppose|imagine|when)\b/i.test(preceding))continue;
  if(/\b(?:he|she|they|you|the app)\s+(?:said|says|say|mentioned)\s*["']?\s*$/i.test(preceding))continue;
  const tail=value.slice(match.index!+match[0].length).split(/[.!?,;:]/,1)[0];
  const tokens=tail.match(/[\p{L}][\p{L}\p{M}'-]*/gu)??[];
  // Do not skip punctuation/code at the front to manufacture a plausible name.
  const first=tokens[0];if(!first||!tail.startsWith(first))continue;
  // After "I'm"/"I am" only a capitalized word is a name ("I'm pretty sure" is not). Transcripts capitalize names.
  if(/^i(?:'m| am)/i.test(match[0])&&!/^\p{Lu}/u.test(first))continue;
  const parts:string[]=[];
  for(const token of tokens){
   if(nonNames.has(token.toLowerCase())||parts.length===4||token.length>40)break;
   parts.push(token);
  }
  const name=parts.join(' ').replace(/['-]+$/,'').trim();
  if(name&&name.length<=80)latest=name;
 }
 return latest;
}

/** Remove personal-introduction spans before looking for product descriptions. */
export function stripPersonalIntroductions(text:string):string{
 const value=normalized(text);const spans:{start:number;end:number}[]=[];
 for(const match of value.matchAll(/\b(?:my name(?: is|'s)?|call me|i'm|i am)\s*/gi)){
  const start=match.index!;
  // Only resolve this marker. A later introduction must not supply a name for
  // an earlier "I'm building" span and accidentally erase the product claim.
  const immediate=value.slice(start+match[0].length).split(/[.!?,;:]/,1)[0]
   .split(/\b(?:my name(?: is|'s)?|call me|i'm|i am)\s*/i,1)[0];
  const name=extractSelfIntroduction(match[0]+immediate);
  if(name)spans.push({start,end:start+match[0].length+name.length});
  else if(/^my name\b/i.test(match[0]))spans.push({start,end:start+match[0].length});
 }
 let output=value;for(const span of spans.reverse())output=output.slice(0,span.start)+output.slice(span.end);
 return output.replace(/\b(?:hey|hello|um|uh)\b[,:]?\s*/gi,' ').replace(/\s+/g,' ').trim();
}

function makesProjectClaim(text: string): boolean {
 return stripPersonalIntroductions(text).split(/(?<=[.!?])\s+/).some(clause=>{
  if(clause.endsWith('?')||/^\s*(?:if|suppose|imagine|what|how|why|could|would|did|do|have|can)\b/i.test(clause))return false;
  if(/\b(?:he|she|they|you)\s+(?:said|says|say|mentioned)\b/i.test(clause))return false;
  return /\b(?:i(?:'ve|'m)?|we(?:'ve|'re)?)\s+(?:(?:have|am|are|been|currently|basically|just)\s+)*(?:(?:built|building|created|made|developed|developing|making|launched|designed|designing)\b|work(?:ing)?\s+on\b)\s+(?:a\s+|an\s+|the\s+)?[\p{L}\p{N}]/iu.test(clause);
 });
}

/** Pure update. Scope is the upstream stream UUID, since provider speaker numbers can restart. */
export function updateConversationIdentity(previous: ConversationIdentity | undefined, incoming: IdentityUtterance): ConversationIdentity {
 const state:ConversationIdentity={...previous};
 const speakers:Record<string,SpeakerIdentity>=Object.create(null);
 for(const [key,person] of Object.entries(previous?.speakers??{}))speakers[key]={...person};
 state.speakers=speakers;
 const scope=incoming.scope?.slice(0,200)||'default';
 if(state.scope!==scope){state.scope=scope;state.builderSpeaker=undefined;state.builderScope=undefined;state.builderKey=undefined;}
 const speaker=incoming.speaker&&/^S[1-9]\d{0,3}$/.test(incoming.speaker)?incoming.speaker:undefined;
 const key=scope+':'+(speaker??'anonymous');
 const person=speakers[key]??(speakers[key]={});
 const name=extractSelfIntroduction(incoming.text);
 if(name)person.name=name;
 const claim=makesProjectClaim(incoming.text);
 if(claim){
  person.projectClaim=true;
  if(!state.builderKey){state.builderKey=key;state.builderSpeaker=speaker;state.builderScope=scope;}
 }
 if(state.builderKey===key&&person.name)state.name=person.name;
 // An unlabelled direct self-introduction is still useful before the first project.
 else if(!state.builderKey&&!speaker&&incoming.speaker!=='UU'&&name)state.name=name;
 // Bound incidental speaker memory without discarding canonical identity.
 for(const old of Object.keys(speakers).slice(0,Math.max(0,Object.keys(speakers).length-128))){if(old!==state.builderKey)delete speakers[old];}
 return state;
}

/** Stateless callers can resolve the same rules from a tagged transcript. */
export function deriveConversationIdentity(transcript: string, previous?: ConversationIdentity): ConversationIdentity {
 const turns=[...normalized(transcript).matchAll(/\[(S[1-9]\d{0,3}|UU)\]\s*([^]*?)(?=\[(?:S[1-9]\d{0,3}|UU)\]|$)/g)];
 if(!turns.length)return updateConversationIdentity(previous,{text:transcript,scope:previous?.scope??'transcript'});
 let state=previous;
 for(const turn of turns)state=updateConversationIdentity(state,{text:turn[2],speaker:turn[1],scope:previous?.scope??'transcript'});
 return state??{};
}
