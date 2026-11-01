// Only this local code executes. Template/model-authored scripts remain blocked by CSP.
function templateInteractions() {
  const navButtons = [];
  const root = document.querySelector('[data-kit], .mock-root');
  if (!root) return;
  const main = root.querySelector('main') || root;
  const kit = root.getAttribute('data-kit');
  const rows = [...root.querySelectorAll(kit === 'cards' ? 'main > .grid > div' : 'main .col-span-3 > div')];
  const status = document.createElement('p');
  status.role = 'status'; status.style.cssText = 'padding:0 16px'; main.append(status);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'Record details');
  dialog.style.cssText = 'max-width:calc(100vw - 32px);width:480px;border:1px solid #a3a3a3;border-radius:12px;padding:24px;color:#171717;background:white';
  document.body.append(dialog);
  function button(el, action) {
    const b = document.createElement('button'); b.type = 'button';
    b.className = el.className; b.innerHTML = el.innerHTML;
    b.style.cssText = 'font:inherit;text-align:inherit;cursor:pointer;min-height:44px';
    b.onclick = action; el.replaceWith(b); return b;
  }
  function openRecord(row, index) {
    dialog.replaceChildren();
    const title = row?.querySelector('.font-medium,.font-semibold')?.textContent?.trim() || 'New record';
    const heading = document.createElement('h2'); heading.textContent = title; heading.style.cssText = 'font-size:20px;font-weight:600;margin-bottom:16px';
    const form = document.createElement('form'); form.style.cssText = 'display:grid;gap:16px';
    const label = document.createElement('label'); label.textContent = 'Notes'; label.htmlFor = 'record-notes';
    const input = document.createElement('textarea'); input.id = 'record-notes'; input.rows = 5; input.maxLength = 4000;
    input.style.cssText = 'border:1px solid #737373;border-radius:8px;padding:12px;width:100%;font:inherit';
    const key = 'template-notes:' + document.title + ':' + index;
    try { input.value = localStorage.getItem(key) || row?.dataset.notes || ''; } catch { input.value = row?.dataset.notes || ''; }
    const save = document.createElement('button'); save.textContent = 'Save changes'; save.type = 'submit';
    const close = document.createElement('button'); close.textContent = 'Close'; close.type = 'button'; close.onclick = () => dialog.close();
    for (const b of [save, close]) b.style.cssText = 'min-height:44px;border:1px solid #737373;border-radius:8px;padding:10px 16px';
    form.append(label, input, save, close);
    form.onsubmit = e => { e.preventDefault(); if (row) row.dataset.notes = input.value; try { localStorage.setItem(key, input.value); } catch {} status.textContent = 'Changes saved for ' + title + '.'; dialog.close(); };
    dialog.append(heading, form); dialog.showModal();
  }
  rows.forEach((row, i) => {
    const action = kit === 'cards' ? row.lastElementChild : row.querySelector('.font-medium');
    if (action) button(action, () => openRecord(row, i));
  });
  if (rows.length) {
    const label = document.createElement('label'); label.textContent = 'Search'; label.htmlFor = 'template-search';
    const search = document.createElement('input'); search.id = 'template-search'; search.type = 'search';
    search.style.cssText = 'display:block;min-height:44px;width:100%;margin:8px 0 20px;padding:10px 12px;border:1px solid #737373;border-radius:8px;background:transparent;color:inherit;font:inherit';
    search.oninput = () => { let found = 0; rows.forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(search.value.toLowerCase()); if (!row.hidden) found++; }); status.textContent = found ? '' : 'No matching records.'; };
    const grid = kit === 'cards' ? main.querySelector('.grid') : main.querySelector('.grid-cols-5');
    if (grid) { grid.before(label, search); }
  }
  const nav = [...root.querySelectorAll('nav > div, header > div > span')].filter(el => el.textContent.trim());
  nav.forEach((el, index) => {
    let b;
    b = button(el, () => {
      if (/settings/i.test(b.textContent)) {
        dialog.replaceChildren();
        const label = document.createElement('label'); label.textContent = 'Display density'; label.htmlFor = 'display-density';
        const select = document.createElement('select'); select.id = 'display-density';
        for (const name of ['Comfortable', 'Compact']) { const option = document.createElement('option'); option.textContent = name; select.append(option); }
        select.style.cssText = 'display:block;min-height:44px;border:1px solid #737373;margin:16px 0;padding:8px';
        select.onchange = () => { main.style.fontSize = select.value === 'Compact' ? '12px' : '14px'; };
        const close = document.createElement('button'); close.textContent = 'Close'; close.style.minHeight = '44px'; close.onclick = () => dialog.close();
        dialog.append(label, select, close); dialog.showModal(); return;
      }
      navButtons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const insights = /insights/i.test(b.textContent);
      const activity = /activity/i.test(b.textContent);
      const stats = main.querySelector('.grid-cols-3'); if (stats && kit === 'dashboard') stats.hidden = activity;
      const list = main.querySelector('.col-span-3'); if (list) list.hidden = insights;
      const chart = main.querySelector('.col-span-2'); if (chart) chart.hidden = activity;
      const heading = main.querySelector('h1'); if (heading) heading.textContent = b.textContent.trim();
    });
    b.setAttribute('aria-pressed', String(index === 0)); navButtons.push(b);
  });
  const toolbar = kit === 'dashboard' ? main.firstElementChild?.lastElementChild?.lastElementChild : null;
  if (toolbar?.tagName === 'DIV' && !toolbar.querySelector('h1')) button(toolbar, () => openRecord(rows[0], 0));
}
module.exports = { interactionScript: '(' + templateInteractions.toString() + ')();' };
