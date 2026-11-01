import type { TemplateDefinition } from '../contracts';
export const TEMPLATE_CATALOG: TemplateDefinition[] = [
{id:'studio-booking',name:'Still Studio',category:'Booking',description:'Light-filled creative spaces with room and date booking.',accent:'#305e52',icon:"◐"},
{id:'restaurant',name:'Casa Verde',category:'Food',description:'Seasonal restaurant with a menu and table reservations.',accent:'#a7472c',icon:"✿"},
{id:'conference',name:'Assembly',category:'Events',description:'A bold conference programme and ticket registration.',accent:'#6945d6',icon:"✳"},
{id:'portfolio',name:'Alex Morgan',category:'Creative',description:'A designer’s selected work and project enquiries.',accent:'#2a57bf',icon:"◧"},
{id:'marketplace',name:'Object Market',category:'Commerce',description:'Curated everyday objects with filters and a demo bag.',accent:'#ae582e',icon:"◇"},
{id:'course',name:'Open School',category:'Education',description:'An approachable learning catalogue and enrolment.',accent:'#315eb7',icon:"▤"},
{id:'wellness',name:'Soft Landing',category:'Wellness',description:'Mindful sessions and a considered appointment flow.',accent:'#71654c',icon:"◒"},
{id:'property',name:'Northline Homes',category:'Property',description:'Find a place to call home and arrange a viewing.',accent:'#3a605e',icon:"⌂"},
{id:'travel',name:'Elsewhere',category:'Travel',description:'Small-group journeys with destination discovery.',accent:'#1d6f8f',icon:"↗"},
{id:'nonprofit',name:'Common Ground',category:'Community',description:'Community initiatives and volunteer registration.',accent:'#367246',icon:"✦"},
{id:'journal',name:'Field Notes',category:'Editorial',description:'An independent journal with searchable stories.',accent:'#865c43',icon:"▥"},
{id:'fitness',name:'Motion Club',category:'Fitness',description:'An energetic training schedule and class booking.',accent:'#e7703f',icon:"↗"},
{id:'salon',name:'Form & Finish',category:'Booking',description:'A modern salon’s services and appointment selection.',accent:'#89576e',icon:"◓"},
{id:'music',name:'After Hours',category:'Events',description:'An intimate live music calendar and local ticket demo.',accent:'#ca7689',icon:"♫"},
{id:'coworking',name:'Good Company',category:'Workspace',description:'Flexible workspaces with tours and membership options.',accent:'#5379a3',icon:"▦"},
{id:'bakery',name:'Sunday Bread',category:'Food',description:'A neighbourhood bakery with a local preorder basket.',accent:'#b47932',icon:"◡"},
{id:'agency',name:'Parallel Practice',category:'Creative',description:'A strategy and design studio with a project brief.',accent:'#6455bd',icon:"∥"},
{id:'recipe',name:'The Daily Table',category:'Food',description:'A useful recipe collection with category filters.',accent:'#477455',icon:"◉"},
{id:'job-board',name:'Good Work',category:'Community',description:'A focused opportunities board with role search.',accent:'#296a81',icon:"▣"},
{id:'wedding',name:'June & August',category:'Events',description:'A personal celebration with schedule and demo RSVP.',accent:'#8c6984',icon:"♡"}
];
export const templateById = (id: string) => TEMPLATE_CATALOG.find(t => t.id === id) ?? TEMPLATE_CATALOG[0];
