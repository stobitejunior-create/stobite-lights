// A small example rig so a new user can try everything without hardware.

import { hsvToRgb, rgbToAttrs } from './color.js';

export function loadDemoRig(engine) {
  const pars = engine.addFixtures({ typeId: 'gen-drgbw8', count: 8, universe: 1, address: 1, name: 'LED Par' });
  const spots = engine.addFixtures({ typeId: 'gen-spot16', count: 4, universe: 1, address: 101, name: 'Spot' });
  const washes = engine.addFixtures({ typeId: 'gen-wash14', count: 4, universe: 1, address: 201, name: 'Wash' });
  const front = engine.addFixtures({ typeId: 'gen-dimmer', count: 6, universe: 1, address: 301, name: 'Front' });
  const haze = engine.addFixtures({ typeId: 'gen-hazer2', count: 1, universe: 1, address: 401, name: 'Hazer' });

  const place = (list, y, x0 = 0.1, x1 = 0.9) =>
    list.forEach((f, i) => Object.assign(f, { x: list.length > 1 ? x0 + ((x1 - x0) * i) / (list.length - 1) : (x0 + x1) / 2, y }));
  place(spots, 0.14, 0.2, 0.8);
  place(washes, 0.3, 0.14, 0.86);
  place(pars, 0.5, 0.06, 0.94);
  place(front, 0.82, 0.15, 0.85);
  place(haze, 0.66, 0.9, 0.9);
  engine.changed();

  const ids = (l) => l.map((f) => f.id);
  const group = (name, list) => { engine.select(ids(list)); engine.recordGroup(name); };
  group('LED Pars', pars);
  group('Spots', spots);
  group('Washes', washes);
  group('Front Light', front);
  group('All Movers', [...spots, ...washes]);
  group('Haze', haze);

  const colorables = [...pars, ...washes, ...spots];
  const colors = [['Red', [1, 0, 0]], ['Orange', [1, 0.45, 0]], ['Yellow', [1, 0.9, 0]], ['Green', [0, 1, 0.1]], ['Cyan', [0, 1, 1]], ['Blue', [0, 0.1, 1]], ['Magenta', [1, 0, 0.8]], ['White', [1, 1, 1]]];
  colors.forEach(([name, rgb], i) => {
    engine.clearAll();
    engine.select(ids(colorables));
    for (const f of colorables) engine.setFixtureValues(f.id, rgbToAttrs(rgb, engine.ctFor(f.id)));
    engine.recordPreset('color', i + 1, name);
  });

  const movers = [...spots, ...washes];
  const positions = [['Centre', 0.5, 0.5], ['Audience', 0.5, 0.75], ['Floor', 0.5, 0.2], ['Fan Out', null, 0.6]];
  positions.forEach(([name, pan, tilt], i) => {
    engine.clearAll();
    engine.select(ids(movers));
    if (pan == null) {
      engine.setAttr('pan', 0.85, { fan: true });
      engine.setAttr('tilt', tilt);
    } else {
      engine.setAttr('pan', pan);
      engine.setAttr('tilt', tilt);
    }
    engine.recordPreset('position', i + 1, name);
  });

  // Main cuelist: a simple three-look show.
  const main = engine.createCuelist('Main Show');
  const look = (fn) => { engine.clearAll(); fn(); };
  look(() => {
    engine.select(ids(front)); engine.setAttr('dim', 0.7);
    engine.select(ids(pars)); engine.setAttr('dim', 0.6);
    engine.applyPreset('color', 6);
  });
  engine.recordCue(main.id, { num: 1 });
  look(() => {
    engine.select(ids(front)); engine.setAttr('dim', 0.85);
    engine.select(ids(pars)); engine.setAttr('dim', 1); engine.applyPreset('color', 2);
    engine.select(ids(washes)); engine.setAttr('dim', 0.8); engine.applyPreset('color', 7); engine.applyPreset('position', 4);
  });
  engine.recordCue(main.id, { num: 2 });
  look(() => {
    engine.select(ids(front)); engine.setAttr('dim', 0.3);
    engine.select(ids(spots)); engine.setAttr('dim', 1); engine.applyPreset('position', 1); engine.applyPreset('color', 8);
    engine.select(ids(pars)); engine.setAttr('dim', 0.4); engine.applyPreset('color', 6);
  });
  engine.recordCue(main.id, { num: 3 });
  main.cues[0].name = 'Preset blue';
  main.cues[1].name = 'Song 1 – warm';
  main.cues[2].name = 'Solo special';

  // Rainbow chase across the pars.
  const chase = engine.createCuelist('Rainbow Chase');
  Object.assign(chase, { loop: true });
  for (let step = 0; step < 6; step++) {
    engine.clearAll();
    pars.forEach((f, i) => {
      engine.setFixtureValues(f.id, { dim: 1, ...rgbToAttrs(hsvToRgb((i + step) / 6, 1, 1), engine.ctFor(f.id)) });
    });
    const cue = engine.recordCue(chase.id, { num: step + 1 });
    Object.assign(cue, { fade: 0.4, trigger: 'wait', wait: 0.5, name: `Step ${step + 1}` });
  }

  // Ballyhoo effect on the movers.
  const fx = engine.createCuelist('Mover Circle');
  engine.clearAll();
  engine.select(ids(movers));
  engine.setAttr('dim', 1);
  engine.addEffect({ id: 'demo-circle', target: 'circle', wave: 'sine', bpm: 20, size: 0.6, fan: 1, fixtures: ids(movers) });
  engine.recordCue(fx.id, { num: 1 }).name = 'Slow circle';

  engine.clearAll();
  engine.assign(engine.page, 0, main.id);
  engine.assign(engine.page, 1, chase.id);
  engine.assign(engine.page, 2, fx.id);
  engine.show.name = 'Demo Rig';
  engine.changed();
}
