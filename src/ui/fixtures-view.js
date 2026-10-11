// Fixtures: groups + a live tile per fixture. Tap to select, drag to paint-select.

import { previewColor } from '../engine/color.js';
import { typeLabel } from '../engine/fixtures.js';
import { loadDemoRig } from '../engine/demo.js';
import { h, clear, btn, icon, popupMenu, promptDialog, rgbCss, toast } from './dom.js';

export function createFixturesView(ctx) {
  const { engine } = ctx;
  const el = h('div');
  let tiles = new Map();
  let lastClicked = null;
  let paint = null;

  function render() {
    clear(el);
    tiles = new Map();
    const fixtures = engine.show.fixtures;
    el.append(h('div', { class: 'view-header' },
      h('h1', null, 'Fixtures'),
      h('span', { class: 'sub' }, fixtures.length ? `${fixtures.length} in the rig` : ''),
      h('div', { class: 'spacer' }),
      fixtures.length ? btn('Select all', () => engine.select(fixtures.map((f) => f.id)), { cls: 'sm ghost' }) : null,
      fixtures.length ? btn('Select none', () => engine.select([]), { cls: 'sm ghost' }) : null,
    ));

    if (!fixtures.length) {
      el.append(h('div', { class: 'empty' },
        icon('bulb'),
        h('h3', null, 'Your rig is empty'),
        h('p', null, 'Add the fixtures you have in the Patch, or load a demo rig to explore how everything works.'),
        h('div', { class: 'row' },
          btn('Add fixtures', () => ctx.setTab('patch'), { cls: 'primary', icon: 'plus' }),
          btn('Load demo rig', () => { loadDemoRig(engine); toast('Demo rig loaded — try the faders below', 'ok'); }),
        ),
      ));
      return;
    }

    // Groups
    const groups = h('div', { class: 'row wrap', style: { marginBottom: '18px' } });
    for (const g of engine.show.groups) {
      const chip = h('button', {
        class: 'chip',
        title: 'Click to select · Shift/Ctrl-click to add · Right-click for options',
        onclick: (e) => engine.selectGroup(g.id, e.shiftKey || e.ctrlKey || e.metaKey ? 'add' : 'set'),
        oncontextmenu: (e) => { e.preventDefault(); groupMenu(e, g); },
      }, g.name, h('span', { class: 'count' }, g.fixtures.length));
      chip.dataset.group = g.id;
      groups.append(chip);
    }
    groups.append(btn('New group', async () => {
      if (!engine.prog.selection.length) return toast('Select some fixtures first, then save them as a group');
      const name = await promptDialog('New group', 'Group name', `Group ${engine.show.groups.length + 1}`);
      if (name) engine.recordGroup(name);
    }, { cls: 'sm ghost', icon: 'plus' }));
    el.append(h('div', { class: 'section-title' }, 'Groups'), groups);

    // Fixture tiles, sectioned by type
    const byType = new Map();
    for (const f of fixtures) {
      if (!byType.has(f.typeId)) byType.set(f.typeId, []);
      byType.get(f.typeId).push(f);
    }
    for (const [typeId, list] of byType) {
      const type = engine.getType(typeId);
      el.append(h('div', { class: 'section-title row' },
        h('span', null, type ? typeLabel(type) : 'Unknown type'),
        h('button', { class: 'btn ghost sm', style: { height: '20px', marginLeft: '4px' }, onclick: () => engine.select(list.map((f) => f.id), 'add') }, 'select'),
      ));
      const grid = h('div', { class: 'tiles' });
      for (const f of list) grid.append(tile(f));
      el.append(grid);
    }
    syncSelection();
  }

  function tile(f) {
    const glow = h('div', { class: 'glow' });
    const lamp = h('div', { class: 'lamp' });
    const barFill = h('i');
    const lvl = h('span', null, '0%');
    const t = h('div', { class: 'tile' },
      glow, lamp,
      h('div', { class: 'fid' }, f.id),
      h('div', { class: 'fname', title: f.name }, f.name),
      h('div', { class: 'prog-dot' }, 'P'),
      h('div', { class: 'level' }, h('div', { class: 'bar' }, barFill), lvl),
    );
    t.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sel = engine.prog.selection;
      if (e.shiftKey && lastClicked != null) {
        const ids = engine.show.fixtures.map((x) => x.id);
        const a = ids.indexOf(lastClicked), b = ids.indexOf(f.id);
        const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
        if (b < a) range.reverse();
        engine.select(range, 'add');
      } else {
        paint = sel.includes(f.id) ? 'remove' : 'add';
        engine.select([f.id], paint);
      }
      lastClicked = f.id;
    });
    t.addEventListener('pointerenter', (e) => {
      if (paint && e.buttons & 1) engine.select([f.id], paint);
    });
    tiles.set(f.id, { t, glow, lamp, barFill, lvl, last: '' });
    return t;
  }
  const endPaint = () => (paint = null);
  window.addEventListener('pointerup', endPaint);

  function groupMenu(e, g) {
    popupMenu(e, [
      { label: 'Add to selection', icon: 'plus', onClick: () => engine.selectGroup(g.id, 'add') },
      { label: 'Rename…', icon: 'edit', onClick: async () => { const n = await promptDialog('Rename group', 'Name', g.name); if (n) { g.name = n; engine.changed(); } } },
      { label: 'Replace with selection', icon: 'copy', onClick: () => { if (!engine.prog.selection.length) return toast('Nothing selected'); g.fixtures = [...engine.prog.selection]; engine.changed(); } },
      '-',
      { label: 'Delete group', icon: 'trash', danger: true, onClick: () => engine.deleteGroup(g.id) },
    ]);
  }

  function syncSelection() {
    const sel = new Set(engine.prog.selection);
    for (const [id, x] of tiles) x.t.classList.toggle('selected', sel.has(id));
    el.querySelectorAll('.chip[data-group]').forEach((c) => {
      const g = engine.show.groups.find((x) => x.id === Number(c.dataset.group));
      c.classList.toggle('active', !!g && g.fixtures.length > 0 && g.fixtures.length === sel.size && g.fixtures.every((id) => sel.has(id)));
    });
  }

  function frame() {
    for (const [id, x] of tiles) {
      const out = engine.out.get(id);
      const ct = engine.ctFor(id);
      if (!out || !ct) continue;
      const dim = ct.has('dim') ? (out.dim ?? 0) * (engine.blackout ? 0 : engine.show.settings.grandMaster) : 0;
      const col = previewColor(out, ct);
      const key = `${dim.toFixed(3)}|${col.map((c) => c.toFixed(2))}|${!!engine.prog.values[id]}`;
      if (key === x.last) continue;
      x.last = key;
      x.glow.style.background = rgbCss(col);
      x.glow.style.opacity = (dim * 0.9).toFixed(3);
      x.lamp.style.background = rgbCss(col.map((c) => c * (0.15 + 0.85 * dim)));
      x.lamp.style.boxShadow = dim > 0.02 ? `0 0 ${6 + dim * 12}px ${rgbCss(col, dim * 0.8)}` : 'none';
      x.barFill.style.width = `${(out.dim ?? 0) * 100}%`;
      x.lvl.textContent = ct.has('dim') ? `${Math.round((out.dim ?? 0) * 100)}%` : '—';
      x.t.classList.toggle('programmed', !!engine.prog.values[id]);
    }
  }

  function refresh(evt) {
    if (evt === 'show') render();
    else if (evt === 'programmer') syncSelection();
  }

  render();
  return { el, frame, refresh, destroy: () => window.removeEventListener('pointerup', endPaint) };
}
