// DMX output monitor: all 512 channels of a universe, live.

import { attrLabel } from '../engine/attributes.js';
import { h, clear, select } from './dom.js';

export function createOutputView(ctx) {
  const { engine } = ctx;
  const el = h('div');
  let universe = engine.usedUniverses()[0] || 1;
  let cells = [];
  let owner = [];

  function render() {
    clear(el);
    const used = engine.usedUniverses();
    const opts = (used.length ? used : [1]).map((u) => ({ value: u, label: `Universe ${u}` }));
    el.append(h('div', { class: 'view-header' },
      h('h1', null, 'DMX Output'),
      h('span', { class: 'sub' }, 'What the desk is sending right now. Hover a channel to see what it controls.'),
      h('div', { class: 'spacer' }),
      select(opts, universe, (v) => { universe = Number(v); render(); }, 'input sm'),
    ));
    owner = new Array(512).fill(null);
    for (const f of engine.show.fixtures) {
      if (f.universe !== universe) continue;
      const t = engine.getType(f.typeId);
      t?.channels.forEach((ch, i) => {
        const a = f.address - 1 + i;
        if (a >= 0 && a < 512) owner[a] = { f, label: `${attrLabel(ch.attr)}${ch.fine ? ' fine' : ''}`, start: i === 0 };
      });
    }
    const grid = h('div', { class: 'dmx-grid' });
    cells = [];
    const sel = new Set(engine.prog.selection);
    for (let i = 0; i < 512; i++) {
      const o = owner[i];
      const fill = h('div', { class: 'fill' });
      const v = h('span', { class: 'v' }, '0');
      const cell = h('div', {
        class: `dmx-cell ${o ? 'patched' : ''} ${o && sel.has(o.f.id) ? 'sel' : ''} ${o?.start ? 'start' : ''}`,
        title: o ? `${i + 1}: #${o.f.id} ${o.f.name} — ${o.label}` : `${i + 1}: unpatched`,
      }, fill, h('span', { class: 'ch' }, i + 1), v);
      cells.push({ fill, v, last: -1 });
      grid.append(cell);
    }
    el.append(grid);
  }

  function frame() {
    const buf = engine.universes.get(universe);
    if (!buf) return;
    for (let i = 0; i < 512; i++) {
      const c = cells[i];
      const val = buf[i];
      if (val === c.last) continue;
      c.last = val;
      c.v.textContent = val;
      c.fill.style.height = `${(val / 255) * 100}%`;
    }
  }

  render();
  return { el, frame, refresh: (evt) => (evt === 'show' || evt === 'programmer') && render() };
}
