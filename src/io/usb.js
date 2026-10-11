// USB-DMX output through Web Serial (no drivers beyond the stock FTDI one
// Windows 11 installs automatically).
//   usbpro  – ENTTEC DMX USB Pro and compatibles (most "Pro" style dongles)
//   opendmx – ENTTEC Open DMX / plain FTDI cables (raw 250k baud with break)

export const USB_KINDS = [
  { id: 'usbpro', label: 'ENTTEC DMX USB Pro (or compatible)' },
  { id: 'opendmx', label: 'ENTTEC Open DMX / FTDI cable' },
];

function proPacket(data) {
  const len = 513;
  const pkt = new Uint8Array(len + 5);
  pkt[0] = 0x7e;
  pkt[1] = 6; // Output Only Send DMX Packet Request
  pkt[2] = len & 0xff;
  pkt[3] = len >> 8;
  pkt[4] = 0; // start code
  pkt.set(data.subarray(0, 512), 5);
  pkt[len + 4] = 0xe7;
  return pkt;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Device {
  constructor(cfg, port) {
    this.cfg = cfg;
    this.port = port;
    this.status = 'connecting';
    this.error = '';
    this.busy = false;
    this.latest = null;
    this.open();
  }

  async open() {
    try {
      if (this.cfg.kind === 'opendmx') await this.port.open({ baudRate: 250000, dataBits: 8, stopBits: 2, parity: 'none' });
      else await this.port.open({ baudRate: 115200 });
      this.writer = this.port.writable.getWriter();
      this.status = 'ok';
      if (this.cfg.kind === 'opendmx') this.loopOpenDmx();
    } catch (e) {
      this.status = 'error';
      this.error = e.message;
    }
  }

  send(data) {
    if (this.status !== 'ok') return;
    if (this.cfg.kind === 'opendmx') {
      this.latest = data;
      return;
    }
    if (this.busy) return;
    this.busy = true;
    this.writer.write(proPacket(data)).then(
      () => (this.busy = false),
      (e) => { this.status = 'error'; this.error = e.message; },
    );
  }

  async loopOpenDmx() {
    const frame = new Uint8Array(513);
    while (this.status === 'ok') {
      try {
        if (this.latest) frame.set(this.latest.subarray(0, 512), 1);
        await this.port.setSignals({ break: true });
        await sleep(1);
        await this.port.setSignals({ break: false });
        await this.writer.write(frame);
        await sleep(22);
      } catch (e) {
        this.status = 'error';
        this.error = e.message;
      }
    }
  }

  async close() {
    this.status = 'closed';
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port.close(); } catch {}
  }
}

export class UsbManager {
  constructor() {
    this.devices = [];
    this.supported = 'serial' in navigator;
    this.onchange = () => {};
  }

  // Reconnect to ports granted earlier, matching saved configs by USB ids.
  async restore(configs) {
    await this.closeAll();
    if (!this.supported || !configs.length) return;
    const ports = await navigator.serial.getPorts();
    const free = [...ports];
    for (const cfg of configs) {
      const i = free.findIndex((p) => {
        const info = p.getInfo();
        return info.usbVendorId === cfg.vendorId && info.usbProductId === cfg.productId;
      });
      if (i < 0) {
        this.devices.push({ cfg, status: 'missing', error: 'Not plugged in', send() {}, close() {} });
        continue;
      }
      this.devices.push(new Device(cfg, free.splice(i, 1)[0]));
    }
    this.onchange();
  }

  // Must be called from a click. Returns the config to persist.
  async add(kind, universe) {
    const port = await navigator.serial.requestPort();
    const info = port.getInfo();
    const cfg = { kind, universe, vendorId: info.usbVendorId, productId: info.usbProductId };
    this.devices.push(new Device(cfg, port));
    setTimeout(() => this.onchange(), 300);
    return cfg;
  }

  async remove(index) {
    const d = this.devices.splice(index, 1)[0];
    await d?.close();
    this.onchange();
  }

  async closeAll() {
    await Promise.all(this.devices.map((d) => d.close()));
    this.devices = [];
  }

  send(universes) {
    for (const d of this.devices) {
      const data = universes.get(d.cfg.universe);
      if (data) d.send(data);
    }
  }
}
