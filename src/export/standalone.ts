import type { Action, UiComponent, UiSpec } from '../contracts';

/** Serialized into index.html. Only trusted pre-rendered templates are cloned.
 * Generated values are always assigned with textContent or input.value. */
export function mountStandalone(spec: UiSpec) {
  const root = document.getElementById('app')!;
  let active = spec.screens[0].id, query = '', notice = '';
  const values: Record<string, string | number | boolean | null> = Object.create(null);
  const forms: Record<string, Record<string, string>> = Object.create(null);
  const filters: Record<string, { field: string; stateKey: string }> = Object.create(null);
  const submitted: Record<string, string> = Object.create(null);
  const metadata = new Set(['hero-brand', 'hero-title', 'hero-description']);

  function element(tag: string, text: string) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function currentScreen() { return spec.screens.find(s => s.id === active)!; }
  function validTarget(formId: string) {
    const target = spec.screens.flatMap(screen => screen.components).find(component => component.id === formId);
    if (target?.type !== 'form') return false;
    return target.properties.fields.every(field => {
      const value = forms[formId]?.[field.id] ?? '';
      if (field.required && !value.trim()) return false;
      if (field.type === 'select') return !value && !field.required || Boolean(field.options?.includes(value));
      const input = document.createElement('input');
      input.type = field.type;
      input.required = field.required;
      if (field.type === 'number') { input.min = '1'; input.step = '1'; }
      input.value = value;
      return (!value || Boolean(input.value)) && input.checkValidity();
    });
  }
  function apply(list: Action[], componentId?: string) {
    for (const action of list) {
      switch (action.type) {
        case 'navigate': active = action.screenId; break;
        case 'setState': values[action.key] = action.value; break;
        case 'filter':
          filters[action.dataKey] = { field: action.field, stateKey: action.stateKey };
          if (componentId) Object.assign(values, forms[componentId]);
          break;
        case 'submitDemoForm':
          if (!validTarget(action.formId)) break;
          values[action.resultStateKey] = 'submitted';
          submitted[action.formId] = 'Demo request received locally. Nothing was sent to a server.';
          break;
      }
    }
    render();
  }
  function act(component: UiComponent) {
    if (component.actions.length) apply(component.actions, component.id);
    else { notice = component.type === 'form' ? 'Your demo request has been recorded.' : 'Selected in this demo.'; render(); }
  }
  function renderNotice() {
    root.querySelector('.preview-notice')?.remove();
    if (notice) {
      const node = element('p', notice);
      node.className = 'preview-notice';
      node.setAttribute('role', 'status');
      root.querySelector('.template-content')!.append(node);
    }
  }
  function paintTables() {
    const bodies = currentScreen().components.filter(c => c.type !== 'navigation' && !metadata.has(c.id));
    const children = root.querySelector('.components-grid')!.children;
    bodies.forEach((component, index) => {
      if (component.type !== 'table') return;
      const section = children[index], body = section.querySelector('tbody')!;
      const filter = filters[component.properties.dataKey];
      const selected = filter ? String(values[filter.stateKey] ?? '').toLowerCase() : '';
      const rows = spec.demoData[component.properties.dataKey].filter(row =>
        (!filter || !selected || selected === 'all' || String(row[filter.field] ?? '').toLowerCase() === selected) &&
        Object.values(row).some(value => String(value).toLowerCase().includes(query.toLowerCase())));
      body.replaceChildren();
      for (const row of rows) {
        const tr = document.createElement('tr');
        for (const column of component.properties.columns) tr.append(element('td', String(row[column] ?? row[column.toLowerCase()] ?? Object.values(row)[component.properties.columns.indexOf(column)] ?? '-')));
        body.append(tr);
      }
      section.querySelector('.table-scroll > p')?.remove();
      if (!rows.length) section.querySelector('.table-scroll')!.append(element('p', 'No matching demo items. Try another search.'));
    });
  }
  function render() {
    const template = document.getElementById('screen-' + active) as HTMLTemplateElement;
    root.replaceChildren(template.content.cloneNode(true));
    const screen = currentScreen();
    (root.querySelector('.template-brand') as HTMLButtonElement).onclick = () => apply([{ type: 'navigate', screenId: spec.screens[0].id }]);
    screen.components.filter(c => c.type === 'navigation').forEach((component, index) => {
      if (component.type !== 'navigation') return;
      const nav = root.querySelectorAll('.content-nav')[index];
      nav.id = component.id;
      nav.querySelectorAll('button').forEach((button, itemIndex) => {
        button.onclick = () => apply([{ type: 'navigate', screenId: component.properties.items[itemIndex].screenId }]);
      });
    });
    const hero = root.querySelector('.hero-cta') as HTMLButtonElement;
    hero.onclick = () => {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      root.querySelector('.template-content')?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      notice = 'Explore the interactive demo below.';
      renderNotice();
    };
    const bodies = screen.components.filter(c => c.type !== 'navigation' && !metadata.has(c.id));
    const children = root.querySelector('.components-grid')!.children;
    bodies.forEach((component, index) => {
      const node = children[index] as HTMLElement;
      node.id = component.id;
      if (component.type === 'button') (node as HTMLButtonElement).onclick = () => act(component);
      if (component.type === 'card') {
        const button = node.querySelector('button');
        if (button) button.onclick = () => act(component);
      }
      if (component.type === 'form') {
        const form = node as HTMLFormElement;
        forms[component.id] ??= Object.create(null);
        const inputs = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select');
        component.properties.fields.forEach((field, fieldIndex) => {
          const input = inputs[fieldIndex];
          input.name = field.id;
          input.value = forms[component.id][field.id] ?? '';
          const update = () => { forms[component.id][field.id] = input.value; };
          input.oninput = update;
          input.onchange = update;
        });
        form.onsubmit = event => { event.preventDefault(); if (form.reportValidity()) act(component); };
        if (submitted[component.id]) {
          const status = element('p', submitted[component.id]);
          status.className = 'form-success';
          status.setAttribute('role', 'status');
          form.querySelector('small')!.before(status);
        }
      }
      if (component.type === 'table') {
        const input = node.querySelector('input')!;
        input.value = query;
        input.oninput = () => {
          query = input.value;
          root.querySelectorAll<HTMLInputElement>('.preview-search input').forEach(other => { other.value = query; });
          paintTables();
        };
      }
    });
    paintTables();
    renderNotice();
  }
  render();
}
