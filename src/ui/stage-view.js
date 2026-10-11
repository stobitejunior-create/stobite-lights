// Stage: a live 2D plan of the rig. Select by tapping or dragging a box;
// switch to Arrange to move fixtures to where they hang.

import { previewColor } from '../engine/color.js';
import { h, segmented, btn, rgbCss } from './dom.js';

export function createStageView(ctx) {
  const { engine } = ctx;
  let mode = 'select';
  const canvas = h('canvas');
  const wrap = h('div', { class: 'stage-wrap' }, canvas);
  const el = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
    h('div', { class: 'view-header' },
      h('h1', null, 'Stage'),
      h('span', { class: 'sub' }, 'Live view of your rig'),
      h('div', { class: 'spacer' }),
      btn('Line up selected', lineUp, { cls: 'sm ghost', title: 'Space the selected fixtures evenly in a row' }),
      segmented([{ value: 'select', label: 'Select' }, { value: 'arrange', label: 'Arrange' }], mode, (v) => (mode = v)),
    ),
    wrap,
  );
  const g = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let drag = null;

  const ro = new ResizeObserver(() => {
    dpr = devicePixelRatio || 1;
    W = wrap.clientWidth;
    H = wrap.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  });
  ro.observe(wrap);

  const pos = (f) => [f.x * W, f.y * H];
  const R = () => Math.max(10, Math.min(22, W / 50));

  function hit(x, y) {
    const r = R() + 4;
    for (let i = engine.show.fixtures.length - 1; i >= 0; i--) {
      const f = engine.show.fixtures[i];
      const [fx, fy] = pos(f);
      if ((fx - x) ** 2 + (fy - y) ** 2 <= r * r) return f;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const f = hit(x, y);
    if (mode === 'arrange' && f) {
      const sel = engine.prog.selection.includes(f.id) ? engine.prog.selection : [f.id];
      drag = { kind: 'move', x, y, start: sel.map((id) => { const fx = engine.fixById.get(id); return [fx, fx.x, fx.y]; }) };
    } else if (f) {
      engine.select([f.id], e.shiftKey || e.ctrlKey || e.metaKey || mode === 'select' ? 'toggle' : 'set');
    } else {
      drag = { kind: 'box', x, y, x2: x, y2: y, add: e.shiftKey || e.ctrlKey || e.metaKey };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag.kind === 'move') {
      const dx = (x - drag.x) / W, dy = (y - drag.y) / H;
      for (const [f, ox, oy] of drag.start) {
        f.x = Math.min(0.98, Math.max(0.02, ox + dx));
        f.y = Math.min(0.97, Math.max(0.03, oy + dy));
      }
    } else {
      drag.x2 = x;
      drag.y2 = y;
    }
  });
  canvas.addEventListener('pointerup', () => {
    if (drag?.kind === 'move') engine.changed();
    if (drag?.kind === 'box') {
      const [x1, x2] = [Math.min(drag.x, drag.x2), Math.max(drag.x, drag.x2)];
      const [y1, y2] = [Math.min(drag.y, drag.y2), Math.max(drag.y, drag.y2)];
      if (x2 - x1 > 4 || y2 - y1 > 4) {
        const ids = engine.show.fixtures.filter((f) => { const [fx, fy] = pos(f); return fx >= x1 && fx <= x2 && fy >= y1 && fy <= y2; })
          .sort((a, b) => a.x - b.x).map((f) => f.id);
        engine.select(ids, drag.add ? 'add' : 'set');
      } else if (!drag.add) engine.select([]);
    }
    drag = null;
  });

  function lineUp() {
    const sel = engine.prog.selection.map((id) => engine.fixById.get(id)).filter(Boolean);
    if (sel.length < 2) return;
    const y = sel[0].y;
    sel.forEach((f, i) => { f.x = 0.08 + (0.84 * i) / (sel.length - 1); f.y = y; });
    engine.changed();
  }

  function frame() {
    if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // Stage outline and audience edge
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 1;
    g.strokeRect(W * 0.03, H * 0.04, W * 0.94, H * 0.86);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.font = '600 11px system-ui';
    g.textAlign = 'center';
    g.fillText('AUDIENCE', W / 2, H - 10);

    const sel = new Set(engine.prog.selection);
    const r = R();
    const gm = engine.blackout ? 0 : engine.show.settings.grandMaster;
    g.globalCompositeOperation = 'lighter';
    for (const f of engine.show.fixtures) {
      const out = engine.out.get(f.id);
      const ct = engine.ctFor(f.id);
      if (!out || !ct || !ct.has('dim')) continue;
      const dim = (out.dim ?? 0) * gm;
      if (dim < 0.01) continue;
      const col = previewColor(out, ct);
      const [x, y] = pos(f);
      let tx = x, ty = y + r * 4;
      if (ct.hasPosition) {
        const a = (out.pan - 0.5) * Math.PI * 1.5 + Math.PI / 2;
        const len = r * (2 + (out.tilt ?? 0.5) * 6);
        tx = x + Math.cos(a) * len;
        ty = y + Math.sin(a) * len;
      }
      const grad = g.createRadialGradient(tx, ty, 0, tx, ty, r * 3.2);
      grad.addColorStop(0, rgbCss(col, 0.5 * dim));
      grad.addColorStop(1, rgbCss(col, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(tx, ty, r * 3.2, 0, Math.PI * 2);
      g.fill();
      if (ct.hasPosition) {
        g.strokeStyle = rgbCss(col, 0.35 * dim);
        g.lineWidth = r * 0.6;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(tx, ty);
        g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (const f of engine.show.fixtures) {
      const out = engine.out.get(f.id);
      const ct = engine.ctFor(f.id);
      if (!out || !ct) continue;
      const [x, y] = pos(f);
      const dim = ct.has('dim') ? (out.dim ?? 0) * gm : 0;
      const col = previewColor(out, ct);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = '#0d0f14';
      g.fill();
      g.beginPath();
      g.arc(x, y, r - 3, 0, Math.PI * 2);
      g.fillStyle = rgbCss(col.map((c) => c * (0.1 + 0.9 * dim)));
      g.fill();
      g.lineWidth = sel.has(f.id) ? 2.5 : 1;
      g.strokeStyle = sel.has(f.id) ? '#6f8cff' : 'rgba(255,255,255,0.18)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
      if (engine.prog.values[f.id]) {
        g.fillStyle = '#ff5c64';
        g.beginPath();
        g.arc(x + r * 0.75, y - r * 0.75, 3.5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = sel.has(f.id) ? '#c9d4ff' : 'rgba(236,238,244,0.7)';
      g.font = '600 11px system-ui';
      g.fillText(String(f.id), x, y + r + 13);
    }
    if (drag?.kind === 'box') {
      g.fillStyle = 'rgba(111,140,255,0.12)';
      g.strokeStyle = 'rgba(111,140,255,0.8)';
      g.lineWidth = 1;
      const bx = Math.min(drag.x, drag.x2), by = Math.min(drag.y, drag.y2);
      g.fillRect(bx, by, Math.abs(drag.x2 - drag.x), Math.abs(drag.y2 - drag.y));
      g.strokeRect(bx, by, Math.abs(drag.x2 - drag.x), Math.abs(drag.y2 - drag.y));
    }
    if (!engine.show.fixtures.length) {
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.font = '14px system-ui';
      g.fillText('Add fixtures in the Patch to see them here', W / 2, H / 2);
    }
  }

  return { el, frame, destroy: () => ro.disconnect() };
}
