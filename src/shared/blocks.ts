/** Shared block palette, so block games look like one family. */
export const BLOCK_COLORS = [
  '#ef4b4b', // red
  '#ff9a1f', // orange
  '#ffd23f', // yellow
  '#3ccf6e', // green
  '#27c2e8', // cyan
  '#3d7bff', // blue
  '#a259ff', // purple
  '#ff5fa8', // pink
] as const;

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number) => {
    const target = amount < 0 ? 0 : 255;
    return Math.round(v + (target - v) * Math.abs(amount));
  };
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Pre-renders a glossy block of `px` device pixels in the given color. Cache the result. */
export function renderBlock(base: string, px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const inset = px * 0.04;
  const s = px - inset * 2;
  const r = px * 0.14;
  // Dark rim
  g.fillStyle = shade(base, -0.35);
  roundRect(g, inset, inset, s, s, r);
  g.fill();
  // Main face
  const grad = g.createLinearGradient(0, inset, 0, inset + s);
  grad.addColorStop(0, shade(base, 0.18));
  grad.addColorStop(1, base);
  g.fillStyle = grad;
  roundRect(g, inset + px * 0.07, inset + px * 0.05, s - px * 0.14, s - px * 0.15, r * 0.7);
  g.fill();
  // Gloss
  g.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(g, inset + px * 0.14, inset + px * 0.1, s - px * 0.28, px * 0.12, px * 0.06);
  g.fill();
  return c;
}
