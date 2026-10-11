// Cuelists and cue editing.

import { PAGE_SIZE } from '../engine/engine.js';
import { h, clear, btn, icon, numberInput, select, segmented, toggle, popupMenu, promptDialog, confirmDialog, toast } from './dom.js';
import { openRecordSheet } from './programmer.js';

export function createCuesView(ctx) {
  const { engine } = ctx;
  const el = h('div');
  let liveRows = [];

  function render() {
    clear(el);
    liveRows = [];
    const lists = engine.show.cuelists;
    const curId = ctx.currentCuelist();
    const cl = curId != null ? engine.cuelist(curId) : null;

    el.append(h('div', { class: 'view-header' },
      h('h1', null, 'Cues'),
      h('span', { class: 'sub' }, 'Cuelists hold your looks in order. Press GO on a fader to run them.'),
    ));

    if (!lists.length) {
      el.append(h('div', { class: 'empty' },
        icon('play'),
        h('h3', null, 'No cuelists yet'),
        h('p', null, 'Set some levels in the programmer, then press Record to create your first cue. Each cuelist gets its own fader.'),
        h('div', { class: 'row' },
          btn('Record first cue', () => openRecordSheet(ctx, 'cue'), { cls: 'rec', icon: 'record', disabled: !engine.hasProgrammerData() }),
          btn('New empty cuelist', () => createList()),
        ),
      ));
      return;
    }

    const listCol = h('div', { class: 'list' });
    for (const c of lists) {
      const rt = engine.rtOf(c.id);
      listCol.append(h('div', {
        class: `list-item ${c.id === curId ? 'active' : ''}`,
        onclick: () => ctx.setCurrentCuelist(c.id),
      }, h('span', { class: 'dot ' + (rt.active ? 'ok' : '') }), c.name, h('span', { class: 'meta' }, c.cues.length)));
    }
    listCol.append(h('div', { style: { marginTop: '6px' } }, btn('New cuelist', () => createList(), { cls: 'ghost sm', icon: 'plus' })));

    const detail = h('div', { style: { minWidth: 0 } });
    if (cl) detail.append(cuelistDetail(cl));
    el.append(h('div', { class: 'split' }, h('div', null, listCol), detail));
  }

  async function createList() {
    const name = await promptDialog('New cuelist', 'Name', `Cuelist ${engine.show.cuelists.length + 1}`);
    if (!name) return;
    const cl = engine.createCuelist(name);
    const slot = engine.firstFreeSlot();
    if (slot != null) engine.assign(engine.page, slot, cl.id);
    ctx.setCurrentCuelist(cl.id);
  }

  function cuelistDetail(cl) {
    const wrap = h('div');
    const slotOf = Object.entries(engine.show.playbacks).find(([, v]) => v === cl.id)?.[0];
    const slotLabel = slotOf ? `Page ${Number(slotOf.split(':')[0]) + 1}, fader ${Number(slotOf.split(':')[1]) + 1}` : 'Not on a fader';

    const nameInput = h('input', { class: 'input', value: cl.name, style: { fontSize: '16px', fontWeight: 600, width: '280px' } });
    nameInput.addEventListener('change', () => engine.updateCuelist(cl.id, { name: nameInput.value.trim() || cl.name }));

    wrap.append(h('div', { class: 'row wrap', style: { marginBottom: '14px' } },
      nameInput,
      h('span', { class: 'badge' }, slotLabel),
      h('div', { class: 'spacer' }),
      btn('GO', () => engine.go(cl.id), { cls: 'go', icon: 'play' }),
      btn('Back', () => engine.back(cl.id), { icon: 'back' }),
      btn('Release', () => engine.release(cl.id), { icon: 'stop' }),
      h('button', { class: 'btn ghost', onclick: (e) => listMenu(e.currentTarget, cl) }, icon('more')),
    ));

    wrap.append(h('div', { class: 'card', style: { marginBottom: '14px', padding: '12px 16px' } },
      h('div', { class: 'row wrap', style: { gap: '22px' } },
        h('div', { class: 'row' }, h('span', { class: 'label' }, 'Mode'),
          segmented([{ value: 'tracking', label: 'Tracking' }, { value: 'cueonly', label: 'Cue only' }], cl.mode, (v) => engine.updateCuelist(cl.id, { mode: v }))),
        h('div', { class: 'row' }, h('span', { class: 'label' }, 'Loop'), toggle(cl.loop, (v) => engine.updateCuelist(cl.id, { loop: v }))),
        h('div', { class: 'row' }, h('span', { class: 'label' }, 'Release time'), numberInput(cl.release, (v) => engine.updateCuelist(cl.id, { release: v }), { min: 0, step: 0.1 }), h('span', { class: 'muted' }, 's')),
        h('div', { class: 'row' }, h('span', { class: 'label' }, 'Fader'), select(
          [{ value: '', label: '—' }, ...Array.from({ length: PAGE_SIZE }, (_, i) => ({ value: i, label: `Page ${engine.page + 1} · ${i + 1}${engine.slotCuelist(engine.page, i) != null && engine.slotCuelist(engine.page, i) !== cl.id ? ' (used)' : ''}` }))],
          Object.entries(engine.show.playbacks).find(([k, v]) => v === cl.id && k.startsWith(`${engine.page}:`))?.[0].split(':')[1] ?? '',
          (v) => {
            for (const [k, val] of Object.entries(engine.show.playbacks)) if (val === cl.id && k.startsWith(`${engine.page}:`)) delete engine.show.playbacks[k];
            if (v !== '') engine.assign(engine.page, Number(v), cl.id);
            else engine.changed();
          }, 'input sm')),
      ),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, cl.mode === 'tracking'
        ? 'Tracking: values carry forward until a later cue changes them — record only what changes.'
        : 'Cue only: each cue is a complete look; anything not in the cue fades out.'),
    ));

    if (!cl.cues.length) {
      wrap.append(h('div', { class: 'empty' },
        h('h3', null, 'No cues in this list'),
        h('p', null, 'Build a look in the programmer, then record it here.'),
        btn('Record cue', () => openRecordSheet(ctx, 'cue'), { cls: 'rec', icon: 'record', disabled: !engine.hasProgrammerData() }),
      ));
      return wrap;
    }

    const table = h('table', { class: 'table cue-table' },
      h('thead', null, h('tr', null,
        h('th', { style: { width: '70px' } }, 'Cue'), h('th', { class: 'name-col' }, 'Name'), h('th', null, 'Fade in'), h('th', null, 'Fade out'),
        h('th', null, 'Delay'), h('th', null, 'Starts'), h('th', null, 'Content'), h('th', { style: { width: '90px' } }, ''),
      )),
    );
    const tbody = h('tbody');
    cl.cues.forEach((cue, idx) => {
      const up = (patch) => engine.updateCue(cl.id, cue.id, patch);
      const name = h('input', { class: 'input sm', value: cue.name, placeholder: 'Untitled', style: { width: '100%' } });
      name.addEventListener('change', () => up({ name: name.value }));
      const trigger = h('div', { class: 'row' },
        select([{ value: 'go', label: 'On GO' }, { value: 'follow', label: 'After previous' }, { value: 'wait', label: 'Wait' }], cue.trigger, (v) => up({ trigger: v }), 'input sm'),
        cue.trigger === 'wait' ? h('span', { class: 'row' }, numberInput(cue.wait, (v) => up({ wait: v }), { min: 0, step: 0.1 }), 's') : null,
      );
      const fixtures = Object.keys(cue.values).length;
      const content = [fixtures ? `${fixtures} fixture${fixtures === 1 ? '' : 's'}` : null, cue.effects.length ? `${cue.effects.length} effect${cue.effects.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || '—';
      const tr = h('tr', null,
        h('td', null, numberInput(cue.num, (v) => up({ num: v }), { min: 0, step: 0.1 })),
        h('td', null, name),
        h('td', null, h('span', { class: 'row' }, numberInput(cue.fade, (v) => up({ fade: v }), { min: 0, step: 0.1 }), 's')),
        h('td', null, h('span', { class: 'row' }, numberInput(cue.out ?? '', (v) => up({ out: v }), { min: 0, step: 0.1, allowEmpty: true, placeholder: String(cue.fade) }), 's')),
        h('td', null, h('span', { class: 'row' }, numberInput(cue.delay, (v) => up({ delay: v }), { min: 0, step: 0.1 }), 's')),
        h('td', null, trigger),
        h('td', { class: 'muted' }, content),
        h('td', null, h('div', { class: 'row' },
          btn('Go', () => { engine.gotoCue(cl.id, idx); }, { cls: 'sm', title: 'Jump to this cue' }),
          h('button', { class: 'btn ghost sm', onclick: (e) => cueMenu(e.currentTarget, cl, cue) }, icon('more')),
        )),
      );
      liveRows.push({ tr, idx });
      tbody.append(tr);
    });
    table.append(tbody);
    wrap.append(h('div', { class: 'card', style: { padding: 0, overflow: 'auto' } }, table));
    wrap.append(h('div', { class: 'row', style: { marginTop: '12px' } },
      btn('Record cue', () => openRecordSheet(ctx, 'cue'), { cls: 'rec sm', icon: 'record', disabled: !engine.hasProgrammerData() }),
      h('span', { class: 'hint' }, 'Leave “Fade out” empty to use the fade-in time. Cues can be renumbered with decimals (e.g. 2.5) to insert between.'),
    ));
    return wrap;
  }

  function listMenu(anchor, cl) {
    popupMenu(anchor, [
      { label: 'Duplicate', icon: 'copy', onClick: () => { const c = engine.createCuelist(`${cl.name} copy`); c.cues = JSON.parse(JSON.stringify(cl.cues)); Object.assign(c, { mode: cl.mode, loop: cl.loop, release: cl.release }); engine.changed(); ctx.setCurrentCuelist(c.id); } },
      '-',
      { label: 'Delete cuelist', icon: 'trash', danger: true, onClick: async () => { if (await confirmDialog('Delete cuelist?', `“${cl.name}” and its ${cl.cues.length} cues will be removed.`, { ok: 'Delete', danger: true })) engine.deleteCuelist(cl.id); } },
    ]);
  }

  function cueMenu(anchor, cl, cue) {
    popupMenu(anchor, [
      { label: 'Load into programmer', icon: 'edit', onClick: () => { engine.loadCueToProgrammer(cl.id, cue.id); toast('Cue loaded — adjust, then Record with “Replace”'); } },
      { label: 'Merge programmer into cue', icon: 'record', onClick: () => { if (!engine.hasProgrammerData()) return toast('Programmer is empty', 'err'); engine.recordCue(cl.id, { num: cue.num, mode: 'merge' }); toast(`Cue ${cue.num} updated`, 'ok'); } },
      { label: cue.clearEffects ? 'Keep earlier effects' : 'Stop earlier effects here', icon: 'zap', onClick: () => engine.updateCue(cl.id, cue.id, { clearEffects: !cue.clearEffects }) },
      '-',
      { label: 'Delete cue', icon: 'trash', danger: true, onClick: () => engine.deleteCue(cl.id, cue.id) },
    ]);
  }

  function frame() {
    const id = ctx.currentCuelist();
    const rt = id != null ? engine.rt.get(id) : null;
    for (const r of liveRows) r.tr.classList.toggle('live', !!rt?.active && rt.index === r.idx);
  }

  function refresh(evt) {
    if (evt === 'show' || evt === 'current') render();
    else if (evt === 'playback') el.querySelectorAll('.list .list-item .dot').forEach((d, i) => d.classList.toggle('ok', !!engine.rt.get(engine.show.cuelists[i]?.id)?.active));
    else if (evt === 'programmer') el.querySelectorAll('.btn.rec').forEach((b) => (b.disabled = !engine.hasProgrammerData()));
  }

  render();
  return { el, frame, refresh };
}

