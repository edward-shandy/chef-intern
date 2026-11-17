import * as THREE from "three";
import { TAU, blobPath, glowTexture, paint, rng } from "./spaceArt";

// Every painted texture used outside the station. Poster style: flat colour bands with crisp edges, a thin dark line
// and a thin light line at each edge, and fine turbulence lines inside the bands. All at most 1024x512.

type Ctx = CanvasRenderingContext2D;

// A wavy horizontal line made of whole sine periods, so it wraps seamlessly around a sphere.
const wave = (x: number, w: number, base: number, amps: number[], freqs: number[], phases: number[]): number => {
  let y = base;
  for (let i = 0; i < amps.length; i++) y += amps[i] * Math.sin((x / w) * TAU * freqs[i] + phases[i]);
  return y;
};

// ---- The hero planet: a warm gas giant striped like a layered dessert ------------------------------------------

export function heroTexture(): THREE.CanvasTexture {
  return paint(1024, 512, (ctx, W, H) => {
    const rand = rng(7);
    const bands: Array<[number, string, string]> = [
      [0.0, "#d9a081", "#c98a74"],
      [0.07, "#ecd2a0", "#e5c18a"],
      [0.15, "#e8a23e", "#df9433"],
      [0.25, "#f3bd92", "#eaa57b"],
      [0.33, "#dc6b57", "#cf5a4e"],
      [0.4, "#f0cb7e", "#e8b968"],
      [0.5, "#ecd5aa", "#e3c295"],
      [0.58, "#e49b45", "#d98a3a"],
      [0.67, "#d4776a", "#c4655e"],
      [0.74, "#f2c79e", "#e8b185"],
      [0.82, "#e6a842", "#da963a"],
      [0.9, "#cf8a78", "#b97368"],
    ];
    const edges = bands.map((b, i) => ({
      y: b[0] * H,
      amps: [2 + rand() * 4, 1.5 + rand() * 3, 1 + rand() * 1.6],
      freqs: [2 + (i % 3), 5 + (i % 4), 9 + (i % 5)],
      phases: [rand() * TAU, rand() * TAU, rand() * TAU],
    }));
    const edgeY = (i: number, x: number) => wave(x, W, edges[i].y, edges[i].amps, edges[i].freqs, edges[i].phases);
    const trace = (ctx2: Ctx, i: number, dy = 0) => {
      ctx2.beginPath();
      for (let x = 0; x <= W; x += 6) ctx2[x === 0 ? "moveTo" : "lineTo"](x, edgeY(i, x) + dy);
    };
    ctx.fillStyle = bands[0][1];
    ctx.fillRect(0, 0, W, H);
    bands.forEach((band, i) => {
      const top = edges[i].y;
      const bottom = i + 1 < bands.length ? edges[i + 1].y : H;
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, band[1]);
      g.addColorStop(1, band[2]);
      ctx.fillStyle = g;
      trace(ctx, i);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();
    });
    // Crisp band edges: a dark line with a light line just under it.
    for (let i = 1; i < bands.length; i++) {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "rgba(110, 46, 52, 0.32)";
      trace(ctx, i);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(255, 238, 208, 0.38)";
      trace(ctx, i, 3.5);
      ctx.stroke();
    }
    // Fine turbulence lines inside every band.
    for (let i = 0; i < bands.length; i++) {
      const top = edges[i].y;
      const bottom = i + 1 < bands.length ? edges[i + 1].y : H;
      const lines = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < lines; k++) {
        const t = 0.15 + (k / lines) * 0.75 + rand() * 0.08;
        const amps = [1.5 + rand() * 3, 1 + rand() * 2];
        const freqs = [3 + Math.floor(rand() * 5), 8 + Math.floor(rand() * 6)];
        const phases = [rand() * TAU, rand() * TAU];
        ctx.beginPath();
        for (let x = 0; x <= W; x += 5) {
          const y = top + (bottom - top) * t + wave(x, W, 0, amps, freqs, phases);
          ctx[x === 0 ? "moveTo" : "lineTo"](x, y);
        }
        ctx.lineWidth = 0.8 + rand() * 1.4;
        ctx.strokeStyle = rand() > 0.5 ? "rgba(255, 244, 220, 0.26)" : "rgba(120, 52, 48, 0.2)";
        ctx.stroke();
      }
    }
    // Cream scallops along a few band edges, like whipped froth.
    for (const i of [2, 4, 7, 9]) {
      for (let k = 0; k < 16; k++) {
        const x = rand() * W;
        ctx.fillStyle = "rgba(250, 232, 200, 0.55)";
        ctx.beginPath();
        ctx.ellipse(x, edgeY(i, x) + 6, 14 + rand() * 26, 3 + rand() * 4, 0, 0, TAU);
        ctx.fill();
      }
    }
    // The great storm: a layered swirl with a dark ring, plus a small cream cousin.
    const storm = (x: number, y: number, rx: number, ry: number) => {
      const layers: Array<[number, string]> = [[1.18, "#a8453f"], [1, "#d8624f"], [0.74, "#f0a47e"], [0.5, "#f7d2a6"], [0.26, "#e0765a"]];
      for (const [k, colour] of layers) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.ellipse(x, y, rx * k, ry * k, 0, 0, TAU);
        ctx.fill();
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 240, 214, 0.55)";
      ctx.beginPath();
      for (let t = 0; t < 3.4 * Math.PI; t += 0.1) {
        const k = 0.9 - t / (3.4 * Math.PI) * 0.8;
        const px = x + Math.cos(t) * rx * k;
        const py = y + Math.sin(t) * ry * k;
        t === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = "rgba(110, 40, 44, 0.4)";
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 1.18, ry * 1.18, 0, 0, TAU);
      ctx.stroke();
    };
    storm(690, 338, 108, 58);
    storm(248, 196, 36, 19);
    // A wake of curls trailing off the big storm.
    ctx.strokeStyle = "rgba(255, 236, 206, 0.45)";
    ctx.lineWidth = 2.2;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(830 + k * 34, 338 + (k % 2) * 10 - 5, 22, 9, 0, 0.3, Math.PI * 1.7);
      ctx.stroke();
    }
    // The poles melt into a dusty rose-violet so the globe closes up softly.
    for (const [from, to, y0] of [[0, 1, 0], [1, 0, H]] as Array<[number, number, number]>) {
      const g = ctx.createLinearGradient(0, y0, 0, y0 === 0 ? H * 0.16 : H * 0.84);
      g.addColorStop(from, "rgba(120, 78, 128, 0.62)");
      g.addColorStop(to, "rgba(120, 78, 128, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y0 === 0 ? 0 : H * 0.84, W, H * 0.16);
    }
  });
}

// The ring is a strip painted across its width: x runs from the inner edge to the outer one.
export function ringTexture(): THREE.CanvasTexture {
  return paint(1024, 4, (ctx, W, H) => {
    const rand = rng(31);
    const bands: Array<[number, number, string, number]> = [
      [0.02, 0.07, "#e8caa8", 0.35],
      [0.07, 0.3, "#ecd8b4", 0.9],
      [0.3, 0.34, "#ecd8b4", 0.0],
      [0.34, 0.5, "#e8a98a", 0.88],
      [0.5, 0.64, "#f0c27a", 0.85],
      [0.64, 0.69, "#f0c27a", 0.0],
      [0.69, 0.9, "#b4dce2", 0.8],
      [0.9, 0.97, "#d6e8ee", 0.32],
    ];
    ctx.clearRect(0, 0, W, H);
    for (const [a, b, colour, alpha] of bands) {
      if (alpha === 0) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colour;
      ctx.fillRect(a * W, 0, (b - a) * W, H);
      // The edges of each band are a touch denser, like a painted line.
      ctx.globalAlpha = Math.min(1, alpha + 0.1);
      ctx.fillStyle = "rgba(255, 244, 226, 0.5)";
      ctx.fillRect(a * W, 0, 3, H);
      ctx.fillStyle = "rgba(120, 70, 70, 0.35)";
      ctx.fillRect(b * W - 3, 0, 3, H);
    }
    for (let i = 0; i < 150; i++) {
      const x = rand() * W;
      ctx.globalAlpha = 0.12 + rand() * 0.2;
      ctx.fillStyle = rand() > 0.5 ? "#fff3dc" : "#7a4a52";
      ctx.fillRect(x, 0, 1 + rand() * 2.4, H);
    }
    ctx.globalAlpha = 1;
  });
}

// ---- The small blue home planet ---------------------------------------------------------------------------------

export function homeTexture(): THREE.CanvasTexture {
  return paint(512, 256, (ctx, W, H) => {
    const sea = ctx.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, "#2a58ac");
    sea.addColorStop(0.5, "#3f8fdc");
    sea.addColorStop(1, "#2a58ac");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, W, H);
    const lands: Array<[number, number, number, number]> = [
      [110, 112, 52, 1],
      [196, 156, 34, 2],
      [300, 96, 56, 3],
      [372, 168, 40, 4],
      [454, 120, 38, 5],
      [60, 170, 26, 6],
      [250, 64, 24, 7],
    ];
    // Shallow water halo, then the land, then a pale coast line, then lighter highlands and darker ridges.
    ctx.fillStyle = "rgba(96, 206, 220, 0.55)";
    for (const [x, y, r, s] of lands) {
      blobPath(ctx, x, y, r * 1.28, s * 11, 14, 0.4, 0.8);
      ctx.fill();
    }
    for (const [x, y, r, s] of lands) {
      blobPath(ctx, x, y, r, s * 11, 14, 0.4, 0.8);
      ctx.fillStyle = "#58a860";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#eadca2";
      ctx.stroke();
      blobPath(ctx, x - r * 0.12, y - r * 0.1, r * 0.62, s * 5, 12, 0.5, 0.8);
      ctx.fillStyle = "#7cc476";
      ctx.fill();
      blobPath(ctx, x + r * 0.2, y + r * 0.18, r * 0.3, s * 9, 10, 0.5, 0.8);
      ctx.fillStyle = "#dcc678";
      ctx.fill();
      ctx.strokeStyle = "rgba(34, 96, 64, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y + r * 0.2);
      ctx.quadraticCurveTo(x, y - r * 0.2, x + r * 0.4, y + r * 0.1);
      ctx.stroke();
    }
    // Ice caps with a scalloped edge.
    ctx.fillStyle = "#e2edf6";
    for (const y0 of [0, H]) {
      ctx.beginPath();
      ctx.moveTo(0, y0);
      const dir = y0 === 0 ? 1 : -1;
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y0 + dir * (20 + 8 * Math.sin(x * 0.11) + 5 * Math.sin(x * 0.37)));
      ctx.lineTo(W, y0);
      ctx.closePath();
      ctx.fill();
    }
  });
}

// Cartoon clouds on a transparent layer: bubbly cream tops with a soft blue underside.
export function cloudTexture(): THREE.CanvasTexture {
  return paint(512, 256, (ctx, W, H) => {
    const rand = rng(91);
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      const cx = rand() * W;
      const cy = 34 + rand() * (H - 68);
      const s = 0.7 + rand() * 0.9;
      const puffs = 3 + Math.floor(rand() * 3);
      for (const pass of [0, 1]) {
        ctx.fillStyle = pass === 0 ? "#a9b8da" : "#e6ecf6";
        for (let k = 0; k < puffs; k++) {
          const px = cx + (k - puffs / 2) * 14 * s;
          const py = cy + (pass === 0 ? 4 : 0) - Math.sin((k / (puffs - 1)) * Math.PI) * 6 * s;
          ctx.beginPath();
          ctx.arc(px, py, (8 + 6 * Math.sin((k / (puffs - 1)) * Math.PI)) * s, 0, TAU);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.ellipse(cx, cy + (pass === 0 ? 8 : 5) * s, puffs * 9 * s, 6 * s, 0, 0, TAU);
        ctx.fill();
      }
    }
  });
}

// ---- The cratered moon --------------------------------------------------------------------------------------------

export function moonTexture(): THREE.CanvasTexture {
  return paint(512, 256, (ctx, W, H) => {
    const rand = rng(53);
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#bdb6cc");
    base.addColorStop(1, "#aaa4bf");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    // Big dark seas.
    ctx.fillStyle = "rgba(112, 104, 146, 0.55)";
    for (const [x, y, r, s] of [[150, 100, 52, 1], [250, 150, 42, 2], [330, 90, 36, 3], [90, 170, 30, 4]] as number[][]) {
      blobPath(ctx, x, y, r, s * 13, 12, 0.5, 0.75);
      ctx.fill();
    }
    // Craters: a lit lower-right floor, a shadowed upper-left wall, a pale raised rim.
    const crater = (x: number, y: number, r: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.clip();
      ctx.fillStyle = "#6c6590";
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = "#a59fc0";
      ctx.beginPath();
      ctx.arc(x + r * 0.2, y + r * 0.22, r * 0.92, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = Math.max(1.5, r * 0.13);
      ctx.strokeStyle = "rgba(222, 216, 238, 0.9)";
      ctx.beginPath();
      ctx.arc(x, y, r * 1.04, Math.PI * 0.5, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = "rgba(78, 70, 112, 0.75)";
      ctx.beginPath();
      ctx.arc(x, y, r * 1.04, -Math.PI * 0.05, Math.PI * 0.45);
      ctx.stroke();
    };
    for (let i = 0; i < 16; i++) crater(rand() * W, 30 + rand() * (H - 60), 14 + rand() * 20);
    for (let i = 0; i < 70; i++) crater(rand() * W, 20 + rand() * (H - 40), 3 + rand() * 7);
    crater(205, 118, 38);
    crater(380, 150, 30);
  });
}

// ---- Station parts ---------------------------------------------------------------------------------------------------

export function solarTexture(): THREE.CanvasTexture {
  return paint(256, 128, (ctx, W, H) => {
    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, "#254d9c");
    base.addColorStop(1, "#1b3a7e");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    const cols = 8;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c * W) / cols;
        const y = (r * H) / rows;
        ctx.fillStyle = (r + c) % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.06)";
        ctx.fillRect(x, y, W / cols, H / rows);
        ctx.strokeStyle = "rgba(210, 178, 96, 0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + W / cols / 2, y + 2);
        ctx.lineTo(x + W / cols / 2, y + H / rows - 2);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "rgba(120, 164, 220, 0.7)";
    ctx.lineWidth = 1.6;
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo((c * W) / cols, 0);
      ctx.lineTo((c * W) / cols, H);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, (r * H) / rows);
      ctx.lineTo(W, (r * H) / rows);
      ctx.stroke();
    }
    const sheen = ctx.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0.2, "rgba(255,255,255,0)");
    sheen.addColorStop(0.4, "rgba(170,200,255,0.12)");
    sheen.addColorStop(0.55, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
  });
}

// Hull plating: panels with dark seams, a light line beside each seam, rivets and a couple of coloured hatches.
export function hullTexture(): THREE.CanvasTexture {
  return paint(256, 256, (ctx, W, H) => {
    const rand = rng(17);
    ctx.fillStyle = "#aab4cc";
    ctx.fillRect(0, 0, W, H);
    const n = 4;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x = (c * W) / n;
        const y = (r * H) / n;
        const tone = 168 + Math.floor(rand() * 22);
        ctx.fillStyle = `rgb(${tone}, ${tone + 8}, ${tone + 30})`;
        ctx.fillRect(x + 2, y + 2, W / n - 4, H / n - 4);
        ctx.fillStyle = "#6c7898";
        for (const [dx, dy] of [[7, 7], [W / n - 7, 7], [7, H / n - 7], [W / n - 7, H / n - 7]]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, 1.8, 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.strokeStyle = "#5e6a8c";
    ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo((i * W) / n, 0);
      ctx.lineTo((i * W) / n, H);
      ctx.moveTo(0, (i * H) / n);
      ctx.lineTo(W, (i * H) / n);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(226, 234, 250, 0.7)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo((i * W) / n + 4, 0);
      ctx.lineTo((i * W) / n + 4, H);
      ctx.moveTo(0, (i * H) / n + 4);
      ctx.lineTo(W, (i * H) / n + 4);
      ctx.stroke();
    }
    for (const [x, y, colour] of [[70, 70, "#d8705c"], [198, 134, "#3db4b8"]] as Array<[number, number, string]>) {
      ctx.fillStyle = colour;
      ctx.fillRect(x - 16, y - 10, 32, 20);
      ctx.strokeStyle = "rgba(40, 40, 70, 0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 16, y - 10, 32, 20);
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.stroke();
    }
  });
}

// Fuel tank skin: seams, rivets, a hazard stripe and a label decal. u runs around the tank, v along it.
export function tankTexture(label: string, accent: string, decals = true): THREE.CanvasTexture {
  return paint(512, 256, (ctx, W, H) => {
    const body = ctx.createLinearGradient(0, 0, 0, H);
    body.addColorStop(0, "#e2dccb");
    body.addColorStop(1, "#cfcab9");
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, W, H);
    // Hazard stripe band
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, H * 0.74, W, H * 0.12);
    ctx.clip();
    ctx.fillStyle = "#3a3a52";
    ctx.fillRect(0, H * 0.74, W, H * 0.12);
    ctx.fillStyle = "#e8a838";
    for (let x = -40; x < W + 40; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, H * 0.86);
      ctx.lineTo(x + 18, H * 0.86);
      ctx.lineTo(x + 18 + 18, H * 0.74);
      ctx.lineTo(x + 18, H * 0.74);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Accent ring and seams
    ctx.fillStyle = accent;
    ctx.fillRect(0, H * 0.12, W, H * 0.07);
    for (const y of [0.12, 0.19, 0.5, 0.74, 0.86]) {
      ctx.fillStyle = "rgba(60, 60, 90, 0.5)";
      ctx.fillRect(0, y * H - 1, W, 2.4);
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.fillRect(0, y * H + 2, W, 1.4);
    }
    ctx.fillStyle = "rgba(60, 60, 90, 0.4)";
    for (const x of [0, W / 2]) ctx.fillRect(x, 0, 3, H);
    ctx.fillStyle = "#8a90ac";
    for (let x = 12; x < W; x += 28) {
      ctx.beginPath();
      ctx.arc(x, H * 0.155, 1.8, 0, TAU);
      ctx.fill();
    }
    // Label decal in the middle of the visible face (u = 0.25 .. 0.75 faces the camera on a cylinder along x).
    for (const cx of decals ? [W * 0.125, W * 0.375, W * 0.625, W * 0.875] : []) {
      ctx.fillStyle = "#2a3358";
      ctx.beginPath();
      ctx.roundRect(cx - 54, H * 0.27, 108, H * 0.19, 8);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(cx - 33, H * 0.365, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#2a3358";
      ctx.beginPath();
      ctx.arc(cx - 33, H * 0.355, 4.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#ece6d2";
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx + 12, H * 0.368);
    }
  });
}

export function radiatorTexture(): THREE.CanvasTexture {
  return paint(128, 256, (ctx, W, H) => {
    ctx.fillStyle = "#e4dfd2";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#8a96b4";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const y = 22 + i * 26;
      ctx.strokeStyle = "#3c8aa0";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(W - 20, y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, y - 2);
      ctx.lineTo(W - 22, y - 2);
      ctx.stroke();
    }
    const tip = ctx.createLinearGradient(0, 0, 0, H);
    tip.addColorStop(0, "rgba(224, 110, 90, 0)");
    tip.addColorStop(1, "rgba(224, 110, 90, 0.55)");
    ctx.fillStyle = tip;
    ctx.fillRect(0, 0, W, H);
  });
}

export function crateTexture(base: string, stripe: string): THREE.CanvasTexture {
  return paint(64, 64, (ctx, W, H) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = stripe;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(W - 6, H - 6);
    ctx.moveTo(W - 6, 6);
    ctx.lineTo(6, H - 6);
    ctx.stroke();
    ctx.fillStyle = "rgba(40, 36, 60, 0.55)";
    ctx.fillRect(W / 2 - 9, H / 2 - 5, 18, 10);
  });
}

// ---- Backdrop: nebula, galaxy, glows, tails -------------------------------------------------------------------------

// A stacked-paper nebula: a few blobs make one silhouette, then smaller, lighter copies sit on top, each in a flat
// colour with a crisp edge. No blur anywhere, so it reads like a poster, and it is kept faint by the sprite opacity.
export function nebulaTexture(palette: string[], seed: number): THREE.CanvasTexture {
  return paint(512, 512, (ctx, W, H) => {
    const rand = rng(seed);
    ctx.clearRect(0, 0, W, H);
    const lumps: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      lumps.push([W * (0.16 + 0.68 * t) + (rand() - 0.5) * 30, H * (0.5 + Math.sin(t * 5 + seed) * 0.2) + (rand() - 0.5) * 40, 58 + rand() * 40, seed * 7 + i]);
    }
    palette.forEach((colour, layer) => {
      const k = 1 - layer * 0.2;
      const ox = -layer * 9;
      const oy = -layer * 11;
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      for (const [x, y, r, s] of lumps) {
        blobPath(ctx, W / 2 + (x - W / 2) * k + ox, H / 2 + (y - H / 2) * k + oy, r * k, s, 12, 0.35, 0.8);
        ctx.stroke();
      }
      ctx.fillStyle = colour;
      for (const [x, y, r, s] of lumps) {
        blobPath(ctx, W / 2 + (x - W / 2) * k + ox, H / 2 + (y - H / 2) * k + oy, r * k, s, 12, 0.35, 0.8);
        ctx.fill();
      }
    });
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = "rgba(240, 240, 255, 0.7)";
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * H, 0.8 + rand() * 1.4, 0, TAU);
      ctx.fill();
    }
  });
}

export function galaxyTexture(): THREE.CanvasTexture {
  return paint(512, 512, (ctx, W, H) => {
    const rand = rng(401);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.45);
    ctx.scale(1, 0.5);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.46);
    halo.addColorStop(0, "rgba(246, 214, 170, 0.75)");
    halo.addColorStop(0.18, "rgba(226, 150, 140, 0.4)");
    halo.addColorStop(0.5, "rgba(120, 90, 200, 0.16)");
    halo.addColorStop(1, "rgba(60, 60, 160, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-W / 2, -H / 2, W, H);
    const tints = ["#f6dcb4", "#f0a8a0", "#c8a0f0", "#8cc8f0", "#9ee6dc"];
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 520; i++) {
        const t = Math.pow(rand(), 0.8);
        const a = arm * Math.PI + t * 4.4 + (rand() - 0.5) * 0.4 * (0.3 + t);
        const r = 18 + t * 215 + (rand() - 0.5) * 14 * (0.5 + t);
        ctx.globalAlpha = 0.35 + rand() * 0.55;
        ctx.fillStyle = tints[Math.min(tints.length - 1, Math.floor(t * 4.4 + rand() * 0.8))];
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.9 + rand() * 2.4 * (1 - t * 0.4), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#f9e6c4";
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, TAU);
    ctx.fill();
  });
}

export const softGlow = (inner: string, mid: string): THREE.CanvasTexture =>
  glowTexture([[0, inner], [0.4, mid], [1, "rgba(0,0,0,0)"]], 128);

// A comet tail: bright at the head (x = 0), fading to nothing, soft across.
export function tailTexture(): THREE.CanvasTexture {
  return paint(256, 64, (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(220, 244, 255, 0.9)");
    g.addColorStop(0.35, "rgba(150, 210, 240, 0.42)");
    g.addColorStop(1, "rgba(110, 150, 230, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "destination-in";
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(0.5, "rgba(0,0,0,1)");
    v.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  });
}
