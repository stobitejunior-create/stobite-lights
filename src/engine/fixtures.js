// Built-in generic fixture library and fixture-type compilation.
// A fixture type lists its DMX channels in order; each channel drives one
// attribute, optionally as the fine (LSB) byte of a 16-bit attribute.

import { ATTRS, attrInfo, baseAttr, sortAttrs } from './attributes.js';

const c = (attr, extra = {}) => ({ attr, ...extra });
const fine = (attr) => ({ attr, fine: true });
const dmx = (v) => v / 255;

const r = (from, to, label) => ({ from, to, label });

const SPOT_COLORS = [
  r(0, 9, 'Open'), r(10, 19, 'Red'), r(20, 29, 'Orange'), r(30, 39, 'Yellow'),
  r(40, 49, 'Green'), r(50, 59, 'Cyan'), r(60, 69, 'Blue'), r(70, 79, 'Magenta'),
  r(80, 89, 'Pink'), r(90, 99, 'CTO'), r(100, 127, 'Split'), r(128, 255, 'Scroll'),
];
const SPOT_GOBOS = [
  r(0, 9, 'Open'), r(10, 19, 'Gobo 1'), r(20, 29, 'Gobo 2'), r(30, 39, 'Gobo 3'),
  r(40, 49, 'Gobo 4'), r(50, 59, 'Gobo 5'), r(60, 69, 'Gobo 6'), r(70, 79, 'Gobo 7'),
  r(80, 127, 'Shake'), r(128, 255, 'Scroll'),
];
const SHUTTER = [
  r(0, 7, 'Closed'), r(8, 15, 'Open'), r(16, 131, 'Strobe'), r(132, 139, 'Open'),
  r(140, 181, 'Pulse'), r(182, 189, 'Open'), r(190, 231, 'Random'), r(232, 255, 'Open'),
];
const PRISM = [r(0, 63, 'Off'), r(64, 255, 'Prism')];
const LED_MODE = [r(0, 50, 'Manual'), r(51, 100, 'Colour Jump'), r(101, 150, 'Colour Fade'), r(151, 200, 'Pulse'), r(201, 255, 'Sound')];

export const LIBRARY = [
  { id: 'gen-dimmer', manufacturer: 'Generic', name: 'Dimmer', channels: [c('dim')] },
  { id: 'gen-dimmer16', manufacturer: 'Generic', name: 'Dimmer 16-bit', channels: [c('dim'), fine('dim')] },
  { id: 'gen-rgb', manufacturer: 'Generic', name: 'LED RGB (3ch)', channels: [c('red'), c('green'), c('blue')] },
  { id: 'gen-drgb', manufacturer: 'Generic', name: 'LED Dim RGB (4ch)', channels: [c('dim'), c('red'), c('green'), c('blue')] },
  { id: 'gen-drgbs', manufacturer: 'Generic', name: 'LED Dim RGB Strobe (5ch)', channels: [c('dim'), c('red'), c('green'), c('blue'), c('strobe')] },
  { id: 'gen-rgbd', manufacturer: 'Generic', name: 'LED RGB Dim Strobe Mode (7ch)', channels: [c('red'), c('green'), c('blue'), c('dim'), c('strobe'), c('macro', { ranges: LED_MODE }), c('speed')] },
  { id: 'gen-rgbw', manufacturer: 'Generic', name: 'LED RGBW (4ch)', channels: [c('red'), c('green'), c('blue'), c('white')] },
  { id: 'gen-drgbw', manufacturer: 'Generic', name: 'LED Dim RGBW (5ch)', channels: [c('dim'), c('red'), c('green'), c('blue'), c('white')] },
  { id: 'gen-drgbw8', manufacturer: 'Generic', name: 'LED Par RGBW (8ch)', channels: [c('dim'), c('red'), c('green'), c('blue'), c('white'), c('strobe'), c('macro', { ranges: LED_MODE }), c('speed')] },
  { id: 'gen-rgbwa', manufacturer: 'Generic', name: 'LED RGBWA (5ch)', channels: [c('red'), c('green'), c('blue'), c('white'), c('amber')] },
  { id: 'gen-rgbwauv', manufacturer: 'Generic', name: 'LED RGBWA+UV (6ch)', channels: [c('red'), c('green'), c('blue'), c('white'), c('amber'), c('uv')] },
  { id: 'gen-drgbwauv', manufacturer: 'Generic', name: 'LED Par RGBWA+UV (10ch)', channels: [c('dim'), c('red'), c('green'), c('blue'), c('white'), c('amber'), c('uv'), c('strobe'), c('macro', { ranges: LED_MODE }), c('speed')] },
  { id: 'gen-bicolor', manufacturer: 'Generic', name: 'LED Bi-Colour (3ch)', channels: [c('dim'), c('white'), c('warmwhite')] },
  { id: 'gen-cmy', manufacturer: 'Generic', name: 'CMY Fixture (4ch)', channels: [c('dim'), c('cyan'), c('magenta'), c('yellow')] },
  { id: 'gen-strobe', manufacturer: 'Generic', name: 'Strobe (2ch)', channels: [c('dim'), c('strobe')] },
  {
    id: 'gen-spot16', manufacturer: 'Generic', name: 'Moving Head Spot (16ch)',
    channels: [
      c('pan'), fine('pan'), c('tilt'), fine('tilt'), c('speed'),
      c('dim'), c('shutter', { def: dmx(12), ranges: SHUTTER }),
      c('colorwheel', { ranges: SPOT_COLORS }), c('gobo', { ranges: SPOT_GOBOS }), c('goborot'),
      c('prism', { ranges: PRISM }), c('prismrot'), c('focus', { def: 0.5 }), c('zoom', { def: 0.5 }), c('frost'),
      c('control', { ranges: [r(0, 99, 'Normal'), r(100, 149, 'Lamp On'), r(150, 199, 'Lamp Off'), r(200, 255, 'Reset')] }),
    ],
  },
  {
    id: 'gen-wash14', manufacturer: 'Generic', name: 'Moving Head Wash RGBW (14ch)',
    channels: [
      c('pan'), fine('pan'), c('tilt'), fine('tilt'), c('speed'),
      c('dim'), c('shutter', { def: dmx(12), ranges: SHUTTER }),
      c('red'), c('green'), c('blue'), c('white'), c('zoom', { def: 0.5 }),
      c('macro', { ranges: LED_MODE }), c('control', { ranges: [r(0, 199, 'Normal'), r(200, 255, 'Reset')] }),
    ],
  },
  {
    id: 'gen-beam', manufacturer: 'Generic', name: 'Moving Head Beam (12ch)',
    channels: [
      c('colorwheel', { ranges: SPOT_COLORS }), c('shutter', { def: dmx(12), ranges: SHUTTER }), c('dim'),
      c('gobo', { ranges: SPOT_GOBOS }), c('prism', { ranges: PRISM }), c('prismrot'),
      c('pan'), fine('pan'), c('tilt'), fine('tilt'), c('speed'), c('frost'),
    ],
  },
  {
    id: 'gen-spot-cmy', manufacturer: 'Generic', name: 'Moving Head Profile CMY (24ch)',
    channels: [
      c('pan'), fine('pan'), c('tilt'), fine('tilt'), c('speed'),
      c('dim'), fine('dim'), c('shutter', { def: dmx(12), ranges: SHUTTER }),
      c('cyan'), c('magenta'), c('yellow'), c('cto'), c('colorwheel', { ranges: SPOT_COLORS }),
      c('gobo', { ranges: SPOT_GOBOS }), c('goborot'), fine('goborot'), c('gobo2', { ranges: SPOT_GOBOS }),
      c('prism', { ranges: PRISM }), c('prismrot'), c('iris'), c('zoom', { def: 0.5 }), c('focus', { def: 0.5 }), c('frost'),
      c('control', { ranges: [r(0, 199, 'Normal'), r(200, 255, 'Reset')] }),
    ],
  },
  { id: 'gen-fog1', manufacturer: 'Generic', name: 'Fog Machine (1ch)', channels: [c('fog')] },
  { id: 'gen-hazer2', manufacturer: 'Generic', name: 'Hazer (2ch)', channels: [c('fog'), c('fan')] },
];

const COLOR_ATTRS = ['red', 'green', 'blue', 'white', 'warmwhite', 'amber', 'lime', 'uv'];

// Turn a fixture type into a fast lookup used by the engine.
export function compileType(type) {
  const map = {};
  type.channels.forEach((ch, i) => {
    const attr = ch.attr || 'generic';
    if (!map[attr]) map[attr] = { coarse: -1, fine: -1, def: ch.def ?? attrInfo(attr).def, ranges: ch.ranges || null };
    if (ch.fine) map[attr].fine = i;
    else {
      map[attr].coarse = i;
      if (ch.def !== undefined) map[attr].def = ch.def;
      if (ch.ranges) map[attr].ranges = ch.ranges;
    }
  });
  // A fine channel without a coarse one is meaningless; drop it.
  for (const [attr, m] of Object.entries(map)) if (m.coarse < 0) delete map[attr];

  const hasDim = Object.keys(map).some((a) => baseAttr(a) === 'dim');
  const colorAttrs = Object.keys(map).filter((a) => COLOR_ATTRS.includes(baseAttr(a)));
  const virtualDim = !hasDim && colorAttrs.length > 0;
  const attrs = sortAttrs(virtualDim ? ['dim', ...Object.keys(map)] : Object.keys(map));
  return {
    id: type.id,
    footprint: type.channels.length,
    map,
    attrs,
    virtualDim,
    colorAttrs,
    hasPosition: !!map.pan || !!map.tilt,
    has(attr) {
      return attr === 'dim' ? hasDim || virtualDim : !!map[attr];
    },
    def(attr) {
      if (attr === 'dim' && virtualDim) return 0;
      return map[attr]?.def ?? ATTRS[baseAttr(attr)]?.def ?? 0;
    },
  };
}

export function typeLabel(type) {
  return `${type.manufacturer ? type.manufacturer + ' ' : ''}${type.name}`;
}
