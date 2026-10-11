// Settings: DMX outputs (Art-Net, sACN, USB), MIDI, general preferences.

import { USB_KINDS } from '../io/usb.js';
import { MIDI_ACTIONS } from '../io/midi.js';
import { h, clear, btn, icon, field, toggle, select, numberInput, toast } from './dom.js';

export function createSettingsView(ctx) {
  const { engine, desk, usb, midi } = ctx;
  const el = h('div');
  let ifaces = [];
  let nodes = null;
  const o = () => engine.show.settings.outputs;
  const save = () => engine.changed();

  async function load() {
    ifaces = await desk.interfaces();
    render();
  }

  function ifaceSelect(value, onChange) {
    const opts = [{ value: '', label: 'Automatic (all networks)' }, ...ifaces.filter((i) => !i.internal).map((i) => ({ value: i.address, label: `${i.name} — ${i.address}` }))];
    return select(opts, value, onChange);
  }

  function render() {
    clear(el);
    el.append(h('div', { class: 'view-header' }, h('h1', null, 'Settings')));
    if (desk.isWeb) {
      el.append(h('div', { class: 'card', style: { borderColor: 'var(--flash)', marginBottom: '14px' } },
        h('strong', null, 'Preview mode. '), h('span', { class: 'muted' }, 'Network output only works in the installed Windows app.')));
    }
    const cols = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '14px', alignItems: 'start' } });
    cols.append(h('div', null, artnetCard(), sacnCard()), h('div', null, usbCard(), midiCard(), generalCard()));
    el.append(cols);
  }

  function artnetCard() {
    const a = o().artnet;
    const card = h('div', { class: 'card' },
      h('div', { class: 'row', style: { marginBottom: '12px' } }, icon('wifi'), h('h2', { style: { margin: 0 } }, 'Art-Net'), h('div', { class: 'spacer' }), toggle(a.enabled, (v) => { a.enabled = v; save(); render(); })),
    );
    if (!a.enabled) {
      card.append(h('div', { class: 'hint' }, 'Send DMX over Ethernet to Art-Net nodes and fixtures. Most network DMX boxes support it.'));
      return card;
    }
    const unicast = h('input', { class: 'input', value: a.unicast || '', placeholder: '192.168.1.50' });
    unicast.addEventListener('change', () => { a.unicast = unicast.value.trim(); save(); });
    card.append(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      field('Network', ifaceSelect(a.iface, (v) => { a.iface = v; save(); })),
      field('Send to', select([
        { value: 'broadcast', label: 'Everything on this network (broadcast)' },
        { value: '2.x', label: 'Art-Net 2.x.x.x network' },
        { value: 'limited', label: 'Limited broadcast 255.255.255.255' },
        { value: 'unicast', label: 'One device (IP address)' },
      ], a.dest, (v) => { a.dest = v; save(); render(); })),
      a.dest === 'unicast' ? field('Device IP address', unicast) : null,
      field('Universe numbering', h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Desk universe 1 sends to Art-Net universe'),
        numberInput(Number(a.offset || 0), (v) => { a.offset = v; save(); }, { min: 0, max: 32767 })),
      'Most nodes call their first universe 0 (shown as 0:0:0). Change this if yours starts at 1.'),
      h('div', { class: 'row' }, btn('Find Art-Net devices', async (e) => {
        e.currentTarget.disabled = true;
        nodes = await desk.discover();
        render();
      }, { cls: 'sm', icon: 'search' }), nodes ? h('span', { class: 'muted' }, `${nodes.length} found`) : null),
      nodes?.length ? h('div', { class: 'lib-list' }, nodes.map((n) => h('div', { class: 'lib-item' }, h('div', null, h('div', null, n.shortName || n.longName || 'Node'), h('div', { class: 'mf' }, n.longName)), h('span', { class: 'badge fp mono' }, n.ip)))) : null,
    ));
    return card;
  }

  function sacnCard() {
    const s = o().sacn;
    const card = h('div', { class: 'card' },
      h('div', { class: 'row', style: { marginBottom: '12px' } }, icon('wifi'), h('h2', { style: { margin: 0 } }, 'sACN (E1.31)'), h('div', { class: 'spacer' }), toggle(s.enabled, (v) => { s.enabled = v; save(); render(); })),
    );
    if (!s.enabled) {
      card.append(h('div', { class: 'hint' }, 'Streaming ACN — the standard for ETC, many LED walls, and newer fixtures.'));
      return card;
    }
    const unicast = h('input', { class: 'input', value: s.unicast || '', placeholder: 'Leave empty for multicast' });
    unicast.addEventListener('change', () => { s.unicast = unicast.value.trim(); save(); });
    card.append(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      field('Network', ifaceSelect(s.iface, (v) => { s.iface = v; save(); })),
      h('div', { class: 'grid2' },
        field('Priority', numberInput(s.priority ?? 100, (v) => { s.priority = v; save(); }, { min: 0, max: 200, cls: 'input num' })),
        field('Unicast IP (optional)', unicast),
      ),
      h('div', { class: 'hint' }, 'Desk universe 1 = sACN universe 1.'),
    ));
    return card;
  }

  function usbCard() {
    const card = h('div', { class: 'card' },
      h('div', { class: 'row', style: { marginBottom: '12px' } }, icon('usb'), h('h2', { style: { margin: 0 } }, 'USB-DMX interfaces')),
    );
    if (!usb.supported) {
      card.append(h('div', { class: 'hint' }, 'USB output is not available here.'));
      return card;
    }
    const list = o().usb;
    usb.devices.forEach((d, i) => {
      const statusCls = d.status === 'ok' ? 'go' : d.status === 'connecting' ? '' : 'bad';
      card.append(h('div', { class: 'row', style: { padding: '8px 0', borderBottom: '1px solid var(--line)' } },
        h('div', null, h('div', null, USB_KINDS.find((k) => k.id === d.cfg.kind)?.label), h('div', { class: 'hint' }, `Universe ${d.cfg.universe}${d.error ? ' · ' + d.error : ''}`)),
        h('div', { class: 'spacer' }),
        h('span', { class: `badge ${statusCls}` }, d.status === 'ok' ? 'Connected' : d.status),
        btn('', async () => {
          await usb.remove(i);
          list.splice(i, 1);
          save();
          render();
        }, { cls: 'ghost sm', icon: 'trash' }),
      ));
    });
    let kind = 'usbpro';
    let uni = 1;
    card.append(h('div', { class: 'row wrap', style: { marginTop: '12px' } },
      select(USB_KINDS.map((k) => ({ value: k.id, label: k.label })), kind, (v) => (kind = v), 'input sm'),
      h('span', { class: 'muted' }, 'universe'),
      numberInput(uni, (v) => (uni = v), { min: 1 }),
      btn('Connect…', async () => {
        try {
          const cfg = await usb.add(kind, uni);
          list.push(cfg);
          save();
          toast('USB interface connected', 'ok');
          setTimeout(render, 400);
        } catch (e) {
          if (e.name !== 'NotFoundError') toast(e.message, 'err');
        }
      }, { cls: 'sm primary' }),
    ));
    card.append(h('div', { class: 'hint', style: { marginTop: '10px' } }, 'Each interface outputs one universe. Windows 11 installs the FTDI driver automatically for ENTTEC-style devices.'));
    usb.onchange = () => ctx.ui.tab === 'settings' && render();
    return card;
  }

  function midiCard() {
    const card = h('div', { class: 'card' }, h('h2', null, 'MIDI controller'));
    if (!midi?.supported) {
      card.append(h('div', { class: 'hint' }, 'MIDI is not available.'));
      return card;
    }
    card.append(h('div', { class: 'hint', style: { marginBottom: '10px' } },
      midi.inputs.length ? `Connected: ${midi.inputs.map((i) => i.name).join(', ')}` : 'No MIDI devices connected. Plug one in to use physical faders and buttons.'));
    const map = engine.show.settings.midi.map;
    const byAction = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 12px', maxHeight: '260px', overflow: 'auto' } });
    for (const a of MIDI_ACTIONS) {
      const learning = midi.learning === a.id;
      grid.append(h('div', { class: 'row', style: { height: '32px' } },
        h('span', { style: { flex: 1 } }, a.label),
        h('span', { class: 'mono muted', style: { fontSize: '11px' } }, byAction[a.id] || ''),
        btn(learning ? 'Move a control…' : 'Learn', () => {
          midi.learning = learning ? null : a.id;
          midi.onlearn = () => { save(); render(); };
          render();
        }, { cls: `sm ${learning ? 'on-flash' : 'ghost'}` }),
      ));
    }
    card.append(grid);
    if (Object.keys(map).length) card.append(h('div', { style: { marginTop: '10px' } }, btn('Clear all mappings', () => { for (const k of Object.keys(map)) delete map[k]; save(); render(); }, { cls: 'sm ghost danger' })));
    midi.onchange = () => ctx.ui.tab === 'settings' && render();
    return card;
  }

  function generalCard() {
    const st = engine.show.settings;
    return h('div', { class: 'card' },
      h('h2', null, 'General'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        field('Default fade time for new cues', h('div', { class: 'row' }, numberInput(st.defaultFade, (v) => { st.defaultFade = v; save(); }, { min: 0, step: 0.1, cls: 'input num' }), h('span', { class: 'muted' }, 'seconds'))),
        h('div', null,
          h('div', { class: 'label', style: { marginBottom: '8px' } }, 'Keyboard shortcuts'),
          shortcut('Space', 'GO on the current cuelist'),
          shortcut('Esc', 'Clear selection, then programmer'),
          shortcut('H', 'Highlight selected fixtures'),
          shortcut('0–9, @, +, −', 'Start typing a command'),
          shortcut('Ctrl+A', 'Select all fixtures'),
          shortcut('Ctrl+Z / Ctrl+Y', 'Undo / redo'),
          shortcut('Ctrl+S', 'Save show'),
        ),
      ),
    );
  }

  const shortcut = (k, d) => h('div', { class: 'row', style: { marginBottom: '6px' } }, h('span', { class: 'kbd' }, k), h('span', { class: 'muted' }, d));

  render();
  load();
  return {
    el,
    refresh: (evt) => evt === 'show' && !el.contains(document.activeElement) && render(),
    destroy: () => { usb.onchange = () => {}; if (midi) { midi.learning = null; midi.onchange = () => {}; } },
  };
}
