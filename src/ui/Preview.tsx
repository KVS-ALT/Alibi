import { useState, type CSSProperties } from 'react';
import type { Action, PreviewState, UiComponent, UiSpec } from '../contracts';
import { templateById } from '../templates';
import './preview.css';
export interface PreviewProps {spec: UiSpec;state: PreviewState;onAction:(action:Action,componentId?:string)=>void;onFieldChange:(componentId:string,fieldId:string,value:string)=>void}
const visualCopy: Record<string, [string,string,string]> = {
 'studio-booking':['A little room for big ideas.','Spaces made for making. Find your light, bring your people, and make something beautiful.','Explore the spaces'],
 restaurant:['Good food. Great company.','A seasonal kitchen, a generous table, and a warm welcome in the heart of the neighbourhood.','Find your table'],
 conference:['Fresh minds. New possibilities.','Two days of conversations that move us forward. For people building what comes next.','Explore the programme'],
 portfolio:['Thoughtful work for a changing world.','Independent designer working at the intersection of identity, digital experiences, and everyday life.','View selected work'],
 marketplace:['Good things, chosen well.','Objects with purpose, made to become part of your everyday. Discover our considered collection.','Discover the collection'],
 course:['Make room for something new.','Practical classes for curious people. Learn at your own pace, with people who care about the craft.','Find your next class'],
 wellness:['Come back to yourself.','A quieter space for movement, connection, and feeling a little more like you.','Find your practice'],
 property:['Your next chapter starts here.','Distinctive places for the way you live. Explore homes with character, light, and room to grow.','Explore homes'],
 travel:['Somewhere worth finding.','Thoughtfully planned journeys for the naturally curious. Less rushing. More being there.','Find your next journey'],
 nonprofit:['A better neighbourhood starts with us.','Small actions. Lasting change. Join the people making our community a kinder place.','Get involved'],
 journal:['Stories for a slower world.','Ideas, places, and people worth spending time with. An independent journal for curious minds.','Read the latest'],
 fitness:['Find your next gear.','Good energy. Expert coaching. A community that shows up for you, every single session.','Find your class'],
 salon:['A fresh perspective.','Considered cuts, lived-in colour, and a little time that belongs entirely to you.','Explore our services'],
 music:['Stay for one more song.','Independent sounds. Unforgettable nights. A home for live music and the people who love it.','See what’s on'],
 coworking:['Do your best work here.','A welcoming workspace for independent minds. Find your focus, and your people.','Find your space'],
 bakery:['Something good is rising.','Slow dough, early mornings, and the simple pleasure of something freshly baked.','See today’s bake'],
 agency:['Different perspectives. Better outcomes.','We bring clarity to complex challenges through strategy, identity, and digital experiences.','Explore our approach'],
 recipe:['Everyday cooking, a little inspired.','Good ingredients. Straightforward recipes. Something delicious for whatever kind of day it is.','Find something delicious'],
 'job-board':['Work that feels like you.','Thoughtful opportunities from teams doing things differently. Find a role worth getting out of bed for.','Explore opportunities'],
 wedding:['Together is our favourite place.','We’re getting married, and we can’t wait to celebrate this next chapter with our favourite people.','Explore the day']
};
function Art({id}:{id:string}) { return <div className={`template-art art-${id}`} aria-hidden="true"><div className="art-orb"/><div className="art-frame"/><div className="art-pillar"/><div className="art-leaf"/><span className="art-caption">{id === 'conference' ? 'Ideas in motion' : id === 'portfolio' ? 'Selected work / 2026' : id === 'wedding' ? 'Saturday, 19 June' : 'Made for the everyday'}</span></div> }
export function Preview({spec,state,onAction,onFieldChange}:PreviewProps) {
 const template=templateById(spec.templateId);const copy=visualCopy[spec.templateId]??visualCopy['studio-booking'];
 const screen=spec.screens.find(s=>s.id===state.activeScreenId)??spec.screens[0];
 const [notice,setNotice]=useState('');const [query,setQuery]=useState('');
 const action=(component:UiComponent)=>{if(component.actions.length)component.actions.forEach(a=>onAction(a,component.id));else setNotice('Selected in this demo.');};
 const render=(component:UiComponent)=>{switch(component.type){
 case 'text':return <p className="content-text" key={component.id}>{component.properties.text}</p>;
 case 'navigation':return <nav className="content-nav" key={component.id} aria-label="Preview pages">{component.properties.items.map(item=><button key={item.screenId} className={state.activeScreenId===item.screenId?'selected':''} onClick={()=>onAction({type:'navigate',screenId:item.screenId},component.id)}>{item.label}</button>)}</nav>;
 case 'card':return <article className="content-card" key={component.id}><div className="card-art" aria-hidden="true"><span>{template.icon}</span></div><div className="card-copy"><h3>{component.properties.title}</h3><p>{component.properties.body}</p>{component.actions.length>0&&<button onClick={()=>action(component)}>Select <span aria-hidden="true">↗</span></button>}</div></article>;
 case 'button':return <button className="template-button" key={component.id} onClick={()=>action(component)}>{component.properties.label}</button>;
 case 'form':return <form className="content-form" key={component.id} onSubmit={e=>{e.preventDefault();action(component);if(!component.actions.length)setNotice('Your demo request has been recorded.');}}><h3>{screen?.title==='Home'?'Let’s make it happen':screen?.title}</h3><div className="form-fields">{component.properties.fields.map(field=><label key={field.id}>{field.label}{field.type==='select'?<select required={field.required} value={state.forms[component.id]?.[field.id]??''} onChange={e=>onFieldChange(component.id,field.id,e.target.value)}><option value="">Choose an option</option>{field.options?.map(o=><option key={o}>{o}</option>)}</select>:<input type={field.type} required={field.required} value={state.forms[component.id]?.[field.id]??''} onChange={e=>onFieldChange(component.id,field.id,e.target.value)}/>}</label>)}</div><button className="template-button" type="submit">{component.properties.submitLabel??'Send demo request'}</button>{state.submitted[component.id]&&<p className="form-success" role="status">{state.submitted[component.id]}</p>}<small>Interactive demo. No real booking or transaction is made.</small></form>;
 case 'table':{const rows=spec.demoData[component.properties.dataKey]??[];const visible=rows.filter(row=>Object.values(row).some(v=>String(v).toLowerCase().includes(query.toLowerCase())));return <section className="content-table" key={component.id}><label className="preview-search">Search {template.category.toLowerCase()}<input aria-label="Search demo items" placeholder="Type to filter…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="table-scroll"><table><thead><tr>{component.properties.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{visible.map((row,i)=><tr key={String(row.id??i)}>{component.properties.columns.map(column=><td key={column}>{String(row[column]??row[column.toLowerCase()]??Object.values(row)[component.properties.columns.indexOf(column)]??'—')}</td>)}</tr>)}</tbody></table>{!visible.length&&<p>No matching demo items. Try another search.</p>}</div></section>};
 }};
 const navigation=screen?.components.filter(c=>c.type==='navigation')??[];const body=screen?.components.filter(c=>c.type!=='navigation')??[];
 return <div className={`template-preview layout-${spec.templateId}`} style={{'--template-accent':template.accent} as CSSProperties}>
 <header className="template-header"><button className="template-brand" onClick={()=>onAction({type:'navigate',screenId:spec.screens[0]?.id??'home'})}><span aria-hidden="true">{template.icon}</span>{template.name}</button><div className="template-nav">{navigation.map(render)}</div><span className="demo-pill">Demo experience</span></header>
 <div className="template-hero"><div className="hero-copy"><div className="hero-tag">{template.category === 'Booking' ? 'A space for possibility' : template.category==='Events'?'Something to look forward to':template.category==='Food'?'Made with care':'A considered collection'}</div><h1>{copy[0]}</h1><p>{copy[1]}</p><button className="template-button hero-cta" onClick={()=>{document.getElementById(`content-${spec.sessionId}`)?.scrollIntoView({behavior:'smooth',block:'start'});setNotice('Explore the interactive demo below.');}}>{copy[2]}<span aria-hidden="true">↗</span></button><span className="hero-note">{spec.templateId==='studio-booking'?'Natural light. Room to create.':spec.templateId==='restaurant'?'Seasonal, local, always welcoming.':'Designed around the things that matter.'}</span></div><Art id={spec.templateId}/></div>
 <section className="template-content" id={`content-${spec.sessionId}`}><div className="section-heading"><div><span>{template.category}</span><h2>{screen?.title && screen.title!=='Home'?screen.title:'Find your favourite'}</h2></div><p>{template.description}</p></div><div className="components-grid">{body.map(render)}</div>{notice&&<p className="preview-notice" role="status">{notice}</p>}</section>
 <footer className="template-footer"><strong>{template.name}</strong><span>{spec.demoDataLabel || 'Synthetic demo data'}</span><span>Built with Forme</span></footer>
 </div>
}
export default Preview;
