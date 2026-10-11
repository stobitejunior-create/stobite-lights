// The lighting engine: show data, programmer, cuelist playback and DMX output.
//
// Merge order per frame:
//   cuelists (intensity HTP scaled by fader, everything else latest-GO wins)
//   -> cuelist effects -> programmer values -> programmer effects -> highlight
//   -> defaults -> grand master / blackout -> DMX.

import { LIBRARY, compileType } from './fixtures.js';
import { attrFeature, attrInfo } from './attributes.js';
import { applyEffect } from './effects.js';

export const PAGE_SIZE = 10;
export const PAGES = 20;
export const PRESET_FEATURES = ['intensity', 'color', 'position', 'beam', 'gobo'];

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyShow() {
  return {
    format: 'stobite-lights',
    version: 1,
    name: 'Untitled Show',
    types: [],
    fixtures: [],
    groups: [],
    presets: Object.fromEntries(PRESET_FEATURES.map((f) => [f, []])),
    cuelists: [],
    playbacks: {},
    settings: {
      grandMaster: 1,
      defaultFade: 2,
      outputs: {
        artnet: { enabled: true, iface: '', dest: 'broadcast', unicast: '', offset: 0 },
        sacn: { enabled: false, iface: '', priority: 100, unicast: '' },
        usb: [],
      },
      midi: { map: {} },
    },
  };
}

export function migrateShow(raw) {
  const base = emptyShow();
  const show = { ...base, ...raw };
  show.settings = { ...base.settings, ...(raw.settings || {}) };
  show.settings.outputs = { ...base.settings.outputs, ...(raw.settings?.outputs || {}) };
  show.settings.midi = { ...base.settings.midi, ...(raw.settings?.midi || {}) };
  show.presets = { ...base.presets, ...(raw.presets || {}) };
  for (const cl of show.cuelists) {
    cl.mode ??= 'tracking';
    cl.release ??= 1;
    for (const cue of cl.cues) {
      cue.values ??= {};
      cue.effects ??= [];
    }
  }
  return show;
}

export class Engine {
  constructor() {
    this.listeners = {};
    this.universes = new Map();
    this.out = new Map(); // fid -> final (pre-grand-master) values, for UI
    this.blackout = false;
    this.page = 0;
    this.load(emptyShow());
  }

  // ---- events -------------------------------------------------------------
  on(evt, fn) {
    (this.listeners[evt] ||= new Set()).add(fn);
    return () => this.listeners[evt].delete(fn);
  }
  emit(evt, data) {
    this.listeners[evt]?.forEach((fn) => fn(data));
  }

  load(show) {
    this.show = migrateShow(clone(show));
    this.rt = new Map();
    this.order = 0;
    this.prog = { selection: [], values: {}, effects: [], highlight: false, fan: false };
    this.page = 0;
    this.changed('show', false);
    this.emit('programmer');
    this.emit('playback');
  }

  // Call after any mutation of show data.
  changed(kind = 'show', dirty = true) {
    this.compiledCache = new Map();
    this.trackCache = new Map();
    this.fixById = new Map(this.show.fixtures.map((f) => [f.id, f]));
    this.emit(kind);
    if (kind !== 'show') this.emit('show-data');
    if (dirty) this.emit('dirty');
  }

  // ---- fixture types ------------------------------------------------------
  allTypes() {
    return [...LIBRARY, ...this.show.types];
  }
  getType(id) {
    return this.show.types.find((t) => t.id === id) || LIBRARY.find((t) => t.id === id);
  }
  compiled(typeId) {
    let ct = this.compiledCache.get(typeId);
    if (!ct) {
      const type = this.getType(typeId);
      if (!type) return null;
      ct = compileType(type);
      this.compiledCache.set(typeId, ct);
    }
    return ct;
  }
  ctFor(fid) {
    const f = this.fixById.get(Number(fid));
    return f ? this.compiled(f.typeId) : null;
  }
  addType(type) {
    const t = clone(type);
    t.id ||= 'user-' + uid();
    const i = this.show.types.findIndex((x) => x.id === t.id);
    if (i >= 0) this.show.types[i] = t;
    else this.show.types.push(t);
    this.changed();
    return t;
  }

  // ---- patch --------------------------------------------------------------
  nextFixtureId() {
    return this.show.fixtures.reduce((m, f) => Math.max(m, f.id), 0) + 1;
  }

  occupancy(universe, exceptIds = new Set()) {
    const used = new Array(513).fill(0);
    for (const f of this.show.fixtures) {
      if (f.universe !== universe || exceptIds.has(f.id)) continue;
      const fp = this.getType(f.typeId)?.channels.length || 1;
      for (let a = f.address; a < f.address + fp && a <= 512; a++) used[a]++;
    }
    return used;
  }

  findFreeAddress(universe, len) {
    const used = this.occupancy(universe);
    let run = 0;
    for (let a = 1; a <= 512; a++) {
      run = used[a] ? 0 : run + 1;
      if (run === len) return a - len + 1;
    }
    return null;
  }

  addFixtures({ typeId, count = 1, universe = 1, address = null, firstId = null, name = '' }) {
    const type = this.getType(typeId);
    if (!type) throw new Error('Unknown fixture type');
    const fp = type.channels.length;
    let u = universe;
    let a = address ?? this.findFreeAddress(u, fp * count) ?? this.findFreeAddress(u, fp);
    if (a == null) { u += 1; a = 1; }
    let id = firstId ?? this.nextFixtureId();
    const created = [];
    const startIndex = this.show.fixtures.length;
    for (let i = 0; i < count; i++) {
      while (this.fixById.has(id) || created.some((f) => f.id === id)) id++;
      if (a + fp - 1 > 512) { u += 1; a = 1; }
      const n = startIndex + i;
      created.push({
        id,
        name: `${name || type.name} ${i + 1}`,
        typeId,
        universe: u,
        address: a,
        x: ((n % 12) + 0.5) / 12,
        y: 0.15 + (Math.floor(n / 12) % 6) * 0.14,
      });
      a += fp;
      id++;
    }
    this.show.fixtures.push(...created);
    this.show.fixtures.sort((p, q) => p.id - q.id);
    this.changed();
    return created;
  }

  updateFixture(id, patch) {
    const f = this.fixById.get(id);
    if (!f) return;
    if (patch.id !== undefined && patch.id !== id && this.fixById.has(patch.id)) throw new Error(`Fixture ${patch.id} already exists`);
    Object.assign(f, patch);
    if (patch.id !== undefined && patch.id !== id) this.renumberRefs(id, patch.id);
    this.show.fixtures.sort((p, q) => p.id - q.id);
    this.changed();
  }

  renumberRefs(from, to) {
    const mapVals = (vals) => {
      if (vals[from] !== undefined) { vals[to] = vals[from]; delete vals[from]; }
    };
    this.show.groups.forEach((g) => (g.fixtures = g.fixtures.map((x) => (x === from ? to : x))));
    Object.values(this.show.presets).flat().forEach((p) => mapVals(p.values));
    this.show.cuelists.forEach((cl) => cl.cues.forEach((cue) => {
      mapVals(cue.values);
      cue.effects.forEach((fx) => (fx.fixtures = fx.fixtures.map((x) => (x === from ? to : x))));
    }));
    mapVals(this.prog.values);
    this.prog.selection = this.prog.selection.map((x) => (x === from ? to : x));
  }

  removeFixtures(ids) {
    const set = new Set(ids);
    const strip = (vals) => ids.forEach((id) => delete vals[id]);
    this.show.fixtures = this.show.fixtures.filter((f) => !set.has(f.id));
    this.show.groups.forEach((g) => (g.fixtures = g.fixtures.filter((x) => !set.has(x))));
    Object.values(this.show.presets).flat().forEach((p) => strip(p.values));
    this.show.cuelists.forEach((cl) => cl.cues.forEach((cue) => {
      strip(cue.values);
      cue.effects.forEach((fx) => (fx.fixtures = fx.fixtures.filter((x) => !set.has(x))));
    }));
    strip(this.prog.values);
    this.prog.effects.forEach((fx) => (fx.fixtures = fx.fixtures.filter((x) => !set.has(x))));
    this.prog.selection = this.prog.selection.filter((x) => !set.has(x));
    this.changed();
    this.emit('programmer');
  }

  // Fixture ids that overlap another fixture or run past channel 512.
  conflicts() {
    const bad = new Set();
    const byU = new Map();
    for (const f of this.show.fixtures) {
      const fp = this.getType(f.typeId)?.channels.length || 1;
      if (f.address < 1 || f.address + fp - 1 > 512) bad.add(f.id);
      if (!byU.has(f.universe)) byU.set(f.universe, []);
      byU.get(f.universe).push([f.address, f.address + fp - 1, f.id]);
    }
    for (const list of byU.values()) {
      list.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < list.length; i++) {
        for (let j = i - 1; j >= 0 && list[j][1] >= list[i][0]; j--) {
          bad.add(list[i][2]);
          bad.add(list[j][2]);
        }
      }
    }
    return bad;
  }

  usedUniverses() {
    return [...new Set(this.show.fixtures.map((f) => f.universe))].sort((a, b) => a - b);
  }

  // ---- selection & groups -------------------------------------------------
  select(ids, mode = 'set') {
    const valid = ids.map(Number).filter((id) => this.fixById.has(id));
    const sel = this.prog.selection;
    if (mode === 'set') this.prog.selection = [...new Set(valid)];
    else if (mode === 'add') this.prog.selection = [...new Set([...sel, ...valid])];
    else if (mode === 'remove') this.prog.selection = sel.filter((x) => !valid.includes(x));
    else if (mode === 'toggle') {
      const s = new Set(sel);
      valid.forEach((id) => (s.has(id) ? s.delete(id) : s.add(id)));
      this.prog.selection = sel.filter((x) => s.has(x)).concat(valid.filter((x) => s.has(x) && !sel.includes(x)));
    }
    this.emit('programmer');
  }

  recordGroup(name) {
    if (!this.prog.selection.length) return null;
    const id = this.show.groups.reduce((m, g) => Math.max(m, g.id), 0) + 1;
    const g = { id, name: name || `Group ${id}`, fixtures: [...this.prog.selection] };
    this.show.groups.push(g);
    this.changed();
    return g;
  }
  selectGroup(id, mode = 'set') {
    const g = this.show.groups.find((x) => x.id === id);
    if (g) this.select(g.fixtures, mode);
  }
  deleteGroup(id) {
    this.show.groups = this.show.groups.filter((g) => g.id !== id);
    this.changed();
  }

  // ---- programmer ---------------------------------------------------------
  setAttr(attr, v, { fids = this.prog.selection, fan = this.prog.fan } = {}) {
    const list = fids.filter((fid) => this.ctFor(fid)?.has(attr));
    const n = list.length;
    const positional = attrFeature(attr) === 'position';
    list.forEach((fid, i) => {
      let val = v;
      if (fan && n > 1) {
        val = positional ? 0.5 + (v - 0.5) * ((2 * i) / (n - 1) - 1) : v * ((i + 1) / n);
      }
      (this.prog.values[fid] ||= {})[attr] = clamp(val);
    });
    this.emit('programmer-values');
  }

  setFixtureValues(fid, vals) {
    const ct = this.ctFor(fid);
    if (!ct) return;
    const target = (this.prog.values[fid] ||= {});
    for (const [a, v] of Object.entries(vals)) if (ct.has(a)) target[a] = clamp(v);
    this.emit('programmer-values');
  }

  releaseAttrs(feature, fids = this.prog.selection) {
    for (const fid of fids) {
      const vals = this.prog.values[fid];
      if (!vals) continue;
      for (const a of Object.keys(vals)) if (!feature || attrFeature(a) === feature) delete vals[a];
      if (!Object.keys(vals).length) delete this.prog.values[fid];
    }
    this.emit('programmer');
  }

  // First press clears the selection, the next clears the programmer.
  clear() {
    if (this.prog.selection.length) this.prog.selection = [];
    else {
      this.prog.values = {};
      this.prog.effects = [];
      this.prog.highlight = false;
    }
    this.emit('programmer');
  }

  clearAll() {
    this.prog.selection = [];
    this.prog.values = {};
    this.prog.effects = [];
    this.prog.highlight = false;
    this.emit('programmer');
  }

  // Value shown for an attribute: programmer first, otherwise live output.
  displayValue(fid, attr) {
    return this.prog.values[fid]?.[attr] ?? this.out.get(fid)?.[attr] ?? this.ctFor(fid)?.def(attr) ?? 0;
  }

  addEffect(fx) {
    this.prog.effects.push(fx);
    this.emit('programmer');
  }
  updateEffect(id, patch) {
    const fx = this.prog.effects.find((e) => e.id === id);
    if (fx) Object.assign(fx, patch);
    this.emit('programmer-values');
  }
  removeEffect(id) {
    this.prog.effects = this.prog.effects.filter((e) => e.id !== id);
    this.emit('programmer');
  }

  hasProgrammerData() {
    return Object.keys(this.prog.values).length > 0 || this.prog.effects.length > 0;
  }

  // ---- presets ------------------------------------------------------------
  recordPreset(feature, slot, name) {
    const fids = this.prog.selection.length ? this.prog.selection : Object.keys(this.prog.values).map(Number);
    const values = {};
    const byType = {};
    for (const fid of fids) {
      const vals = this.prog.values[fid];
      if (!vals) continue;
      const picked = Object.fromEntries(Object.entries(vals).filter(([a]) => attrFeature(a) === feature));
      if (!Object.keys(picked).length) continue;
      values[fid] = picked;
      const typeId = this.fixById.get(fid)?.typeId;
      if (typeId && !byType[typeId]) byType[typeId] = picked;
    }
    if (!Object.keys(values).length) return null;
    const list = this.show.presets[feature];
    const existing = list.find((p) => p.id === slot);
    const p = { id: slot, name: name || existing?.name || `${feature[0].toUpperCase()}${feature.slice(1)} ${slot}`, values, byType };
    if (existing) Object.assign(existing, p);
    else {
      list.push(p);
      list.sort((a, b) => a.id - b.id);
    }
    this.changed();
    return p;
  }

  applyPreset(feature, slot) {
    const p = this.show.presets[feature].find((x) => x.id === slot);
    if (!p) return;
    for (const fid of this.prog.selection) {
      const vals = p.values[fid] || p.byType[this.fixById.get(fid)?.typeId];
      if (vals) Object.assign((this.prog.values[fid] ||= {}), vals);
    }
    this.emit('programmer');
  }

  deletePreset(feature, slot) {
    this.show.presets[feature] = this.show.presets[feature].filter((p) => p.id !== slot);
    this.changed();
  }

  // ---- cuelists -----------------------------------------------------------
  cuelist(id) {
    return this.show.cuelists.find((c) => c.id === id);
  }

  createCuelist(name) {
    const id = this.show.cuelists.reduce((m, c) => Math.max(m, c.id), 0) + 1;
    const cl = { id, name: name || `Cuelist ${id}`, mode: 'tracking', loop: false, release: 1, cues: [] };
    this.show.cuelists.push(cl);
    this.changed();
    return cl;
  }

  updateCuelist(id, patch) {
    Object.assign(this.cuelist(id), patch);
    this.changed();
  }

  deleteCuelist(id) {
    this.show.cuelists = this.show.cuelists.filter((c) => c.id !== id);
    for (const [k, v] of Object.entries(this.show.playbacks)) if (v === id) delete this.show.playbacks[k];
    this.rt.delete(id);
    this.changed();
    this.emit('playback');
  }

  // Record the programmer into a cue. mode: 'merge' into an existing cue or 'replace' it.
  recordCue(clId, { num = null, mode = 'merge' } = {}) {
    if (!this.hasProgrammerData()) return null;
    const cl = this.cuelist(clId);
    if (!cl) return null;
    if (num == null) num = cl.cues.length ? Math.floor(cl.cues[cl.cues.length - 1].num) + 1 : 1;
    const values = clone(this.prog.values);
    const effects = clone(this.prog.effects);
    let cue = cl.cues.find((c) => Math.abs(c.num - num) < 1e-9);
    if (cue && mode === 'merge') {
      for (const [fid, vals] of Object.entries(values)) cue.values[fid] = { ...cue.values[fid], ...vals };
      for (const fx of effects) {
        const i = cue.effects.findIndex((e) => e.id === fx.id);
        if (i >= 0) cue.effects[i] = fx;
        else cue.effects.push(fx);
      }
    } else if (cue) {
      cue.values = values;
      cue.effects = effects;
    } else {
      cue = { id: uid(), num, name: '', fade: this.show.settings.defaultFade, out: null, delay: 0, trigger: 'go', wait: 0, values, effects, clearEffects: false };
      cl.cues.push(cue);
      cl.cues.sort((a, b) => a.num - b.num);
    }
    this.changed();
    return cue;
  }

  // Merge the programmer into the cue currently live on this cuelist.
  updateActiveCue(clId) {
    const rt = this.rt.get(clId);
    const cl = this.cuelist(clId);
    if (!rt?.active || !cl?.cues[rt.index]) return null;
    return this.recordCue(clId, { num: cl.cues[rt.index].num, mode: 'merge' });
  }

  updateCue(clId, cueId, patch) {
    const cl = this.cuelist(clId);
    const cue = cl?.cues.find((c) => c.id === cueId);
    if (!cue) return;
    Object.assign(cue, patch);
    if (patch.num !== undefined) cl.cues.sort((a, b) => a.num - b.num);
    this.changed();
  }

  deleteCue(clId, cueId) {
    const cl = this.cuelist(clId);
    if (!cl) return;
    const rt = this.rt.get(clId);
    const idx = cl.cues.findIndex((c) => c.id === cueId);
    cl.cues.splice(idx, 1);
    if (rt?.active && rt.index >= cl.cues.length) {
      rt.index = cl.cues.length - 1;
      if (rt.index < 0) rt.active = false;
    }
    this.changed();
    this.emit('playback');
  }

  // Load a cue's contents into the programmer for editing.
  loadCueToProgrammer(clId, cueId) {
    const cue = this.cuelist(clId)?.cues.find((c) => c.id === cueId);
    if (!cue) return;
    this.prog.values = clone(cue.values);
    this.prog.effects = clone(cue.effects);
    this.emit('programmer');
  }

  // ---- playback slots -----------------------------------------------------
  slotKey(page, slot) {
    return `${page}:${slot}`;
  }
  slotCuelist(page, slot) {
    return this.show.playbacks[this.slotKey(page, slot)] ?? null;
  }
  assign(page, slot, clId) {
    const k = this.slotKey(page, slot);
    if (clId == null) delete this.show.playbacks[k];
    else this.show.playbacks[k] = clId;
    this.changed();
    this.emit('playback');
  }
  firstFreeSlot(page = this.page) {
    for (let s = 0; s < PAGE_SIZE; s++) if (this.slotCuelist(page, s) == null) return s;
    return null;
  }

  // ---- runtime ------------------------------------------------------------
  rtOf(clId) {
    let rt = this.rt.get(clId);
    if (!rt) {
      rt = { active: false, index: -1, level: 1, flash: false, flashActivated: false, fadeStart: 0, from: {}, order: 0, releaseStart: null };
      this.rt.set(clId, rt);
    }
    return rt;
  }

  go(clId, now = performance.now()) {
    const cl = this.cuelist(clId);
    if (!cl?.cues.length) return;
    const rt = this.rtOf(clId);
    let next = rt.active && rt.releaseStart == null ? rt.index + 1 : 0;
    if (next >= cl.cues.length) {
      if (!cl.loop) return;
      next = 0;
    }
    this._goto(cl, rt, next, now);
  }

  back(clId, now = performance.now()) {
    const cl = this.cuelist(clId);
    const rt = this.rtOf(clId);
    if (!cl || !rt.active) return;
    let prev = rt.index - 1;
    if (prev < 0) {
      if (!cl.loop) return;
      prev = cl.cues.length - 1;
    }
    this._goto(cl, rt, prev, now);
  }

  gotoCue(clId, index, now = performance.now()) {
    const cl = this.cuelist(clId);
    if (!cl?.cues[index]) return;
    this._goto(cl, this.rtOf(clId), index, now);
  }

  release(clId, now = performance.now()) {
    const rt = this.rt.get(clId);
    if (!rt?.active) return;
    const cl = this.cuelist(clId);
    if (!cl || !(cl.release > 0)) this._deactivate(rt);
    else rt.releaseStart = now;
    this.emit('playback');
  }

  releaseAll(now = performance.now()) {
    for (const id of this.rt.keys()) this.release(id, now);
  }

  setLevel(clId, level, now = performance.now()) {
    const rt = this.rtOf(clId);
    const was = rt.level;
    rt.level = clamp(level);
    if ((!rt.active || rt.releaseStart != null) && was === 0 && rt.level > 0) this.go(clId, now);
    this.emit('level', clId);
  }

  flash(clId, on, now = performance.now()) {
    const rt = this.rtOf(clId);
    rt.flash = on;
    if (on && !rt.active) {
      this.go(clId, now);
      rt.flashActivated = rt.active;
    } else if (!on && rt.flashActivated) {
      rt.flashActivated = false;
      this._deactivate(rt);
    }
    this.emit('playback');
  }

  _deactivate(rt) {
    rt.active = false;
    rt.index = -1;
    rt.releaseStart = null;
    rt.from = {};
  }

  _goto(cl, rt, idx, now) {
    const live = rt.active && rt.releaseStart == null;
    const from = live ? this._cuelistValues(cl, rt, now) : {};
    const target = this.tracked(cl, idx).values;
    // Start moves from wherever the fixture currently is, not from defaults.
    for (const [fid, vals] of Object.entries(target)) {
      for (const attr of Object.keys(vals)) {
        const f = (from[fid] ||= {});
        if (f[attr] === undefined) f[attr] = attr === 'dim' ? 0 : this.out.get(Number(fid))?.[attr] ?? vals[attr];
      }
    }
    rt.from = from;
    rt.index = idx;
    rt.active = true;
    rt.releaseStart = null;
    rt.fadeStart = now;
    rt.order = ++this.order;
    this.emit('playback');
  }

  // Values a cue state contributes (tracked through earlier cues unless cue-only).
  tracked(cl, idx) {
    const key = `${cl.id}:${idx}`;
    let t = this.trackCache.get(key);
    if (t) return t;
    if (cl.mode === 'cueonly') {
      const cue = cl.cues[idx];
      t = { values: cue?.values || {}, effects: cue?.effects || [] };
    } else {
      const values = {};
      const fx = new Map();
      for (let i = 0; i <= idx && i < cl.cues.length; i++) {
        const cue = cl.cues[i];
        for (const [fid, vals] of Object.entries(cue.values)) values[fid] = { ...values[fid], ...vals };
        if (cue.clearEffects) fx.clear();
        for (const e of cue.effects) fx.set(e.id, e);
      }
      t = { values, effects: [...fx.values()] };
    }
    this.trackCache.set(key, t);
    return t;
  }

  cueDuration(cue) {
    return (cue.delay || 0) + Math.max(cue.fade || 0, cue.out ?? cue.fade ?? 0);
  }

  _cuelistValues(cl, rt, now) {
    const cue = cl.cues[rt.index];
    if (!cue) return {};
    const target = this.tracked(cl, rt.index).values;
    const t = (now - rt.fadeStart) / 1000 - (cue.delay || 0);
    const res = {};
    const fids = new Set([...Object.keys(rt.from), ...Object.keys(target)]);
    for (const fid of fids) {
      const a = rt.from[fid] || {};
      const b = target[fid] || {};
      const o = {};
      for (const attr of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const va = a[attr];
        let vb = b[attr];
        const isDim = attr === 'dim';
        if (vb === undefined && isDim) vb = 0;
        const time = isDim && vb < (va ?? 0) ? cue.out ?? cue.fade : cue.fade;
        const p = t < 0 ? 0 : time > 0 ? clamp(t / time) : 1;
        if (vb === undefined) {
          if (p < 1) o[attr] = va; // released by a cue-only step: hold until the fade ends
          continue;
        }
        if (va === undefined) o[attr] = vb;
        else if (this.isSnap(fid, attr)) o[attr] = t >= 0 ? vb : va;
        else o[attr] = va + (vb - va) * p;
      }
      res[fid] = o;
    }
    return res;
  }

  isSnap(fid, attr) {
    return !!attrInfo(attr).snap;
  }

  // Auto-follow / wait cues and finished releases.
  tick(now) {
    for (const [clId, rt] of this.rt) {
      if (!rt.active) continue;
      const cl = this.cuelist(clId);
      if (!cl) {
        this.rt.delete(clId);
        continue;
      }
      if (rt.releaseStart != null) {
        if (now - rt.releaseStart >= (cl.release || 0) * 1000) {
          this._deactivate(rt);
          this.emit('playback');
        }
        continue;
      }
      const cue = cl.cues[rt.index];
      if (!cue) continue;
      let ni = rt.index + 1;
      if (ni >= cl.cues.length) {
        if (!cl.loop || cl.cues.length < 2) continue;
        ni = 0;
      }
      const next = cl.cues[ni];
      const el = (now - rt.fadeStart) / 1000;
      if (next.trigger === 'follow' && el >= Math.max(0.03, this.cueDuration(cue))) this._goto(cl, rt, ni, now);
      else if (next.trigger === 'wait' && el >= Math.max(0.03, next.wait || 0)) this._goto(cl, rt, ni, now);
    }
  }

  universe(u) {
    let buf = this.universes.get(u);
    if (!buf) this.universes.set(u, (buf = new Uint8Array(512)));
    return buf;
  }

  // Compute one frame; fills this.universes and this.out.
  compute(now = performance.now()) {
    this.tick(now);
    const values = new Map();
    const get = (fid) => {
      let o = values.get(fid);
      if (!o) values.set(fid, (o = {}));
      return o;
    };
    const ctFn = (fid) => this.ctFor(fid);
    const fallback = (fid, attr) => this.ctFor(fid)?.def(attr) ?? 0;
    const timeSec = now / 1000;
    const dimMax = new Map();

    const actives = [];
    for (const [clId, rt] of this.rt) {
      if (!rt.active) continue;
      const cl = this.cuelist(clId);
      if (cl) actives.push({ cl, rt });
    }
    actives.sort((a, b) => a.rt.order - b.rt.order);

    for (const { cl, rt } of actives) {
      let lvl = rt.flash ? 1 : rt.level;
      if (rt.releaseStart != null) lvl *= 1 - clamp((now - rt.releaseStart) / 1000 / Math.max(cl.release || 0, 0.001));
      const base = this._cuelistValues(cl, rt, now);
      const m = new Map();
      for (const [fid, vals] of Object.entries(base)) m.set(Number(fid), { ...vals });
      for (const fx of this.tracked(cl, rt.index).effects) applyEffect(fx, timeSec, m, ctFn, fallback);
      for (const [fid, vals] of m) {
        for (const [attr, v] of Object.entries(vals)) {
          if (attr === 'dim') dimMax.set(fid, Math.max(dimMax.get(fid) ?? 0, v * lvl));
          else get(fid)[attr] = v;
        }
      }
    }
    for (const [fid, d] of dimMax) get(fid).dim = d;

    for (const [fid, vals] of Object.entries(this.prog.values)) Object.assign(get(Number(fid)), vals);
    for (const fx of this.prog.effects) applyEffect(fx, timeSec, values, ctFn, fallback);

    if (this.prog.highlight) {
      for (const fid of this.prog.selection) {
        const ct = this.ctFor(fid);
        if (ct) Object.assign(get(fid), highlightValues(ct));
      }
    }

    const gm = this.blackout ? 0 : this.show.settings.grandMaster;
    for (const buf of this.universes.values()) buf.fill(0);
    const out = new Map();
    for (const f of this.show.fixtures) {
      const ct = this.compiled(f.typeId);
      if (!ct) continue;
      const v = values.get(f.id) || {};
      const fin = {};
      for (const attr of ct.attrs) fin[attr] = clamp(v[attr] ?? ct.def(attr));
      out.set(f.id, fin);
      const buf = this.universe(f.universe);
      const base = f.address - 1;
      const dim = fin.dim ?? 1;
      for (const [attr, ch] of Object.entries(ct.map)) {
        let x = fin[attr];
        if (attr === 'dim') x *= gm;
        else if (ct.virtualDim && ct.colorAttrs.includes(attr)) x *= dim * gm;
        writeChannel(buf, base, ch, x);
      }
    }
    this.out = out;
    return this.universes;
  }
}

function writeChannel(buf, base, ch, x) {
  const ci = base + ch.coarse;
  if (ch.fine >= 0) {
    const w = Math.round(clamp(x) * 65535);
    if (ci >= 0 && ci < 512) buf[ci] = w >> 8;
    const fi = base + ch.fine;
    if (fi >= 0 && fi < 512) buf[fi] = w & 255;
  } else if (ci >= 0 && ci < 512) buf[ci] = Math.round(clamp(x) * 255);
}

function highlightValues(ct) {
  const hv = { dim: 1 };
  for (const a of ['red', 'green', 'blue', 'white']) if (ct.map[a]) hv[a] = 1;
  for (const a of ['cyan', 'magenta', 'yellow', 'cto', 'colorwheel', 'gobo', 'prism', 'frost', 'iris', 'amber', 'uv', 'lime', 'warmwhite']) if (ct.map[a]) hv[a] = 0;
  if (ct.map.shutter) hv.shutter = ct.map.shutter.def;
  if (ct.map.strobe) hv.strobe = ct.map.strobe.def;
  return hv;
}
