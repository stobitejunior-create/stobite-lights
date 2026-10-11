// Playback wing: 10 fader playbacks per page, page select, grand master.

import { PAGE_SIZE, PAGES } from '../engine/engine.js';
import { h, clear, btn, slider, icon, popupMenu, pct, toast, promptDialog } from './dom.js';

export function createWing(ctx) {
  const { engine } = ctx;
  const el = h('section', { class: 'wing' });
  const pageNum = h('div', { class: 'num' });
  const side = h('div', { class: 'wing-side' },
    h('div', { class: 'page-box' }, h('div', { class: 'lbl' }, 'Page'), pageNum),
    h('div', { class: 'row' },
      btn('', () => setPage(engine.page - 1), { cls: 'sm block', icon: 'chevL', title: 'Previous page' }),
      btn('', () => setPage(engine.page + 1), { cls: 'sm block', icon: 'chevR', title: 'Next page' }),
    ),
    h('div', { class: 'spacer' }),
    btn('Release all', () => engine.releaseAll(), { cls: 'sm block', title: 'Fade out every running cuelist' }),
  );
  const faders = h('div', { class: 'faders' });
  const gmVal = h('div', { class: 'val' });
  const gmSlider = slider(engine.show.settings.grandMaster, (v) => {
    engine.show.settings.grandMaster = v;
  }, { vertical: true, fill: 'var(--flash)' });
  const gm = h('div', { class: 'gm' }, h('div', { class: 'lbl' }, 'Master'), gmVal, h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' } }, gmSlider));
  el.append(side, faders, gm);

  let slots = [];

  function setPage(p) {
    engine.page = Math.max(0, Math.min(PAGES - 1, p));
    render();
  }

  function render() {
    pageNum.textContent = engine.page + 1;
    clear(faders);
    slots = [];
    for (let i = 0; i < PAGE_SIZE; i++) faders.append(slotEl(i));
  }

  function slotEl(i) {
    const clId = engine.slotCuelist(engine.page, i);
    const cl = clId != null ? engine.cuelist(clId) : null;
    if (!cl) {
      const box = h('div', { class: 'pb empty' },
        h('div', { class: 'pb-name' }, `${i + 1} · Empty`),
        h('div', { class: 'pb-assign', onclick: (e) => assignMenu(e.currentTarget, i) }, icon('plus'), ' Assign'),
      );
      slots.push(null);
      return box;
    }
    const rt = engine.rtOf(cl.id);
    const name = h('div', { class: 'pb-name', title: 'Options', onclick: (e) => slotMenu(e.currentTarget, i, cl) }, `${i + 1} · ${cl.name}`);
    const cue = h('div', { class: 'pb-cue' });
    const bar = h('i');
    const lvl = h('div', { class: 'lvl' });
    const fader = slider(rt.level, (v) => { engine.setLevel(cl.id, v); ctx.setCurrentCuelist(cl.id); }, { vertical: true, fill: 'var(--go)' });
    const flashBtn = h('button', { class: 'btn', title: 'Flash to full while held' }, 'Flash');
    flashBtn.addEventListener('pointerdown', (e) => { flashBtn.setPointerCapture(e.pointerId); engine.flash(cl.id, true); flashBtn.classList.add('on-flash'); });
    const unflash = () => { if (engine.rtOf(cl.id).flash) engine.flash(cl.id, false); flashBtn.classList.remove('on-flash'); };
    flashBtn.addEventListener('pointerup', unflash);
    flashBtn.addEventListener('pointercancel', unflash);
    const box = h('div', { class: 'pb' },
      name, cue, h('div', { class: 'pb-progress' }, bar),
      h('div', { class: 'pb-mid' },
        h('div', { class: 'pb-fader' }, lvl, fader),
        h('div', { class: 'pb-buttons' },
          h('button', { class: 'btn go', title: 'Go to next cue', onclick: () => { engine.go(cl.id); ctx.setCurrentCuelist(cl.id); } }, 'GO'),
          h('button', { class: 'btn', title: 'Previous cue', onclick: () => { engine.back(cl.id); ctx.setCurrentCuelist(cl.id); } }, 'Back'),
          flashBtn,
          h('button', { class: 'btn', title: 'Release (fade out)', onclick: () => engine.release(cl.id) }, 'Release'),
        ),
      ),
    );
    slots.push({ cl, box, cue, bar, lvl, fader });
    return box;
  }

  function assignMenu(anchor, slot) {
    const items = engine.show.cuelists.map((c) => ({ label: c.name, icon: 'play', onClick: () => engine.assign(engine.page, slot, c.id) }));
    if (items.length) items.push('-');
    if (engine.hasProgrammerData()) {
      items.push({
        label: 'New cuelist from programmer', icon: 'record', onClick: () => {
          const cl = engine.createCuelist();
          engine.recordCue(cl.id, { num: 1 });
          engine.assign(engine.page, slot, cl.id);
          ctx.setCurrentCuelist(cl.id);
          toast(`Recorded ${cl.name} cue 1`, 'ok');
        },
      });
    }
    items.push({ label: 'New empty cuelist', icon: 'plus', onClick: () => { const cl = engine.createCuelist(); engine.assign(engine.page, slot, cl.id); } });
    popupMenu(anchor, items);
  }

  function slotMenu(anchor, slot, cl) {
    popupMenu(anchor, [
      { label: 'Open in Cues', icon: 'edit', onClick: () => { ctx.setCurrentCuelist(cl.id); ctx.setTab('cues'); } },
      { label: 'Rename…', icon: 'edit', onClick: async () => { const n = await promptDialog('Rename cuelist', 'Name', cl.name); if (n) engine.updateCuelist(cl.id, { name: n }); } },
      { label: cl.loop ? 'Turn loop off' : 'Loop (chase)', icon: 'undo', onClick: () => engine.updateCuelist(cl.id, { loop: !cl.loop }) },
      '-',
      { label: 'Remove from fader', icon: 'x', danger: true, onClick: () => engine.assign(engine.page, slot, null) },
    ]);
  }

  function frame() {
    const now = performance.now();
    const current = ctx.currentCuelist();
    for (const s of slots) {
      if (!s) continue;
      const rt = engine.rtOf(s.cl.id);
      s.fader.setValue(rt.level);
      s.fader.style.setProperty('--pct', `${(rt.flash ? 1 : rt.level) * 100}%`);
      s.lvl.textContent = pct(rt.level);
      s.box.classList.toggle('active', rt.active);
      s.box.classList.toggle('current', current === s.cl.id);
      const c = s.cl.cues[rt.index];
      const n = s.cl.cues.length;
      if (rt.active && c) {
        const dur = engine.cueDuration(c);
        const p = dur > 0 ? Math.min(1, (now - rt.fadeStart) / 1000 / dur) : 1;
        s.bar.style.width = `${(rt.releaseStart != null ? 0 : p) * 100}%`;
        setText(s.cue, `${rt.releaseStart != null ? 'Releasing' : `Cue ${c.num}`}${c.name ? ' · ' + c.name : ''}`);
      } else {
        s.bar.style.width = '0%';
        setText(s.cue, n ? `${n} cue${n === 1 ? '' : 's'} · off` : 'No cues yet');
      }
    }
    const gmv = engine.show.settings.grandMaster;
    gmSlider.setValue(gmv);
    gmVal.textContent = pct(gmv);
  }

  function refresh(evt) {
    // Runtime state is drawn in frame(); only rebuild when assignments/names change.
    if (evt === 'show') render();
  }

  render();
  return { el, frame, refresh, setPage };
}

function setText(el, t) {
  if (el.textContent !== t) el.textContent = t;
}
