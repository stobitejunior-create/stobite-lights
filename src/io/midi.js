// MIDI control surfaces (APC, nanoKONTROL, X-Touch …) with a learn mode.
// Mappings are stored as "cc:<channel>:<number>" / "note:<channel>:<number>" -> action.

export const MIDI_ACTIONS = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `fader:${i}`, label: `Fader ${i + 1}` })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `go:${i}`, label: `Go ${i + 1}` })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `flash:${i}`, label: `Flash ${i + 1}` })),
  { id: 'gm', label: 'Grand master' },
  { id: 'blackout', label: 'Blackout' },
  { id: 'pagedown', label: 'Page −' },
  { id: 'pageup', label: 'Page +' },
  { id: 'releaseall', label: 'Release all' },
];

export class MidiManager {
  constructor(onAction) {
    this.onAction = onAction;
    this.map = {};
    this.inputs = [];
    this.learning = null; // action id waiting for a control
    this.onlearn = () => {};
    this.onchange = () => {};
    this.supported = 'requestMIDIAccess' in navigator;
  }

  async init() {
    if (!this.supported) return;
    try {
      this.access = await navigator.requestMIDIAccess();
    } catch {
      this.supported = false;
      return;
    }
    const bind = () => {
      this.inputs = [...this.access.inputs.values()];
      this.inputs.forEach((inp) => (inp.onmidimessage = (e) => this.handle(e.data)));
      this.onchange();
    };
    this.access.onstatechange = bind;
    bind();
  }

  handle([status, d1, d2]) {
    const type = status & 0xf0;
    const ch = (status & 0x0f) + 1;
    let key, value;
    if (type === 0xb0) { key = `cc:${ch}:${d1}`; value = d2 / 127; }
    else if (type === 0x90 || type === 0x80) { key = `note:${ch}:${d1}`; value = type === 0x90 && d2 > 0 ? 1 : 0; }
    else return;
    if (this.learning && value > 0) {
      for (const k of Object.keys(this.map)) if (this.map[k] === this.learning) delete this.map[k];
      this.map[key] = this.learning;
      const learned = this.learning;
      this.learning = null;
      this.onlearn(learned, key);
      return;
    }
    const action = this.map[key];
    if (action) this.onAction(action, value, key.startsWith('note'));
  }
}
