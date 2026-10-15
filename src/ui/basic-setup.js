// Settings (Basic): your lights, how to connect, and the Basic/Advanced switch.

import { typeLabel } from '../engine/fixtures.js';
import { loadDemoRig } from '../engine/demo.js';
import { h, clear, btn, icon, modal, field, numberInput, promptDialog, confirmDialog, toast } from './dom.js';
import { createSettingsView } from './settings-view.js';

export function createBasicSettings(ctx) {
  const { engine } = ctx;
  const el = h('div', { style: { maxWidth: '800px' } });
  const host = h('div');
  const inner = createSettingsView(ctx, { simple: true });
  el.append(h('div', { class: 'view-header' }, h('h1', null, 'Settings')), host, inner.el);

  function groupsInfo() {
    const list = engine.show.groups
      .map((g) => ({ id: g.id, name: g.name, fixtures: g.fixtures.map((id) => engine.fixById.get(id)).filter(Boolean) }))
      .filter((g) => g.fixtures.length);
    const grouped = new Set(list.flatMap((g) => g.fixtures.map((f) => f.id)));
    const rest = engine.show.fixtures.filter((f) => !grouped.has(f.id));
    if (rest.length) list.push({ id: null, name: list.length ? 'Other lights' : 'All lights', fixtures: rest });
    return list;
  }

  function renderLights() {
    clear(host);
    const groups = groupsInfo();
    const card = h('div', { class: 'card' },
      h('div', { class: 'row', style: { marginBottom: '12px' } },
        icon('bulb'), h('h2', { style: { margin: 0 } }, 'Your lights'), h('div', { class: 'spacer' }),
        btn('Add lights', () => openAddLights(ctx), { cls: 'primary', icon: 'plus' }),
      ),
    );
    if (!groups.length) {
      card.append(h('div', { class: 'hint', style: { marginBottom: '12px' } }, 'Nothing here yet. Add the lights you have — you can group them by area, like “Stage pars” or “Front wash”.'),
        btn('Use demo lights instead', () => { loadDemoRig(engine); toast('Demo lights added', 'ok'); }, { cls: 'sm' }));
    }
    for (const g of groups) {
      const types = [...new Set(g.fixtures.map((f) => engine.getType(f.typeId)?.name).filter(Boolean))];
      card.append(h('div', { class: 'list-item', style: { cursor: 'default', borderBottom: '1px solid var(--line)', borderRadius: 0, padding: '12px 4px' } },
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontWeight: 600 } }, g.name),
          h('div', { class: 'muted', style: { fontSize: '12px' } }, `${g.fixtures.length} × ${types.join(', ')}`)),
        btn('Addresses', () => showAddresses(engine, g.name, g.fixtures), { cls: 'sm', title: 'What to set on each physical light' }),
        g.id != null ? btn('', async () => { const n = await promptDialog('Rename group', 'Name', g.name); if (n) { engine.show.groups.find((x) => x.id === g.id).name = n; engine.changed(); } }, { cls: 'sm ghost', icon: 'edit', title: 'Rename' }) : null,
        btn('', async () => {
          if (!(await confirmDialog('Remove these lights?', `“${g.name}” (${g.fixtures.length} lights) will be removed, including from any scenes.`, { ok: 'Remove', danger: true }))) return;
          engine.removeFixtures(g.fixtures.map((f) => f.id));
          if (g.id != null) engine.deleteGroup(g.id);
        }, { cls: 'sm ghost danger', icon: 'trash', title: 'Remove' }),
      ));
    }
    host.append(card);
  }

  renderLights();
  return {
    el,
    refresh: (evt) => { if (evt === 'show') renderLights(); inner.refresh?.(evt); },
    destroy: () => inner.destroy?.(),
  };
}

// Tells the person what to dial in on the physical fixtures.
export function showAddresses(engine, title, fixtures) {
  const rows = fixtures.map((f) => h('tr', null,
    h('td', null, f.name), h('td', { class: 'mono' }, f.universe), h('td', { class: 'mono', style: { fontWeight: 600 } }, f.address)));
  modal({
    title: `Set these addresses — ${title}`,
    wide: false,
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, 'Each light has a DMX address setting (on its display or little switches). Set each one to the number below so it responds to the right controls.'),
      h('div', { class: 'card', style: { padding: 0, maxHeight: '320px', overflow: 'auto' } },
        h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', null, 'Light'), h('th', null, 'Universe'), h('th', null, 'DMX address'))), h('tbody', null, rows))),
    ),
    actions: [{ label: 'Done', cls: 'primary' }],
  });
}

export function openAddLights(ctx) {
  const { engine } = ctx;
  let typeId = null;
  const search = h('input', { class: 'input', placeholder: 'What kind of light? Search, e.g. par, spot, wash, dimmer…', style: { height: '40px' } });
  const list = h('div', { class: 'lib-list', style: { maxHeight: '240px' } });
  const count = numberInput(4, () => {}, { min: 1, max: 200, cls: 'input num' });
  const name = h('input', { class: 'input', placeholder: 'e.g. Stage pars' });
  const universe = numberInput(1, () => {}, { min: 1, cls: 'input num' });
  const address = numberInput('', () => {}, { min: 1, max: 512, cls: 'input num', allowEmpty: true, placeholder: 'auto' });

  const drawList = () => {
    clear(list);
    const q = search.value.toLowerCase().trim();
    const types = engine.allTypes().filter((t) => !q || typeLabel(t).toLowerCase().includes(q));
    for (const t of types) {
      list.append(h('div', {
        class: `lib-item ${t.id === typeId ? 'active' : ''}`,
        onclick: () => { typeId = t.id; if (!name.dataset.touched) name.value = t.name.replace(/\s*\(\d+ch\)/, ''); drawList(); },
      }, h('div', null, h('div', null, t.name), h('div', { class: 'mf' }, t.manufacturer || '')), h('span', { class: 'badge fp' }, `${t.channels.length} ch`)));
    }
    if (!types.length) list.append(h('div', { class: 'lib-item muted' }, 'No match. Try a simpler word, or import the fixture in Advanced mode.'));
  };
  name.addEventListener('input', () => (name.dataset.touched = '1'));
  search.addEventListener('input', drawList);
  drawList();

  modal({
    title: 'Add lights',
    wide: true,
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div', { class: 'field' }, h('label', null, '1. Pick the type of light'), search, list),
      h('div', { class: 'grid2' }, field('2. How many?', count), field('3. Give them a name', name)),
      h('details', null,
        h('summary', { class: 'muted', style: { cursor: 'pointer' } }, 'Address options (usually leave alone)'),
        h('div', { class: 'grid2', style: { marginTop: '10px' } }, field('Universe', universe), field('Start address', address, 'Empty = next free address')),
      ),
    ),
    actions: [
      { label: 'Cancel' },
      {
        label: 'Add lights', cls: 'primary lg', onClick: () => {
          if (!typeId) return toast('Pick the type of light first', 'err'), false;
          try {
            const gname = name.value.trim() || engine.getType(typeId).name;
            const created = engine.addFixtures({
              typeId, count: Number(count.value) || 1, universe: Number(universe.value) || 1,
              address: address.value ? Number(address.value) : null, name: gname,
            });
            engine.select(created.map((f) => f.id));
            engine.recordGroup(gname);
            engine.clearAll();
            toast(`Added ${created.length} light${created.length === 1 ? '' : 's'}`, 'ok');
            setTimeout(() => showAddresses(engine, gname, created), 150);
          } catch (e) {
            toast(e.message, 'err');
            return false;
          }
        },
      },
    ],
  });
}
