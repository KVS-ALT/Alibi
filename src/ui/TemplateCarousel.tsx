import { useRef, type ReactNode, type PointerEvent } from 'react';
import type { CaptureStatus, TemplateDefinition, UiSpec } from '../contracts';
import { getTemplatePresentation } from '../templates/presentation';
import './preview.css';
import './carousel.css';
export interface TemplateCarouselProps { templates:TemplateDefinition[];selectedTemplateId:string;onSelectTemplate:(id:string)=>void;captureStatus:CaptureStatus;onStart:()=>void;onMute:()=>void;onResume:()=>void;onEnd:()=>void;preview?:ReactNode;building?:boolean;notice?:string;starting?:boolean;shareUrl?:string }
function Cover({template}:{template:TemplateDefinition}) {
 const copy=getTemplatePresentation({templateId:template.id,screens:[]} as unknown as UiSpec);
 return <div className={`template-preview layout-${template.id} carousel-cover`} style={{'--template-accent':template.accent} as React.CSSProperties}><div className="carousel-cover-brand"><span aria-hidden="true">{template.icon}</span>{template.name}</div><div className="carousel-cover-copy"><p>{template.category}</p><h2>{copy.title}</h2></div><div className="template-art" aria-hidden="true"><div className="art-orb"/><div className="art-frame"/><div className="art-pillar"/><div className="art-leaf"/></div><div className="carousel-cover-footer"><span>{template.description}</span><span aria-hidden="true">↗</span></div></div>
}
function Mic({paused}:{paused:boolean}) {return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0014 0v-1M12 18v4M8 22h8"/>{paused&&<path d="M3 3l18 18"/>}</svg>}
export function TemplateCarousel({templates,selectedTemplateId,onSelectTemplate,captureStatus,onStart,onMute,onResume,onEnd,preview,building,notice,starting}:TemplateCarouselProps){
 const index=Math.max(0,templates.findIndex(t=>t.id===selectedTemplateId));const active=templates[index];const pointer=useRef<{x:number;y:number}|null>(null);
 const move=(direction:number)=>onSelectTemplate(templates[(index+direction+templates.length)%templates.length].id);
 const finish=(e:PointerEvent)=>{const start=pointer.current;pointer.current=null;if(start&&Math.abs(e.clientX-start.x)>55&&Math.abs(e.clientX-start.x)>Math.abs(e.clientY-start.y)*1.4)move(e.clientX<start.x?1:-1)};
 const listening=captureStatus==='listening';const muted=captureStatus==='muted';
 return <main className="template-carousel" aria-label="Template gallery">
 <section className="carousel-stage" aria-roledescription="carousel" aria-label="Starting points" tabIndex={0} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='ArrowRight'){e.preventDefault();move(1)}if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}}} onPointerDown={e=>{if((e.target as HTMLElement).closest('button,input,select,textarea,a'))return;pointer.current={x:e.clientX,y:e.clientY}}} onPointerUp={finish} onPointerCancel={()=>{pointer.current=null}}>
 <div className="carousel-peek previous" aria-hidden="true"><Cover template={templates[(index+templates.length-1)%templates.length]}/></div>
 <div className={`carousel-active ${preview?'has-generated-preview':''}`} key={active.id} role="group" aria-roledescription="slide" aria-label={`${index+1} of ${templates.length}: ${active.name}`}>{preview??<Cover template={active}/>}</div>
 <div className="carousel-peek next" aria-hidden="true"><Cover template={templates[(index+1)%templates.length]}/></div>
 </section>
 <nav className="carousel-navigation" aria-label="Choose template"><button onClick={()=>move(-1)} aria-label="Previous template">←</button><div aria-live="polite"><span>{active.name}</span><small>{String(index+1).padStart(2,'0')} / {templates.length}</small></div><button onClick={()=>move(1)} aria-label="Next template">→</button></nav>
 <div className="carousel-voice"><div className="carousel-mic-row"><button className={`carousel-mic ${listening?'is-listening':''}`} disabled={starting} aria-label={listening?'Mute microphone':muted?'Resume microphone':'Start session'} onClick={listening?onMute:muted?onResume:onStart}><Mic paused={muted}/></button>{(listening||muted)&&<button className="carousel-stop" aria-label="End listening" onClick={onEnd}><span aria-hidden="true">■</span></button>}</div><p role="status">{starting?'Connecting…':building?'Creating your preview…':listening?'Listening':muted?'Paused':''}</p>{notice&&<p className="carousel-notice" role="status">{notice}</p>}</div>
 </main>
}
