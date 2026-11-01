import type { FormField, Primitive } from '../contracts';

export interface TemplateScenario {
  sectionTitle: string;
  actionLabel: string;
  submitLabel: string;
  columns: string[];
  data: Record<string, Primitive>[];
  fields: FormField[];
  description: string;
}
const select = (id: string, label: string, options: string[]): FormField => ({ id, label, type: 'select', required: true, options });
const date = (id: string, label: string): FormField => ({ id, label, type: 'date', required: true });
const number = (id: string, label: string): FormField => ({ id, label, type: 'number', required: true });
const text = (id: string, label: string, required = true): FormField => ({ id, label, type: 'text', required });
const contact = (fields: FormField[], nameRequired = true): FormField[] => [...fields, text('visitor-name', 'Your name', nameRequired), { id: 'visitor-email', label: 'Email', type: 'email', required: true }];
function scenario(sectionTitle: string, actionLabel: string, submitLabel: string, columns: string[], rows: string[][], fields: FormField[], description: string): TemplateScenario {
  return { sectionTitle, actionLabel, submitLabel, columns, data: rows.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]]))), fields: contact(fields), description };
}

/** Reviewed, synthetic scenarios. These describe local interactions, never real services. */
const scenarios: Record<string, TemplateScenario> = {
  'studio-booking': scenario('Explore demo spaces', 'Plan a studio booking', 'Save demo booking', ['space', 'category', 'capacity', 'rate'], [
    ['Daylight Room', 'Photography', '8 guests', '$60 / hour'], ['Sound Room', 'Audio', '4 guests', '$35 / hour'], ['Workshop Room', 'Photography', '12 guests', '$75 / hour'],
  ], [select('booking-space', 'Choose a space', ['Daylight Room', 'Sound Room', 'Workshop Room']), date('booking-date', 'Preferred date'), number('booking-guests', 'Number of guests')], 'Choose a sample studio and plan a date. Availability and prices are synthetic; no reservation is made.'),
  restaurant: scenario('A sample seasonal menu', 'Plan a table reservation', 'Save demo reservation', ['dish', 'category', 'diet', 'price'], [
    ['Roasted tomato toast', 'Starters', 'Vegetarian', '$9'], ['Garden herb pasta', 'Mains', 'Vegetarian', '$18'], ['Citrus olive oil cake', 'Desserts', 'Contains gluten', '$8'],
  ], [date('reservation-date', 'Preferred dining date'), select('reservation-time', 'Seating time', ['18:00', '19:00', '20:00']), number('reservation-guests', 'Number of guests')], 'Browse a sample menu and try the reservation form. No table is reserved and no dietary guarantee is implied.'),
  conference: scenario('Explore the demo programme', 'Register conference interest', 'Save demo registration', ['session', 'category', 'time', 'format'], [
    ['Opening ideas', 'Strategy', '09:00', 'Demo keynote'], ['Build together', 'Product', '11:00', 'Sample workshop'], ['New perspectives', 'Strategy', '14:00', 'Sample discussion'],
  ], [select('conference-pass', 'Pass preference', ['Day pass', 'Full programme', 'Workshop only']), number('conference-attendees', 'Number of attendees')], 'Explore a synthetic programme and register local interest. No ticket, real speaker booking, or admission is issued.'),
  portfolio: scenario('Your project placeholders', 'Start a project enquiry', 'Save demo project enquiry', ['project', 'category', 'format', 'status'], [
    ['Project placeholder 01', 'Identity', 'Case study', 'Replace with your work'], ['Project placeholder 02', 'Digital', 'Website', 'Replace with your work'], ['Project placeholder 03', 'Identity', 'Visual system', 'Replace with your work'],
  ], [select('portfolio-project', 'Project type', ['Identity', 'Digital experience', 'Other collaboration']), text('portfolio-scope', 'Tell us about the scope')], 'Add your own work to these placeholders. No client credits, completed projects, awards, or work history are claimed.'),
  marketplace: scenario('Browse the demo collection', 'Try the local demo bag', 'Save item in demo bag', ['product', 'category', 'price', 'availability'], [
    ['Everyday notebook', 'Stationery', '$14', 'Sample item'], ['Stoneware cup', 'Home', '$22', 'Sample item'], ['Canvas pencil case', 'Stationery', '$12', 'Sample item'],
  ], [select('bag-product', 'Item for your demo bag', ['Everyday notebook', 'Stoneware cup', 'Canvas pencil case']), number('bag-quantity', 'Quantity')], 'Choose a sample item and quantity for a local demo bag. No checkout, payment, delivery, or stock reservation occurs.'),
  course: scenario('Find a sample class', 'Plan your learning', 'Save demo enrolment', ['class', 'category', 'level', 'duration'], [
    ['Visual foundations', 'Design', 'Beginner', '4 weeks'], ['Writing with clarity', 'Writing', 'All levels', '3 weeks'], ['Designing a small project', 'Design', 'Intermediate', '6 weeks'],
  ], [select('course-choice', 'Class preference', ['Visual foundations', 'Writing with clarity', 'Designing a small project']), select('course-pace', 'Learning pace', ['Self-paced', 'Weekly sessions'])], 'Explore a synthetic class catalogue and save an enrolment preference locally. No course access or charge is created.'),
  wellness: scenario('Sample sessions for a slower day', 'Plan a wellbeing session', 'Save demo session request', ['session', 'category', 'duration', 'format'], [
    ['Gentle movement', 'Movement', '40 minutes', 'Small group'], ['A quiet pause', 'Mindfulness', '20 minutes', 'Guided practice'], ['Rest and reset', 'Mindfulness', '30 minutes', 'Individual'],
  ], [select('wellness-session', 'Session preference', ['Gentle movement', 'A quiet pause', 'Rest and reset']), date('wellness-date', 'Preferred date')], 'Try a sample session request. These are synthetic wellbeing offerings, with no appointment, medical service, or health outcome promised.'),
  property: scenario('Explore sample homes', 'Request a demo viewing', 'Save demo viewing request', ['home', 'category', 'area', 'price'], [
    ['Sample courtyard apartment', 'Apartment', '72 square metres', '$1,500 / month'], ['Sample garden house', 'House', '120 square metres', '$2,200 / month'], ['Sample loft apartment', 'Apartment', '90 square metres', '$1,850 / month'],
  ], [select('property-choice', 'Home to explore', ['Sample courtyard apartment', 'Sample garden house', 'Sample loft apartment']), date('property-viewing', 'Preferred viewing date')], 'Browse invented listings and save a viewing request locally. No real listing, offer, tenancy, or appointment is represented.'),
  travel: scenario('Imagine a sample journey', 'Plan a demo trip', 'Save demo travel enquiry', ['journey', 'category', 'duration', 'budget'], [
    ['Coastal slow days', 'Coast', '4 days', 'Sample $600'], ['Mountain mornings', 'Mountains', '5 days', 'Sample $850'], ['Island notebook', 'Coast', '3 days', 'Sample $500'],
  ], [select('travel-destination', 'Journey preference', ['Coastal slow days', 'Mountain mornings', 'Island notebook']), date('travel-departure', 'Preferred departure'), number('travel-party', 'Travellers')], 'Explore fictional journeys and plan a local enquiry. No itinerary, transport, hotel, payment, or reservation is confirmed.'),
  nonprofit: scenario('Sample ways to take part', 'Choose a volunteer interest', 'Save demo volunteer interest', ['opportunity', 'category', 'location', 'commitment'], [
    ['Community garden morning', 'Outdoors', 'Sample community garden', '2 hours'], ['Neighbourhood reading circle', 'Education', 'Sample local library', 'Weekly'], ['Park care afternoon', 'Outdoors', 'Sample neighbourhood park', '3 hours'],
  ], [select('volunteer-role', 'Volunteer interest', ['Community garden morning', 'Neighbourhood reading circle', 'Park care afternoon']), text('volunteer-availability', 'When could you help?')], 'Try a local volunteer interest form for synthetic opportunities. Nothing is sent to an organisation and no donation is taken.'),
  journal: scenario('A sample reading list', 'Try the journal subscription', 'Save demo subscription', ['story', 'category', 'readingTime', 'format'], [
    ['Notes from a quieter morning', 'Everyday', '4 minutes', 'Sample essay'], ['The shape of a neighbourhood', 'Places', '6 minutes', 'Sample feature'], ['Making space for attention', 'Everyday', '3 minutes', 'Sample note'],
  ], [select('journal-topic', 'Stories you enjoy', ['Everyday', 'Places', 'All stories'])], 'These are synthetic article titles for layout exploration. The subscription is a local demo and sends no email.'),
  fitness: scenario('Find a sample training session', 'Plan a demo class', 'Save demo class booking', ['class', 'category', 'level', 'duration'], [
    ['Strength foundations', 'Strength', 'Beginner', '45 minutes'], ['Morning mobility', 'Mobility', 'All levels', '30 minutes'], ['Full body circuit', 'Strength', 'Intermediate', '50 minutes'],
  ], [select('fitness-class', 'Class preference', ['Strength foundations', 'Morning mobility', 'Full body circuit']), date('fitness-date', 'Preferred date'), number('fitness-places', 'Places')], 'Explore a synthetic training schedule and save a class preference locally. No place, coach, or fitness result is promised.'),
  salon: scenario('Explore sample salon services', 'Plan a salon appointment', 'Save demo appointment request', ['service', 'category', 'duration', 'price'], [
    ['Cut and finish', 'Cuts', '60 minutes', '$55'], ['Colour consultation', 'Colour', '30 minutes', '$20'], ['Fringe refresh', 'Cuts', '20 minutes', '$15'],
  ], [select('salon-service', 'Service preference', ['Cut and finish', 'Colour consultation', 'Fringe refresh']), date('salon-date', 'Preferred appointment date'), select('salon-time', 'Preferred time', ['Morning', 'Afternoon', 'Evening'])], 'Try a local salon appointment request using sample services. No real appointment, stylist, price quote, or payment is confirmed.'),
  music: scenario('A sample live programme', 'Choose a demo show', 'Save demo ticket interest', ['event', 'category', 'date', 'venue'], [
    ['Small room sounds', 'Acoustic', 'Sample Friday', 'Demo listening room'], ['After dark selections', 'Electronic', 'Sample Saturday', 'Demo main room'], ['Sunday sessions', 'Acoustic', 'Sample Sunday', 'Demo listening room'],
  ], [select('music-show', 'Show preference', ['Small room sounds', 'After dark selections', 'Sunday sessions']), number('music-tickets', 'Tickets of interest')], 'Browse fictional shows and save local ticket interest. No real artist lineup, ticket, admission, or charge is issued.'),
  coworking: scenario('Compare sample workspace plans', 'Plan a workspace tour', 'Save demo workspace enquiry', ['plan', 'category', 'access', 'rate'], [
    ['Day desk', 'Flexible', 'One day', '$25 / day'], ['Resident desk', 'Dedicated', 'Weekdays', '$280 / month'], ['Flexible week', 'Flexible', 'Five visits', '$95 / week'],
  ], [select('workspace-plan', 'Plan preference', ['Day desk', 'Resident desk', 'Flexible week']), date('workspace-tour', 'Preferred tour date')], 'Compare synthetic workspace plans and save a tour enquiry locally. No membership, desk, entry access, or payment is activated.'),
  bakery: scenario('See the sample bake', 'Plan a local demo preorder', 'Save demo preorder', ['item', 'category', 'allergens', 'price'], [
    ['Country sourdough', 'Bread', 'Sample: gluten', '$7'], ['Chocolate morning bun', 'Pastry', 'Sample: gluten, milk', '$4'], ['Seeded rye', 'Bread', 'Sample: gluten, sesame', '$8'],
  ], [select('bakery-item', 'Choose a sample bake', ['Country sourdough', 'Chocolate morning bun', 'Seeded rye']), number('bakery-quantity', 'Quantity'), date('pickup-date', 'Preferred pickup date')], 'Try a local preorder using sample bakery items. No order or pickup is scheduled; confirm real ingredients and allergens with the bakery.'),
  agency: scenario('Explore sample ways to work together', 'Start a demo project brief', 'Save demo project brief', ['service', 'category', 'scope', 'format'], [
    ['Strategy sprint', 'Strategy', 'Sample discovery', 'Workshop'], ['Identity direction', 'Design', 'Sample visual exploration', 'Project'], ['Digital concept', 'Design', 'Sample interactive concept', 'Prototype'],
  ], [select('agency-service', 'Area of support', ['Strategy sprint', 'Identity direction', 'Digital concept']), text('agency-scope', 'What are you hoping to make?'), select('agency-timeline', 'Timeline', ['Exploring', 'This month', 'This quarter'])], 'These are sample service descriptions, not client results or project history. The project brief remains a local demo.'),
  recipe: scenario('Browse the sample recipe index', 'Save a recipe preference', 'Save demo cooking plan', ['recipe', 'category', 'time', 'diet'], [
    ['Roasted tomato pasta', 'Dinner', '30 minutes', 'Vegetarian'], ['Oat and berry bowl', 'Breakfast', '10 minutes', 'Plant-based'], ['Lemon chickpea tray', 'Dinner', '35 minutes', 'Plant-based'],
  ], [select('recipe-choice', 'Recipe to explore', ['Roasted tomato pasta', 'Oat and berry bowl', 'Lemon chickpea tray']), number('recipe-servings', 'Servings')], 'Explore a synthetic recipe index and save a local cooking preference. Full instructions and verified ingredient information are not included.'),
  'job-board': scenario('Explore sample opportunities', 'Try a local demo application', 'Save demo application draft', ['role', 'category', 'team', 'arrangement'], [
    ['Product designer', 'Design', 'Example team A', 'Remote'], ['Frontend developer', 'Engineering', 'Example team B', 'Hybrid'], ['Brand designer', 'Design', 'Example team C', 'Remote'],
  ], [select('job-role', 'Role of interest', ['Product designer', 'Frontend developer', 'Brand designer']), text('job-work-link', 'Work or portfolio link', false), text('job-note', 'A short introduction')], 'All roles and teams are invented demo data. Application details stay in this browser and are never sent to an employer.'),
  wedding: scenario('A sample celebration schedule', 'Try the demo RSVP', 'Save demo RSVP', ['moment', 'category', 'time', 'location'], [
    ['Welcome gathering', 'Gathering', '15:00', 'Sample garden'], ['Ceremony', 'Ceremony', '16:00', 'Sample courtyard'], ['Dinner and dancing', 'Gathering', '18:00', 'Sample hall'],
  ], [select('rsvp-attendance', 'Will you attend?', ['Joyfully accepts', 'Regretfully declines']), number('rsvp-guests', 'Guests in your party'), text('rsvp-dietary', 'Dietary notes', false)], 'Replace the synthetic schedule with your own details. RSVP details stay in memory; no host receives a reply or guest-list update.'),
};

export function getTemplateScenario(templateId: string, input: string): TemplateScenario {
  const selected = scenarios[templateId] ?? scenarios['studio-booking'];
  if (/\b(?:waitlist|wait list|launch updates|notify me)\b/i.test(input)) {
    return { ...selected, actionLabel: 'Join the demo waitlist', submitLabel: 'Join demo waitlist', fields: contact([], false), description: 'Try a local email opt-in. This demo saves no server-side subscriber and sends no launch email.' };
  }
  return selected;
}
