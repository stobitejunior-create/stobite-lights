// Lights (Basic): one card per group with brightness, colour and aim.
// Changes go live straight away; "Save as scene" keeps them.

import { rgbToAttrs, previewColor } from '../engine/color.js';
import { h, clear, btn, icon, slider, toggle, pct, rgbCss } from './dom.js';
import { openSaveScene } from './scene-dialog.js';

const SWATCHES = [
  ['White', [1, 1, 1]], ['Warm', [1, 0.72, 0.42]], ['Red', [1, 0, 0]], ['Orange', [1, 0.42, 0]], ['Yellow', [1, 0.9, 0]],
  ['Green', [0, 1, 0.1]], ['Cyan', [0, 0.9, 1]], ['Blue', [0, 0.08, 1]], ['Purple', [0.6, 0, 1]], ['Pink', [1, 0.3, 0.6]],
];

export function createLightsView(ctx) {
  const { engine } = ctx;
  const el = h('div');
  let cards = [];
  let banner = null;

  function groups() {
    const list = engine.show.groups
      .map((g) => ({ name: g.name, fixtures: g.fixtures.filter((id) => engine.fixById.has(id)) }))
      .filter((g) => g.fixtures.length);
    const grouped = new Set(list.flatMap((g) => g.fixtures));
    const rest = engine.show.fixtures.map((f) => f.id).filter((id) => !grouped.has(id));
    if (rest.length) list.push({ name: list.length ? 'Other lights' : 'All lights', fixtures: rest });
    return list;
  }

  function render() {
    clear(el);
    cards = [];
    el.append(h('div', { class: 'view-header' },
      h('h1', null, 'Lights'),
      h('span', { class: 'sub' }, 'Changes happen live. Save them as a scene when you like what you see.'),
    ));

    if (!engine.show.fixtures.length) {
      el.append(h('div', { class: 'empty' },
        icon('bulb'),
        h('h3', null, 'No lights yet'),
        h('p', null, 'Add your lights in Settings first.'),
        btn('Add lights', () => ctx.setTab('setup'), { cls: 'primary', icon: 'plus' }),
      ));
      return;
    }

    banner = h('div', { class: 'banner', style: { display: 'none' } },
      icon('wand'),
      h('div', { style: { flex: 1 } }, h('strong', null, 'You’ve changed the lights. '), h('span', { class: 'muted' }, 'Save this look so you can bring it back with one tap.')),
      btn('Undo changes', () => engine.clearAll(), { cls: 'sm' }),
      btn('Save as scene', () => openSaveScene(ctx), { cls: 'primary' }),
    );
    el.append(banner);
    updateBanner();

    const grid = h('div', { class: 'light-grid' });
    for (const g of groups()) grid.append(card(g));
    el.append(grid);
  }

  function updateBanner() {
    if (banner) banner.style.display = engine.hasProgrammerData() ? 'flex' : 'none';
  }

  function card(g) {
    const withAttr = (a) => g.fixtures.filter((id) => engine.ctFor(id)?.has(a));
    const primary = withAttr('dim').length ? 'dim' : withAttr('fog').length ? 'fog' : null;
    const hasColor = g.fixtures.some((id) => {
      const ct = engine.ctFor(id);
      return ct && (ct.map.red || ct.map.cyan || ct.map.colorwheel);
    });
    const movers = g.fixtures.filter((id) => engine.ctFor(id)?.hasPosition);
    const aimPresets = engine.show.presets.position;
    const level = () => (primary ? engine.displayValue(withAttr(primary)[0], primary) : 0);

    const dot = h('div', { class: 'light-dot' });
    const val = h('div', { class: 'big-pct' });
    const power = toggle(level() > 0.02, (on) => primary && engine.setAttr(primary, on ? 1 : 0, { fids: withAttr(primary), fan: false }));
    const s = primary ? slider(level(), (v) => engine.setAttr(primary, v, { fids: withAttr(primary), fan: false }), { fill: 'var(--flash)' }) : null;

    const setColor = (rgb) => {
      for (const fid of g.fixtures) {
        const ct = engine.ctFor(fid);
        if (ct) engine.setFixtureValues(fid, rgbToAttrs(rgb, ct));
      }
      if (primary === 'dim' && level() < 0.02) engine.setAttr('dim', 1, { fids: withAttr('dim'), fan: false });
    };

    const body = h('div', { class: 'light-card' },
      h('div', { class: 'light-head' },
        dot,
        h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'light-name' }, g.name), h('div', { class: 'light-sub' }, `${g.fixtures.length} light${g.fixtures.length === 1 ? '' : 's'}`)),
        primary ? power : null,
      ),
      primary ? h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, s), val) : null,
      hasColor ? h('div', { class: 'swatches' }, SWATCHES.map(([name, rgb]) =>
        h('div', { class: 'swatch', title: name, style: { background: rgbCss(rgb) }, onclick: () => setColor(rgb) }))) : null,
      movers.length && aimPresets.length ? h('div', null,
        h('div', { class: 'label', style: { marginBottom: '6px' } }, 'Aim'),
        h('div', { class: 'slots' }, aimPresets.map((p) => h('button', {
          class: 'slot', onclick: () => { engine.select(movers, 'set'); engine.applyPreset('position', p.id); },
        }, p.name)))) : null,
    );
    cards.push({ g, s, val, dot, power: power.querySelector('input'), level, withAttr, primary });
    return body;
  }

  function frame() {
    for (const c of cards) {
      const lv = c.level();
      if (c.s) c.s.setValue(lv);
      const t = c.primary ? pct(lv) : '';
      if (c.val.textContent !== t) c.val.textContent = t;
      if (c.power && document.activeElement !== c.power) c.power.checked = lv > 0.02;
      const f0 = c.g.fixtures[0];
      const out = engine.out.get(f0);
      const ct = engine.ctFor(f0);
      if (out && ct) {
        const col = previewColor(out, ct);
        const dim = ct.has('dim') ? (out.dim ?? 0) : c.primary ? (out[c.primary] ?? 0) * 0.6 : 0;
        c.dot.style.background = rgbCss(col.map((x) => x * (0.12 + 0.88 * dim)));
        c.dot.style.boxShadow = dim > 0.05 ? `0 0 ${8 + dim * 14}px ${rgbCss(col, dim * 0.7)}` : 'none';
      }
    }
  }

  function refresh(evt) {
    if (evt === 'show') render();
    else if (evt === 'programmer' || evt === 'programmer-values') updateBanner();
  }

  render();
  return { el, frame, refresh };
}
