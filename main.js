// Electron main process: window, network DMX output (Art-Net / sACN),
// show files, and permission plumbing for USB-DMX (Web Serial) and MIDI.

const { app, BrowserWindow, ipcMain, dialog, session, powerSaveBlocker, Menu, shell } = require('electron');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const packets = require('./net/packets');

let win = null;
// SL_SELFTEST=<png path>: load the demo rig, run cues, screenshot, quit (used for testing).
const SELFTEST = process.env.SL_SELFTEST;
if (SELFTEST) app.setPath('userData', path.join(os.tmpdir(), 'stobite-lights-selftest'));
let outputCfg = { artnet: { enabled: false }, sacn: { enabled: false } };
let artSock = null, artSockAddr = null;
let sacnSock = null, sacnSockAddr = null;
let pollSock = null;
const seq = { art: new Map(), sacn: new Map() };
const lastSent = new Map(); // `${proto}:${u}` -> { data, time }
const cid = crypto.randomBytes(16);
const stats = { packets: 0, errors: 0, lastError: '' };

// ---- network ---------------------------------------------------------------

function interfaces() {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      const broadcast = ip.map((b, i) => (b & mask[i]) | (~mask[i] & 255)).join('.');
      list.push({ name, address: a.address, netmask: a.netmask, broadcast, internal: a.internal });
    }
  }
  return list;
}

function openSocket(bindAddr, onReady) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', (err) => {
    stats.errors++;
    stats.lastError = err.message;
  });
  sock.bind({ port: 0, address: bindAddr || undefined }, () => {
    try { onReady(sock); } catch (e) { stats.lastError = e.message; }
  });
  return sock;
}

function ensureSockets() {
  const art = outputCfg.artnet || {};
  if (art.enabled && (!artSock || artSockAddr !== (art.iface || ''))) {
    artSock?.close();
    artSockAddr = art.iface || '';
    artSock = openSocket(artSockAddr, (s) => s.setBroadcast(true));
  } else if (!art.enabled && artSock) {
    artSock.close();
    artSock = null;
  }
  const sacn = outputCfg.sacn || {};
  if (sacn.enabled && (!sacnSock || sacnSockAddr !== (sacn.iface || ''))) {
    sacnSock?.close();
    sacnSockAddr = sacn.iface || '';
    sacnSock = openSocket(sacnSockAddr, (s) => {
      s.setMulticastTTL(8);
      if (sacnSockAddr) s.setMulticastInterface(sacnSockAddr);
    });
  } else if (!sacn.enabled && sacnSock) {
    sacnSock.close();
    sacnSock = null;
  }
}

function artDest() {
  const art = outputCfg.artnet;
  if (art.dest === 'unicast' && art.unicast) return art.unicast;
  if (art.dest === 'limited') return '255.255.255.255';
  if (art.dest === '2.x') return '2.255.255.255';
  const iface = interfaces().find((i) => i.address === art.iface);
  return iface ? iface.broadcast : '255.255.255.255';
}

function nextSeq(map, u) {
  const v = ((map.get(u) || 0) % 255) + 1;
  map.set(u, v);
  return v;
}

// Send if changed, otherwise refresh once a second so nodes don't time out.
function shouldSend(key, data, now) {
  const prev = lastSent.get(key);
  if (prev && now - prev.time < 1000 && Buffer.compare(prev.data, data) === 0) return false;
  lastSent.set(key, { data: Buffer.from(data), time: now });
  return true;
}

function sendFrames(frames) {
  ensureSockets();
  const now = Date.now();
  for (const { u, data } of frames) {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    if (artSock && outputCfg.artnet.enabled && shouldSend(`a:${u}`, buf, now)) {
      const port = Math.max(0, u - 1 + Number(outputCfg.artnet.offset || 0));
      artSock.send(packets.artDmx(port, buf, nextSeq(seq.art, u)), packets.ARTNET_PORT, artDest(), countErr);
    }
    if (sacnSock && outputCfg.sacn.enabled && shouldSend(`s:${u}`, buf, now)) {
      const pkt = packets.sacnData(u, buf, { sequence: nextSeq(seq.sacn, u), priority: Number(outputCfg.sacn.priority) || 100, cid });
      const dest = outputCfg.sacn.unicast || packets.sacnMulticast(u);
      sacnSock.send(pkt, packets.SACN_PORT, dest, countErr);
    }
  }
}

function countErr(err) {
  if (err) {
    stats.errors++;
    stats.lastError = err.message;
  } else stats.packets++;
}

// ArtPoll: discover Art-Net nodes on the network for ~2 seconds.
function discoverNodes() {
  return new Promise((resolve) => {
    const found = new Map();
    pollSock?.close();
    pollSock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    pollSock.on('message', (msg) => {
      const r = packets.parseArtPollReply(msg);
      if (r) found.set(r.ip, r);
    });
    pollSock.on('error', () => {});
    pollSock.bind(packets.ARTNET_PORT, () => {
      pollSock.setBroadcast(true);
      const dests = new Set(['255.255.255.255', '2.255.255.255', ...interfaces().filter((i) => !i.internal).map((i) => i.broadcast)]);
      for (const d of dests) pollSock.send(packets.artPoll(), packets.ARTNET_PORT, d, () => {});
    });
    setTimeout(() => {
      pollSock?.close();
      pollSock = null;
      resolve([...found.values()]);
    }, 2000);
  });
}

// ---- window ----------------------------------------------------------------

function autosavePath() {
  return path.join(app.getPath('userData'), 'autosave.slshow');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0e0f13',
    title: 'Stobite Lights',
    ...(fs.existsSync(path.join(__dirname, 'build', 'icon.png')) ? { icon: path.join(__dirname, 'build', 'icon.png') } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false, // keep DMX running when minimised
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'), SELFTEST ? { hash: 'selftest' } : undefined);
  if (SELFTEST) {
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(SELFTEST, img.toPNG());
      console.log('SELFTEST stats', JSON.stringify(stats));
      win.__allowClose = true;
      app.quit();
    }, 5000);
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (win.__allowClose) return;
    e.preventDefault();
    win.webContents.send('app:before-close');
  });
}

function setupPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_wc, permission) => ['serial', 'midi', 'midiSysex'].includes(permission) || null);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(['midi', 'midiSysex', 'serial'].includes(permission)));
  ses.setDevicePermissionHandler((details) => details.deviceType === 'serial');
  ses.on('select-serial-port', (event, portList, _wc, callback) => {
    event.preventDefault();
    const ports = portList.map((p) => ({ portId: p.portId, name: p.displayName || p.portName, portName: p.portName, vendorId: p.vendorId, productId: p.productId }));
    win.webContents.send('serial:choose', ports);
    ipcMain.once('serial:chosen', (_e, portId) => callback(portId || ''));
  });
}

function setupMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Show', accelerator: 'CmdOrCtrl+N', click: () => win.webContents.send('menu', 'new') },
        { label: 'Open Show…', accelerator: 'CmdOrCtrl+O', click: () => win.webContents.send('menu', 'open') },
        { label: 'Save Show', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('menu', 'save') },
        { label: 'Save Show As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('menu', 'saveAs') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'toggleDevTools' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC -------------------------------------------------------------------

ipcMain.on('dmx:frames', (_e, frames) => sendFrames(frames));
ipcMain.on('dmx:config', (_e, cfg) => {
  outputCfg = cfg;
  lastSent.clear();
  ensureSockets();
});
ipcMain.handle('net:interfaces', () => interfaces());
ipcMain.handle('net:stats', () => ({ ...stats }));
ipcMain.handle('net:discover', () => discoverNodes());

const showFilters = [{ name: 'Stobite Lights Show', extensions: ['slshow'] }, { name: 'All Files', extensions: ['*'] }];

ipcMain.handle('show:save', async (_e, { data, filePath, saveAs }) => {
  let target = filePath;
  if (!target || saveAs) {
    const r = await dialog.showSaveDialog(win, { title: 'Save Show', defaultPath: filePath || 'Show.slshow', filters: showFilters });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  fs.writeFileSync(target + '.tmp', data);
  fs.renameSync(target + '.tmp', target);
  return target;
});

ipcMain.handle('show:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open Show', properties: ['openFile'], filters: showFilters });
  if (r.canceled || !r.filePaths[0]) return null;
  return { filePath: r.filePaths[0], data: fs.readFileSync(r.filePaths[0], 'utf8') };
});

ipcMain.handle('show:autosave', (_e, data) => {
  fs.writeFileSync(autosavePath(), data);
  return true;
});
ipcMain.handle('show:loadAutosave', () => {
  try { return fs.readFileSync(autosavePath(), 'utf8'); } catch { return null; }
});

ipcMain.handle('files:openJson', async (_e, title) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openFile', 'multiSelections'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled) return [];
  return r.filePaths.map((p) => ({ name: path.basename(p), data: fs.readFileSync(p, 'utf8') }));
});

ipcMain.on('app:close-ok', () => {
  if (!win) return;
  win.__allowClose = true;
  win.close();
});

// ---- lifecycle -------------------------------------------------------------

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.stobite.lights');
  powerSaveBlocker.start('prevent-app-suspension');
  setupPermissions();
  setupMenu();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
