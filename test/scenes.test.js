import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { saveScene, toggleScene, showSceneNow, allOff, isLive, sceneColors, snapshotLook } from '../src/engine/scenes.js';

function rig() {
  const e = new Engine();
  e.addFixtures({ typeId: 'gen-drgb', count: 4, universe: 1, address: 1 });
  e.addFixtures({ typeId: 'gen-dimmer', count: 2, universe: 1, address: 101 });
  return e;
}

function look(e, ids, rgb) {
  e.clearAll();
  e.select(ids);
  e.setAttr('dim', 1);
  if (rgb) { e.setAttr('red', rgb[0]); e.setAttr('green', rgb[1]); e.setAttr('blue', rgb[2]); }
  e.compute(0);
}

test('saving captures everything that is lit, not just the programmer', () => {
  const e = rig();
  look(e, [1, 2], [1, 0, 0]);
  const a = saveScene(e, 'Red', 1);
  showSceneNow(e, a.id, 0);
  e.compute(0);
  // Adjust only fixture 5 on top of the running scene, then save again.
  e.select([5]);
  e.setAttr('dim', 0.5);
  e.compute(0);
  const b = saveScene(e, 'Red + dimmer', 1);
  assert.deepEqual(Object.keys(b.cues[0].values).sort(), ['1', '2', '5']);
  assert.equal(b.cues[0].values[5].dim, 0.5);
  assert.equal(b.cues[0].values[1].red, 1);
  assert.equal(snapshotLook(e).values[3], undefined, 'unlit fixtures are not recorded');
  assert.ok(Object.values(e.show.playbacks).includes(b.id), 'assigned to a fader');
});

test('nothing lit → nothing to save', () => {
  const e = rig();
  e.compute(0);
  assert.equal(saveScene(e, 'Empty'), null);
});

test('scenes are exclusive and tapping toggles', () => {
  const e = rig();
  look(e, [1, 2], [1, 0, 0]);
  const red = saveScene(e, 'Red', 0);
  look(e, [3, 4], [0, 0, 1]);
  const blue = saveScene(e, 'Blue', 0);
  e.clearAll();

  toggleScene(e, red.id, 0);
  e.compute(100);
  assert.equal(e.out.get(1).dim, 1);
  assert.equal(e.out.get(3).dim, 0);

  toggleScene(e, blue.id, 200);
  assert.equal(isLive(e, red.id), false);
  assert.equal(isLive(e, blue.id), true);
  e.compute(200 + 1500);
  assert.equal(e.out.get(1).dim, 0, 'red scene faded out');
  assert.equal(e.out.get(3).dim, 1);
  assert.equal(e.out.get(3).blue, 1);

  toggleScene(e, blue.id, 4000); // tap again → off
  e.compute(6000);
  assert.equal(e.out.get(3).dim, 0);
});

test('tapping a scene discards un-saved manual changes', () => {
  const e = rig();
  look(e, [1], [1, 1, 1]);
  const s = saveScene(e, 'One', 0);
  e.clearAll();
  e.select([2]);
  e.setAttr('dim', 1);
  toggleScene(e, s.id, 0);
  assert.equal(e.hasProgrammerData(), false);
});

test('multi-step scene advances then turns off', () => {
  const e = rig();
  const cl = e.createCuelist('Steps');
  for (const fid of [1, 2]) { e.clearAll(); e.select([fid]); e.setAttr('dim', 1); e.recordCue(cl.id); }
  e.clearAll();
  toggleScene(e, cl.id, 0);
  assert.equal(e.rt.get(cl.id).index, 0);
  toggleScene(e, cl.id, 10);
  assert.equal(e.rt.get(cl.id).index, 1);
  toggleScene(e, cl.id, 20);
  assert.equal(isLive(e, cl.id), false);
});

test('all off releases scenes and clears the programmer', () => {
  const e = rig();
  look(e, [1], [1, 0, 0]);
  const s = saveScene(e, 'R', 0);
  toggleScene(e, s.id, 0);
  e.select([2]);
  e.setAttr('dim', 1);
  allOff(e, 100);
  e.compute(100 + 2000);
  assert.equal(isLive(e, s.id), false);
  assert.equal(e.out.get(1).dim, 0);
  assert.equal(e.out.get(2).dim, 0);
});

test('scene card colours reflect the look', () => {
  const e = rig();
  look(e, [1, 2], [1, 0, 0]);
  const s = saveScene(e, 'Red', 0);
  const cols = sceneColors(e, s);
  assert.equal(cols.length, 1);
  assert.ok(cols[0][0] > 0.9 && cols[0][1] < 0.1);
});
