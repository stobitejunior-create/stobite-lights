// Presets: reusable colours, positions, beams, gobos and levels.

import { FEATURES, attrFeature } from '../engine/attributes.js';
import { PRESET_FEATURES } from '../engine/engine.js';
import { previewColor } from '../engine/color.js';
import { h, clear, popupMenu, promptDialog, toast, rgbCss } from './dom.js';

export function createPresetsView(ctx) {
  const { engine } = ctx;
  const el = h('div');

  function render() {
    clear(el);
    el.append(h('div', { class: 'view-header' },
      h('h1', null, 'Presets'),
      h('span', { class: 'sub' }, 'Tap a preset to apply it to the selected fixtures. Tap + to store what’s in the programmer.'),
    ));
    for (const feat of PRESET_FEATURES) {
      const label = FEATURES.find((f) => f.id === feat).label;
      const grid = h('div', { class: 'preset-grid' });
      for (const p of engine.show.presets[feat]) grid.append(presetTile(feat, p));
      grid.append(h('div', {
        class: 'preset add',
        title: `Record ${label.toLowerCase()} from the programmer`,
        onclick: () => recordNew(feat),
      }, '+'));
      el.append(h('div', { class: 'section-title' }, label), grid);
    }
  }

  function presetTile(feat, p) {
    let swatch = null;
    if (feat === 'color') {
      const [typeId, vals] = Object.entries(p.byType)[0] || [];
      const ct = typeId && engine.compiled(typeId);
      if (ct) {
        const full = Object.fromEntries(ct.attrs.map((a) => [a, vals[a] ?? ct.def(a)]));
        swatch = h('div', { class: 'pswatch', style: { background: rgbCss(previewColor(full, ct)), opacity: 0.55 } });
      }
    }
    const tile = h('div', {
      class: 'preset',
      onclick: () => {
        if (!engine.prog.selection.length) return toast('Select fixtures first');
        engine.applyPreset(feat, p.id);
      },
      oncontextmenu: (e) => { e.preventDefault(); menu(e, feat, p); },
    },
    swatch,
    h('div', { class: 'pnum', style: { position: 'relative' } }, p.id),
    h('div', { class: 'pname' }, p.name),
    h('button', { class: 'more', onclick: (e) => { e.stopPropagation(); menu(e.currentTarget, feat, p); } }, '•••'),
    );
    return tile;
  }

  function hasFeatureValues(feat) {
    return Object.values(engine.prog.values).some((v) => Object.keys(v).some((a) => attrFeature(a) === feat));
  }

  async function recordNew(feat) {
    if (!hasFeatureValues(feat)) return toast(`Set some ${FEATURES.find((f) => f.id === feat).label.toLowerCase()} values in the programmer first`, 'err');
    const slot = engine.show.presets[feat].reduce((m, p) => Math.max(m, p.id), 0) + 1;
    const name = await promptDialog('New preset', 'Name', '');
    if (name === null) return;
    const p = engine.recordPreset(feat, slot, name);
    if (p) toast(`Stored “${p.name}”`, 'ok');
  }

  function menu(anchor, feat, p) {
    popupMenu(anchor, [
      { label: 'Rename…', icon: 'edit', onClick: async () => { const n = await promptDialog('Rename preset', 'Name', p.name); if (n) { p.name = n; engine.changed(); } } },
      {
        label: 'Overwrite from programmer', icon: 'record', onClick: () => {
          if (!hasFeatureValues(feat)) return toast('Nothing of this type in the programmer', 'err');
          engine.recordPreset(feat, p.id, p.name);
          toast(`Updated “${p.name}”`, 'ok');
        },
      },
      '-',
      { label: 'Delete', icon: 'trash', danger: true, onClick: () => engine.deletePreset(feat, p.id) },
    ]);
  }

  render();
  return { el, refresh: (evt) => evt === 'show' && render() };
}
