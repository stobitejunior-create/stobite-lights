// App shell: layout, tabs, show files, undo, keyboard, output loop.

import { Engine, emptyShow } from './engine/engine.js';
import { runCommand } from './engine/command.js';
import { desk } from './io/bridge.js';
import { UsbManager } from './io/usb.js';
import { MidiManager } from './io/midi.js';
import { h, clear, icon, modal, promptDialog, toast, popupMenu, slider, pct } from './ui/dom.js';
import { allOff } from './engine/scenes.js';
import { createProgrammer } from './ui/programmer.js';
import { createWing } from './ui/playbacks.js';
import { createFixturesView } from './ui/fixtures-view.js';
import { createStageView } from './ui/stage-view.js';
import { createCuesView } from './ui/cues-view.js';
import { createPresetsView } from './ui/presets-view.js';
import { createEffectsView } from './ui/effects-view.js';
import { createPatchView } from './ui/patch-view.js';
import { createOutputView } from './ui/output-view.js';
import { createSettingsView } from './ui/settings-view.js';
import { createScenesView } from './ui/scenes-view.js';
import { createLightsView } from './ui/lights-view.js';
import { createBasicSettings } from './ui/basic-setup.js';

const engine = new Engine();
const usb = new UsbManager();

function readMode() {
  try { return localStorage.getItem('sl-mode') === 'advanced' ? 'advanced' : 'basic'; } catch { return 'basic'; }
}

const ui = {
  mode: readMode(),
  tab: 'scenes',
  currentCuelist: null,
  filePath: null,
  dirty: false,
};

const TABS_ADV = [
  { id: 'fixtures', label: 'Fixtures', create: createFixturesView },
  { id: 'stage', label: 'Stage', create: createStageView },
  { id: 'cues', label: 'Cues', create: createCuesView },
  { id: 'presets', label: 'Presets', create: createPresetsView },
  { id: 'effects', label: 'Effects', create: createEffectsView },
  { id: 'patch', label: 'Patch', create: createPatchView },
  { id: 'output', label: 'DMX Output', create: createOutputView },
  { id: 'settings', label: 'Settings', create: createSettingsView },
];
const TABS_BASIC = [
  { id: 'scenes', label: 'Scenes', create: createScenesView },
  { id: 'lights', label: 'Lights', create: createLightsView },
  { id: 'setup', label: 'Settings', create: createBasicSettings },
];
const tabsFor = () => (ui.mode === 'basic' ? TABS_BASIC : TABS_ADV);
const settingsTab = () => (ui.mode === 'basic' ? 'setup' : 'settings');

// ---- undo -----------------------------------------------------------------
const undo = { past: [], future: [], snapshot: null, restoring: false };
function snapshotNow() {
  undo.snapshot = JSON.stringify(engine.show);
}
function restoreShow(json) {
  undo.restoring = true;
  const prog = engine.prog;
  const rt = engine.rt;
  const page = engine.page;
  engine.load(JSON.parse(json));
  engine.prog = prog;
  engine.prog.selection = prog.selection.filter((id) => engine.fixById.has(id));
  engine.rt = rt;
  engine.page = page;
  engine.emit('programmer');
  engine.emit('playback');
  undo.restoring = false;
  snapshotNow();
  setDirty(true);
}
function doUndo() {
  if (!undo.past.length) return toast('Nothing to undo');
  undo.future.push(undo.snapshot);
  restoreShow(undo.past.pop());
  toast('Undone');
}
function doRedo() {
  if (!undo.future.length) return toast('Nothing to redo');
  undo.past.push(undo.snapshot);
  restoreShow(undo.future.pop());
  toast('Redone');
}

// ---- context passed to views ---------------------------------------------
const ctx = {
  engine,
  ui,
  usb,
  desk,
  midi: null,
  setTab,
  mode: () => ui.mode,
  setMode,
  save,
  openShow,
  newShow,
  setCurrentCuelist(id) {
    ui.currentCuelist = id;
    engine.emit('current');
  },
  currentCuelist() {
    if (ui.currentCuelist != null && engine.cuelist(ui.currentCuelist)) return ui.currentCuelist;
    return engine.slotCuelist(engine.page, 0) ?? engine.show.cuelists[0]?.id ?? null;
  },
  pushOutputs,
  undo: doUndo,
  redo: doRedo,
};

// ---- layout ---------------------------------------------------------------
const root = document.getElementById('app');
const tabBar = h('nav', { class: 'tabs' });
const showName = h('div', { class: 'show-name', title: 'Show file' });
const statusPill = h('div', { class: 'status-pill', onclick: () => setTab(settingsTab()) }, h('span', { class: 'dot' }), h('span', null, 'Output'));
const blackoutBtn = h('button', { class: 'btn adv-only', title: 'Blackout (all intensity to zero)', onclick: () => toggleBlackout() }, 'Blackout');
const undoBtn = h('button', { class: 'btn ghost adv-only', title: 'Undo (Ctrl+Z)', onclick: doUndo }, icon('undo'));

const topbar = h('header', { class: 'topbar' },
  h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }), 'Stobite Lights'),
  showName,
  tabBar,
  h('div', { class: 'top-right' }, undoBtn, statusPill, blackoutBtn),
);

const viewHost = h('div', { class: 'view', id: 'view' });
const cmdInput = h('input', { placeholder: 'Type a command — e.g. 1 thru 8 @ 50, group 2 @ full, record cue 5', spellcheck: false });
const cmdFeedback = h('div', { class: 'cmd-feedback' });
const cmdBar = h('div', { class: 'cmdbar', style: { padding: '10px 20px 12px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '4px' } },
  h('div', { class: 'cmd' }, h('span', { class: 'prompt' }, '›'), cmdInput),
  cmdFeedback,
);
const main = h('main', { class: 'main' }, viewHost, cmdBar);

const programmer = createProgrammer(ctx);
const wing = createWing(ctx);

// Basic mode: one big brightness slider and two buttons instead of the wing.
const bbSlider = slider(engine.show.settings.grandMaster, (v) => { engine.show.settings.grandMaster = v; }, { fill: 'var(--flash)' });
const bbVal = h('span', { class: 'mono bb-val' });
const bbOff = h('button', { class: 'btn lg', title: 'Fade every light out', onclick: () => { allOff(engine); toast('Lights fading out'); } }, 'Lights off');
const bbBlackout = h('button', { class: 'btn lg', title: 'Instantly kill all light (tap again to restore)', onclick: () => toggleBlackout() }, 'Blackout');
const basicBar = h('div', { class: 'basic-bar' },
  h('div', { class: 'bb-master' }, h('span', { class: 'label' }, 'Brightness'), bbSlider, bbVal),
  h('div', { class: 'spacer' }), bbOff, bbBlackout);

root.append(topbar, main, programmer.el, wing.el, basicBar);
applyModeClass();

function applyModeClass() {
  root.classList.toggle('basic', ui.mode === 'basic');
  document.body.classList.toggle('basic', ui.mode === 'basic');
}

function setMode(m) {
  if (m === ui.mode) return;
  ui.mode = m;
  try { localStorage.setItem('sl-mode', m); } catch {}
  applyModeClass();
  setTab(settingsTab()); // stay on Settings so the switch feels instant
  toast(m === 'basic' ? 'Basic interface' : 'Advanced interface — everything is unlocked');
}

let view = null;
function setTab(id) {
  ui.tab = id;
  view?.destroy?.();
  clear(viewHost);
  const tabs = tabsFor();
  const t = tabs.find((x) => x.id === id) || tabs[0];
  ui.tab = t.id;
  view = t.create(ctx);
  viewHost.append(view.el);
  renderTabs();
  try { localStorage.setItem(`sl-tab-${ui.mode}`, t.id); } catch {}
}

function renderTabs() {
  clear(tabBar);
  for (const t of tabsFor()) tabBar.append(h('button', { class: `tab ${ui.tab === t.id ? 'active' : ''}`, onclick: () => setTab(t.id) }, t.label));
}

function renderShowName() {
  clear(showName);
  showName.append(icon('folder'), h('span', null, engine.show.name || 'Untitled Show'));
  if (ui.dirty) showName.append(h('span', { class: 'dirty', title: 'Unsaved changes' }));
}
showName.onclick = () => popupMenu(showName, [
  { label: 'New show', icon: 'plus', onClick: newShow },
  { label: 'Open show…', icon: 'folder', onClick: openShow },
  { label: 'Save', icon: 'save', onClick: () => save() },
  { label: 'Save as…', icon: 'copy', onClick: () => save(true) },
  '-',
  { label: 'Rename show…', icon: 'edit', onClick: renameShow },
]);

async function renameShow() {
  const name = await promptDialog('Rename show', 'Show name', engine.show.name);
  if (name) {
    engine.show.name = name;
    engine.changed();
  }
}

function toggleBlackout(force) {
  engine.blackout = force ?? !engine.blackout;
  for (const b of [blackoutBtn, bbBlackout]) {
    b.classList.toggle('blackout-on', engine.blackout);
    b.textContent = engine.blackout ? 'Blackout ON' : 'Blackout';
  }
}
ctx.toggleBlackout = toggleBlackout;

// ---- dirty / autosave ------------------------------------------------------
let autosavePending = false;
function setDirty(d) {
  ui.dirty = d;
  autosavePending = true;
  renderShowName();
}

engine.on('dirty', () => {
  if (!undo.restoring && undo.snapshot) {
    undo.past.push(undo.snapshot);
    if (undo.past.length > 100) undo.past.shift();
    undo.future = [];
  }
  snapshotNow();
  setDirty(true);
});

setInterval(() => {
  if (!autosavePending) return;
  autosavePending = false;
  desk.autosave(JSON.stringify({ show: engine.show, filePath: ui.filePath, dirty: ui.dirty }));
}, 3000);

async function save(saveAs = false) {
  const data = JSON.stringify(engine.show, null, 1);
  const suggested = ui.filePath || `${(engine.show.name || 'Show').replace(/[\\/:*?"<>|]/g, '')}.slshow`;
  const p = await desk.saveShow({ data, filePath: ui.filePath ? ui.filePath : desk.isWeb ? suggested : null, saveAs: saveAs || !ui.filePath });
  if (!p) return false;
  ui.filePath = p;
  setDirty(false);
  toast('Show saved', 'ok');
  return true;
}

async function openShow() {
  const r = await desk.openShow();
  if (!r) return;
  try {
    const json = JSON.parse(r.data);
    if (!json.fixtures || !json.cuelists) throw new Error('Not a Stobite Lights show file');
    engine.load(json);
    ui.filePath = r.filePath;
    ui.currentCuelist = null;
    resetUndo();
    setDirty(false);
    toast(`Opened ${engine.show.name}`, 'ok');
  } catch (e) {
    toast(`Couldn't open show: ${e.message}`, 'err');
  }
}

async function newShow() {
  engine.load(emptyShow());
  ui.filePath = null;
  ui.currentCuelist = null;
  resetUndo();
  setDirty(false);
}

function resetUndo() {
  undo.past = [];
  undo.future = [];
  snapshotNow();
}

desk.onMenu((cmd) => ({ new: newShow, open: openShow, save: () => save(), saveAs: () => save(true) })[cmd]?.());

// Closing never asks: the show is backed up automatically and restored on the next launch.
desk.onBeforeClose(async () => {
  await desk.autosave(JSON.stringify({ show: engine.show, filePath: ui.filePath, dirty: ui.dirty }));
  desk.closeOk();
});

// ---- command line ---------------------------------------------------------
const history = [];
let histIdx = 0;
cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const src = cmdInput.value.trim();
    if (!src) return;
    try {
      const msg = runCommand(engine, src, { cuelistId: ctx.currentCuelist() });
      cmdFeedback.textContent = msg;
      cmdFeedback.classList.remove('err');
      history.push(src);
      histIdx = history.length;
      cmdInput.value = '';
    } catch (err) {
      cmdFeedback.textContent = err.message;
      cmdFeedback.classList.add('err');
    }
  } else if (e.key === 'ArrowUp' && history.length) {
    histIdx = Math.max(0, histIdx - 1);
    cmdInput.value = history[histIdx];
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    histIdx = Math.min(history.length, histIdx + 1);
    cmdInput.value = history[histIdx] ?? '';
  } else if (e.key === 'Escape') {
    cmdInput.value = '';
    cmdInput.blur();
  }
});

// ---- keyboard -------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openShow(); return; }
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
  if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); doRedo(); return; }
  if (mod && e.key.toLowerCase() === 'a' && !typing) { e.preventDefault(); engine.select(engine.show.fixtures.map((f) => f.id)); return; }
  if (typing || mod || document.querySelector('.overlay')) return;
  if (ui.mode === 'basic') return;
  if (/^[0-9@+\-.]$/.test(e.key)) {
    cmdInput.focus();
    return; // the key lands in the command line
  }
  if (e.key === ' ') {
    e.preventDefault();
    const id = ctx.currentCuelist();
    if (id != null) engine.go(id);
  } else if (e.key === 'Escape') {
    engine.clear();
  } else if (e.key.toLowerCase() === 'h') {
    engine.prog.highlight = !engine.prog.highlight;
    engine.emit('programmer');
  }
});

// ---- serial port chooser (Electron) --------------------------------------
desk.onSerialChoose((ports) => {
  let chosen = '';
  const list = h('div', { class: 'lib-list' });
  if (!ports.length) list.append(h('div', { class: 'lib-item muted' }, 'No USB serial devices found. Plug in the interface and try again.'));
  for (const p of ports) {
    list.append(h('div', {
      class: 'lib-item',
      onclick: (e) => {
        chosen = p.portId;
        list.querySelectorAll('.lib-item').forEach((x) => x.classList.remove('active'));
        e.currentTarget.classList.add('active');
      },
    }, icon('usb'), h('div', null, h('div', null, p.name || p.portName), h('div', { class: 'mf' }, p.portName))));
  }
  modal({
    title: 'Choose USB-DMX interface',
    body: list,
    actions: [{ label: 'Cancel' }, { label: 'Connect', cls: 'primary' }],
    onClose: () => desk.chooseSerial(chosen),
  });
});

// ---- outputs --------------------------------------------------------------
function pushOutputs() {
  desk.setOutputConfig(JSON.parse(JSON.stringify(engine.show.settings.outputs)));
}

async function restoreUsb() {
  await usb.restore(engine.show.settings.outputs.usb || []);
}

let lastUsbKey = '';
engine.on('show', () => {
  pushOutputs();
  const key = JSON.stringify(engine.show.settings.outputs.usb || []);
  if (key !== lastUsbKey) {
    lastUsbKey = key;
    restoreUsb();
  }
});

async function updateStatus() {
  const o = engine.show.settings.outputs;
  const universes = engine.usedUniverses().length;
  const parts = [];
  if (o.artnet.enabled) parts.push('Art-Net');
  if (o.sacn.enabled) parts.push('sACN');
  const usbOk = usb.devices.filter((d) => d.status === 'ok').length;
  if (usbOk) parts.push(`USB×${usbOk}`);
  const stats = await desk.stats();
  const usbBad = usb.devices.some((d) => d.status === 'error' || d.status === 'missing');
  const dot = statusPill.querySelector('.dot');
  dot.className = 'dot ' + (desk.isWeb ? 'warn' : !parts.length ? 'bad' : stats.errors && stats.lastError ? 'warn' : usbBad ? 'warn' : 'ok');
  statusPill.lastChild.textContent = desk.isWeb
    ? 'Preview — no DMX output'
    : ui.mode === 'basic'
      ? (parts.length ? 'Connected to lights' : 'Not connected — open Settings')
      : parts.length ? `${parts.join(' + ')} · ${universes} universe${universes === 1 ? '' : 's'}` : 'No outputs enabled';
  statusPill.title = stats.lastError ? `Last network error: ${stats.lastError}` : '';
}
setInterval(updateStatus, 1000);

// DMX at ~40 fps
setInterval(() => {
  engine.compute(performance.now());
  const frames = engine.usedUniverses().map((u) => ({ u, data: engine.universe(u) }));
  if (frames.length) desk.sendFrames(frames);
  usb.send(engine.universes);
}, 25);

// UI refresh loop for live values
function frame() {
  view?.frame?.();
  if (ui.mode === 'basic') {
    const gm = engine.show.settings.grandMaster;
    bbSlider.setValue(gm);
    bbVal.textContent = pct(gm);
  } else {
    programmer.frame();
    wing.frame();
  }
  requestAnimationFrame(frame);
}

// ---- engine events -> views ------------------------------------------------
for (const evt of ['show', 'programmer', 'programmer-values', 'playback', 'level', 'current']) {
  engine.on(evt, (data) => {
    view?.refresh?.(evt, data);
    programmer.refresh(evt, data);
    wing.refresh(evt, data);
    if (evt === 'show') renderShowName();
  });
}

// ---- MIDI -----------------------------------------------------------------
const midi = new MidiManager((action, value, isNote) => {
  const [kind, n] = action.split(':');
  const slot = Number(n);
  const clId = slot >= 0 ? engine.slotCuelist(engine.page, slot) : null;
  if (kind === 'fader' && clId != null) engine.setLevel(clId, value);
  else if (kind === 'go' && clId != null && value > 0) engine.go(clId);
  else if (kind === 'flash' && clId != null) engine.flash(clId, value > 0);
  else if (kind === 'gm') { engine.show.settings.grandMaster = value; engine.emit('level'); }
  else if (kind === 'blackout' && value > 0) toggleBlackout();
  else if (kind === 'pageup' && value > 0) wing.setPage(engine.page + 1);
  else if (kind === 'pagedown' && value > 0) wing.setPage(engine.page - 1);
  else if (kind === 'releaseall' && value > 0) engine.releaseAll();
  void isNote;
});
ctx.midi = midi;

// ---- boot -----------------------------------------------------------------
async function boot() {
  try {
    const saved = await desk.loadAutosave();
    if (saved) {
      const { show, filePath, dirty } = JSON.parse(saved);
      engine.load(show);
      ui.filePath = filePath || null;
      ui.dirty = !!dirty;
    }
  } catch (e) {
    console.warn('Autosave restore failed', e);
  }
  if (location.hash === '#selftest') await selfTest();
  midi.map = engine.show.settings.midi.map;
  engine.on('show', () => (midi.map = engine.show.settings.midi.map));
  await midi.init();
  resetUndo();
  renderShowName();
  let tab = tabsFor()[0].id;
  try { tab = localStorage.getItem(`sl-tab-${ui.mode}`) || tab; } catch {}
  setTab(tabsFor().some((t) => t.id === tab) ? tab : tabsFor()[0].id);
  pushOutputs();
  lastUsbKey = JSON.stringify(engine.show.settings.outputs.usb || []);
  restoreUsb();
  updateStatus();
  requestAnimationFrame(frame);
}

async function selfTest() {
  const { loadDemoRig } = await import('./engine/demo.js');
  engine.load(emptyShow());
  loadDemoRig(engine);
  const o = engine.show.settings.outputs;
  Object.assign(o.artnet, { enabled: true, dest: 'unicast', unicast: '127.0.0.1' });
  Object.assign(o.sacn, { enabled: true, unicast: '127.0.0.1' });
  engine.changed();
  for (let s = 0; s < 3; s++) engine.go(engine.slotCuelist(0, s));
  ui.mode = 'advanced';
  applyModeClass();
  setTab('stage');
}

boot();
