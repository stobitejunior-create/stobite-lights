import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Engine } from '../src/engine/engine.js';
import { parseOfl } from '../src/engine/ofl.js';
import { runCommand } from '../src/engine/command.js';

const require = createRequire(import.meta.url);
const packets = require('../net/packets.js');

function rig() {
  const e = new Engine();
  e.addFixtures({ typeId: 'gen-drgb', count: 4, universe: 1, address: 1 }); // ids 1-4, 4ch
  e.addFixtures({ typeId: 'gen-spot16', count: 2, universe: 2, address: 101 }); // ids 5-6
  e.addFixtures({ typeId: 'gen-rgb', count: 1, universe: 1, address: 50 }); // id 7 virtual dim
  return e;
}

test('patch addresses fixtures sequentially and detects conflicts', () => {
  const e = rig();
  assert.deepEqual(e.show.fixtures.slice(0, 4).map((f) => f.address), [1, 5, 9, 13]);
  assert.equal(e.conflicts().size, 0);
  e.updateFixture(2, { address: 3 });
  assert.deepEqual([...e.conflicts()].sort(), [1, 2]);
  assert.equal(e.findFreeAddress(1, 4), 17);
});

test('programmer drives DMX with grand master, 16-bit and virtual dim', () => {
  const e = rig();
  e.select([1]);
  e.setAttr('dim', 1);
  e.setAttr('red', 0.5);
  e.select([5]);
  e.setAttr('pan', 0.5);
  e.select([7]);
  e.setAttr('dim', 0.5);
  e.setAttr('green', 1);
  e.compute(0);
  const u1 = e.universe(1), u2 = e.universe(2);
  assert.equal(u1[0], 255);
  assert.equal(u1[1], 128);
  assert.equal(u2[100], 128); // pan coarse (32768 >> 8)
  assert.equal(u2[101], 0); // pan fine
  assert.equal(u1[49], 128); // virtual-dim red default 1 * 0.5
  assert.equal(u1[50], 128);
  e.show.settings.grandMaster = 0.5;
  e.compute(0);
  assert.equal(u1[0], 128);
  e.blackout = true;
  e.compute(0);
  assert.equal(u1[0], 0);
  assert.equal(u1[1], 128); // colour unaffected by GM on real-dim fixtures
});

test('cue fades, tracking, HTP and LTP', () => {
  const e = rig();
  const cl = e.createCuelist('Main');
  e.select([1, 2]);
  e.setAttr('dim', 1);
  e.setAttr('red', 1);
  e.recordCue(cl.id); // cue 1
  e.clearAll();
  e.select([3]);
  e.setAttr('dim', 0.6);
  e.recordCue(cl.id); // cue 2: fixtures 1,2 track
  e.clearAll();
  e.cuelist(cl.id).cues.forEach((c) => (c.fade = 2));
  e.changed();

  e.go(cl.id, 0);
  e.compute(1000);
  assert.equal(e.out.get(1).dim, 0.5);
  e.compute(2000);
  assert.equal(e.out.get(1).dim, 1);
  e.go(cl.id, 2000);
  e.compute(5000);
  assert.equal(e.out.get(1).dim, 1, 'tracked');
  assert.equal(e.out.get(3).dim, 0.6);

  e.setLevel(cl.id, 0.5, 5000);
  e.compute(5000);
  assert.equal(e.out.get(1).dim, 0.5);

  // Second cuelist: higher intensity wins (HTP), latest colour wins (LTP).
  const cl2 = e.createCuelist('Sub');
  e.select([1]);
  e.setAttr('dim', 0.8);
  e.setAttr('red', 0.2);
  e.recordCue(cl2.id);
  e.clearAll();
  e.cuelist(cl2.id).cues[0].fade = 0;
  e.changed();
  e.go(cl2.id, 6000);
  e.compute(6000);
  assert.equal(e.out.get(1).dim, 0.8);
  assert.ok(Math.abs(e.out.get(1).red - 0.2) < 1e-9);

  e.release(cl2.id, 7000);
  e.compute(9000);
  assert.equal(e.rt.get(cl2.id).active, false);
  assert.equal(e.out.get(1).dim, 0.5);
});

test('follow cues and looping chase', () => {
  const e = rig();
  const cl = e.createCuelist('Chase');
  for (const fid of [1, 2, 3]) {
    e.clearAll();
    e.select([fid]);
    e.setAttr('dim', 1);
    e.recordCue(cl.id);
  }
  e.clearAll();
  e.updateCuelist(cl.id, { mode: 'cueonly', loop: true });
  e.cuelist(cl.id).cues.forEach((c) => Object.assign(c, { fade: 0, trigger: 'wait', wait: 0.5 }));
  e.changed();
  e.go(cl.id, 0);
  e.compute(0);
  assert.equal(e.rt.get(cl.id).index, 0);
  e.compute(600);
  assert.equal(e.rt.get(cl.id).index, 1);
  assert.equal(e.out.get(2).dim, 1);
  assert.equal(e.out.get(1).dim, 0);
  e.compute(1200);
  e.compute(1800);
  assert.equal(e.rt.get(cl.id).index, 0, 'looped');
});

test('presets apply by fixture and by type', () => {
  const e = rig();
  e.select([1]);
  e.setAttr('red', 0.3);
  e.recordPreset('color', 1, 'Rose');
  e.clearAll();
  e.select([4]);
  e.applyPreset('color', 1);
  assert.equal(e.prog.values[4].red, 0.3);
});

test('dim effect with fan modulates across fixtures', () => {
  const e = rig();
  e.select([1, 2, 3, 4]);
  e.setAttr('dim', 1);
  e.addEffect({ id: 'a', target: 'dim', wave: 'square', bpm: 60, size: 1, fan: 1, fixtures: [1, 2, 3, 4] });
  e.compute(100);
  const dims = [1, 2, 3, 4].map((id) => e.out.get(id).dim);
  assert.deepEqual(dims, [1, 1, 0, 0]);
});

test('command line selects, sets and records', () => {
  const e = rig();
  e.createCuelist('Main');
  runCommand(e, '1 thru 3 @ 50');
  assert.deepEqual(e.prog.selection, [1, 2, 3]);
  assert.equal(e.prog.values[2].dim, 0.5);
  runCommand(e, '+ 5 @ full');
  assert.equal(e.prog.values[5].dim, 1);
  runCommand(e, '1 thru 4 - 2 @ 0');
  assert.deepEqual(e.prog.selection, [1, 3, 4]);
  runCommand(e, 'record cue 7');
  assert.equal(e.show.cuelists[0].cues[0].num, 7);
  assert.throws(() => runCommand(e, 'bogus'));
});

test('Open Fixture Library import maps channels and fine aliases', () => {
  const ofl = {
    name: 'Test Spot',
    availableChannels: {
      Pan: { fineChannelAliases: ['Pan fine'], capability: { type: 'Pan' } },
      Dimmer: { capability: { type: 'Intensity' } },
      Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
      'Gobo Wheel': { capabilities: [
        { dmxRange: [0, 9], type: 'WheelSlot', slotNumber: 1 },
        { dmxRange: [10, 255], type: 'WheelSlot', slotNumber: 2, comment: 'Star' },
      ] },
      Shutter: { defaultValue: 20, capabilities: [
        { dmxRange: [0, 9], type: 'ShutterStrobe', shutterEffect: 'Closed' },
        { dmxRange: [10, 255], type: 'ShutterStrobe', shutterEffect: 'Open' },
      ] },
    },
    modes: [{ name: '6ch', channels: ['Pan', 'Pan fine', 'Dimmer', 'Red', 'Gobo Wheel', 'Shutter'] }],
  };
  const [t] = parseOfl(ofl, 'Acme');
  assert.deepEqual(t.channels.map((c) => c.attr + (c.fine ? '+' : '')), ['pan', 'pan+', 'dim', 'red', 'gobo', 'shutter']);
  assert.equal(t.channels[4].ranges[1].label, 'Star');
  assert.ok(Math.abs(t.channels[5].def - 20 / 255) < 1e-9);
});

test('Art-Net and sACN packets are well formed', () => {
  const data = new Uint8Array(512);
  data[0] = 255;
  data[511] = 7;
  const a = packets.artDmx(0x0102, data, 9);
  assert.equal(a.length, 530);
  assert.equal(a.toString('ascii', 0, 7), 'Art-Net');
  assert.equal(a.readUInt16LE(8), 0x5000);
  assert.equal(a[14], 0x02);
  assert.equal(a[15], 0x01);
  assert.equal(a[18], 255);
  assert.equal(a[529], 7);

  const s = packets.sacnData(1, data, { cid: Buffer.alloc(16, 1), sequence: 3 });
  assert.equal(s.length, 638);
  assert.equal(s.readUInt16BE(16) & 0x0fff, 622);
  assert.equal(s.readUInt16BE(113), 1);
  assert.equal(s[126], 255);
  assert.equal(s[637], 7);
  assert.equal(packets.sacnMulticast(257), '239.255.1.1');
});
