// Attribute (parameter) definitions shared by the engine and UI.
// Every value in the engine is normalised 0..1; DMX scaling happens at output.

export const FEATURES = [
  { id: 'intensity', label: 'Intensity' },
  { id: 'color', label: 'Colour' },
  { id: 'position', label: 'Position' },
  { id: 'beam', label: 'Beam' },
  { id: 'gobo', label: 'Gobo' },
  { id: 'control', label: 'Control' },
];

const A = (label, feature, opts = {}) => ({ label, feature, def: 0, ...opts });

export const ATTRS = {
  dim: A('Intensity', 'intensity'),
  red: A('Red', 'color', { mix: 'add', def: 1 }),
  green: A('Green', 'color', { mix: 'add', def: 1 }),
  blue: A('Blue', 'color', { mix: 'add', def: 1 }),
  white: A('White', 'color', { mix: 'add', def: 1 }),
  warmwhite: A('Warm White', 'color', { mix: 'add' }),
  amber: A('Amber', 'color', { mix: 'add' }),
  lime: A('Lime', 'color', { mix: 'add' }),
  uv: A('UV', 'color', { mix: 'add' }),
  cyan: A('Cyan', 'color', { mix: 'sub' }),
  magenta: A('Magenta', 'color', { mix: 'sub' }),
  yellow: A('Yellow', 'color', { mix: 'sub' }),
  cto: A('CTO', 'color'),
  colorwheel: A('Colour Wheel', 'color', { snap: true }),
  colorwheel2: A('Colour Wheel 2', 'color', { snap: true }),
  pan: A('Pan', 'position', { def: 0.5 }),
  tilt: A('Tilt', 'position', { def: 0.5 }),
  shutter: A('Shutter', 'beam', { snap: true }),
  strobe: A('Strobe', 'beam'),
  zoom: A('Zoom', 'beam', { def: 0.5 }),
  focus: A('Focus', 'beam', { def: 0.5 }),
  iris: A('Iris', 'beam'),
  frost: A('Frost', 'beam'),
  prism: A('Prism', 'beam', { snap: true }),
  prismrot: A('Prism Rot', 'beam'),
  gobo: A('Gobo', 'gobo', { snap: true }),
  goborot: A('Gobo Rot', 'gobo'),
  gobo2: A('Gobo 2', 'gobo', { snap: true }),
  gobo2rot: A('Gobo 2 Rot', 'gobo'),
  fx: A('Effect Wheel', 'gobo', { snap: true }),
  speed: A('P/T Speed', 'control'),
  macro: A('Macro', 'control', { snap: true }),
  control: A('Control', 'control', { snap: true }),
  fog: A('Fog Output', 'control'),
  fan: A('Fan', 'control'),
  generic: A('Generic', 'control'),
};

export const ATTR_ORDER = Object.keys(ATTRS);

// Attribute names may carry a suffix when a fixture repeats one ("generic_2").
export function baseAttr(attr) {
  return attr.replace(/_\d+$/, '');
}

export function attrInfo(attr) {
  const base = ATTRS[baseAttr(attr)];
  if (!base) return A(attr, 'control');
  if (attr === baseAttr(attr)) return base;
  return { ...base, label: `${base.label} ${attr.split('_').pop()}` };
}

export function attrLabel(attr) {
  return attrInfo(attr).label;
}

export function attrFeature(attr) {
  return attrInfo(attr).feature;
}

export function sortAttrs(attrs) {
  const idx = (a) => {
    const i = ATTR_ORDER.indexOf(baseAttr(a));
    return i < 0 ? 999 : i;
  };
  return [...attrs].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b));
}
