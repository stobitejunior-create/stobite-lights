// Effects: one-tap templates applied to the selection, with live controls.

import { EFFECT_TARGETS, WAVES, newEffect } from '../engine/effects.js';
import { h, clear, btn, icon, slider, select, toast } from './dom.js';
import { openRecordSheet } from './programmer.js';

const TEMPLATES = [
  { name: 'Intensity chase', desc: 'Light runs across the selection', make: (f) => ({ ...newEffect(f, 'dim'), wave: 'square', bpm: 120 }) },
  { name: 'Smooth wave', desc: 'Soft rolling intensity', make: (f) => ({ ...newEffect(f, 'dim'), wave: 'sine', bpm: 30 }) },
  { name: 'Pulse', desc: 'Everything breathes together', make: (f) => ({ ...newEffect(f, 'dim'), wave: 'sine', bpm: 40, fan: 0, size: 0.8 }) },
  { name: 'Sparkle', desc: 'Random flicker', make: (f) => ({ ...newEffect(f, 'dim'), wave: 'random', bpm: 240 }) },
  { name: 'Rainbow', desc: 'Colour cycle across the rig', make: (f) => ({ ...newEffect(f, 'rainbow'), bpm: 12 }) },
  { name: 'Circle', desc: 'Movers draw circles', make: (f) => ({ ...newEffect(f, 'circle'), bpm: 20, size: 0.4 }) },
  { name: 'Pan sweep', desc: 'Side-to-side sweep', make: (f) => ({ ...newEffect(f, 'pan'), wave: 'sine', bpm: 15, size: 0.5, fan: 0.5 }) },
  { name: 'Tilt wave', desc: 'Up and down wave', make: (f) => ({ ...newEffect(f, 'tilt'), wave: 'sine', bpm: 20, size: 0.4 }) },
];

const WAVE_LABEL = { sine: 'Sine', square: 'Square', triangle: 'Triangle', sawup: 'Ramp up', sawdown: 'Ramp down', pulse: 'Pulse', random: 'Random' };

export function createEffectsView(ctx) {
  const { engine } = ctx;
  const el = h('div');

  function render() {
    clear(el);
    el.append(h('div', { class: 'view-header' },
      h('h1', null, 'Effects'),
      h('span', { class: 'sub' }, 'Pick fixtures, tap an effect, then Record it into a cue to keep it.'),
    ));

    const sel = engine.prog.selection;
    const tGrid = h('div', { class: 'preset-grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' } });
    for (const t of TEMPLATES) {
      tGrid.append(h('div', {
        class: 'preset', style: { height: '74px' },
        onclick: () => {
          if (!sel.length) return toast('Select fixtures first');
          const fx = t.make(sel);
          // Intensity effects need light to modulate.
          if (fx.target === 'dim') for (const fid of sel) if (engine.displayValue(fid, 'dim') < 0.05) engine.setFixtureValues(fid, { dim: 1 });
          engine.addEffect(fx);
        },
      }, h('div', { class: 'pname' }, t.name), h('div', { class: 'pnum' }, t.desc)));
    }
    el.append(h('div', { class: 'section-title' }, sel.length ? `Add to ${sel.length} selected fixture${sel.length === 1 ? '' : 's'}` : 'Templates — select fixtures first'), tGrid);

    el.append(h('div', { class: 'section-title' }, 'Running in programmer'));
    if (!engine.prog.effects.length) {
      el.append(h('div', { class: 'empty', style: { padding: '28px' } }, h('p', null, 'No effects running. Effects that are saved in cues play when the cue is live.')));
      return;
    }
    for (const fx of engine.prog.effects) el.append(effectCard(fx));
    el.append(h('div', { class: 'row', style: { marginTop: '8px' } },
      btn('Record into cue', () => openRecordSheet(ctx, 'cue'), { cls: 'rec sm', icon: 'record' }),
    ));
  }

  function effectCard(fx) {
    const up = (patch) => engine.updateEffect(fx.id, patch);
    const row = (label, value, onInput, fmt) => {
      const v = h('span', { class: 'val' }, fmt(value));
      return h('div', { class: 'param' },
        h('div', { class: 'param-head' }, h('span', { class: 'name' }, label), v),
        slider(value, (x) => { v.textContent = fmt(x); onInput(x); }),
      );
    };
    const bpmToSlider = (b) => Math.log(b / 2) / Math.log(300);
    const sliderToBpm = (s) => Math.round(2 * Math.pow(300, s));
    return h('div', { class: 'fx-card' },
      h('div', { class: 'row', style: { marginBottom: '10px' } },
        icon('zap'),
        h('strong', null, EFFECT_TARGETS.find((t) => t.id === fx.target)?.label || fx.target),
        h('span', { class: 'muted' }, `on ${fx.fixtures.length} fixture${fx.fixtures.length === 1 ? '' : 's'}`),
        h('div', { class: 'spacer' }),
        fx.target !== 'circle' && fx.target !== 'rainbow'
          ? select(WAVES.map((w) => ({ value: w, label: WAVE_LABEL[w] })), fx.wave, (v) => up({ wave: v }), 'input sm')
          : null,
        btn('', () => engine.removeEffect(fx.id), { cls: 'ghost sm', icon: 'trash', title: 'Remove effect' }),
      ),
      h('div', { class: 'grid3' },
        row('Speed', bpmToSlider(fx.bpm), (s) => up({ bpm: sliderToBpm(s) }), (s) => `${sliderToBpm(s)} BPM`),
        row(fx.target === 'rainbow' ? 'Saturation' : 'Size', fx.size, (s) => up({ size: s }), (s) => `${Math.round(s * 100)}%`),
        row('Spread', fx.fan, (s) => up({ fan: s }), (s) => (s < 0.02 ? 'Together' : `${Math.round(s * 360)}°`)),
      ),
    );
  }

  render();
  return { el, refresh: (evt) => (evt === 'programmer' || evt === 'show') && render() };
}
