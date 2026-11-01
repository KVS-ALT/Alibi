import type { Portfolio } from '@alibi/shared';

export interface ProjectIdentity {
 id:string;name:string;nameSource:'spoken'|'descriptive';aliases:string[];
 domain:string;description:string;mentions:string[];
}
export interface ProjectIdentityRegistry { projects:ProjectIdentity[];nextId:number;activeId?:string }
export interface ProjectMention {
 domain:string;description:string;label:string;spokenName?:string;
 explicitSeparate?:boolean;explicitRename?:boolean;referenceName?:string;
}
const normalized=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const clean=(value:string)=>value.replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
const stop=new Set('i im ive we were have has had a an the this that my our is it its are was built building working made created called named actually now and or for with to of on in project another separate different also app application tool website platform marketplace cad review new'.split(' '));
function terms(value:string){return new Set(value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(word=>word.length>2&&!stop.has(word)));}
function similarity(a:string,b:string){const x=terms(a),y=terms(b);let common=0;for(const term of x)if(y.has(term))common++;return common/Math.max(1,Math.min(x.size,y.size));}
function distance(a:string,b:string){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let diagonal=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const prior=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=prior;}}return row[b.length];}
export function projectNamesMatch(a:string,b:string){
 const x=normalized(a),y=normalized(b);if(!x||!y)return false;if(x===y)return true;
 if(Math.min(x.length,y.length)>=5&&Math.abs(x.length-y.length)<=1&&distance(x,y)<=1)return true;
 const consonants=(value:string)=>value.replace(/[aeiou]/g,'');
 return Math.min(x.length,y.length)>=6&&consonants(x).length>=4&&consonants(x)===consonants(y)&&similarity(a,b)>0;
}
export function seedProjectRegistry(previous?:Portfolio,existing?:ProjectIdentityRegistry):ProjectIdentityRegistry{
 const registry:ProjectIdentityRegistry=existing?structuredClone(existing):{projects:[],nextId:1};
 for(const[id,project]of Object.entries(previous?.projects??{})){
  if(registry.projects.some(entry=>entry.id===id))continue;
  registry.projects.push({id,name:project.title,nameSource:/\b(?:tool|app|marketplace|workspace|prototype|tracker|system|platform)\b/i.test(project.title)?'descriptive':'spoken',aliases:[project.title],domain:'',description:project.summary,mentions:[]});
 }
 return registry;
}
export function resolveProjectIdentity(input:ProjectIdentityRegistry|undefined,mention:ProjectMention):{registry:ProjectIdentityRegistry;project?:ProjectIdentity;created:boolean}{
 const registry=input?structuredClone(input):{projects:[],nextId:1};
 const spokenName=mention.spokenName?clean(mention.spokenName):undefined;
 const fingerprint=normalized(mention.description)+'|'+normalized(spokenName??'');
 let project=registry.projects.find(entry=>entry.mentions.includes(fingerprint));
 const compatible=registry.projects.filter(entry=>!entry.domain||entry.domain===mention.domain);
 const active=registry.projects.find(entry=>entry.id===registry.activeId)??registry.projects.at(-1);
 if(!project&&spokenName)project=registry.projects.find(entry=>entry.aliases.some(alias=>normalized(alias)===normalized(spokenName))&&(!entry.domain||entry.domain===mention.domain||mention.domain==='general'));
 if(!project&&!mention.explicitSeparate&&spokenName)project=registry.projects.find(entry=>entry.aliases.some(alias=>projectNamesMatch(alias,spokenName))&&(!entry.domain||entry.domain===mention.domain||mention.domain==='general'));
 if(!project&&mention.explicitRename){
  project=mention.referenceName?registry.projects.find(entry=>entry.aliases.some(alias=>projectNamesMatch(alias,mention.referenceName!))):mention.domain==='general'?active:compatible.length===1?compatible[0]:undefined;
 }
 if(!project&&!mention.explicitSeparate&&mention.domain==='general'&&/\b(?:it|this|that)\s+(?:is|was|will be|has been)\s+(?:called|named)\b/i.test(mention.description))project=active;
 if(!project&&!mention.explicitSeparate){
  const ranked=compatible.map(entry=>({entry,score:similarity(entry.description,mention.description)})).sort((a,b)=>b.score-a.score);
  if(ranked[0]&&ranked[0].score>=.3&&(!ranked[1]||ranked[0].score-ranked[1].score>=.15))project=ranked[0].entry;
  // A short follow-up/name variation is not enough evidence for another product.
  if(!project&&compatible.length===1&&(!spokenName||terms(mention.description).size<5||similarity(compatible[0].description,mention.description)>.12))project=compatible[0];
  if(!project&&compatible.length>1&&!spokenName)return {registry,created:false};
 }
 if(project){
  registry.activeId=project.id;
  if(!project.domain)project.domain=mention.domain;
  const mayRename=spokenName&&(project.nameSource==='descriptive'||mention.explicitRename);
  if(mayRename){project.aliases=[...new Set([...project.aliases,project.name,spokenName!])];project.name=spokenName!;project.nameSource='spoken';}
  else if(spokenName&&project.aliases.some(alias=>projectNamesMatch(alias,spokenName)))project.aliases=[...new Set([...project.aliases,spokenName])];
  // Full rolling transcripts are replayed. Preserve the founding mention so a
  // later replay of "a separate project" cannot recreate an existing identity.
  if(!project.mentions.includes(fingerprint)){
   const origin=project.mentions[0];
   project.mentions=origin?[origin,...[...project.mentions.slice(1),fingerprint].slice(-23)]:[fingerprint];
  }
  // Keep the fuller product brief; short corrections should not erase its purpose.
  if(terms(mention.description).size>terms(project.description).size)project.description=mention.description.slice(0,700);
  return {registry,project,created:false};
 }
 if(registry.projects.length>=3)return {registry,created:false};
 let id:string;do{id=`project-${registry.nextId++}`;}while(registry.projects.some(entry=>entry.id===id));
 project={id,name:spokenName||clean(mention.label),nameSource:spokenName?'spoken':'descriptive',aliases:[spokenName||clean(mention.label)],domain:mention.domain,description:mention.description.slice(0,700),mentions:[fingerprint]};
 registry.projects.push(project);registry.activeId=project.id;return {registry,project,created:true};
}

/** A title is a heard identity only when a naming phrase or supplied product noun supports it. */
export function spokenProjectName(clause:string):string|undefined{
 const match=clause.match(/\b(?:called|named|rename(?:d)?\s+(?:it|the\s+\w+)\s+to)\s+(?:["“']([^"”'\n]{1,80})["”']|([^.!?;\n]{1,100}))/iu);
 if(!match)return undefined;
 let name=(match[1]||match[2]).split(/\s+(?:for|with|which|that|because|where|and|but|now|actually|it\s+(?:has|is|does)|we\s+(?:have|use))\b/i)[0].trim().replace(/[,:]+$/,'');
 if(!name||name.split(/\s+/).length>6||/^(?:a|an|the|it|this|that|something)\b/i.test(name))return undefined;
 name=clean(name);return name;
}
