/**
 * W-62 E5 clip export: the game canvas copied each rendered frame (Phaser's postrender, while the WebGL buffer still
 * holds it) into a 2D canvas with a small PixelArrow watermark, recorded by MediaRecorder (webm, vp9 where the browser
 * has it) and downloaded. The HUD is HTML over the canvas, so it is never in the clip. Nothing is uploaded.
 */
import type Phaser from 'phaser';

/** The clip's longest side at most (a 4K window records at 1080p-ish). */
const MAX_W = 1920;
const FPS = 30;

export function clipType(): string {
  const want = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return typeof MediaRecorder === 'undefined' ? '' : want.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

let logo: HTMLImageElement | null = null;
const loadLogo = () => {
  if (logo) return;
  logo = new Image();
  logo.src = 'icon-192.png';
};

/** The watermark, bottom right: the helmet badge and the name. */
function watermark(c: CanvasRenderingContext2D, w: number, h: number): void {
  const k = Math.max(0.6, h / 720), s = Math.round(30 * k), pad = Math.round(14 * k);
  c.save();
  c.globalAlpha = 0.82;
  c.font = `700 ${Math.round(17 * k)}px Cinzel, serif`;
  c.textBaseline = 'middle';
  const text = 'PixelArrow', tw = c.measureText(text).width, x = w - pad - tw, y = h - pad - s / 2;
  if (logo?.complete && logo.naturalWidth) c.drawImage(logo, x - s - 6 * k, y - s / 2, s, s);
  c.shadowColor = 'rgba(0,0,0,.85)';
  c.shadowBlur = 4 * k;
  c.shadowOffsetY = 1;
  c.fillStyle = '#f2b27a';
  c.fillText(text, x, y + 1);
  c.restore();
}

export interface ClipRec { stop(): Promise<Blob | null>; cancel(): void; readonly ms: number }

/** Start recording the game canvas; stop() gives the webm (null when nothing was recorded). */
export function recordClip(game: Phaser.Game): ClipRec | null {
  const type = clipType(), src = game.canvas;
  if (!type || !src) return null;
  loadLogo();
  const k = Math.min(1, MAX_W / Math.max(src.width, src.height));
  const out = document.createElement('canvas');
  out.width = Math.round((src.width * k) / 2) * 2; // even sizes for the encoder
  out.height = Math.round((src.height * k) / 2) * 2;
  const c = out.getContext('2d')!;
  c.imageSmoothingQuality = 'high';
  const draw = () => {
    c.drawImage(src, 0, 0, out.width, out.height);
    watermark(c, out.width, out.height);
  };
  draw();
  game.events.on('postrender', draw);
  const rec = new MediaRecorder(out.captureStream(FPS), { mimeType: type, videoBitsPerSecond: 10_000_000 });
  const parts: Blob[] = [], t0 = performance.now();
  rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
  rec.start(1000);
  let done: Promise<Blob | null> | null = null;
  const end = () => (done ??= new Promise((ok) => {
    game.events.off('postrender', draw);
    rec.onstop = () => ok(parts.length ? new Blob(parts, { type: 'video/webm' }) : null);
    if (rec.state !== 'inactive') rec.stop();
    else ok(null);
  }));
  return { stop: end, cancel: () => void end(), get ms() { return performance.now() - t0; } };
}

/** Save a blob as a file. */
export function download(b: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
