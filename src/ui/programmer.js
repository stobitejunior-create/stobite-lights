// Programmer panel: everything for the currently selected fixtures.

import { FEATURES, attrFeature, attrLabel, sortAttrs } from '../engine/attributes.js';
import { hsvToRgb, rgbToHsv, rgbToAttrs } from '../engine/color.js';
import { PRESET_FEATURES } from '../engine/engine.js';
import { h, clear, btn, slider, pct, toast, modal, field, segmented, select, numberInput, icon } from './dom.js';

const SWATCHES = [
  ['White', [1, 1, 1]], ['Warm', [1, 0.72, 0.42]], ['Red', [1, 0, 0]], ['Orange', [1, 0.42, 0]],
  ['Yellow', [1, 0.9, 0]], ['Lime', [0.55, 1, 0]], ['Green', [0, 1, 0.1]], ['Teal', [0, 1, 0.6]],
  ['Cyan', [0, 0.9, 1]], ['Sky', [0.3, 0.6, 1]], ['Blue', [0, 0.08, 1]], ['Indigo', [0.3, 0, 1]],
  ['Purple', [0.6, 0, 1]], ['Magenta', [1, 0, 0.85]], ['Pink', [1, 0.3, 0.6]], ['Rose', [1, 0.55, 0.65]],
];

export function createProgrammer(ctx) {
  const { engine } = ctx;
  let feature = 'intensity';
  let controls = [];

  const el = h('aside', { class: 'programmer' });
  const head = h('div', { class: 'prog-head' });
  const tabs = h('div', { class: 'feature-tabs' });
  const body = h('div', { class: 'prog-body' });
  const foot = h('div', { class: 'prog-foot' });
  el.append(head, tabs, body, foot);

  const sel = () => engine.prog.selection;
  const selAttrs = () => {
    const set = new Set();
    for (const fid of sel()) engine.ctFor(fid)?.attrs.forEach((a) => set.add(a));
    return sortAttrs([...set]);
  };
  const firstWith = (attr) => sel().find((fid) => engine.ctFor(fid)?.has(attr));
  const touched = (attr) => sel().some((fid) => engine.prog.values[fid]?.[attr] !== undefined);
  const featureTouched = (f) => sel().some((fid) => Object.keys(engine.prog.values[fid] || {}).some((a) => attrFeature(a) === f));

  function render() {
    controls = [];
    renderHead();
    const attrs = selAttrs();
    const present = new Set(attrs.map(attrFeature));
    if (engine.prog.effects.length) present.add('effects');
    if (!present.has(feature) && present.size) feature = FEATURES.find((f) => present.has(f.id))?.id || feature;

    clear(tabs);
    for (const f of FEATURES) {
      tabs.append(h('button', {
        class: `feature-tab ${feature === f.id ? 'active' : ''} ${featureTouched(f.id) ? 'touched' : ''}`,
        disabled: !present.has(f.id),
        onclick: () => { feature = f.id; render(); },
      }, f.label));
    }

    clear(body);
    if (!sel().length) {
      body.append(h('div', { class: 'empty', style: { marginTop: '8px' } },
        icon('bulb'),
        h('h3', null, 'Nothing selected'),
        h('p', null, 'Tap fixtures or a group to start. You can also type a selection, like ', h('span', { class: 'kbd' }, '1 thru 4 @ 50'), '.'),
        engine.hasProgrammerData() ? h('p', { class: 'hint' }, `Programmer holds values for ${Object.keys(engine.prog.values).length} fixture(s).`) : null,
      ));
    } else {
      const fattrs = attrs.filter((a) => attrFeature(a) === feature);
      if (feature === 'intensity') renderIntensity(fattrs);
      else if (feature === 'color') renderColor(fattrs);
      else if (feature === 'position') renderPosition(fattrs);
      else fattrs.forEach((a) => body.append(paramRow(a)));
      if (featureTouched(feature)) {
        body.append(h('div', { style: { marginTop: '6px' } }, btn(`Release ${FEATURES.find((f) => f.id === feature).label.toLowerCase()}`, () => engine.releaseAttrs(feature), { cls: 'ghost sm' })));
      }
    }

    clear(foot);
    foot.append(
      btn('Record', () => openRecordSheet(ctx), { cls: 'rec lg', icon: 'record', disabled: !engine.hasProgrammerData() }),
      btn('Update cue', () => {
        const id = ctx.currentCuelist();
        const cue = id != null && engine.updateActiveCue(id);
        toast(cue ? `Updated cue ${cue.num} in ${engine.cuelist(id).name}` : 'No live cue to update — press Go on a playback first', cue ? 'ok' : 'err');
      }, { cls: 'lg', disabled: !engine.hasProgrammerData(), title: 'Merge programmer into the live cue of the current cuelist' }),
    );
  }

  function renderHead() {
    clear(head);
    const n = sel().length;
    const names = sel().slice(0, 4).map((id) => engine.fixById.get(id)?.name).filter(Boolean).join(', ');
    head.append(
      h('div', { class: 'prog-title' }, h('strong', null, 'Programmer'), h('span', { class: 'muted' }, n ? `${n} selected` : '')),
      h('div', { class: 'prog-sel' }, n ? names + (n > 4 ? ` +${n - 4} more` : '') : 'No fixtures selected'),
      h('div', { class: 'prog-tools' },
        btn('Highlight', () => { engine.prog.highlight = !engine.prog.highlight; engine.emit('programmer'); }, { cls: `sm ${engine.prog.highlight ? 'on' : ''}`, title: 'Bring selected fixtures to full white so you can find them (H)' }),
        btn('Fan', () => { engine.prog.fan = !engine.prog.fan; engine.emit('programmer'); }, { cls: `sm ${engine.prog.fan ? 'on-flash' : ''}`, title: 'Spread values across the selection when you move a control' }),
        btn(n ? 'Clear selection' : 'Clear all', () => engine.clear(), { cls: 'sm', disabled: !n && !engine.hasProgrammerData(), title: 'Esc' }),
      ),
    );
  }

  // ---- generic parameter row ----------------------------------------------
  function paramRow(attr, { fill } = {}) {
    const fid0 = firstWith(attr);
    const ranges = engine.ctFor(fid0)?.map[attr]?.ranges;
    const val = h('span', { class: 'val' });
    const row = h('div', { class: `param ${touched(attr) ? 'touched' : ''}` });
    const s = slider(engine.displayValue(fid0, attr), (v) => {
      engine.setAttr(attr, v);
      row.classList.add('touched');
    }, { fill });
    const fmt = (v) => {
      const d = Math.round(v * 255);
      const rg = ranges?.find((r) => d >= r.from && d <= r.to);
      return rg ? `${rg.label} · ${d}` : `${pct(v)} · ${d}`;
    };
    const slots = ranges ? h('div', { class: 'slots' }, ranges.slice(0, 24).map((rg) =>
      h('button', { class: 'slot', title: `${rg.from}–${rg.to}`, onclick: () => { engine.setAttr(attr, ((rg.from + rg.to) / 2) / 255, { fan: false }); row.classList.add('touched'); } }, rg.label))) : null;
    row.append(
      h('div', { class: 'param-head' },
        h('span', { class: 'name' }, attrLabel(attr)),
        h('button', { class: 'param-x', title: 'Release from programmer', onclick: () => releaseAttr(attr) }, '×'),
        val,
      ),
      s,
    );
    if (slots) row.append(slots);
    controls.push({
      update() {
        const v = engine.displayValue(firstWith(attr), attr);
        s.setValue(v);
        val.textContent = fmt(v);
        if (slots) {
          const d = Math.round(v * 255);
          [...slots.children].forEach((b, i) => b.classList.toggle('active', d >= ranges[i].from && d <= ranges[i].to));
        }
      },
    });
    return row;
  }

  function releaseAttr(attr) {
    for (const fid of sel()) {
      const vals = engine.prog.values[fid];
      if (!vals) continue;
      delete vals[attr];
      if (!Object.keys(vals).length) delete engine.prog.values[fid];
    }
    engine.emit('programmer');
  }

  // ---- intensity --------------------------------------------------------
  function renderIntensity(attrs) {
    const big = h('div', { class: 'big-level' });
    body.append(h('div', { class: 'row', style: { marginBottom: '10px' } }, big));
    const quick = h('div', { class: 'quick' }, [0, 0.25, 0.5, 0.75, 1].map((v) =>
      btn(v === 1 ? 'Full' : v === 0 ? 'Out' : pct(v), () => engine.setAttr('dim', v, { fan: false }), { cls: 'sm' })));
    const row = paramRow('dim', { fill: 'var(--flash)' });
    body.append(row, quick);
    attrs.filter((a) => a !== 'dim').forEach((a) => body.append(paramRow(a, { fill: 'var(--flash)' })));
    controls.push({
      update() {
        const v = engine.displayValue(firstWith('dim'), 'dim');
        big.innerHTML = '';
        big.append(String(Math.round(v * 100)), h('small', null, '%'));
      },
    });
  }

  // ---- colour -----------------------------------------------------------
  function applyRgb(rgb) {
    for (const fid of sel()) {
      const ct = engine.ctFor(fid);
      if (ct) engine.setFixtureValues(fid, rgbToAttrs(rgb, ct));
    }
    engine.emit('programmer-values');
    markTouched();
  }
  function markTouched() {
    tabs.querySelectorAll('.feature-tab').forEach((t, i) => t.classList.toggle('touched', featureTouched(FEATURES[i].id)));
    body.querySelectorAll('.param').forEach((p) => p.classList.add('touched'));
  }

  function renderColor(attrs) {
    const canMix = attrs.some((a) => ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow'].includes(a)) ||
      attrs.includes('colorwheel');
    if (canMix) {
      body.append(colorWheel(applyRgb, () => {
        const fid = firstWith('red') ?? firstWith('cyan');
        if (fid == null) return null;
        const v = (a) => engine.displayValue(fid, a);
        const rgb = engine.ctFor(fid).map.red ? [v('red') + (v('white') || 0), v('green') + (v('white') || 0), v('blue') + (v('white') || 0)].map((x) => Math.min(1, x)) : [1 - v('cyan'), 1 - v('magenta'), 1 - v('yellow')];
        return rgbToHsv(...rgb);
      }, controls));
      body.append(h('div', { class: 'swatches' }, SWATCHES.map(([name, rgb]) =>
        h('div', { class: 'swatch', title: name, style: { background: `rgb(${rgb.map((x) => Math.round(x * 255)).join(',')})` }, onclick: () => applyRgb(rgb) }))));
    }
    const presets = engine.show.presets.color;
    if (presets.length) {
      body.append(h('div', { class: 'section-title' }, 'Colour presets'),
        h('div', { class: 'slots', style: { marginBottom: '14px' } }, presets.map((p) => h('button', { class: 'slot', onclick: () => engine.applyPreset('color', p.id) }, p.name))));
    }
    body.append(h('div', { class: 'section-title' }, 'Emitters'));
    const fills = { red: '#ff4d4d', green: '#3ddc84', blue: '#4d7cff', white: '#e8e8e8', warmwhite: '#ffd29a', amber: '#ffaa2b', lime: '#b4ff3b', uv: '#8a3dff', cyan: '#2be0ff', magenta: '#ff3dd8', yellow: '#ffe53b', cto: '#ffb46b' };
    attrs.forEach((a) => body.append(paramRow(a, { fill: fills[a] })));
  }

  // ---- position ---------------------------------------------------------
  function renderPosition(attrs) {
    const pad = h('div', { class: 'xy-pad' }, h('div', { class: 'crossh' }), h('div', { class: 'crossv' }));
    const dots = [];
    const movers = sel().filter((fid) => engine.ctFor(fid)?.hasPosition);
    movers.slice(0, 40).forEach((_, i) => {
      const d = h('div', { class: `xy-dot ${i ? 'secondary' : ''}` });
      dots.push(d);
      pad.append(d);
    });
    let start = null;
    const setFrom = (e) => {
      const r = pad.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
      if (e.shiftKey || engine.prog.fan) {
        engine.setAttr('pan', x);
        engine.setAttr('tilt', y);
      } else if (start) {
        // Move the whole selection relatively so spreads are kept.
        const dx = x - start.x, dy = y - start.y;
        for (const fid of movers) {
          const b = start.vals.get(fid);
          engine.setFixtureValues(fid, { pan: b.pan + dx, tilt: b.tilt + dy });
        }
      }
      markTouched();
    };
    pad.addEventListener('pointerdown', (e) => {
      pad.setPointerCapture(e.pointerId);
      const r = pad.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
      const vals = new Map(movers.map((fid) => [fid, { pan: engine.displayValue(fid, 'pan'), tilt: engine.displayValue(fid, 'tilt') }]));
      // Clicking jumps the first fixture there; others keep their offsets.
      const f0 = vals.get(movers[0]);
      start = { x: f0 ? f0.pan : x, y: f0 ? f0.tilt : y, vals };
      setFrom(e);
    });
    pad.addEventListener('pointermove', (e) => { if (start) setFrom(e); });
    pad.addEventListener('pointerup', () => (start = null));
    body.append(pad,
      h('div', { class: 'row', style: { marginBottom: '14px' } },
        btn('Centre', () => { engine.setAttr('pan', 0.5, { fan: false }); engine.setAttr('tilt', 0.5, { fan: false }); markTouched(); }, { cls: 'sm' }),
        h('span', { class: 'hint' }, 'Drag to move together · Shift-drag sets all to the same point'),
      ));
    const presets = engine.show.presets.position;
    if (presets.length) {
      body.append(h('div', { class: 'slots', style: { marginBottom: '14px' } }, presets.map((p) => h('button', { class: 'slot', onclick: () => engine.applyPreset('position', p.id) }, p.name))));
    }
    attrs.forEach((a) => body.append(paramRow(a)));
    controls.push({
      update() {
        movers.slice(0, 40).forEach((fid, i) => {
          dots[i].style.left = `${engine.displayValue(fid, 'pan') * 100}%`;
          dots[i].style.top = `${(1 - engine.displayValue(fid, 'tilt')) * 100}%`;
        });
      },
    });
  }

  function refresh(evt) {
    if (evt === 'programmer' || evt === 'show') render();
    else if (evt === 'programmer-values') {
      renderHeadTouched();
    }
  }
  function renderHeadTouched() {
    const has = engine.hasProgrammerData();
    foot.querySelectorAll('button').forEach((b) => (b.disabled = !has));
    tabs.querySelectorAll('.feature-tab').forEach((t, i) => t.classList.toggle('touched', featureTouched(FEATURES[i].id)));
    const clearBtn = head.querySelector('.prog-tools .btn:last-child');
    if (clearBtn && !sel().length) clearBtn.disabled = !has;
  }

  function frame() {
    for (const c of controls) c.update();
  }

  render();
  return { el, refresh, frame };
}

// Hue/saturation disc.
function colorWheel(onPick, current, controls) {
  const size = 240;
  const c = h('canvas', { class: 'color-wheel', width: size * 2, height: size * 2 });
  const g = c.getContext('2d');
  const img = g.createImageData(size * 2, size * 2);
  const R = size;
  for (let y = 0; y < size * 2; y++) {
    for (let x = 0; x < size * 2; x++) {
      const dx = x - R, dy = y - R;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size * 2 + x) * 4;
      if (d > R) { img.data[i + 3] = 0; continue; }
      const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
      const [r, gg, b] = hsvToRgb(hue, d / R, 1);
      img.data[i] = r * 255; img.data[i + 1] = gg * 255; img.data[i + 2] = b * 255;
      img.data[i + 3] = d > R - 1.5 ? (R - d) / 1.5 * 255 : 255;
    }
  }
  const base = img;
  let marker = null;
  const draw = () => {
    g.putImageData(base, 0, 0);
    const hsv = marker || current();
    if (!hsv) return;
    const [hh, s] = hsv;
    const a = hh * Math.PI * 2;
    const mx = R + Math.cos(a) * s * R, my = R + Math.sin(a) * s * R;
    g.beginPath();
    g.arc(mx, my, 12, 0, Math.PI * 2);
    g.lineWidth = 4;
    g.strokeStyle = '#fff';
    g.stroke();
    g.beginPath();
    g.arc(mx, my, 15, 0, Math.PI * 2);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(0,0,0,.6)';
    g.stroke();
  };
  let dragging = false;
  let last = '';
  const pick = (e) => {
    const r = c.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width * 2 - 1;
    const dy = (e.clientY - r.top) / r.height * 2 - 1;
    const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
    const sat = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    marker = [hue, sat, 1];
    onPick(hsvToRgb(hue, sat, 1));
    draw();
  };
  c.addEventListener('pointerdown', (e) => { dragging = true; c.setPointerCapture(e.pointerId); pick(e); });
  c.addEventListener('pointermove', (e) => dragging && pick(e));
  c.addEventListener('pointerup', () => { dragging = false; marker = null; });
  controls.push({
    update() {
      if (dragging) return;
      const hsv = current();
      const key = hsv ? hsv.map((x) => x.toFixed(3)).join() : '';
      if (key !== last) { last = key; draw(); }
    },
  });
  draw();
  return c;
}

// ---- Record sheet ------------------------------------------------------------
export function openRecordSheet(ctx, initial = 'cue') {
  const { engine } = ctx;
  let kind = initial;
  const content = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
  let commit = () => false;

  const renderCue = () => {
    const lists = engine.show.cuelists;
    let clId = ctx.currentCuelist() ?? 'new';
    const newName = h('input', { class: 'input', placeholder: 'e.g. Main Show', value: lists.length ? '' : 'Main Show' });
    const nextNum = (id) => {
      const cl = engine.cuelist(id);
      return cl?.cues.length ? Math.floor(cl.cues[cl.cues.length - 1].num) + 1 : 1;
    };
    const num = numberInput(nextNum(clId), () => {}, { min: 0, step: 0.1, cls: 'input num' });
    let mode = 'merge';
    const fade = numberInput(engine.show.settings.defaultFade, () => {}, { min: 0, step: 0.1, cls: 'input num' });
    const newWrap = field('New cuelist name', newName);
    const sync = () => {
      newWrap.style.display = clId === 'new' ? '' : 'none';
      num.value = nextNum(clId);
    };
    content.append(
      field('Cuelist', select([...lists.map((c) => ({ value: c.id, label: c.name })), { value: 'new', label: '+ New cuelist…' }], clId, (v) => { clId = v === 'new' ? 'new' : Number(v); sync(); })),
      newWrap,
      h('div', { class: 'grid3' },
        field('Cue number', num),
        field('Fade (seconds)', fade),
        field('If the cue exists', segmented([{ value: 'merge', label: 'Merge' }, { value: 'replace', label: 'Replace' }], mode, (v) => (mode = v))),
      ),
    );
    sync();
    commit = () => {
      let id = clId;
      if (id === 'new') {
        const cl = engine.createCuelist(newName.value.trim() || undefined);
        id = cl.id;
        const slot = engine.firstFreeSlot();
        if (slot != null) engine.assign(engine.page, slot, id);
      }
      const cue = engine.recordCue(id, { num: Number(num.value), mode });
      if (!cue) return toast('Programmer is empty', 'err'), false;
      engine.updateCue(id, cue.id, { fade: Number(fade.value) });
      ctx.setCurrentCuelist(id);
      toast(`Recorded cue ${cue.num} in ${engine.cuelist(id).name}`, 'ok');
      return true;
    };
  };

  const renderPreset = () => {
    const counts = Object.fromEntries(PRESET_FEATURES.map((f) => [f, 0]));
    for (const vals of Object.values(engine.prog.values)) for (const a of Object.keys(vals)) if (counts[attrFeature(a)] !== undefined) counts[attrFeature(a)]++;
    let feat = PRESET_FEATURES.find((f) => counts[f]) || 'color';
    const nextSlot = (f) => engine.show.presets[f].reduce((m, p) => Math.max(m, p.id), 0) + 1;
    const slotIn = numberInput(nextSlot(feat), () => {}, { min: 1, cls: 'input num' });
    const name = h('input', { class: 'input', placeholder: 'e.g. Deep Blue' });
    content.append(
      field('Type', select(PRESET_FEATURES.map((f) => ({ value: f, label: `${FEATURES.find((x) => x.id === f).label}${counts[f] ? ` (${counts[f]} values)` : ''}` })), feat, (v) => { feat = v; slotIn.value = nextSlot(v); })),
      h('div', { class: 'grid2' }, field('Slot', slotIn), field('Name', name)),
      h('div', { class: 'hint' }, 'Presets store only the values of that type (e.g. just colour) for the selected fixtures.'),
    );
    commit = () => {
      const p = engine.recordPreset(feat, Number(slotIn.value), name.value.trim());
      if (!p) return toast(`No ${feat} values in the programmer for the selection`, 'err'), false;
      toast(`Recorded preset “${p.name}”`, 'ok');
      return true;
    };
  };

  const renderGroup = () => {
    const name = h('input', { class: 'input', placeholder: 'e.g. Front Wash' });
    content.append(field('Group name', name), h('div', { class: 'hint' }, `${engine.prog.selection.length} fixtures will be stored in selection order.`));
    commit = () => {
      const g = engine.recordGroup(name.value.trim());
      if (!g) return toast('Select fixtures first', 'err'), false;
      toast(`Recorded group “${g.name}”`, 'ok');
      return true;
    };
  };

  const clearAfter = h('input', { type: 'checkbox', checked: true });
  const draw = () => {
    clear(content);
    content.append(segmented([{ value: 'cue', label: 'Cue' }, { value: 'preset', label: 'Preset' }, { value: 'group', label: 'Group' }], kind, (v) => { kind = v; draw(); }));
    ({ cue: renderCue, preset: renderPreset, group: renderGroup })[kind]();
    if (kind === 'cue') content.append(h('label', { class: 'row muted' }, clearAfter, 'Clear the programmer after recording'));
  };
  draw();
  modal({
    title: 'Record',
    body: content,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Record', cls: 'rec', onClick: () => {
          const ok = commit();
          if (ok && kind === 'cue' && clearAfter.checked) engine.clearAll();
          return ok;
        },
      },
    ],
  });
}
