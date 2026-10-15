// Scenes: the Basic interface's simple model on top of cuelists.
// A scene is a cuelist with one "look" (a snapshot of what's on stage).
// Tapping a scene fades out whatever else is on and brings this one in.

import { previewColor } from './color.js';
import { PAGES, PAGE_SIZE } from './engine.js';

const EPS = 0.01;
const clone = (o) => JSON.parse(JSON.stringify(o));

export function isLive(engine, id) {
  const rt = engine.rt.get(id);
  return !!rt?.active && rt.releaseStart == null;
}

// Everything that is currently lit, as cue values.
export function snapshotLook(engine) {
  const values = {};
  for (const f of engine.show.fixtures) {
    const ct = engine.compiled(f.typeId);
    const out = engine.out.get(f.id);
    if (!ct || !out) continue;
    const on = ct.has('dim')
      ? (out.dim ?? 0) > EPS
      : ct.attrs.some((a) => Math.abs((out[a] ?? 0) - ct.def(a)) > EPS);
    if (on) values[f.id] = { ...out };
  }
  return { values, effects: clone(engine.prog.effects) };
}

function assignAnywhere(engine, clId) {
  for (let p = 0; p < PAGES; p++) {
    for (let s = 0; s < PAGE_SIZE; s++) {
      const key = engine.slotKey(p, s);
      if (engine.show.playbacks[key] == null) {
        engine.show.playbacks[key] = clId;
        return;
      }
    }
  }
}

// Save what's on stage as a new scene. Returns the cuelist, or null if nothing is lit.
export function saveScene(engine, name, fade = 2) {
  const look = snapshotLook(engine);
  if (!Object.keys(look.values).length) return null;
  const id = engine.show.cuelists.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  const cl = {
    id,
    name: name || `Scene ${engine.show.cuelists.length + 1}`,
    mode: 'cueonly',
    loop: false,
    release: 1,
    cues: [{
      id: Math.random().toString(36).slice(2, 10), num: 1, name: '', fade, out: null, delay: 0,
      trigger: 'go', wait: 0, values: look.values, effects: look.effects, clearEffects: false,
    }],
  };
  engine.show.cuelists.push(cl);
  assignAnywhere(engine, id);
  engine.changed();
  engine.emit('playback');
  return cl;
}

// Turn a scene on (fading the others out), advance a multi-step one, or turn it off.
export function toggleScene(engine, id, now = performance.now()) {
  const cl = engine.cuelist(id);
  if (!cl?.cues.length) return;
  const rt = engine.rtOf(id);
  if (isLive(engine, id)) {
    if (!cl.loop && rt.index < cl.cues.length - 1) engine.go(id, now);
    else engine.release(id, now);
    return;
  }
  engine.clearAll();
  for (const c of engine.show.cuelists) if (c.id !== id && engine.rt.get(c.id)?.active) engine.release(c.id, now);
  rt.level = 1;
  engine.go(id, now);
}

// Turn a scene on with no fade (used right after saving, so the lights don't dip).
export function showSceneNow(engine, id, now = performance.now()) {
  toggleScene(engine, id, now);
  engine.rtOf(id).fadeStart = now - 1e7;
}

export function allOff(engine, now = performance.now()) {
  engine.releaseAll(now);
  engine.clearAll();
}

// Up to four representative colours for a scene's card.
export function sceneColors(engine, cl) {
  const cue = cl.cues[0];
  if (!cue) return [];
  const seen = new Map();
  for (const [fid, vals] of Object.entries(cue.values)) {
    const ct = engine.ctFor(fid);
    if (!ct) continue;
    if (ct.has('dim') && (vals.dim ?? 1) < 0.05) continue;
    const full = Object.fromEntries(ct.attrs.map((a) => [a, vals[a] ?? ct.def(a)]));
    const col = previewColor(full, ct);
    const key = col.map((c) => Math.round(c * 3)).join();
    const prev = seen.get(key);
    seen.set(key, { col, n: (prev?.n || 0) + 1 });
  }
  return [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 4).map((x) => x.col);
}
