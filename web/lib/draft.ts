import { Claims, Portfolio, type ProjectSection } from '@alibi/shared';
import { isProjectFeatureStatement, mergeProjectHighlights, resolveProjectIdentity, seedProjectRegistry, spokenProjectName, type ProjectIdentityRegistry } from './project-identity';
import { deriveConversationIdentity, stripPersonalIntroductions } from './conversation-identity';
import { renderDesignedProject } from './mock-designs';

interface Recipe {
 key: string; match: RegExp; name: string; category: string; tagline: string; summary: string;
 highlights: [string, string, string]; metrics: [string, string][]; stack: string[];
 columns: [string, string, string]; rows: [string, string, string][];
}
const recipes: Recipe[] = [
 { key:'audio-hardware',match:/\b(airpods|earbuds?|headphones?|loudspeakers?|speakers?|audio hardware|wireless audio)\b/i,name:'Wireless audio prototype',category:'AUDIO HARDWARE',tagline:'Compact wireless audio built around comfort and clear sound.',summary:'A wireless audio prototype exploring enclosure fit, acoustic tuning and battery efficiency. The design combines rapid enclosure iterations with repeatable listening and bench tests before the next hardware revision.',highlights:['Iterated enclosure geometry for a secure and comfortable fit','Compared acoustic tuning with repeatable listening tests','Bench-tested battery life and wireless connection stability'],metrics:[['prototype revisions','4'],['pilot listeners','18'],['battery bench test','6.2 hr']],stack:['Industrial design','CAD','Acoustic testing','Embedded firmware'],columns:['Prototype','Check','Status'],rows:[['Enclosure R3','Comfort and seal','Fit approved'],['Acoustic module R2','Frequency sweep','Tuning review'],['Battery module R4','6.2 hr bench run','Test complete']] },
 { key:'cars',match:/\b(cars?|vehicles?|dealers?|automotive|VIN)\b/i,name:'Car marketplace',category:'MARKETPLACE',tagline:'Find the right car below the usual asking price.',summary:'A car marketplace that brings dealer overstock into one searchable inventory. Buyers compare price history, save searches and contact the seller after reviewing vehicle details.',highlights:['Normalized dealer inventory and deduplicated listings by VIN','Ranked price drops against comparable vehicles','Built saved searches with availability alerts'],metrics:[['listings','146'],['pilot dealers','8'],['search p95','240 ms']],stack:['Next.js','TypeScript','PostgreSQL'],columns:['Vehicle','Price','Status'],rows:[['2021 Honda Civic','$18,400','18% below market'],['2020 Toyota Corolla','$17,250','New price drop'],['2022 Mazda 3','$21,100','History checked']] },
 { key:'cad',match:/\b(CAD|3d|solidworks|mechanical|meshes|parametric)\b/i,name:'CAD review tool',category:'DESIGN TOOL',tagline:'Catch manufacturability issues before the first prototype.',summary:'A CAD review tool for small design teams. It checks model revisions for thin walls, missing clearances and inconsistent dimensions, then groups the findings into a review queue.',highlights:['Compared model revisions without losing review comments','Flagged thin walls and clearance issues before export','Generated a prioritized design review checklist'],metrics:[['models tested','42'],['reviewers','6'],['review time saved','31%']],stack:['Python','React','OpenCascade'],columns:['Model','Checks','Review'],rows:[['Motor bracket v4','12 passed','Clearance fixed'],['Sensor enclosure','2 findings','Thin wall'],['Mounting plate','18 passed','Ready for export']] },
 { key:'learning',match:/\b(students?|tutor|learn|school|homework|math|course|education)\b/i,name:'Learning tool',category:'LEARNING TOOL',tagline:'Turn difficult practice into a clear next step.',summary:'A practice workspace that helps students work through difficult questions. It tracks attempts, finds recurring mistakes and serves focused practice before showing a worked solution.',highlights:['Grouped mistakes into actionable practice topics','Added progress tracking across short practice sessions','Designed incremental hints that preserve independent work'],metrics:[['practice questions','128'],['pilot learners','24'],['weekly sessions','86']],stack:['Next.js','TypeScript','PostgreSQL'],columns:['Topic','Practice','Progress'],rows:[['Linear equations','8 questions','6 completed'],['Fractions','5 questions','Ready to practise'],['Quadratics','6 questions','Review suggested']] },
 { key:'fitness',match:/\b(fitness|workout|gym|exercise|trainer|nutrition)\b/i,name:'Fitness app',category:'FITNESS APP',tagline:'A training plan that fits the week you actually have.',summary:'A lightweight workout planner for people balancing training with a busy schedule. It adapts sessions to available equipment and tracks progression without a complicated setup.',highlights:['Adapted session plans to time and equipment constraints','Logged sets with repeatable progression targets','Built a weekly adherence and recovery dashboard'],metrics:[['pilot members','28'],['logged workouts','186'],['plan setup','45 sec']],stack:['React','TypeScript','Supabase'],columns:['Session','Duration','Status'],rows:[['Upper body A','35 min','Completed'],['Lower body B','40 min','Tomorrow'],['Recovery walk','20 min','Suggested']] },
 { key:'commerce',match:/\b(shop|store|bakery|restaurant|retail|orders?|ecommerce|inventory)\b/i,name:'Shop operations app',category:'OPERATIONS APP',tagline:'Keep small-business orders and stock in sync.',summary:'An operations dashboard for independent shops. It groups incoming orders, highlights low-stock products and gives staff one place to prepare the next handoff.',highlights:['Unified orders and stock changes in a single queue','Flagged low-stock products before the morning rush','Built daily sales and fulfillment summaries'],metrics:[['pilot shops','4'],['sample orders','214'],['handoff time saved','24%']],stack:['Next.js','PostgreSQL','Tailwind CSS'],columns:['Order','Total','Status'],rows:[['Order #1048','$28.50','Ready for pickup'],['Order #1049','$46.00','Preparing'],['Order #1050','$19.25','Confirmed']] },
 { key:'finance',match:/\b(budget|expense|finance|invoice|spending|payments?)\b/i,name:'Expense tracker',category:'FINANCE TOOL',tagline:'Know where the money went without another spreadsheet.',summary:'A personal expense workspace that groups transactions, tracks recurring bills and makes monthly spending easier to review. The prototype uses a realistic sample ledger.',highlights:['Grouped recurring transactions into monthly commitments','Built category budgets with clear variance indicators','Added searchable notes and CSV transaction imports'],metrics:[['sample transactions','620'],['budget categories','12'],['import time','1.4 sec']],stack:['React','TypeScript','SQLite'],columns:['Transaction','Amount','Category'],rows:[['Groceries','$64.20','Essentials'],['Transit pass','$42.00','Travel'],['Cloud hosting','$12.00','Tools']] },
 { key:'developer',match:/\b(code|developer|deploy|debug|API|github|software|pull request)\b/i,name:'Developer release tool',category:'DEVELOPER TOOL',tagline:'Make the next release easier to understand.',summary:'A release workspace for small software teams. It groups code changes, tracks deployment checks and turns scattered pull-request notes into a useful release summary.',highlights:['Grouped pull requests into a release review queue','Tracked build checks and deployment status','Generated concise release notes from structured changes'],metrics:[['sample releases','18'],['checks tracked','64'],['summary time','2.1 sec']],stack:['Next.js','TypeScript','GitHub API'],columns:['Change','Checks','Release'],rows:[['Search indexing','6 passed','Ready'],['Invite flow','4 passed','In review'],['Usage dashboard','5 passed','Released']] },
];
const generic: Recipe = {key:'workflow',match:/./,name:'Workflow tool',category:'WORKFLOW TOOL',tagline:'Turn scattered requests into a clear next action.',summary:'A lightweight workspace for teams handling repeated requests. It captures incoming work, assigns an owner and keeps decisions and follow-ups in one searchable queue.',highlights:['Grouped incoming requests by urgency and owner','Tracked decisions without losing the original context','Built a searchable queue with clear handoff states'],metrics:[['sample requests','84'],['pilot testers','12'],['handoff time saved','26%']],stack:['Next.js','TypeScript','PostgreSQL'],columns:['Request','Owner','Status'],rows:[['Review onboarding','Maya','In progress'],['Prepare weekly report','Alex','Ready'],['Update client brief','Jordan','Needs review']]};
function genericFor(clause: string): Recipe {
 const brief=clause.replace(/^.*?\b(?:working on|built|building|created|made|making|developed|launched|designed|designing)\s+/i,'').replace(/^\s*(?:a prototype|a|an|the|this)\s+/i,'').replace(/\s+(?:called|named)\s+.*$/i,'').replace(/\b(?:um|uh|basically)\b[,.]?\s*/gi,'').replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'').slice(0,240);
 const product=brief.match(/^([a-z0-9-]+(?:\s+[a-z0-9-]+){0,2})\s+(app|tool|platform|website|service|assistant|tracker|workspace|system)\b/i);
 const subject=product?`${product[1]} ${product[2]}`:brief.split(/\s+/).slice(0,4).join(' ');
 const title=subject?subject[0].toUpperCase()+subject.slice(1):generic.name;
 const audio=/\b(audio|sound|recordings?|calls?|music)\b/i.test(brief);
 return {...generic,key:'workflow-'+(subject.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'general'),name:title,
  category:audio?'AUDIO TOOL':'PRODUCT APP',
  tagline:subject?`A focused workspace for ${subject}.`:generic.tagline,
  summary:brief?`A prototype ${brief[0].toLowerCase()+brief.slice(1)}. It combines a focused capture flow, saved results and a reviewable history so the core task can be repeated without starting over.`:generic.summary,
  highlights:audio?['Built short-recording capture with a clear analysis queue','Saved analysis results with confidence and review states','Added searchable history and repeatable evaluation clips']:['Turned the described problem into a focused capture-and-review flow','Added saved results with searchable history and review states','Tested the main workflow with a small pilot group'],
  metrics:audio?[['sample recordings','96'],['pilot testers','12'],['analysis median','1.8 sec']]:[['sample records','84'],['pilot testers','12'],['task completion','91%']],
  columns:audio?['Recording','Analysis','Status']:['Record','Revision','Status'],
  rows:audio?[['Morning recording 014','High confidence','Reviewed'],['Field recording 015','Analysis complete','Saved'],['Evening recording 016','Needs review','Queued']]:[['Record A-014','v3','Reviewed'],['Record A-015','v1','Saved'],['Record A-016','v2','In review']],
 };
}
function recipeFor(project: ProjectSection) { return recipes.find(recipe => recipe.match.test(`${project.title} ${project.category} ${project.summary}`)) ?? genericFor(project.summary); }

/** Trusted local rendering avoids asking a slow model to generate thousands of HTML tokens. */
export function renderProjectMock(project: ProjectSection,stableId?:string): string {
 return renderDesignedProject(project,stableId);
}

/** Deterministic fictional detail, grounded in the stated product rather than a generic placeholder. */
export interface DraftOptions {projectRegistry?:ProjectIdentityRegistry;builderName?:string;builderSpeaker?:string}
export function createDraftPortfolio(transcript: string, previous?: Portfolio,options:DraftOptions={}): { portfolio: Portfolio; claims: Claims;projectRegistry:ProjectIdentityRegistry } {
 const prior = Portfolio.safeParse(previous);
 const portfolio: Portfolio = prior.success ? structuredClone(prior.data) : {templateId:/\b(dark|vercel|deployment)\b/i.test(transcript)?'geist':/\b(minimal|lowercase)\b/i.test(transcript)?'lowercase':'showcase',skills:[],projects:{},contradictions:[]};
 // Questions help the model, but must not independently invent a second project.
 const normalized=transcript.replace(/[’‘]/g,"'");
 const personalIdentity=options.builderName??deriveConversationIdentity(normalized).name;
 const turns=[...normalized.matchAll(/\[(S\d+|UU)\]\s*([^]*?)(?=\[(?:S\d+|UU)\]|$)/g)];
 const builder=options.builderSpeaker??turns.find(turn=>/\b(?:i(?:'ve|'m)?|we(?:'ve|'re)?)\s+(?:(?:have|am|are|been|basically|currently|just)\s+)*(?:built|building|created|made|developed|working|making|launched|designed|designing)\b/i.test(turn[2]))?.[1];
 const builderText=builder?turns.filter(turn=>turn[1]===builder).map(turn=>turn[2]).join(' '):normalized;
 const clauses=builderText.replace(/\[(?:S\d+|UU)\]\s*/g,'').split(/(?<=[.!?])\s+|(?=\b(?:on the side|separately|another project|a separate project|a different project)\b)/i).filter(part=>!part.trim().endsWith('?'));
 const statements=clauses.join(' ');
 const selections:{recipe:Recipe;clause:string}[]=[];
 for(const rawClause of clauses){
  const clause=stripPersonalIntroductions(rawClause);
  // A construction verb without a product brief is a partial utterance, not a product.
  const construction=clause.match(/\b(?:working on|built|building|created|made|making|developed|developing|launched|designed|designing)\b\s*([^]*)/i);
  if(construction&&!construction[1].replace(/[\s\p{P}\p{S}]/gu,'').replace(/^(?:a|an|the|this|hey|hello|um|uh)$/i,''))continue;
  if(!isProjectFeatureStatement(clause)&&!/\b(?:built|building|working|making|created|develop(?:ed|ing|s|ment)?|design(?:ed|ing|s)?|projects?|websites?|apps?|applications?|tools?|platforms?|marketplaces?|problems?|helps?|needs?|wish|waste|struggl(?:e|ing)|automate|actually|called)\b/i.test(clause))continue;
  let found=recipes.filter(recipe=>recipe.match.test(clause));
  // Inventory/payment APIs can be features of a product rather than separate products.
  if(found.some(recipe=>recipe.key==='cars'))found=found.filter(recipe=>recipe.key!=='commerce'&&recipe.key!=='developer');
  if(found.some(recipe=>recipe.key==='finance'))found=found.filter(recipe=>recipe.key!=='commerce');
  if(found.some(recipe=>recipe.key==='audio-hardware'))found=found.filter(recipe=>recipe.key!=='cad'&&recipe.key!=='developer');
  if(found.length>1&&!/\b(?:also|and a|another|second)\b/i.test(clause))found=found.slice(0,1);
  if(!found.length){
   const fallback=genericFor(clause);
   if(personalIdentity&&fallback.name.toLowerCase()===personalIdentity.toLowerCase()&&!spokenProjectName(clause))continue;
   found=[fallback];
  }
  for(const recipe of found)selections.push({recipe,clause});
 }
 let projectRegistry=seedProjectRegistry(previous,options.projectRegistry);
 for(const entry of projectRegistry.projects){if(!entry.domain&&portfolio.projects[entry.id]){const key=recipeFor(portfolio.projects[entry.id]).key;entry.domain=key.startsWith('workflow-')?'general':key;}}
 for (const {recipe,clause} of selections) {
   const statedProduct=recipe.key==='audio-hardware'?clause.match(/\b(AirPods(?:\s+Pro)?)\b/i)?.[1]:undefined;
   const explicitSeparate=/\b(?:on the side|separately|another (?:project|tool|app)|second (?:project|tool|app)|(?:separate|different) (?:project|tool|app))\b/i.test(clause);
   const resolved=resolveProjectIdentity(projectRegistry,{domain:recipe.key.startsWith('workflow-')?'general':recipe.key,description:clause,label:recipe.name,spokenName:spokenProjectName(clause)||(statedProduct?/\bpro\b/i.test(statedProduct)?'AirPods Pro':'AirPods':undefined),explicitSeparate,explicitRename:/\b(?:actually|rename[ds]?|renaming|correction|(?:now|instead)\s+(?:called|named)|(?:called|named)\b[^]*?\bnow\b)\b/i.test(clause)});
   projectRegistry=resolved.registry;
   const identity=resolved.project;if(!identity)continue;
   const existing=portfolio.projects[identity.id];
   if(existing){
    const project=existing;project.title=identity.name;
    const userCount=clause.match(/\b(\d{1,4})\s+(?:pilot\s+)?(?:users|testers|learners|members)\b/i);
    if(userCount){const metric=project.metrics.find(metric=>/user|tester|learner|member/i.test(metric.label));if(metric)metric.value=userCount[1];}
    project.mockHtml=renderProjectMock(project,identity.designKey??identity.id);continue;
   }
   if (Object.keys(portfolio.projects).length>=3) break;
   const name = identity.name;
   const project: ProjectSection = {status:'ready',title:name,category:recipe.category,year:new Date().getUTCFullYear(),tagline:recipe.tagline,summary:recipe.summary,highlights:[...recipe.highlights],metrics:recipe.metrics.map(([label,value])=>({label,value})),stack:[...recipe.stack]};
   project.mockHtml=renderProjectMock(project,identity.designKey??identity.id);portfolio.projects[identity.id]=project;
 }
 for(const identity of projectRegistry.projects){
  const project=portfolio.projects[identity.id];if(!project)continue;
  if(identity.spokenFeatures?.length)project.highlights=mergeProjectHighlights(project.highlights,identity.spokenFeatures);
  const details=new Map((project.details??[]).map(detail=>[detail.label.toLowerCase(),detail]));
  details.set('product brief',{label:'Product brief',value:identity.description.slice(0,600)});
  if(!details.has('prototype approach'))details.set('prototype approach',{label:'Prototype approach',value:`Prototype built with ${project.stack.join(', ')}. ${project.highlights[0]}`.slice(0,600)});
  project.details=[...details.values()].slice(-8);
  project.mockHtml=renderProjectMock(project,identity.designKey??identity.id);
 }
 const projects=Object.entries(portfolio.projects);
 const spokenName=personalIdentity;
 if(projects.length||spokenName){
   const name=spokenName||portfolio.hero?.name||'Your portfolio';
   portfolio.hero={...portfolio.hero,name,handle:portfolio.hero?.handle||'builder',roles:portfolio.hero?.roles||['student developer'],bio:portfolio.hero?.bio||(projects.length?`Building ${projects.map(([,project])=>project.title).join(', ')}: practical tools for everyday problems.`:''),currently:projects.slice(-2).map(([,project])=>'building '+project.title)};
   portfolio.skills=[...new Set([...portfolio.skills,...projects.flatMap(([,project])=>project.stack)])].slice(0,16);
 }
 return {portfolio:Portfolio.parse(portfolio),claims:Claims.parse({...(spokenName?{speakerName:spokenName}:{}),vibe:portfolio.templateId,skills:portfolio.skills,projects:projects.map(([id,project])=>({id,name:project.title,saidAbout:[statements.slice(-700)||project.summary]}))}),projectRegistry};
}
