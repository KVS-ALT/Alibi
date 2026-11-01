import { Claims, Portfolio, type ProjectSection } from '@alibi/shared';
import { renderProjectMock } from './draft';
import { mergeProjectHighlights, projectNamesMatch, type ProjectIdentityRegistry } from './project-identity';
export interface PortfolioFactsOutput { portfolio:Portfolio;claims:Claims;projectRegistry?:ProjectIdentityRegistry }

/** Model content may enrich registered products, but never decide personal/project identity. */
export function applyConversationFacts(result:PortfolioFactsOutput,registry:ProjectIdentityRegistry|undefined,builderName:string|undefined,fallback:Portfolio):PortfolioFactsOutput{
 const projects:Record<string,ProjectSection>=Object.create(null);
 const candidateEntries=Object.entries(result.portfolio.projects);
 for(const identity of registry?.projects.slice(0,3)??[]){
  const idCandidate=candidateEntries.find(([id])=>id===identity.id)?.[1];
  const candidate=idCandidate&&identity.aliases.some(alias=>projectNamesMatch(alias,idCandidate.title))?idCandidate:candidateEntries.find(([,project])=>identity.aliases.some(alias=>projectNamesMatch(alias,project.title)))?.[1];
  const source=candidate??fallback.projects[identity.id];if(!source)continue;
  const replace=(value:string)=>source.title&&source.title!==identity.name?value.split(source.title).join(identity.name):value;
  const project:ProjectSection={...source,title:identity.name,tagline:replace(source.tagline),summary:replace(source.summary),highlights:mergeProjectHighlights(source.highlights.map(replace),identity.spokenFeatures)};
  project.mockHtml=renderProjectMock(project,identity.designKey??identity.id,identity.description);projects[identity.id]=project;
 }
 const portfolio=Portfolio.parse({...result.portfolio,projects,skills:[...new Set([...fallback.skills,...Object.values(projects).flatMap(project=>project.stack)])].slice(0,16)});
 const knownName=builderName||fallback.hero?.name;
 if(portfolio.hero)portfolio.hero={...portfolio.hero,name:knownName||'Your portfolio'};
 else if(fallback.hero)portfolio.hero=structuredClone(fallback.hero);
 const claims=Claims.parse({...result.claims,projects:Object.entries(projects).map(([id,project])=>({id,name:project.title,saidAbout:result.claims.projects.find(claim=>claim.id===id)?.saidAbout??[project.summary]}))});
 if(builderName)claims.speakerName=builderName;else delete claims.speakerName;
 return {portfolio,claims,projectRegistry:registry};
}
