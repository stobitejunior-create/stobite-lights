// Console-style command line:
//   1 thru 8 @ 50      select 1-8, intensity 50%
//   + 10 - 3 @ full    add 10, remove 3, full
//   group 2 @ 0        select group 2, out
//   @ 75               level for current selection
//   record cue 5       record programmer into the active cuelist
//   clear | highlight | go | back | release

const WORD = { t: 'thru', thru: 'thru', through: 'thru', '>': 'thru', at: '@', ff: 'full', g: 'group', grp: 'group', rec: 'record', q: 'cue', c: 'clear' };

export function tokenize(src) {
  return String(src)
    .toLowerCase()
    .replace(/([@+\-])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => WORD[t] || t);
}

const isNum = (t) => /^\d+(\.\d+)?$/.test(t);

// ctx.cuelistId: cuelist used by record/go/back/release.
export function runCommand(engine, src, ctx = {}) {
  const tok = tokenize(src);
  if (!tok.length) return '';
  let i = 0;
  const peek = () => tok[i];
  const next = () => tok[i++];
  const num = () => {
    const t = next();
    if (!isNum(t ?? '')) throw new Error(`Expected a number${t ? ` but got "${t}"` : ''}`);
    return Number(t);
  };
  const clId = () => {
    const id = ctx.cuelistId ?? engine.show.cuelists[0]?.id;
    if (id == null) throw new Error('No cuelist — create one first');
    return id;
  };

  const head = peek();
  if (head === 'clear') return engine.clear(), 'Cleared';
  if (head === 'highlight') {
    engine.prog.highlight = !engine.prog.highlight;
    engine.emit('programmer');
    return engine.prog.highlight ? 'Highlight on' : 'Highlight off';
  }
  if (head === 'go') return engine.go(clId()), 'Go';
  if (head === 'back') return engine.back(clId()), 'Back';
  if (head === 'release') return engine.release(clId()), 'Released';
  if (head === 'record') {
    next();
    const what = next();
    if (what === 'group') {
      const g = engine.recordGroup();
      if (!g) throw new Error('Nothing selected');
      return `Recorded ${g.name}`;
    }
    if (what !== 'cue') throw new Error('Use "record cue N" or "record group"');
    const n = peek() ? num() : null;
    const cue = engine.recordCue(clId(), { num: n });
    if (!cue) throw new Error('Programmer is empty');
    return `Recorded cue ${cue.num}`;
  }

  // Selection expression
  let mode = 'set';
  let sel = null;
  const apply = (ids) => {
    sel ??= mode === 'set' ? [] : [...engine.prog.selection];
    if (mode === 'remove') sel = sel.filter((x) => !ids.includes(x));
    else sel = [...sel, ...ids.filter((x) => !sel.includes(x))];
  };
  while (i < tok.length && peek() !== '@') {
    const t = next();
    if (t === '+') { mode = sel ? 'add' : 'add'; if (!sel) sel = [...engine.prog.selection]; continue; }
    if (t === '-') { mode = 'remove'; if (!sel) sel = [...engine.prog.selection]; continue; }
    if (t === 'group') {
      const g = engine.show.groups.find((x) => x.id === num());
      if (!g) throw new Error('No such group');
      apply(g.fixtures);
    } else if (isNum(t)) {
      const a = Number(t);
      let ids = [a];
      if (peek() === 'thru') {
        next();
        const b = num();
        const lo = Math.min(a, b), hi = Math.max(a, b);
        ids = engine.show.fixtures.map((f) => f.id).filter((id) => id >= lo && id <= hi);
        if (b < a) ids.reverse();
      }
      apply(ids.filter((id) => engine.fixById.has(id)));
    } else throw new Error(`Unknown command "${t}"`);
    if (mode !== 'remove') mode = 'add';
  }
  if (sel) engine.select(sel, 'set');

  if (peek() === '@') {
    next();
    const t = next();
    let v;
    if (t === 'full') v = 1;
    else if (t === 'out') v = 0;
    else if (isNum(t ?? '')) v = Math.min(100, Number(t)) / 100;
    else throw new Error('Expected a level after @');
    if (!engine.prog.selection.length) throw new Error('Nothing selected');
    engine.setAttr('dim', v, { fan: false });
    engine.emit('programmer');
    return `${engine.prog.selection.length} fixture(s) @ ${Math.round(v * 100)}%`;
  }
  if (i < tok.length) throw new Error(`Unexpected "${peek()}"`);
  return `${engine.prog.selection.length} selected`;
}
