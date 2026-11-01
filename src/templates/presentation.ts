import type { UiSpec } from '../contracts';
import { templateById } from './index';
import { STYLE_METADATA_IDS } from './styleTokens';
const visualCopy: Record<string, [string,string,string]> = {
  "studio-booking": [
    "A little room for big ideas.",
    "Spaces made for making. Find your light, bring your people, and make something beautiful.",
    "Explore the spaces"
  ],
  "restaurant": [
    "Good food. Great company.",
    "A seasonal kitchen, a generous table, and a warm welcome in the heart of the neighbourhood.",
    "Find your table"
  ],
  "conference": [
    "Fresh minds. New possibilities.",
    "Two days of conversations that move us forward. For people building what comes next.",
    "Explore the programme"
  ],
  "portfolio": [
    "Thoughtful work for a changing world.",
    "A concept for presenting your work, your interests, and the projects you choose to share.",
    "View selected work"
  ],
  "marketplace": [
    "Good things, chosen well.",
    "Objects with purpose, made to become part of your everyday. Discover our considered collection.",
    "Discover the collection"
  ],
  "course": [
    "Make room for something new.",
    "Practical classes for curious people. Learn at your own pace, with people who care about the craft.",
    "Find your next class"
  ],
  "wellness": [
    "Come back to yourself.",
    "A quieter space for movement, connection, and feeling a little more like you.",
    "Find your practice"
  ],
  "property": [
    "Your next chapter starts here.",
    "Distinctive places for the way you live. Explore homes with character, light, and room to grow.",
    "Explore homes"
  ],
  "travel": [
    "Somewhere worth finding.",
    "Thoughtfully planned journeys for the naturally curious. Less rushing. More being there.",
    "Find your next journey"
  ],
  "nonprofit": [
    "A better neighbourhood starts with us.",
    "Small actions. Lasting change. Join the people making our community a kinder place.",
    "Get involved"
  ],
  "journal": [
    "Stories for a slower world.",
    "Ideas, places, and people worth spending time with. An independent journal for curious minds.",
    "Read the latest"
  ],
  "fitness": [
    "Find your next gear.",
    "Good energy. Expert coaching. A community that shows up for you, every single session.",
    "Find your class"
  ],
  "salon": [
    "A fresh perspective.",
    "Considered cuts, lived-in colour, and a little time that belongs entirely to you.",
    "Explore our services"
  ],
  "music": [
    "Stay for one more song.",
    "Independent sounds. Unforgettable nights. A home for live music and the people who love it.",
    "See what’s on"
  ],
  "coworking": [
    "Do your best work here.",
    "A welcoming workspace for independent minds. Find your focus, and your people.",
    "Find your space"
  ],
  "bakery": [
    "Something good is rising.",
    "Slow dough, early mornings, and the simple pleasure of something freshly baked.",
    "See today’s bake"
  ],
  "agency": [
    "Different perspectives. Better outcomes.",
    "We bring clarity to complex challenges through strategy, identity, and digital experiences.",
    "Explore our approach"
  ],
  "recipe": [
    "Everyday cooking, a little inspired.",
    "Good ingredients. Straightforward recipes. Something delicious for whatever kind of day it is.",
    "Find something delicious"
  ],
  "job-board": [
    "Work that feels like you.",
    "Thoughtful opportunities from teams doing things differently. Find a role worth getting out of bed for.",
    "Explore opportunities"
  ],
  "wedding": [
    "Together is our favourite place.",
    "We’re getting married, and we can’t wait to celebrate this next chapter with our favourite people.",
    "Explore the day"
  ]
};
export function getTemplatePresentation(spec:UiSpec) {
 const template=templateById(spec.templateId), home=spec.screens[0];
 const metadata=(id:string)=>{const c=home?.components.find(c=>c.id===id);return c?.type==='text'?c.properties.text.trim():'';};
 const copy=visualCopy[spec.templateId]??visualCopy['studio-booking'];
 return {brand:metadata('hero-brand')||(home?.title && home.title!=='Home'?home.title:template.name),title:metadata('hero-title')||copy[0],description:metadata('hero-description')||copy[1],cta:copy[2],tag:template.category==='Booking'?'A space for possibility':template.category==='Events'?'Something to look forward to':template.category==='Food'?'Made with care':'A considered collection',note:'Explore this interactive concept.',artCaption:spec.templateId==='portfolio'?'Sample project artwork':'Concept artwork'};
}
export const HERO_METADATA_IDS=new Set(['hero-brand','hero-title','hero-description',...STYLE_METADATA_IDS]);
