// Patch: add fixtures, set addresses, import / build fixture types.

import { ATTR_ORDER, attrLabel } from '../engine/attributes.js';
import { typeLabel } from '../engine/fixtures.js';
import { parseOfl } from '../engine/ofl.js';
import { loadDemoRig } from '../engine/demo.js';
import { h, clear, btn, icon, modal, field, numberInput, select, toast, confirmDialog, popupMenu } from './dom.js';

export function createPatchView(ctx) {
  const { engine } = ctx;
  const el = h('div');

  function render() {
    clear(el);
    const fixtures = engine.show.fixtures;
    el.append(h('div', { class: 'view-header' },
      h('h1', null, 'Patch'),
      h('span', { class: 'sub' }, 'Tell the desk which fixtures you have and their DMX addresses.'),
      h('div', { class: 'spacer' }),
      btn('Fixture types', (e) => typesMenu(e.currentTarget), { cls: 'sm', icon: 'chevD' }),
      btn('Add fixtures', () => openAddSheet(), { cls: 'primary', icon: 'plus' }),
    ));

    if (!fixtures.length) {
      el.append(h('div', { class: 'empty' },
        icon('plus'),
        h('h3', null, 'Add your first fixtures'),
        h('p', null, 'Choose a fixture type, how many, and the DMX start address. Dozens of generic types are built in, and you can import any fixture from the Open Fixture Library.'),
        h('div', { class: 'row' }, btn('Add fixtures', () => openAddSheet(), { cls: 'primary', icon: 'plus' }), btn('Load demo rig', () => loadDemoRig(engine))),
      ));
      return;
    }

    // Universe overview
    const conflicts = engine.conflicts();
    const uni = h('div', { class: 'card', style: { marginBottom: '14px' } });
    for (const u of engine.usedUniverses()) {
      const bar = h('div', { class: 'universe-bar' });
      let used = 0;
      for (const f of fixtures.filter((x) => x.universe === u)) {
        const fp = engine.getType(f.typeId)?.channels.length || 1;
        used += fp;
        bar.append(h('i', { class: conflicts.has(f.id) ? 'bad' : '', title: `${f.id} ${f.name}: ${f.address}–${f.address + fp - 1}`, style: { left: `${((f.address - 1) / 512) * 100}%`, width: `${(fp / 512) * 100}%` } }));
      }
      uni.append(h('div', { class: 'row', style: { marginBottom: '8px' } },
        h('span', { style: { width: '90px' } }, `Universe ${u}`),
        h('div', { style: { flex: 1 } }, bar),
        h('span', { class: 'muted mono', style: { width: '80px', textAlign: 'right' } }, `${used}/512`),
      ));
    }
    if (conflicts.size) uni.append(h('div', { class: 'badge bad', style: { height: 'auto', padding: '6px 10px' } }, `${conflicts.size} fixtures overlap or run past channel 512 — check the red rows below.`));
    el.append(uni);

    const sel = new Set(engine.prog.selection);
    const typeOptions = engine.allTypes().map((t) => ({ value: t.id, label: `${typeLabel(t)} (${t.channels.length}ch)` }));
    const table = h('table', { class: 'table' },
      h('thead', null, h('tr', null,
        h('th', { style: { width: '80px' } }, '#'), h('th', null, 'Name'), h('th', null, 'Type'),
        h('th', { style: { width: '90px' } }, 'Universe'), h('th', { style: { width: '90px' } }, 'Address'), h('th', { style: { width: '70px' } }, 'Chans'), h('th', { style: { width: '50px' } }, ''),
      )),
    );
    const tbody = h('tbody');
    for (const f of fixtures) {
      const fp = engine.getType(f.typeId)?.channels.length || 1;
      const name = h('input', { class: 'input sm', value: f.name, style: { width: '100%' } });
      name.addEventListener('change', () => engine.updateFixture(f.id, { name: name.value.trim() || f.name }));
      const safe = (fn) => (v) => { try { fn(v); } catch (e) { toast(e.message, 'err'); render(); } };
      const tr = h('tr', { class: `${sel.has(f.id) ? 'selected' : ''} ${conflicts.has(f.id) ? 'conflict' : ''}` },
        h('td', null, numberInput(f.id, safe((v) => engine.updateFixture(f.id, { id: v })), { min: 1 })),
        h('td', null, name),
        h('td', null, select(typeOptions, f.typeId, (v) => engine.updateFixture(f.id, { typeId: v }), 'input sm')),
        h('td', null, numberInput(f.universe, (v) => engine.updateFixture(f.id, { universe: v }), { min: 1, max: 63999 })),
        h('td', null, numberInput(f.address, (v) => engine.updateFixture(f.id, { address: v }), { min: 1, max: 512 })),
        h('td', { class: 'muted mono' }, `${fp}`),
        h('td', null, h('button', { class: 'btn ghost sm', title: 'Remove fixture', onclick: () => engine.removeFixtures([f.id]) }, icon('trash'))),
      );
      tr.addEventListener('click', (e) => {
        if (e.target.closest('input,select,button')) return;
        engine.select([f.id], e.ctrlKey || e.metaKey || e.shiftKey ? 'toggle' : 'set');
      });
      tbody.append(tr);
    }
    table.append(tbody);
    el.append(h('div', { class: 'row', style: { marginBottom: '8px' } },
      h('span', { class: 'hint' }, 'Click a row to select it (Ctrl-click for more). Changing a type keeps the fixture in all cues — handy for swapping fixtures.'),
      h('div', { class: 'spacer' }),
      engine.prog.selection.length ? btn(`Remove ${engine.prog.selection.length} selected`, async () => {
        if (await confirmDialog('Remove fixtures?', `${engine.prog.selection.length} fixtures will be removed from the patch, groups, presets and cues.`, { ok: 'Remove', danger: true })) engine.removeFixtures([...engine.prog.selection]);
      }, { cls: 'sm danger', icon: 'trash' }) : null,
    ));
    el.append(h('div', { class: 'card', style: { padding: 0, overflow: 'hidden' } }, table));
  }

  function typesMenu(anchor) {
    popupMenu(anchor, [
      { label: 'Import from Open Fixture Library…', icon: 'folder', onClick: importOfl },
      { label: 'Build a custom fixture…', icon: 'wand', onClick: () => openTypeEditor() },
      ...(engine.show.types.length ? ['-', ...engine.show.types.map((t) => ({ label: `Edit ${typeLabel(t)}`, icon: 'edit', onClick: () => openTypeEditor(t) }))] : []),
    ]);
  }

  async function importOfl() {
    const files = await ctx.desk.openJsonFiles('Import Open Fixture Library JSON');
    let added = 0;
    for (const f of files) {
      try {
        const json = JSON.parse(f.data);
        const mf = json.manufacturerKey || (f.name.includes('_') ? f.name.split('_')[0] : '');
        for (const t of parseOfl(json, mf.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))) {
          engine.addType(t);
          added++;
        }
      } catch (e) {
        toast(`${f.name}: ${e.message}`, 'err');
      }
    }
    if (added) toast(`Imported ${added} fixture mode${added === 1 ? '' : 's'} — find them under Add fixtures`, 'ok');
  }

  function openAddSheet() {
    let typeId = engine.show.types[0]?.id || 'gen-drgbw8';
    const search = h('input', { class: 'input', placeholder: 'Search fixtures (e.g. par, spot, wash, dimmer)…' });
    const list = h('div', { class: 'lib-list' });
    const count = numberInput(1, update, { min: 1, max: 512, cls: 'input num' });
    const universe = numberInput(1, update, { min: 1, max: 63999, cls: 'input num' });
    const address = numberInput('', update, { min: 1, max: 512, cls: 'input num', allowEmpty: true, placeholder: 'auto' });
    const firstId = numberInput(engine.nextFixtureId(), update, { min: 1, cls: 'input num' });
    const name = h('input', { class: 'input', placeholder: 'Default: type name' });
    const summary = h('div', { class: 'hint' });

    function drawList() {
      clear(list);
      const q = search.value.toLowerCase().trim();
      const types = engine.allTypes().filter((t) => !q || typeLabel(t).toLowerCase().includes(q));
      for (const t of types) {
        list.append(h('div', {
          class: `lib-item ${t.id === typeId ? 'active' : ''}`,
          onclick: () => { typeId = t.id; drawList(); update(); },
          ondblclick: () => document.querySelector('.modal .btn.primary')?.click(),
        }, h('div', null, h('div', null, t.name), h('div', { class: 'mf' }, t.manufacturer || '')), h('span', { class: 'badge fp' }, `${t.channels.length} ch`)));
      }
      if (!types.length) list.append(h('div', { class: 'lib-item muted' }, 'No match. Import it from the Open Fixture Library or build a custom fixture.'));
    }
    function update() {
      const t = engine.getType(typeId);
      if (!t) return;
      const fp = t.channels.length;
      const n = Number(count.value) || 1;
      const u = Number(universe.value) || 1;
      const a = address.value ? Number(address.value) : engine.findFreeAddress(u, fp * n) ?? engine.findFreeAddress(u, fp);
      summary.textContent = a == null
        ? `Universe ${u} is full — choose another universe.`
        : `${n} × ${t.name} · ${fp} channels each · universe ${u}, ${a}–${a + fp * n - 1}${a + fp * n - 1 > 512 ? ' (continues on the next universe)' : ''}`;
    }
    search.addEventListener('input', drawList);
    drawList();
    update();
    setTimeout(() => list.querySelector('.active')?.scrollIntoView({ block: 'center' }), 30);

    modal({
      title: 'Add fixtures',
      wide: true,
      body: h('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '18px' } },
        h('div', { class: 'field' }, search, list),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          h('div', { class: 'grid2' }, field('How many', count), field('First fixture #', firstId)),
          h('div', { class: 'grid2' }, field('Universe', universe), field('Start address', address, 'Leave empty for the next free address')),
          field('Name', name),
          summary,
        ),
      ),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Add to patch', cls: 'primary', onClick: () => {
            try {
              const created = engine.addFixtures({
                typeId,
                count: Number(count.value) || 1,
                universe: Number(universe.value) || 1,
                address: address.value ? Number(address.value) : null,
                firstId: Number(firstId.value) || null,
                name: name.value.trim(),
              });
              toast(`Added ${created.length} fixture${created.length === 1 ? '' : 's'}`, 'ok');
            } catch (e) {
              toast(e.message, 'err');
              return false;
            }
          },
        },
      ],
    });
  }

  function openTypeEditor(existing) {
    const t = existing ? JSON.parse(JSON.stringify(existing)) : { manufacturer: '', name: '', channels: [{ attr: 'dim' }] };
    const mf = h('input', { class: 'input', value: t.manufacturer || '', placeholder: 'e.g. Chauvet' });
    const nm = h('input', { class: 'input', value: t.name || '', placeholder: 'e.g. SlimPAR Pro H (7ch)' });
    const rows = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '340px', overflow: 'auto' } });
    const attrOpts = ATTR_ORDER.map((a) => ({ value: a, label: attrLabel(a) }));
    function draw() {
      clear(rows);
      t.channels.forEach((ch, i) => {
        rows.append(h('div', { class: 'row' },
          h('span', { class: 'mono muted', style: { width: '28px' } }, i + 1),
          select(attrOpts.some((o) => o.value === ch.attr) ? attrOpts : [{ value: ch.attr, label: ch.label || ch.attr }, ...attrOpts], ch.attr, (v) => (ch.attr = v), 'input sm'),
          h('label', { class: 'row muted', title: 'This channel is the fine (16-bit) half of the attribute' },
            h('input', { type: 'checkbox', checked: !!ch.fine, onchange: (e) => (ch.fine = e.target.checked) }), 'fine'),
          h('span', { class: 'muted' }, 'default'),
          numberInput(Math.round((ch.def ?? 0) * 255), (v) => (ch.def = v / 255), { min: 0, max: 255 }),
          h('div', { class: 'spacer' }),
          btn('', () => { t.channels.splice(i, 1); draw(); }, { cls: 'ghost sm', icon: 'x' }),
        ));
      });
    }
    draw();
    modal({
      title: existing ? 'Edit fixture type' : 'Build a custom fixture',
      wide: true,
      body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('div', { class: 'grid2' }, field('Manufacturer', mf), field('Model & mode', nm)),
        h('div', { class: 'label' }, 'Channels, in DMX order (check the fixture manual)'),
        rows,
        h('div', null, btn('Add channel', () => { t.channels.push({ attr: 'generic' }); draw(); rows.scrollTop = 1e6; }, { cls: 'sm', icon: 'plus' })),
      ),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Save fixture type', cls: 'primary', onClick: () => {
            if (!nm.value.trim()) return toast('Give the fixture a name', 'err'), false;
            if (!t.channels.length) return toast('Add at least one channel', 'err'), false;
            // Repeated attributes (two "Generic" channels…) need distinct names.
            const seen = {};
            for (const ch of t.channels) {
              if (ch.fine) continue;
              const b = ch.attr.replace(/_\d+$/, '');
              seen[b] = (seen[b] || 0) + 1;
              ch.attr = seen[b] > 1 ? `${b}_${seen[b]}` : b;
            }
            t.manufacturer = mf.value.trim();
            t.name = nm.value.trim();
            engine.addType(t);
            toast('Fixture type saved', 'ok');
          },
        },
      ],
    });
  }

  render();
  return { el, refresh: (evt) => (evt === 'show' || evt === 'programmer') && render() };
}
