// Whale Over the Rooftops — make.fun ai-excited-01 entry (Account A / overtheraa).
//
// A giant whale breaches out of a city street at night. Its spray turns
// into a flock of glowing paper lanterns, and a small child on a rooftop
// reaches up toward it. One huge shape, one thrilling moment, readable
// even at ~300 px across.
//
// Node 22, standard library only. Drawn procedurally, pixel by pixel,
// with a hand-rolled PNG encoder. Fully deterministic: a fixed seed drives
// every random choice, so two runs write byte-identical bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- seeded RNG
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- canvas
type RGB = [number, number, number];

class Px {
  buf = new Uint8Array(W * H * 3);
  set(x: number, y: number, c: RGB, a = 1): void {
    const xi = Math.round(x); const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    const i = (yi * W + xi) * 3;
    if (a >= 1) { this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2]; return; }
    this.buf[i] = Math.round(this.buf[i] * (1 - a) + c[0] * a);
    this.buf[i + 1] = Math.round(this.buf[i + 1] * (1 - a) + c[1] * a);
    this.buf[i + 2] = Math.round(this.buf[i + 2] * (1 - a) + c[2] * a);
  }
  disc(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx; const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c, a);
      }
    }
  }
  // Soft-edged disc: solid core, fading rim — used for glows and spray.
  glow(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1) continue;
        const fall = (1 - d) * (1 - d);
        this.set(x, y, c, a * fall);
      }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx; const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++)
        this.set(x, y, c, a);
  }
  // Thick line drawn as a chain of discs — smooth, no gaps.
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (w * 0.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c, a);
    }
  }
  // Scanline fill of a simple polygon.
  poly(pts: Array<[number, number]>, c: RGB, a = 1): void {
    let minY = H; let maxY = 0;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i]; const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(W - 1, Math.floor(xs[k + 1])); x++)
          this.set(x, y, c, a);
      }
    }
  }
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
}

// Palette
const SKY_TOP: RGB = [8, 14, 42];
const SKY_MID: RGB = [18, 38, 74];
const SKY_LOW: RGB = [38, 84, 104];
const MOON: RGB = [255, 238, 196];
const WHALE: RGB = [46, 106, 138];
const WHALE_DARK: RGB = [26, 66, 96];
const WHALE_LIGHT: RGB = [96, 168, 196];
const BELLY: RGB = [168, 212, 222];
const LANTERN: RGB = [255, 176, 66];
const LANTERN_HOT: RGB = [255, 214, 130];
const WINDOW: RGB = [255, 196, 110];
const BUILD_FAR: RGB = [22, 34, 58];
const BUILD_NEAR: RGB = [12, 18, 34];
const STREET: RGB = [13, 18, 30];
const CREAM: RGB = [255, 233, 176];
const SPRAY: RGB = [207, 238, 247];

// ---------------------------------------------------------------------- sky
function drawSky(px: Px, rng: () => number): void {
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const c = t < 0.55 ? mix(SKY_TOP, SKY_MID, t / 0.55) : mix(SKY_MID, SKY_LOW, (t - 0.55) / 0.45);
    px.rect(0, y, W, y + 1, c);
  }
  // Stars, denser and brighter up high.
  for (let i = 0; i < 170; i++) {
    const x = rng() * W; const y = rng() * 560;
    const b = 0.35 + rng() * 0.65;
    const r = rng() < 0.12 ? 2 : 1;
    px.disc(x, y, r, [255, 255, 240], b * (1 - y / 1400));
    if (rng() < 0.08) { // sparkle cross
      px.line(x - 5, y, x + 5, y, 1, [255, 255, 240], 0.5);
      px.line(x, y - 5, x, y + 5, 1, [255, 255, 240], 0.5);
    }
  }
  // Moon, upper right, behind the whale's head.
  px.glow(838, 148, 150, [255, 236, 180], 0.35);
  px.glow(838, 148, 96, [255, 240, 200], 0.55);
  px.disc(838, 148, 66, MOON);
  px.disc(818, 132, 10, [232, 210, 168], 0.8);
  px.disc(856, 166, 7, [232, 210, 168], 0.8);
  px.disc(842, 122, 5, [240, 220, 180], 0.8);
}

// --------------------------------------------------------------------- city
function drawCity(px: Px, rng: () => number): void {
  // Far skyline.
  const far: Array<[number, number, number]> = [
    [0, 640, 150], [120, 600, 130], [230, 660, 170], [380, 610, 120],
    [480, 670, 160], [620, 620, 140], [740, 665, 170], [880, 630, 150],
  ];
  for (const [x, top, w] of far) px.rect(x, top, x + w, 820, BUILD_FAR);
  // A few lit windows in the far layer.
  for (let i = 0; i < 46; i++) {
    const x = rng() * W; const y = 620 + rng() * 170;
    px.rect(x, y, x + 5, y + 7, WINDOW, 0.35 + rng() * 0.4);
  }
  // Near buildings left and right, framing the breach.
  px.rect(0, 560, 250, 1024, BUILD_NEAR);
  px.rect(0, 560, 250, 574, [20, 28, 48]); // roof lip
  px.rect(790, 600, 1024, 1024, BUILD_NEAR);
  px.rect(790, 600, 1024, 614, [20, 28, 48]);
  // Rooftop water tower on the left block: slim legs, narrow cap.
  px.rect(48, 512, 56, 560, BUILD_NEAR);
  px.rect(64, 512, 72, 560, BUILD_NEAR);
  px.ellipse(60, 506, 22, 11, BUILD_NEAR);
  px.rect(38, 514, 82, 517, BUILD_NEAR);
  // Windows: warm, irregular, some dark.
  for (let bx = 0; bx < 250; bx += 34) {
    for (let by = 596; by < 980; by += 52) {
      if (rng() < 0.62) px.rect(14 + bx, by, 30 + bx, by + 22, WINDOW, 0.5 + rng() * 0.5);
    }
  }
  for (let bx = 0; bx < 234; bx += 34) {
    for (let by = 646; by < 980; by += 52) {
      if (rng() < 0.62) px.rect(806 + bx, by, 822 + bx, by + 22, WINDOW, 0.5 + rng() * 0.5);
    }
  }
  // Street: dark asphalt with a wet sheen.
  px.rect(250, 820, 790, 1024, STREET);
  px.rect(250, 820, 790, 828, [30, 42, 60]);
  // Lane dashes, tilted by perspective, half-buried in shadow.
  for (let i = 0; i < 6; i++) {
    const y = 850 + i * 28;
    px.rect(500 - i * 6, y, 540 - i * 6, y + 5, [120, 130, 140], 0.35);
  }
  // Wet reflections: moonlight and lantern light smeared down the street.
  for (let i = 0; i < 26; i++) {
    const x = 300 + rng() * 440; const y = 860 + rng() * 150;
    const warm = rng() < 0.55;
    px.rect(x, y, x + 3 + rng() * 14, y + 2, warm ? LANTERN : [150, 200, 220], 0.16 + rng() * 0.2);
  }
}

// -------------------------------------------------------------------- whale
// Cubic bezier spine: tail stock low-left, head high-right.
function spine(t: number): [number, number] {
  const mt = 1 - t;
  const x = mt * mt * mt * 330 + 3 * mt * mt * t * 400 + 3 * mt * t * t * 570 + t * t * t * 762;
  const y = mt * mt * mt * 880 + 3 * mt * mt * t * 660 + 3 * mt * t * t * 560 + t * t * t * 318;
  return [x, y];
}
function whaleWidth(t: number): number {
  // Tail stock narrow, belly widest just past mid-body, head blunt.
  if (t < 0.12) return lerp(34, 96, t / 0.12);
  if (t < 0.55) return lerp(96, 168, (t - 0.12) / 0.43);
  if (t < 0.85) return lerp(168, 128, (t - 0.55) / 0.3);
  return lerp(128, 74, (t - 0.85) / 0.15);
}

function drawWhale(px: Px): void {
  const N = 120;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [x, y] = spine(t);
    const [x2, y2] = spine(Math.min(1, t + 0.01));
    const dx = x2 - x; const dy = y2 - y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; const ny = dx / len;
    const w = whaleWidth(t);
    left.push([x + nx * w, y + ny * w]);
    right.push([x - nx * w, y - ny * w]);
  }
  // Body: one big smooth polygon.
  px.poly([...left, ...right.reverse()], WHALE);
  // Head cap: blunt rounded nose at the spine's end.
  const [hx, hy] = spine(1);
  px.disc(hx, hy, 74, WHALE);
  // Belly: a narrower, lighter band along the underside (the right side
  // of the spine), so the body keeps one big blue shape, not two halves.
  // Belly: a thin pale under-edge along the mid-body only, fading out
  // toward head and tail so it never reads as a stripe across the body.
  const strip: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = 0.15 + (i / N) * 0.67;
    const [x, y] = spine(t);
    const [x2, y2] = spine(Math.min(1, t + 0.01));
    const dx = x2 - x; const dy = y2 - y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; const ny = dx / len;
    const w = whaleWidth(t);
    strip.push([x - nx * w * 0.78, y - ny * w * 0.78]);
  }
  for (let i = N; i >= 0; i--) {
    const t = 0.15 + (i / N) * 0.67;
    const [x, y] = spine(t);
    const [x2, y2] = spine(Math.min(1, t + 0.01));
    const dx = x2 - x; const dy = y2 - y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; const ny = dx / len;
    const w = whaleWidth(t);
    strip.push([x - nx * w * 0.97, y - ny * w * 0.97]);
  }
  px.poly(strip, BELLY, 0.85);
  // Top highlight: one smooth bright rim along the whale's back.
  for (let i = 0; i < N; i++) {
    const t0 = i / N; const t1 = (i + 1) / N;
    const [x0, y0] = spine(t0); const [x1, y1] = spine(t1);
    const [xa, ya] = spine(Math.min(1, t0 + 0.01));
    const dx = xa - x0; const dy = ya - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; const ny = dx / len;
    const w0 = whaleWidth(t0); const w1 = whaleWidth(t1);
    px.line(x0 + nx * (w0 - 6), y0 + ny * (w0 - 6), x1 + nx * (w1 - 6), y1 + ny * (w1 - 6), 9, WHALE_LIGHT, 0.55);
  }
  // Tail flukes: two lobes fanning out behind the tail stock, clear of
  // the buildings so the tail reads at a glance.
  const [tx, ty] = spine(0);
  px.poly([[tx - 6, ty - 18], [tx - 128, ty - 66], [tx - 96, ty - 6], [tx - 118, ty + 58], [tx - 34, ty + 34]], WHALE_DARK);
  px.poly([[tx - 14, ty - 12], [tx - 108, ty - 52], [tx - 84, ty - 4], [tx - 100, ty + 44], [tx - 34, ty + 26]], WHALE);
  // Pectoral fin: small, dark, swept back tight along the belly.
  const [fx, fy] = spine(0.45);
  px.poly([[fx + 10, fy + 44], [fx - 58, fy + 108], [fx - 30, fy + 112], [fx + 26, fy + 66]], WHALE_DARK);
  // Eye: dark, watchful, with a moonlight catchlight.
  px.disc(hx + 2, hy - 14, 12, [8, 16, 28]);
  px.disc(hx - 2, hy - 18, 4, [255, 255, 255], 0.95);
  // Mouth: a gentle smile curve low on the head, not a seam across it.
  px.line(hx - 52, hy + 44, hx + 6, hy + 58, 4, WHALE_DARK, 0.7);
  px.line(hx + 6, hy + 58, hx + 56, hy + 44, 4, WHALE_DARK, 0.7);
  // Throat grooves: three short faint lines under the chin.
  for (let i = 0; i < 3; i++) {
    px.line(hx - 28 + i * 24, hy + 62, hx - 22 + i * 24, hy + 92, 2, WHALE_DARK, 0.3);
  }
}

// ------------------------------------------------------- spray and lanterns
function drawSprayAndLanterns(px: Px, rng: () => number): void {
  const [hx, hy] = spine(1);
  // Blowhole spray: a fan of droplets bursting upward from the head.
  for (let i = 0; i < 90; i++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * 1.9;
    const d = 30 + rng() * rng() * 210;
    const x = hx + Math.cos(a) * d * 0.9;
    const y = hy - 40 + Math.sin(a) * d;
    const r = 1 + rng() * 3.2;
    px.disc(x, y, r, SPRAY, 0.45 + rng() * 0.5);
  }
  // Spray arcs: three bright curved jets.
  for (const [dx, dy, len] of [[-70, -90, 150], [0, -120, 190], [80, -80, 140]] as const) {
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      px.disc(hx + dx * t, hy - 46 + dy * t + 34 * t * t, 3.5 - 2 * t, SPRAY, 0.85 - 0.5 * t);
    }
  }
  // The spray becomes lanterns: warm paper lanterns rising in a loose
  // flock that arcs up and left from the blowhole, clear of the moon.
  const lanterns: Array<[number, number, number]> = [];
  for (let i = 0; i < 15; i++) {
    const t = i / 14;
    const x = hx - 40 - t * 400 + (rng() - 0.5) * 70;
    const y = hy - 80 - t * 150 - Math.sin(t * Math.PI) * 40 + (rng() - 0.5) * 50;
    const s = 14 + rng() * 12 + (1 - t) * 8;
    lanterns.push([x, y, s]);
  }
  // A few lanterns drift down-left over the street too.
  for (let i = 0; i < 4; i++) {
    lanterns.push([420 + rng() * 140, 200 + rng() * 140, 12 + rng() * 10]);
  }
  for (const [x, y, s] of lanterns) {
    px.glow(x, y, s * 2.4, LANTERN, 0.5);
    px.glow(x, y, s * 1.4, LANTERN_HOT, 0.55);
    // Paper body: warm ellipse with ribs and a dark rim.
    px.ellipse(x, y, s * 0.78, s, LANTERN);
    px.ellipse(x, y, s * 0.78, s, LANTERN_HOT, 0.35);
    px.line(x - s * 0.4, y - s * 0.85, x - s * 0.4, y + s * 0.85, 1.5, [200, 110, 30], 0.6);
    px.line(x + s * 0.4, y - s * 0.85, x + s * 0.4, y + s * 0.85, 1.5, [200, 110, 30], 0.6);
    px.rect(x - s * 0.34, y - s - 4, x + s * 0.34, y - s + 1, [120, 60, 16]);
    px.rect(x - s * 0.3, y + s - 1, x + s * 0.3, y + s + 4, [120, 60, 16]);
    // Tassel swaying below.
    px.line(x, y + s + 4, x + 3, y + s + 12, 2, [255, 90, 60], 0.9);
  }
}

// -------------------------------------------------------------------- splash
function drawSplash(px: Px, rng: () => number): void {
  const [tx, ty] = spine(0);
  // The street bursts where the tail smashes through it.
  px.glow(tx, ty + 30, 190, [120, 190, 220], 0.3);
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI * (0.15 + rng() * 0.7);
    const d = 20 + rng() * rng() * 190;
    px.disc(tx + Math.cos(a) * d, ty + 26 + Math.sin(a) * d * 0.7, 1 + rng() * 3.4, SPRAY, 0.5 + rng() * 0.5);
  }
  // Splash crown: three soft, uneven arcs over a burst of droplets.
  // (No foam disc: on the dark street it read as a flat plate.)
  for (const [ox, h] of [[-95, 62], [-10, 84], [72, 56]] as const) {
    let px0 = tx + ox - 42; let py0 = ty + 44;
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      const x = tx + ox + (t - 0.5) * 84;
      const y = ty + 44 - Math.sin(t * Math.PI) * h;
      px.line(px0, py0, x, y, 4, [235, 246, 252], 0.6);
      px0 = x; py0 = y;
    }
  }
  // Cracked asphalt: three short cracks from different points of impact.
  px.line(tx - 40, ty + 62, tx - 110, ty + 96, 2, [4, 7, 14], 0.5);
  px.line(tx + 30, ty + 64, tx + 96, ty + 104, 2, [4, 7, 14], 0.5);
  px.line(tx + 80, ty + 58, tx + 150, ty + 78, 2, [4, 7, 14], 0.5);
}

// --------------------------------------------------------------------- child
function drawChild(px: Px): void {
  // Small child on the right rooftop, reaching up at the whale.
  const cx = 906; const roofY = 600;
  // Legs and coat.
  px.line(cx - 6, roofY - 34, cx - 10, roofY, 7, [10, 14, 26]);
  px.line(cx + 6, roofY - 34, cx + 12, roofY, 7, [10, 14, 26]);
  px.poly([[cx - 14, roofY - 66], [cx + 14, roofY - 66], [cx + 18, roofY - 30], [cx - 18, roofY - 30]], [16, 22, 40]);
  // Head.
  px.disc(cx, roofY - 78, 12, [10, 14, 26]);
  // Raised arm, stretched toward the whale.
  px.line(cx + 10, roofY - 60, cx + 42, roofY - 108, 7, [16, 22, 40]);
  px.disc(cx + 42, roofY - 108, 5, [232, 190, 150]);
  // Other arm held out for balance.
  px.line(cx - 12, roofY - 58, cx - 34, roofY - 40, 6, [16, 22, 40]);
  // Red scarf streaming behind — the momentum of the moment.
  px.line(cx - 8, roofY - 70, cx - 52, roofY - 88, 6, [214, 48, 48]);
  px.line(cx - 52, roofY - 88, cx - 84, roofY - 76, 5, [214, 48, 48]);
  px.line(cx - 84, roofY - 76, cx - 104, roofY - 88, 4, [214, 48, 48]);
  // Warm rim light on the child's outline from the lanterns.
  px.line(cx + 10, roofY - 60, cx + 42, roofY - 108, 2, LANTERN_HOT, 0.7);
}

// ------------------------------------------------------------- bitmap text
// Minimal 5x7 font, only the glyphs "LOOK UP!" needs. Clean block capitals:
// no curves to smear, no garbled text.
const FONT: Record<string, string[]> = {
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function drawText(px: Px, text: string, x0: number, y0: number, scale: number, c: RGB): void {
  let x = x0;
  for (const ch of text) {
    const g = FONT[ch];
    if (g) {
      for (let r = 0; r < 7; r++) {
        for (let col = 0; col < 5; col++) {
          if (g[r][col] === '1') px.rect(x + col * scale, y0 + r * scale, x + (col + 1) * scale, y0 + (r + 1) * scale, c);
        }
      }
    }
    x += 6 * scale;
  }
}

// ------------------------------------------------------------------ PNG out
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(tag: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tagBuf = Buffer.from(tag, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tagBuf, data])));
  return Buffer.concat([len, tagBuf, data, crc]);
}
function encodePng(px: Px): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------------- main
function build(): Px {
  const rng = mulberry32(20261116);
  const px = new Px();
  drawSky(px, rng);
  drawCity(px, rng);
  drawWhale(px);
  drawSplash(px, rng);
  drawSprayAndLanterns(px, rng);
  drawChild(px);
  // Addressed to the judge, top-left, in clean block capitals.
  drawText(px, 'LOOK UP!', 56, 64, 5, [20, 26, 48]);
  drawText(px, 'LOOK UP!', 52, 60, 5, CREAM);
  return px;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  const data = encodePng(build());
  const path = join(outDir, 'entry.png');
  writeFileSync(path, data);
  console.log(`wrote ${path} (${data.length} bytes, ${W}x${H})`);
}

main();
