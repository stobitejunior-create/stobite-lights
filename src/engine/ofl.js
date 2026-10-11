// Import fixture definitions in Open Fixture Library JSON format
// (https://open-fixture-library.org → any fixture → Download → "OFL JSON").
// Each fixture mode becomes one fixture type.

const COLOR_MAP = {
  red: 'red', green: 'green', blue: 'blue', white: 'white', 'cold white': 'white', 'cool white': 'white',
  'warm white': 'warmwhite', amber: 'amber', lime: 'lime', uv: 'uv', cyan: 'cyan', magenta: 'magenta', yellow: 'yellow',
};

function capsOf(ch) {
  if (ch.capability) return [ch.capability];
  return ch.capabilities || [];
}

function attrFor(name, ch) {
  const caps = capsOf(ch).filter((c) => c.type !== 'NoFunction');
  const type = caps[0]?.type || 'Generic';
  const n = name.toLowerCase();
  switch (type) {
    case 'Intensity': return 'dim';
    case 'ColorIntensity': return COLOR_MAP[String(caps[0].color).toLowerCase()] || 'generic';
    case 'ColorTemperature': return 'cto';
    case 'Pan': case 'PanContinuous': return 'pan';
    case 'Tilt': case 'TiltContinuous': return 'tilt';
    case 'PanTiltSpeed': return 'speed';
    case 'ShutterStrobe': return caps.every((c) => ['Open', 'Closed'].includes(c.shutterEffect)) || n.includes('shutter') ? 'shutter' : 'strobe';
    case 'StrobeSpeed': case 'StrobeDuration': return 'strobe';
    case 'Zoom': return 'zoom';
    case 'Focus': return 'focus';
    case 'Iris': case 'IrisEffect': return 'iris';
    case 'Frost': case 'FrostEffect': return 'frost';
    case 'Prism': return 'prism';
    case 'PrismRotation': return 'prismrot';
    case 'Fog': case 'FogOutput': return 'fog';
    case 'FogType': return 'control';
    case 'Effect': case 'EffectSpeed': case 'EffectDuration': case 'SoundSensitivity': return 'macro';
    case 'Maintenance': return 'control';
    case 'ColorPreset': return 'colorwheel';
    case 'WheelSlot': case 'WheelShake': case 'WheelSlotRotation': case 'WheelRotation': {
      const wheel = String(caps[0].wheel || name).toLowerCase();
      const rot = type === 'WheelSlotRotation' || type === 'WheelRotation';
      if (wheel.includes('colo')) return 'colorwheel';
      if (wheel.includes('prism')) return rot ? 'prismrot' : 'prism';
      if (wheel.includes('gobo')) return rot ? 'goborot' : 'gobo';
      return rot ? 'goborot' : 'fx';
    }
    default:
      if (n.includes('fan')) return 'fan';
      return 'generic';
  }
}

function toDmx(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.endsWith('%')) return Math.round((parseFloat(v) / 100) * 255);
  return null;
}

function rangesFor(ch) {
  const caps = capsOf(ch).filter((c) => c.dmxRange);
  if (caps.length < 2) return null;
  return caps.map((c) => ({
    from: c.dmxRange[0],
    to: c.dmxRange[1],
    label: c.comment || (c.slotNumber != null ? `${c.type === 'WheelSlot' ? 'Slot' : c.type} ${c.slotNumber}` : null) || c.shutterEffect || c.effectName || c.color || c.type,
  }));
}

function defaultFor(attr, ch) {
  const d = toDmx(ch.defaultValue);
  if (d != null) return d / 255;
  if (attr === 'shutter' || attr === 'strobe') {
    const open = capsOf(ch).find((c) => c.shutterEffect === 'Open' && c.dmxRange);
    if (open) return (open.dmxRange[0] + open.dmxRange[1]) / 2 / 255;
  }
  if (attr === 'pan' || attr === 'tilt') return 0.5;
  return undefined;
}

export function parseOfl(json, manufacturer = '') {
  const avail = json.availableChannels || {};
  const fineOf = {};
  for (const [name, ch] of Object.entries(avail)) {
    (ch.fineChannelAliases || []).forEach((alias, i) => (fineOf[alias] = { parent: name, level: i + 1 }));
  }
  const attrCache = {};
  const attrOf = (name) => (attrCache[name] ??= attrFor(name, avail[name] || {}));
  const modes = json.modes?.length ? json.modes : [{ name: 'Default', channels: Object.keys(avail) }];
  return modes.map((mode) => {
    const used = {};
    const nameToAttr = {};
    const channels = mode.channels.map((name) => {
      if (typeof name !== 'string') return { attr: uniq('generic') };
      const f = fineOf[name];
      if (f) {
        const attr = nameToAttr[f.parent] ?? attrOf(f.parent);
        return f.level === 1 ? { attr, fine: true } : { attr: uniq('generic') };
      }
      const ch = avail[name] || {};
      const attr = uniq(attrOf(name));
      nameToAttr[name] = attr;
      const out = { attr, label: name };
      const def = defaultFor(attr, ch);
      if (def !== undefined) out.def = def;
      const ranges = rangesFor(ch);
      if (ranges) out.ranges = ranges;
      return out;
    });
    function uniq(attr) {
      used[attr] = (used[attr] || 0) + 1;
      return used[attr] === 1 ? attr : `${attr}_${used[attr]}`;
    }
    const base = json.name || 'Imported Fixture';
    return {
      id: `ofl-${slug(manufacturer)}-${slug(base)}-${slug(mode.name || mode.shortName || 'mode')}`,
      manufacturer: manufacturer || json.manufacturerKey || 'Imported',
      name: `${base} (${mode.shortName || mode.name || channels.length + 'ch'})`,
      channels,
    };
  });
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
