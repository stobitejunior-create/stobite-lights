// Scenes (Basic home screen): big tap targets, one tap to bring a look in.

import { isLive, toggleScene, sceneColors, snapshotLook } from '../engine/scenes.js';
import { loadDemoRig } from '../engine/demo.js';
import { h, clear, btn, icon, popupMenu, promptDialog, confirmDialog, toast, rgbCss } from './dom.js';
import { openSaveScene } from './scene-dialog.js';

export function createScenesView(ctx) {
  const { engine } = ctx;
  const el = h('div');
  let cards = [];

  function render() {
    clear(el);
    cards = [];
    const lists = engine.show.cuelists;

    if (!engine.show.fixtures.length) return el.append(welcome());

    el.append(h('div', { class: 'view-header' },
      h('h1', null, 'Scenes'),
      h('span', { class: 'sub' }, lists.length ? 'Tap a scene to turn it on. Tap it again to turn it off.' : ''),
    ));

    const grid = h('div', { class: 'scene-grid' });
    lists.forEach((cl, i) => grid.append(sceneCard(cl, i)));
    grid.append(h('div', {
      class: 'scene add',
      onclick: () => {
        if (Object.keys(snapshotLook(engine).values).length) openSaveScene(ctx);
        else {
          toast('First set up your lights, then save them as a scene');
          ctx.setTab('lights');
        }
      },
    }, icon('plus', 'icon lg'), h('div', { class: 'scene-name' }, 'New scene'), h('div', { class: 'scene-meta' }, 'Save how the lights look now')));
    el.append(grid);

    if (!lists.length) {
      el.append(h('div', { class: 'tip' },
        icon('bulb'),
        h('div', null, h('strong', null, 'Make your first scene. '), 'Open the ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); ctx.setTab('lights'); } }, 'Lights'),
          ' tab, set brightness and colours, then press ', h('strong', null, 'Save as scene'), '.')));
    }
  }

  function welcome() {
    const step = (n, title, text, action) => h('div', { class: 'step' },
      h('div', { class: 'step-n' }, n), h('div', { class: 'step-title' }, title), h('div', { class: 'muted' }, text), action);
    return h('div', { style: { maxWidth: '860px' } },
      h('h1', { style: { fontSize: '26px', margin: '8px 0 6px', fontWeight: 650 } }, 'Welcome to Stobite Lights'),
      h('p', { class: 'muted', style: { fontSize: '15px', margin: '0 0 24px' } }, 'Three steps and you’re running your lights.'),
      h('div', { class: 'steps' },
        step(1, 'Add your lights', 'Tell it what lights you have and how many.', btn('Add lights', () => ctx.setTab('setup'), { cls: 'primary', icon: 'plus' })),
        step(2, 'Connect', 'Choose how the computer talks to your lights.', btn('Connection', () => ctx.setTab('setup'), { icon: 'wifi' })),
        step(3, 'Make scenes', 'Set the lights how you like, save, then tap to recall.', null),
      ),
      h('div', { class: 'row', style: { marginTop: '28px' } },
        h('span', { class: 'muted' }, 'Just looking around?'),
        btn('Try it with demo lights', () => { loadDemoRig(engine); toast('Demo lights added — tap a scene', 'ok'); }, { cls: 'sm' }),
      ),
    );
  }

  function sceneCard(cl, i) {
    const cols = sceneColors(engine, cl);
    const tint = h('div', { class: 'tint' });
    if (cols.length === 1) tint.style.background = rgbCss(cols[0]);
    else if (cols.length > 1) tint.style.background = `linear-gradient(120deg, ${cols.map((c) => rgbCss(c)).join(', ')})`;
    else tint.style.background = 'var(--panel-3)';
    const steps = cl.cues.length;
    const meta = h('div', { class: 'scene-meta' });
    const live = h('div', { class: 'scene-live' }, 'ON');
    const card = h('div', {
      class: 'scene',
      onclick: () => toggleScene(engine, cl.id),
      oncontextmenu: (e) => { e.preventDefault(); menu(e, cl); },
    },
    tint,
    i < 9 ? h('div', { class: 'scene-key', title: `Press ${i + 1}` }, i + 1) : null,
    live,
    h('div', { class: 'scene-name' }, cl.name),
    meta,
    h('button', { class: 'scene-more', title: 'More', onclick: (e) => { e.stopPropagation(); menu(e.currentTarget, cl); } }, icon('more')),
    );
    cards.push({ cl, card, meta, steps, last: '' });
    return card;
  }

  function menu(anchor, cl) {
    const single = cl.cues.length === 1;
    const items = [
      { label: 'Rename…', icon: 'edit', onClick: async () => { const n = await promptDialog('Rename scene', 'Name', cl.name); if (n) engine.updateCuelist(cl.id, { name: n }); } },
      {
        label: 'Change fade time…', icon: 'zap', onClick: async () => {
          const v = await promptDialog('Fade time', 'Seconds to fade in', String(cl.cues[0]?.fade ?? 2));
          const n = Number(v);
          if (v !== null && !Number.isNaN(n) && n >= 0) { cl.cues.forEach((c) => (c.fade = n)); engine.changed(); }
        },
      },
    ];
    if (single && Object.keys(snapshotLook(engine).values).length) {
      items.push({
        label: 'Replace with how lights look now', icon: 'record', onClick: async () => {
          if (!(await confirmDialog('Replace scene?', `“${cl.name}” will be overwritten with what’s lit right now.`, { ok: 'Replace' }))) return;
          const { values, effects } = snapshotLook(engine);
          Object.assign(cl.cues[0], { values, effects });
          engine.changed();
          toast('Scene updated', 'ok');
        },
      });
    }
    items.push('-', {
      label: 'Delete scene', icon: 'trash', danger: true,
      onClick: async () => { if (await confirmDialog('Delete scene?', `“${cl.name}” will be removed.`, { ok: 'Delete', danger: true })) engine.deleteCuelist(cl.id); },
    });
    popupMenu(anchor, items);
  }

  function frame() {
    for (const c of cards) {
      const on = isLive(engine, c.cl.id);
      c.card.classList.toggle('live', on);
      const rt = engine.rt.get(c.cl.id);
      const n = c.cl.cues.length;
      const text = c.cl.loop && n > 1 ? (on ? 'Chase running' : 'Chase') : on && n > 1 ? `Step ${rt.index + 1} of ${n} · tap for next` : n > 1 ? `${n} steps` : n === 1 ? (c.cl.cues[0].fade ? `${c.cl.cues[0].fade}s fade` : 'Instant') : 'Empty';
      if (text !== c.last) { c.last = text; c.meta.textContent = text; }
    }
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.querySelector('.overlay')) return;
    if (/^[1-9]$/.test(e.key)) {
      const cl = engine.show.cuelists[Number(e.key) - 1];
      if (cl) toggleScene(engine, cl.id);
    }
  };
  document.addEventListener('keydown', onKey);

  render();
  return {
    el, frame,
    refresh: (evt) => evt === 'show' && render(),
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}
