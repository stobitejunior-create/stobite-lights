const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  platform: process.platform,
  sendFrames: (frames) => ipcRenderer.send('dmx:frames', frames),
  setOutputConfig: (cfg) => ipcRenderer.send('dmx:config', cfg),
  interfaces: () => ipcRenderer.invoke('net:interfaces'),
  stats: () => ipcRenderer.invoke('net:stats'),
  discover: () => ipcRenderer.invoke('net:discover'),
  saveShow: (opts) => ipcRenderer.invoke('show:save', opts),
  openShow: () => ipcRenderer.invoke('show:open'),
  autosave: (data) => ipcRenderer.invoke('show:autosave', data),
  loadAutosave: () => ipcRenderer.invoke('show:loadAutosave'),
  openJsonFiles: (title) => ipcRenderer.invoke('files:openJson', title),
  onSerialChoose: (fn) => ipcRenderer.on('serial:choose', (_e, ports) => fn(ports)),
  chooseSerial: (portId) => ipcRenderer.send('serial:chosen', portId),
  onMenu: (fn) => ipcRenderer.on('menu', (_e, cmd) => fn(cmd)),
  onBeforeClose: (fn) => ipcRenderer.on('app:before-close', () => fn()),
  closeOk: () => ipcRenderer.send('app:close-ok'),
});
