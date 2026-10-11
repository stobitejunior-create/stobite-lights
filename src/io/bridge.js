// Access to the Electron main process. When the UI runs in a plain browser
// (development preview) a fallback keeps everything working except network output.

const AUTOSAVE_KEY = 'stobite-lights-autosave';

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function pickFiles(accept, multiple) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = async () => {
      const files = await Promise.all([...input.files].map(async (f) => ({ name: f.name, data: await f.text() })));
      resolve(files);
    };
    input.click();
  });
}

const web = {
  platform: 'web',
  isWeb: true,
  sendFrames() {},
  setOutputConfig() {},
  async interfaces() { return []; },
  async stats() { return { packets: 0, errors: 0, lastError: '' }; },
  async discover() { return []; },
  async saveShow({ data, filePath }) {
    const name = filePath || 'Show.slshow';
    download(name, data);
    return name;
  },
  async openShow() {
    const [f] = await pickFiles('.slshow,.json', false);
    return f ? { filePath: f.name, data: f.data } : null;
  },
  async autosave(data) {
    try { localStorage.setItem(AUTOSAVE_KEY, data); } catch {}
    return true;
  },
  async loadAutosave() {
    try { return localStorage.getItem(AUTOSAVE_KEY); } catch { return null; }
  },
  openJsonFiles() { return pickFiles('.json', true); },
  onSerialChoose() {},
  chooseSerial() {},
  onMenu() {},
  onBeforeClose() {},
  closeOk() {},
};

export const desk = window.desk ? { ...window.desk, isWeb: false } : web;
