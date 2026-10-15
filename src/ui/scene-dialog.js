// "Save as scene" — shared by the Lights and Scenes screens.

import { snapshotLook, saveScene, showSceneNow } from '../engine/scenes.js';
import { h, modal, field, segmented, toast } from './dom.js';

export function openSaveScene(ctx) {
  const { engine } = ctx;
  if (!Object.keys(snapshotLook(engine).values).length) {
    toast('Turn some lights on first, then save how they look as a scene', 'err');
    return;
  }
  const name = h('input', { class: 'input', placeholder: 'e.g. Welcome, Worship, Sermon', style: { height: '42px', fontSize: '15px' } });
  let fade = 2;
  modal({
    title: 'Save as a scene',
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, 'This saves everything that is lit right now, so you can bring it back with one tap.'),
      field('Scene name', name),
      field('How quickly should it fade in?', segmented(
        [{ value: 0, label: 'Instantly' }, { value: 1, label: '1 sec' }, { value: 2, label: '2 sec' }, { value: 4, label: '4 sec' }, { value: 8, label: '8 sec' }],
        fade, (v) => (fade = v))),
    ),
    actions: [
      { label: 'Cancel' },
      {
        label: 'Save scene', cls: 'primary lg', onClick: () => {
          const cl = saveScene(engine, name.value.trim(), fade);
          if (!cl) return toast('Nothing is lit', 'err'), false;
          showSceneNow(engine, cl.id);
          ctx.setTab('scenes');
          toast(`Saved “${cl.name}”`, 'ok');
        },
      },
    ],
  });
}
