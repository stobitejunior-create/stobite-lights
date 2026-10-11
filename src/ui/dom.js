// Tiny DOM helpers: element builder, modals, menus, toasts, form controls.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  play: 'M7 5l12 7-12 7z',
  back: 'M17 5L5 12l12 7z',
  stop: 'M6 6h12v12H6z',
  record: 'M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  save: 'M5 3h11l3 3v15H5zM8 3v6h8M8 14h8v7H8z',
  folder: 'M3 6h6l2 2h10v11H3z',
  search: 'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-5-5',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M4 20L14 10',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  usb: 'M12 2v14M8 6l4-4 4 4M7 12v2l5 3 5-3v-3M12 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01',
  sun: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
};

export function icon(name, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || '');
  svg.append(p);
  return svg;
}

export function btn(label, onClick, { cls = '', icon: ic, title, disabled } = {}) {
  return h('button', { class: `btn ${cls}`, onclick: onClick, title, disabled }, ic ? icon(ic) : null, label);
}

// ---- modal ----------------------------------------------------------------
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const overlay = h('div', { class: 'overlay' });
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  const footer = h('div', { class: 'modal-foot' });
  for (const a of actions) {
    footer.append(btn(a.label, async () => {
      const r = await a.onClick?.();
      if (r !== false) close();
    }, { cls: a.cls || '' }));
  }
  const box = h('div', { class: `modal ${wide ? 'wide' : ''}` },
    h('div', { class: 'modal-head' }, h('h2', null, title), h('div', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? footer : null,
  );
  overlay.append(box);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
      const primary = actions.find((a) => /primary|go|rec/.test(a.cls || ''));
      if (primary) {
        e.preventDefault();
        e.stopPropagation();
        Promise.resolve(primary.onClick?.()).then((r) => r !== false && close());
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  setTimeout(() => box.querySelector('input:not([type=checkbox]):not([type=range]), select')?.focus(), 30);
  return close;
}

export function confirmDialog(title, message, { ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    modal({
      title,
      body: h('p', { style: { margin: 0, color: 'var(--muted)' } }, message),
      actions: [
        { label: 'Cancel' },
        { label: ok, cls: danger ? 'rec' : 'primary', onClick: () => { result = true; } },
      ],
      onClose: () => resolve(result),
    });
  });
}

export function promptDialog(title, label, value = '') {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input', { class: 'input', value });
    modal({
      title,
      body: field(label, input),
      actions: [
        { label: 'Cancel' },
        { label: 'OK', cls: 'primary', onClick: () => { result = input.value.trim(); } },
      ],
      onClose: () => resolve(result),
    });
    setTimeout(() => input.select(), 40);
  });
}

// ---- menu -----------------------------------------------------------------
export function popupMenu(anchorOrEvent, items) {
  document.querySelector('.menu')?.remove();
  const menu = h('div', { class: 'menu' });
  for (const it of items) {
    if (it === '-') { menu.append(h('hr')); continue; }
    menu.append(h('button', { class: it.danger ? 'danger' : '', onclick: () => { menu.remove(); it.onClick(); } }, it.icon ? icon(it.icon) : null, it.label));
  }
  document.body.append(menu);
  let x, y;
  if (anchorOrEvent instanceof Event) { x = anchorOrEvent.clientX; y = anchorOrEvent.clientY; }
  else { const r = anchorOrEvent.getBoundingClientRect(); x = r.left; y = r.bottom + 4; }
  const mr = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - mr.width - 8) + 'px';
  menu.style.top = (y + mr.height > innerHeight - 8 ? y - mr.height - (anchorOrEvent instanceof Event ? 0 : 40) : y) + 'px';
  const off = (e) => {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off, true); }
  };
  setTimeout(() => document.addEventListener('pointerdown', off, true));
}

// ---- toast ----------------------------------------------------------------
let toastBox;
export function toast(msg, kind = '') {
  toastBox ??= document.body.appendChild(h('div', { class: 'toasts' }));
  const t = h('div', { class: `toast ${kind}` }, msg);
  toastBox.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 4000 : 2200);
}

// ---- form controls --------------------------------------------------------
export function field(label, control, hint) {
  return h('div', { class: 'field' }, h('label', null, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

export function toggle(checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onchange: () => onChange(input.checked) });
  return h('label', { class: 'switch' }, input, h('span'));
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'segmented' });
  for (const o of options) {
    wrap.append(h('button', {
      class: o.value === value ? 'active' : '',
      onclick: () => {
        wrap.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        wrap.children[options.indexOf(o)].classList.add('active');
        onChange(o.value);
      },
    }, o.label));
  }
  return wrap;
}

export function select(options, value, onChange, cls = 'input') {
  const s = h('select', { class: cls, onchange: () => onChange(s.value) },
    options.map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(value) }, o.label)));
  return s;
}

// Range slider whose filled track follows the value (0..1).
export function slider(value, onInput, { vertical = false, fill, step = 0.001 } = {}) {
  const s = h('input', { type: 'range', min: 0, max: 1, step, class: vertical ? 'vertical' : '' });
  s.value = value;
  const paint = () => s.style.setProperty('--pct', `${s.value * 100}%`);
  if (fill) s.style.setProperty('--fill', fill);
  paint();
  s.addEventListener('input', () => { paint(); onInput(Number(s.value)); });
  s.setValue = (v) => {
    if (document.activeElement === s && s.matches(':active')) return;
    s.value = v;
    paint();
  };
  return s;
}

export function numberInput(value, onChange, { min, max, step = 1, cls = 'input sm num', allowEmpty = false, placeholder } = {}) {
  const i = h('input', { class: cls, type: 'number', value, min, max, step, placeholder });
  i.addEventListener('change', () => {
    if (allowEmpty && i.value === '') return onChange(null);
    let v = Number(i.value);
    if (Number.isNaN(v)) return;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    i.value = v;
    onChange(v);
  });
  return i;
}

export const pct = (v) => `${Math.round(v * 100)}%`;
export const rgbCss = ([r, g, b], a = 1) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
