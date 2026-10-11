// Colour helpers: HSV <-> RGB and mapping an RGB target onto whatever
// emitters a fixture actually has.

export function hsvToRgb(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}

export function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max ? d / max : 0, max];
}

// Values to set on a fixture to reproduce an RGB colour (0..1 each).
export function rgbToAttrs(rgb, compiled) {
  const [r, g, b] = rgb;
  const has = (a) => !!compiled.map[a];
  const out = {};
  if (has('red') || has('green') || has('blue')) {
    let rr = r, gg = g, bb = b;
    if (has('white')) {
      const w = Math.min(r, g, b);
      out.white = w;
      rr -= w; gg -= w; bb -= w;
    }
    if (has('amber')) out.amber = 0;
    if (has('red')) out.red = rr;
    if (has('green')) out.green = gg;
    if (has('blue')) out.blue = bb;
    if (has('lime')) out.lime = 0;
    if (has('uv')) out.uv = 0;
  }
  if (has('cyan')) out.cyan = 1 - r;
  if (has('magenta')) out.magenta = 1 - g;
  if (has('yellow')) out.yellow = 1 - b;
  if (has('colorwheel') && !has('red') && !has('cyan')) out.colorwheel = nearestWheelSlot(rgb, compiled.map.colorwheel.ranges);
  return out;
}

const NAMED = {
  open: [1, 1, 1], white: [1, 1, 1], red: [1, 0, 0], orange: [1, 0.5, 0], yellow: [1, 1, 0],
  green: [0, 1, 0], cyan: [0, 1, 1], blue: [0, 0, 1], magenta: [1, 0, 1], pink: [1, 0.4, 0.7],
  purple: [0.5, 0, 1], cto: [1, 0.75, 0.45], uv: [0.4, 0, 1], amber: [1, 0.6, 0], lime: [0.6, 1, 0],
};

function nearestWheelSlot(rgb, ranges) {
  if (!ranges) return 0;
  let best = null, bestD = Infinity;
  for (const rg of ranges) {
    const col = NAMED[String(rg.label).toLowerCase().trim()];
    if (!col) continue;
    const d = (col[0] - rgb[0]) ** 2 + (col[1] - rgb[1]) ** 2 + (col[2] - rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = rg; }
  }
  return best ? ((best.from + best.to) / 2) / 255 : 0;
}

// Approximate visible colour of a fixture from its final values, for the UI.
export function previewColor(vals, compiled) {
  const v = (a, d = 0) => (vals[a] ?? d);
  let r = 0, g = 0, b = 0, any = false;
  const add = (a, cr, cg, cb) => {
    if (compiled.map[a]) { const x = v(a); r += x * cr; g += x * cg; b += x * cb; any = true; }
  };
  add('red', 1, 0, 0); add('green', 0, 1, 0); add('blue', 0, 0, 1);
  add('white', 1, 1, 1); add('warmwhite', 1, 0.8, 0.55); add('amber', 1, 0.55, 0);
  add('lime', 0.6, 1, 0); add('uv', 0.35, 0, 0.8);
  if (compiled.map.cyan || compiled.map.magenta || compiled.map.yellow) {
    r = 1 - v('cyan'); g = 1 - v('magenta'); b = 1 - v('yellow'); any = true;
  }
  if (!any && compiled.map.colorwheel) {
    const dmxv = v('colorwheel') * 255;
    const rg = compiled.map.colorwheel.ranges?.find((x) => dmxv >= x.from && dmxv <= x.to);
    const col = rg && NAMED[String(rg.label).toLowerCase().trim()];
    [r, g, b] = col || [1, 1, 1];
    any = true;
  }
  if (!any) [r, g, b] = [1, 0.92, 0.8]; // tungsten-ish for plain dimmers
  const m = Math.max(r, g, b, 1);
  return [r / m, g / m, b / m];
}
