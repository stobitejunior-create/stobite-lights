// Effect generator. An effect modulates one target across a list of fixtures,
// with a fan (phase spread) so the wave travels across the rig.

import { hsvToRgb, rgbToAttrs } from './color.js';

export const EFFECT_TARGETS = [
  { id: 'dim', label: 'Intensity' },
  { id: 'circle', label: 'Position circle' },
  { id: 'pan', label: 'Pan sweep' },
  { id: 'tilt', label: 'Tilt sweep' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'zoom', label: 'Zoom' },
];

export const WAVES = ['sine', 'square', 'triangle', 'sawup', 'sawdown', 'pulse', 'random'];

export function newEffect(fixtures, target = 'dim') {
  return {
    id: 'fx' + Math.random().toString(36).slice(2, 9),
    target,
    wave: target === 'circle' || target === 'rainbow' ? 'sine' : 'sine',
    bpm: 60,
    size: target === 'circle' ? 0.3 : 1,
    fan: 1,
    fixtures: [...fixtures],
  };
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Wave value 0..1 at phase 0..1 (phase may exceed 1; cycles are counted).
export function wave(kind, phase, seed = 0) {
  const p = phase - Math.floor(phase);
  switch (kind) {
    case 'square': return p < 0.5 ? 1 : 0;
    case 'triangle': return p < 0.5 ? p * 2 : 2 - p * 2;
    case 'sawup': return p;
    case 'sawdown': return 1 - p;
    case 'pulse': return p < 0.15 ? 1 : 0;
    case 'random': return hash(Math.floor(phase) * 7 + seed);
    default: return 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
  }
}

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Apply effect to `values` (Map fid -> {attr: v}); compiled(fid) gives type info.
// `fallback(fid, attr)` provides a base when nothing set the attribute.
export function applyEffect(fx, timeSec, values, compiled, fallback, scale = 1) {
  const n = fx.fixtures.length;
  if (!n || scale <= 0) return;
  const cycles = (timeSec * fx.bpm) / 60;
  fx.fixtures.forEach((fid, i) => {
    const ct = compiled(fid);
    if (!ct) return;
    const offset = n > 1 ? (fx.fan * i) / n : 0;
    const phase = cycles + offset;
    let vals = values.get(fid);
    if (!vals) values.set(fid, (vals = {}));
    const base = (attr) => vals[attr] ?? fallback(fid, attr);
    const size = fx.size * scale;
    switch (fx.target) {
      case 'dim': {
        if (!ct.has('dim')) return;
        const w = wave(fx.wave, phase, i);
        vals.dim = clamp(base('dim') * (1 - size * (1 - w)));
        break;
      }
      case 'circle': {
        const a = phase * Math.PI * 2;
        if (ct.map.pan) vals.pan = clamp(base('pan') + size * 0.25 * Math.sin(a));
        if (ct.map.tilt) vals.tilt = clamp(base('tilt') + size * 0.25 * Math.cos(a));
        break;
      }
      case 'rainbow': {
        const rgb = hsvToRgb(phase, size, 1);
        Object.assign(vals, rgbToAttrs(rgb, ct));
        break;
      }
      default: {
        const attr = fx.target;
        if (!ct.map[attr]) return;
        const w = wave(fx.wave, phase, i);
        vals[attr] = clamp(base(attr) + size * 0.5 * (w - 0.5) * 2);
      }
    }
  });
}
