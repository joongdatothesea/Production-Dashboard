/**
 * chartRenderer.ts
 * Renders charts to base64 PNG using offscreen Canvas (runs in browser).
 */

export interface Dataset { label: string; data: number[]; color: string; }

function setupCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return [c, ctx];
}

const GREEN  = '#1a6b3a';
const GRAY   = '#94a3b8';
const DARK   = '#1e293b';
const AM_CLR = '#3b82f6';
const PM_CLR = '#f97316';

/** Stacked / grouped bar chart */
export function renderBarChart(opts: {
  title: string;
  labels: string[];
  datasets: Dataset[];
  stacked?: boolean;
  unit?: string;
  w?: number; h?: number;
}): string {
  const W = opts.w || 640, H = opts.h || 300;
  const PAD = { top: 44, right: 20, bottom: 56, left: 58 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const [canvas, ctx] = setupCanvas(W, H);

  // Title
  ctx.fillStyle = DARK; ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(opts.title, W / 2, 26);

  // Max value
  const maxes = opts.labels.map((_, i) =>
    opts.stacked
      ? opts.datasets.reduce((s, d) => s + (d.data[i] || 0), 0)
      : Math.max(...opts.datasets.map(d => d.data[i] || 0))
  );
  const maxVal = Math.max(...maxes, 1) * 1.15;

  // Grid
  const gridN = 4;
  for (let i = 0; i <= gridN; i++) {
    const y = PAD.top + cH - (i / gridN) * cH;
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    ctx.fillStyle = GRAY; ctx.font = '10px Arial'; ctx.textAlign = 'right';
    ctx.fillText(((maxVal * i / gridN)).toFixed(0) + (opts.unit || ''), PAD.left - 5, y + 4);
  }

  // Bars
  const nG = opts.labels.length;
  const gW = cW / nG;
  const ds = opts.datasets;

  opts.labels.forEach((lbl, gi) => {
    const gX = PAD.left + gi * gW;
    if (opts.stacked) {
      let stackY = PAD.top + cH;
      ds.forEach(d => {
        const v = d.data[gi] || 0;
        const bH = (v / maxVal) * cH;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.roundRect?.(gX + gW * 0.12, stackY - bH, gW * 0.76, bH, stackY - bH === PAD.top ? [3,3,0,0] : 0);
        ctx.fill();
        stackY -= bH;
      });
    } else {
      const bW = (gW * 0.7) / ds.length;
      ds.forEach((d, di) => {
        const v = d.data[gi] || 0;
        const bH = (v / maxVal) * cH;
        const bX = gX + gW * 0.12 + di * bW;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.roundRect?.(bX, PAD.top + cH - bH, bW - 2, bH, [3,3,0,0]);
        ctx.fill();
      });
    }
    // X label
    ctx.fillStyle = '#475569'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
    const shortLbl = lbl.length > 8 ? lbl.slice(0, 8) + '…' : lbl;
    ctx.fillText(shortLbl, gX + gW / 2, PAD.top + cH + 16);
  });

  // Axis lines
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top); ctx.lineTo(PAD.left, PAD.top + cH);
  ctx.lineTo(PAD.left + cW, PAD.top + cH); ctx.stroke();

  // Legend
  let legX = PAD.left;
  ds.forEach(d => {
    ctx.fillStyle = d.color; ctx.fillRect(legX, H - 18, 12, 10);
    ctx.fillStyle = '#475569'; ctx.font = '10px Arial'; ctx.textAlign = 'left';
    ctx.fillText(d.label, legX + 16, H - 10);
    legX += ctx.measureText(d.label).width + 32;
  });

  return canvas.toDataURL('image/png');
}

/** Horizontal bar chart (e.g. machine downtime ranking) */
export function renderHBarChart(opts: {
  title: string;
  labels: string[];
  values: number[];
  color?: string;
  unit?: string;
  w?: number; h?: number;
}): string {
  const W = opts.w || 520, H = opts.h || Math.max(220, opts.labels.length * 38 + 80);
  const PAD = { top: 44, right: 80, bottom: 24, left: 80 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const [canvas, ctx] = setupCanvas(W, H);

  ctx.fillStyle = DARK; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
  ctx.fillText(opts.title, W / 2, 26);

  const maxVal = Math.max(...opts.values, 1) * 1.15;
  const barH = cH / opts.labels.length;

  opts.labels.forEach((lbl, i) => {
    const v = opts.values[i] || 0;
    const bW = (v / maxVal) * cW;
    const y = PAD.top + i * barH;

    ctx.fillStyle = opts.color || GREEN;
    ctx.beginPath();
    ctx.roundRect?.(PAD.left, y + barH * 0.15, bW, barH * 0.65, [0, 3, 3, 0]);
    ctx.fill();

    // Label
    ctx.fillStyle = DARK; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'right';
    ctx.fillText(lbl, PAD.left - 6, y + barH * 0.6);

    // Value
    ctx.fillStyle = '#475569'; ctx.font = '11px Arial'; ctx.textAlign = 'left';
    ctx.fillText(v.toFixed(1) + (opts.unit || ''), PAD.left + bW + 6, y + barH * 0.6);
  });

  return canvas.toDataURL('image/png');
}

/** KPI donut / gauge (single metric) */
export function renderGauge(opts: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  color?: string;
  w?: number; h?: number;
}): string {
  const W = opts.w || 200, H = opts.h || 200;
  const [canvas, ctx] = setupCanvas(W, H);
  const cx = W / 2, cy = H / 2 + 10, r = Math.min(W, H) * 0.38;
  const pct = Math.min(opts.value / opts.max, 1);
  const startA = Math.PI * 0.75, endA = startA + pct * Math.PI * 1.5;
  const fullEnd = startA + Math.PI * 1.5;

  // Background arc
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 14; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, startA, fullEnd); ctx.stroke();

  // Value arc
  ctx.strokeStyle = opts.color || GREEN; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(cx, cy, r, startA, endA); ctx.stroke();

  // Value text
  ctx.fillStyle = DARK; ctx.font = `bold ${Math.floor(r * 0.55)}px Arial`; ctx.textAlign = 'center';
  ctx.fillText(opts.value.toFixed(0) + (opts.unit || ''), cx, cy + r * 0.2);

  // Label
  ctx.fillStyle = GRAY; ctx.font = '11px Arial';
  ctx.fillText(opts.label, cx, cy + r * 0.65);

  return canvas.toDataURL('image/png');
}

/** Convert base64 dataURL → Uint8Array for docx ImageRun */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
