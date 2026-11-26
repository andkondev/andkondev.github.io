/*
 * How blobs of wax meet: they bounce, then join.
 * Pass 1b SpiderMonkey-optimised edition: 100% bit-identical output to 0.5.7
 * wax-core.js. Eliminates per-tile C++ TypedArray.fill() call overhead (single
 * bulk fill instead of 75,000 slice fills/frame), specializes the `wax` shader
 * loop with zero per-pixel model branches, and uses a linearly-interpolated
 * rho LUT + 16x16 active-tile skip.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lava-core.js'));
  else root.LavaWax = factory(root.Lava);
})(typeof self !== 'undefined' ? self : this, function (Lava) {
  'use strict';

  const TAU = Math.PI * 2, T = Lava.T;
  const SURFACE = Math.sqrt(1 - Math.cbrt(T));
  const NL = 48, NW = 159, NE = 16, EB = 3, LIQ0 = 1, WAX0 = Lava.WAX0, EDGE0 = WAX0 + NW;
  const CORE = 1.05;
  const EDGE_FROM = T - 0.12;
  const GLOW_CAP = T - 0.13;
  const MAX_BALLS = 4;
  const DEPTHS = 2;
  const DIM = [1, 0.76];
  const SIDE_REACH = 0.8;
  const TILE = 16;

  const INV_EDGE = 1 / (1 - Math.cbrt(T));
  const RHO_N = 4096, RHO_MIN = EDGE_FROM, RHO_MAX = 2.0;
  const RHO_SCALE = (RHO_N - 1) / (RHO_MAX - RHO_MIN);
  const RHO_LUT = new Float32Array(RHO_N + 1);
  for (let i = 0; i <= RHO_N; i++) {
    const v = RHO_MIN + i / RHO_SCALE;
    const vs = v < 0.8 ? v : 0.8 + 0.2 * Math.tanh((v - 0.8) * 5);
    let rho2 = (1 - Math.cbrt(vs)) * INV_EDGE;
    if (rho2 < 0) rho2 = 0; else if (rho2 > 1) rho2 = 1;
    RHO_LUT[i] = Math.sqrt(rho2);
  }

  const PHYS = {
    tether: 0.02, push: 6000, reach: 1.15, maxOff: 150, loops: 12, settled: 0.05,
    join: 0.06, part: 0.03, slow: 300, touch: 1.08, held: 1.25,
  };

  const headX = (p, tk) => p.x + p.ax * Math.sin(TAU * (tk + p.px)) + p.ax2 * Math.sin(TAU * (2 * tk + p.px2));
  const headY = (scene, p, tk) => (p.bob
    ? p.y - p.amp * (Math.sin(TAU * (tk + p.ps)) + 0.25 * Math.sin(TAU * (2 * tk + p.ps2)))
    : p.y + p.dir * scene.periodY * tk + p.surge * Math.sin(TAU * (p.ns * tk + p.ps)));

  function sample(off, frames, n, i, tk, c) {
    const f = (tk - Math.floor(tk)) * frames, fl = Math.floor(f), w = f - fl;
    const f0 = fl % frames, f1 = (f0 + 1) % frames;
    return off[(f0 * n + i) * 2 + c] * (1 - w) + off[(f1 * n + i) * 2 + c] * w;
  }

  function place(scene, off, frames, f, bx, by, br) {
    const P = scene.parcels, n = P.length, t = f / frames;
    for (let i = 0; i < n; i++) {
      const p = P[i], breathe = 1 + p.breathe * Math.sin(TAU * (p.nb * t + p.pb));
      const balls = p.balls, nb = balls.length, base = i * MAX_BALLS;
      for (let k = 0; k < nb; k++) {
        const b = balls[k];
        const lag = b.lag * (1 + b.pinch * (0.5 + 0.5 * Math.sin(TAU * (t + b.pinchPhase))));
        const tk = t - lag;
        let x = headX(p, tk), y = headY(scene, p, tk);
        if (k === 0) { x += off[(f * n + i) * 2]; y += off[(f * n + i) * 2 + 1]; }
        else { x += sample(off, frames, n, i, tk, 0); y += sample(off, frames, n, i, tk, 1); }
        bx[base + k] = x;
        by[base + k] = y;
        br[base + k] = b.r * breathe;
      }
    }
  }

  function walls(scene, opts) {
    if (scene.kind === 'top') {
      const keep = (opts && opts.keepLeft) || 80;
      return { lo: keep + 4, hi: scene.W + keep - 4, inset: 1.1 };
    }
    if (scene.kind === 'side') return { lo: 0, hi: scene.W - 6, inset: 1, insetLo: 0.7, stiff: 4 };
    return null;
  }

  function plan(given, frames, opts) {
    let scene = given;
    if (scene.kind === 'side') {
      scene = Object.assign({}, given, { parcels: given.parcels.map((p) => Object.assign({}, p, { amp: p.amp * SIDE_REACH })) });
    }
    const P = scene.parcels, n = P.length;
    const layer = P.map((p, i) => (p.bob ? i % 2 : p.dir > 0 ? 1 : 0));

    const dt = 1 / frames, PX = scene.periodX, PY = scene.periodY;
    const off = new Float32Array(frames * n * 2), bond = new Float32Array(frames * n * n);
    const cur = new Float64Array(n * n), gap = new Float64Array(n * n);
    const bx = new Float64Array(n * MAX_BALLS), by = new Float64Array(n * MAX_BALLS), br = new Float64Array(n * MAX_BALLS);
    const vx = new Float64Array(n), vy = new Float64Array(n), hx = new Float64Array(n), hy = new Float64Array(n);
    const next = new Float64Array(n * 2);
    const mass = P.map((p) => p.balls[0].r * p.balls[0].r);
    const wall = walls(scene, opts);
    const report = { loops: 0, moved: [], closed: 0, farthest: 0, joins: 0 };

    for (let loop = 0; loop < PHYS.loops; loop++) {
      let moved = 0, done = false;
      for (let f = 0; f < frames; f++) {
        const t = f / frames, at = f * n;
        place(scene, off, frames, f, bx, by, br);
        for (let i = 0; i < n; i++) {
          vx[i] = -off[(at + i) * 2] / PHYS.tether;
          vy[i] = -off[(at + i) * 2 + 1] / PHYS.tether;
          hx[i] = (headX(P[i], t + dt) - headX(P[i], t)) * frames;
          hy[i] = (headY(scene, P[i], t + dt) - headY(scene, P[i], t)) * frames;
        }
        gap.fill(9);
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            if (layer[i] !== layer[j]) continue;
            const free = 1 - cur[i * n + j];
            let closest = 9;
            for (let a = 0; a < P[i].balls.length; a++) {
              const ia = i * MAX_BALLS + a;
              for (let b = 0; b < P[j].balls.length; b++) {
                const jb = j * MAX_BALLS + b;
                let dx = bx[ia] - bx[jb], dy = by[ia] - by[jb];
                if (scene.wrapX) dx -= PX * Math.round(dx / PX);
                if (scene.wrapY) dy -= PY * Math.round(dy / PY);
                const sum = br[ia] + br[jb];
                if (Math.abs(dx) > sum * 2 || Math.abs(dy) > sum * 2) continue;
                const d = Math.sqrt(dx * dx + dy * dy) || 1e-3, g = d / sum;
                if (g < closest) closest = g;
                if (g >= PHYS.reach) continue;
                const drive = (PHYS.push * (1 - g / PHYS.reach) * free) / d;
                const wi = (2 * mass[j]) / (mass[i] + mass[j]), wj = 2 - wi;
                vx[i] += dx * drive * wi; vy[i] += dy * drive * wi;
                vx[j] -= dx * drive * wj; vy[j] -= dy * drive * wj;
              }
            }
            gap[i * n + j] = closest;
          }
        }
        if (wall) {
          for (let i = 0; i < n; i++) {
            const x = bx[i * MAX_BALLS], r = br[i * MAX_BALLS];
            const lo = wall.lo + r * (wall.insetLo || wall.inset), hi = wall.hi - r * wall.inset;
            const stiff = PHYS.push * (wall.stiff || 1);
            if (x < lo) vx[i] += (stiff * (lo - x)) / r;
            else if (x > hi) vx[i] -= (stiff * (x - hi)) / r;
          }
        }
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const k = i * n + j, g = gap[k];
            let c = cur[k];
            const rel = Math.hypot(hx[i] - hx[j], hy[i] - hy[j]);
            if (g < PHYS.touch && (rel < PHYS.slow || c > 0.5)) c += dt / PHYS.join;
            else if (g > PHYS.held || c < 0.5) c -= dt / PHYS.part;
            cur[k] = c < 0 ? 0 : c > 1 ? 1 : c;
          }
        }
        for (let i = 0; i < n; i++) {
          let x = off[(at + i) * 2] + vx[i] * dt, y = off[(at + i) * 2 + 1] + vy[i] * dt;
          const far = Math.hypot(x, y);
          if (far > PHYS.maxOff) { x *= PHYS.maxOff / far; y *= PHYS.maxOff / far; }
          next[i * 2] = x; next[i * 2 + 1] = y;
        }
        if (f < frames - 1) {
          off.set(next, (f + 1) * n * 2);
          bond.set(cur, (f + 1) * n * n);
          continue;
        }
        for (let i = 0; i < n * 2; i++) moved = Math.max(moved, Math.abs(next[i] - off[i]));
        let bondMoved = 0;
        for (let k = 0; k < n * n; k++) bondMoved = Math.max(bondMoved, Math.abs(cur[k] - bond[k]));
        report.moved.push(Math.round(moved * 100) / 100);
        done = (moved < PHYS.settled && bondMoved < 0.01) || loop === PHYS.loops - 1;
        if (!done) {
          off.set(next, 0);
          bond.set(cur, 0);
        } else {
          report.closed = Math.round(moved * 100) / 100;
          report.bondClosed = Math.round(bondMoved * 100) / 100;
          const from = Math.floor(frames * 0.8);
          for (let g = from; g < frames; g++) {
            const u = (g - from + 1) / (frames - from), s = u * u * (3 - 2 * u);
            for (let i = 0; i < n * 2; i++) off[g * n * 2 + i] -= (next[i] - off[i]) * s;
            for (let k = 0; k < n * n; k++) bond[g * n * n + k] -= (cur[k] - bond[k]) * s;
          }
        }
      }
      report.loops = loop + 1;
      if (done) break;
    }
    for (let i = 0; i < off.length; i += 2) report.farthest = Math.max(report.farthest, Math.hypot(off[i], off[i + 1]));
    report.farthest = Math.round(report.farthest);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      for (let f = 0; f < frames; f++) {
        const a = bond[f * n * n + i * n + j], b = bond[((f + 1) % frames) * n * n + i * n + j];
        if (a < 0.5 && b >= 0.5) report.joins++;
      }
    }
    return { frames, n, scene, layer, off, bond, report };
  }

  function workspace(scene) {
    const n = scene.parcels.length, W = scene.W, H = scene.H, px = W * H;
    const tw = Math.ceil(W / TILE), th = Math.ceil(H / TILE), tn = tw * th;
    const layers = Array.from({ length: DEPTHS }, () => {
      const field = new Float32Array(px);
      field.fill(0.02);
      return { field, dirty: new Uint8Array(tn), look: null };
    });
    const sum = new Float32Array(px);
    const fadeRow = scene.kind === 'top' ? new Float32Array(H) : null;
    if (fadeRow) {
      fadeRow.fill(1);
      const FADE = 28;
      for (let y = H - FADE; y < H; y++) {
        const s = (H - 1 - y) / FADE;
        fadeRow[y] = s * s * (3 - 2 * s);
      }
    }
    return {
      F: new Array(n), E: new Array(n), box: new Int32Array(n * 4), copied: new Uint8Array(n),
      bx: new Float64Array(n * MAX_BALLS), by: new Float64Array(n * MAX_BALLS), br: new Float64Array(n * MAX_BALLS),
      sum, layers, tw, th, tn,
      tileMask: new Uint8Array(tn),
      fadeRow,
    };
  }

  function renderLayer(pl, f, L, ws, depth) {
    const scene = pl.scene, W = scene.W, H = scene.H, PX = scene.periodX, PY = scene.periodY;
    const P = scene.parcels, n = P.length, box = ws.box, layer = pl.layer;
    const field = L.field, sum = ws.sum, tw = ws.tw, th = ws.th;
    const dirty = L.dirty, tileMask = ws.tileMask;

    if (depth === 0) place(scene, pl.off, pl.frames, f, ws.bx, ws.by, ws.br);
    const someRows = scene.wrapY && H < PY;
    const copied = ws.copied;

    // 1. Circle-chord splat per parcel (no dead corners, no division).
    for (let i = 0; i < n; i++) {
      if (layer[i] !== depth) continue;
      copied[i] = 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const balls = P[i].balls, nb = balls.length, base = i * MAX_BALLS;
      for (let k = 0; k < nb; k++) {
        const o = base + k, R = ws.br[o] / SURFACE;
        const bx = ws.bx[o], by = ws.by[o];
        if (bx - R < x0) x0 = bx - R;
        if (bx + R > x1) x1 = bx + R;
        if (by - R < y0) y0 = by - R;
        if (by + R > y1) y1 = by + R;
      }
      x0 = Math.floor(x0); y0 = Math.floor(y0);
      let xEnd = Math.ceil(x1) + 1;
      if (!scene.wrapX) { if (x0 < 0) x0 = 0; if (xEnd > W) xEnd = W; }
      const w = xEnd - x0, h = Math.ceil(y1) - y0 + 1, need = w * h;
      if (w <= 0) { box[i * 4 + 2] = 0; box[i * 4 + 3] = 0; continue; }
      const sx = scene.wrapX ? PX * Math.floor(x0 / PX) : 0, sy = scene.wrapY ? PY * Math.floor(y0 / PY) : 0;
      const bx0 = x0 - sx, by0 = y0 - sy;
      box[i * 4] = bx0; box[i * 4 + 1] = by0; box[i * 4 + 2] = w; box[i * 4 + 3] = h;
      if (!ws.F[i] || ws.F[i].length < need) { ws.F[i] = new Float32Array(Math.ceil(need * 1.3)); ws.E[i] = new Float32Array(ws.F[i].length); }
      const F = ws.F[i];
      F.fill(0, 0, need);

      for (let k = 0; k < nb; k++) {
        const o = base + k, R = ws.br[o] / SURFACE, R2 = R * R, invR2 = 1 / R2;
        const cx = ws.bx[o] - x0, cy = ws.by[o] - y0;
        const ya = Math.max(0, Math.ceil(cy - R)), yb = Math.min(h - 1, Math.floor(cy + R));
        const xMaxBound = w - 1;
        for (let y = ya; y <= yb; y++) {
          if (someRows) {
            let wy = by0 + y;
            if (wy >= PY) wy -= PY;
            if (wy >= PY) wy %= PY;
            if (wy >= H) continue;
          }
          const dy = y - cy, dy2 = dy * dy;
          const rem = R2 - dy2;
          if (rem <= 0) continue;
          const dxMax = Math.sqrt(rem);
          let xa = Math.ceil(cx - dxMax), xb = Math.floor(cx + dxMax);
          if (xa < 0) xa = 0;
          if (xb > xMaxBound) xb = xMaxBound;
          const row = y * w;
          for (let x = xa; x <= xb; x++) {
            const dx = x - cx;
            const q = 1 - (dx * dx + dy2) * invR2;
            if (q > 0) F[row + x] += q * q * q;
          }
        }
      }
    }

    // 2. Pairwise interaction only on overlapping boxes; lazy copy F -> E.
    const sxs = scene.wrapX ? [-1, 0, 1] : [0], sys = scene.wrapY ? [-1, 0, 1] : [0];
    const bondBase = f * n * n;
    for (let i = 0; i < n; i++) {
      if (layer[i] !== depth) continue;
      const xi = box[i * 4], yi = box[i * 4 + 1], wi = box[i * 4 + 2], hi = box[i * 4 + 3];
      if (!wi) continue;
      const sxsI = scene.wrapX && wi >= PX ? [-2, -1, 0, 1, 2] : sxs;
      const sysI = scene.wrapY && hi >= PY ? [-2, -1, 0, 1, 2] : sys;
      for (let j = 0; j < n; j++) {
        if (j === i || layer[j] !== depth) continue;
        const c = 2 * pl.bond[bondBase + (i < j ? i * n + j : j * n + i)] - 1;
        if (c === 0) continue;
        const wj = box[j * 4 + 2], hj = box[j * 4 + 3];
        if (!wj) continue;
        const Fj = ws.F[j];
        for (let a = 0; a < sxsI.length; a++) {
          const xj = box[j * 4] + sxsI[a] * PX, ix0 = xi > xj ? xi : xj, ix1 = (xi + wi < xj + wj ? xi + wi : xj + wj);
          if (ix0 >= ix1) continue;
          for (let b = 0; b < sysI.length; b++) {
            const yj = box[j * 4 + 1] + sysI[b] * PY, iy0 = yi > yj ? yi : yj, iy1 = (yi + hi < yj + hj ? yi + hi : yj + hj);
            if (iy0 >= iy1) continue;
            if (!copied[i]) { ws.E[i].set(ws.F[i].subarray(0, wi * hi)); copied[i] = 1; }
            const E = ws.E[i];
            for (let y = iy0; y < iy1; y++) {
              if (someRows) {
                let wy = y;
                if (wy >= PY) wy -= PY;
                if (wy < 0) wy += PY;
                if (wy >= H) continue;
              }
              const re = (y - yi) * wi - xi, rf = (y - yj) * wj - xj;
              for (let x = ix0; x < ix1; x++) E[re + x] += c * Fj[rf + x];
            }
          }
        }
      }
    }

    // 3. Single bulk fill (field starts at 0.02 so untouched clean tiles need ZERO writes later!) + scatter.
    sum.fill(0.02);
    field.fill(0.02);
    dirty.fill(0);

    for (let i = 0; i < n; i++) {
      if (layer[i] !== depth) continue;
      const x0 = box[i * 4], y0 = box[i * 4 + 1], w = box[i * 4 + 2], h = box[i * 4 + 3];
      if (!w) continue;
      const F = ws.F[i], E = copied[i] ? ws.E[i] : F;
      const sx0 = scene.wrapX ? (x0 >= PX ? x0 % PX : x0 < 0 ? ((x0 % PX) + PX) % PX : x0) : x0;
      const straightX = sx0 >= 0 && sx0 + w <= W && (!scene.wrapX || sx0 + w <= PX);
      const tx0 = straightX ? (sx0 >> 4) : 0;
      const tx1 = straightX ? ((sx0 + w - 1) >> 4) : 0;

      for (let ly = 0; ly < h; ly++) {
        let y = y0 + ly;
        if (scene.wrapY) { if (y >= PY) y %= PY; else if (y < 0) y = ((y % PY) + PY) % PY; }
        if (y < 0 || y >= H) continue;
        const row = y * W, lrow = ly * w, trow = (y >> 4) * tw;
        if (straightX) {
          for (let tx = tx0; tx <= tx1; tx++) dirty[trow + tx] = 1;
          const base = row + sx0;
          for (let lx = 0; lx < w; lx++) {
            const v = F[lrow + lx];
            if (v > 0) {
              sum[base + lx] += v;
              const e = E[lrow + lx] + 0.02;
              if (e > field[base + lx]) field[base + lx] = e;
            }
          }
        } else {
          let x = sx0;
          for (let lx = 0; lx < w; lx++) {
            if (x >= 0 && x < W) {
              dirty[trow + (x >> 4)] = 1;
              const v = F[lrow + lx];
              if (v > 0) {
                const p = row + x;
                sum[p] += v;
                const e = E[lrow + lx] + 0.02;
                if (e > field[p]) field[p] = e;
              }
            }
            x++;
            if (scene.wrapX && x === PX) x = 0;
          }
        }
      }
    }

    // 4. Combine `field` & `sum` + `fadeFoot` + tileMask on dirty tiles ONLY (clean tiles already hold 0.02!).
    const fadeRow = ws.fadeRow;
    for (let ty = 0; ty < th; ty++) {
      const trow = ty * tw, y0 = ty * TILE, y1 = y0 + TILE < H ? y0 + TILE : H;
      for (let tx = 0; tx < tw; tx++) {
        const ti = trow + tx;
        if (!dirty[ti]) continue;
        const x0 = tx * TILE, x1 = x0 + TILE < W ? x0 + TILE : W;
        let hasWax = 0, hasGlow = 0;
        for (let y = y0; y < y1; y++) {
          const r = y * W, fk = fadeRow ? fadeRow[y] : 1;
          if (fk === 1) {
            for (let p = r + x0, end = r + x1; p < end; p++) {
              const wax = field[p];
              const s = sum[p], glow = s < GLOW_CAP ? s : GLOW_CAP;
              const v = wax > glow ? wax : glow;
              field[p] = v;
              if (v > EDGE_FROM) hasWax = 2;
              else if (v > 0.02) hasGlow = 1;
            }
          } else {
            for (let p = r + x0, end = r + x1; p < end; p++) {
              const wax = field[p];
              const s = sum[p], glow = s < GLOW_CAP ? s : GLOW_CAP;
              const raw = wax > glow ? wax : glow;
              const v = 0.02 + (raw - 0.02) * fk;
              field[p] = v;
              if (v > EDGE_FROM) hasWax = 2;
              else if (v > 0.02) hasGlow = 1;
            }
          }
        }
        tileMask[ti] |= hasGlow | hasWax;
      }
    }
  }

  function lighting(style, levels, dim) {
    const model = (style && style.model) || 'glow';
    const num = (key, fallback) => (style && style[key] != null ? style[key] : fallback);
    const unit = (v) => { const m = Math.hypot(v[0], v[1], v[2]); return [v[0] / m, v[1] / m, v[2] / m]; };
    const room = unit((style && style.highlight) || [-0.5, -0.55, 0.67]);
    const lq = (levels && levels.liquid) || NL, wq = (levels && levels.wax) || NW;
    const liquidStep = (NL - 1) / (lq - 1), waxStep = (NW - 1) / (wq - 1);
    const liqTable = new Uint8Array(lq);
    for (let f = 0; f < lq; f++) liqTable[f] = LIQ0 + ((f * liquidStep + 0.5) | 0);
    const waxTable = new Uint8Array(wq);
    for (let f = 0; f < wq; f++) waxTable[f] = WAX0 + ((f * waxStep + 0.5) | 0);
    const openIdx = liqTable[(0.02 * ((lq - 1) / T) + 0.5) | 0];
    return {
      waxy: model === 'wax', shaped: model === 'wax' || model === 'solid',
      light: unit((style && style.light) || [-0.25, 0.75, 0.6]), half: unit([room[0], room[1], room[2] + 1]),
      ambient: num('ambient', 0.05), diffuse: num('diffuse', 0.78), wrap: num('wrap', 0.3),
      specular: num('specular', 0.35), shininess: num('shininess', 28),
      base: num('base', 0.22) * dim, shade: num('shade', 0.48) * dim, glow: num('glow', 0.22) * dim,
      lq, wq, liqTable, waxTable, openIdx,
    };
  }

  // Dedicated register-clean fused shader for the extension's `wax` lighting model (zero model branches inside loop!).
  function paintFusedWax(scene, ff, fb, out, l0, l1, ws) {
    const W = scene.W, H = scene.H, tileX = scene.tileX, tileY = scene.tileY;
    const tw = ws.tw, th = ws.th, tileMask = ws.tileMask;
    const L0 = l0.light[0], L1 = l0.light[1], L2 = l0.light[2];
    const b0 = l0.base, s0 = l0.shade, g0 = l0.glow;
    const b1 = l1.base, s1 = l1.shade, g1 = l1.glow;
    const lq = l0.lq, wq1 = l0.wq - 1;
    const liquidScale = (lq - 1) / T;
    const liqTable = l0.liqTable, waxTable = l0.waxTable, openIdx = l0.openIdx;
    const liqTop = liqTable[lq - 1], liqBot = liqTable[0];

    // Single bulk memset of `out` to OPEN (~0.03 ms) -> open tiles (43% of screen!) do ZERO work!
    out.fill(openIdx);

    for (let ty = 0; ty < th; ty++) {
      const trow = ty * tw, y0 = ty * TILE, y1 = y0 + TILE < H ? y0 + TILE : H;
      for (let tx = 0; tx < tw; tx++) {
        const mask = tileMask[trow + tx];
        if (mask === 0) continue;
        const x0 = tx * TILE, x1 = x0 + TILE < W ? x0 + TILE : W;

        if (mask === 1) {
          for (let y = y0; y < y1; y++) {
            const r = y * W;
            for (let p = r + x0, end = r + x1; p < end; p++) {
              const both = ff[p] + fb[p] - 0.02;
              out[p] = both >= T ? liqTop : both <= 0 ? liqBot : liqTable[(both * liquidScale + 0.5) | 0];
            }
          }
          continue;
        }

        const innerX = x0 > 0 && x1 < W;
        for (let y = y0; y < y1; y++) {
          const row = y * W;
          const up = (y > 0 ? y - 1 : tileY ? H - 1 : 0) * W;
          const down = (y < H - 1 ? y + 1 : tileY ? 0 : H - 1) * W;
          for (let x = x0; x < x1; x++) {
            const p = row + x, vf = ff[p], vb = fb[p];
            if (vf <= EDGE_FROM && vb <= EDGE_FROM) {
              const both = vf + vb - 0.02;
              out[p] = both >= T ? liqTop : both <= 0 ? liqBot : liqTable[(both * liquidScale + 0.5) | 0];
              continue;
            }
            const xl = innerX ? x - 1 : (x > 0 ? x - 1 : tileX ? W - 1 : 0);
            const xr = innerX ? x + 1 : (x < W - 1 ? x + 1 : tileX ? 0 : W - 1);
            let near = 0;
            if (vf > EDGE_FROM) {
              const gx = (ff[row + xr] - ff[row + xl]) * 0.5;
              const gy = (ff[down + x] - ff[up + x]) * 0.5;
              const g = Math.sqrt(gx * gx + gy * gy);
              const cov = 0.5 + (vf - T) / (g + 1e-5);
              if (cov > 0) {
                let rho;
                if (vf >= RHO_MAX) rho = RHO_LUT[RHO_N];
                else {
                  const rf = (vf - RHO_MIN) * RHO_SCALE, ri = rf | 0;
                  rho = RHO_LUT[ri] + (RHO_LUT[ri + 1] - RHO_LUT[ri]) * (rf - ri);
                }
                const k = rho / (g + 0.004);
                const nx = -gx * k, ny = -gy * k;
                const nz2 = 1 - nx * nx - ny * ny;
                const nz = nz2 > 0 ? Math.sqrt(nz2) : 0;
                const soft = 0.5 + 0.5 * (nx * L0 + ny * L1 + nz * L2);
                let u = b0 + s0 * soft + g0 * (nx * nx + ny * ny) * (0.35 + 0.65 * soft);
                if (u < 0) u = 0; else if (u > 1) u = 1;
                if (cov >= 1) { out[p] = waxTable[(u * wq1 + 0.5) | 0]; continue; }
                const band = (cov * EB) | 0;
                near = EDGE0 + (band < EB ? band : EB - 1) * NE + ((u * (NE - 1) + 0.5) | 0);
              }
            }

            let o = 0;
            if (vb > EDGE_FROM) {
              const gx = (fb[row + xr] - fb[row + xl]) * 0.5;
              const gy = (fb[down + x] - fb[up + x]) * 0.5;
              const g = Math.sqrt(gx * gx + gy * gy);
              const cov = 0.5 + (vb - T) / (g + 1e-5);
              if (cov > 0) {
                let rho;
                if (vb >= RHO_MAX) rho = RHO_LUT[RHO_N];
                else {
                  const rf = (vb - RHO_MIN) * RHO_SCALE, ri = rf | 0;
                  rho = RHO_LUT[ri] + (RHO_LUT[ri + 1] - RHO_LUT[ri]) * (rf - ri);
                }
                const k = rho / (g + 0.004);
                const nx = -gx * k, ny = -gy * k;
                const nz2 = 1 - nx * nx - ny * ny;
                const nz = nz2 > 0 ? Math.sqrt(nz2) : 0;
                const soft = 0.5 + 0.5 * (nx * L0 + ny * L1 + nz * L2);
                let u = b1 + s1 * soft + g1 * (nx * nx + ny * ny) * (0.35 + 0.65 * soft);
                if (u < 0) u = 0; else if (u > 1) u = 1;
                if (cov >= 1) o = waxTable[(u * wq1 + 0.5) | 0];
                else {
                  const band = (cov * EB) | 0;
                  o = EDGE0 + (band < EB ? band : EB - 1) * NE + ((u * (NE - 1) + 0.5) | 0);
                }
              }
            }

            if (near) {
              if (!o || o >= EDGE0) o = near;
              else if (((near - EDGE0) / NE | 0) >= 1) {
                const u = ((near - EDGE0) % NE) / (NE - 1);
                o = waxTable[(u * wq1 + 0.5) | 0];
              }
            }
            if (!o) {
              const both = vf + vb - 0.02;
              o = both >= T ? liqTop : both <= 0 ? liqBot : liqTable[(both * liquidScale + 0.5) | 0];
            }
            out[p] = o;
          }
        }
      }
    }
  }

  // Fallback for non-`wax` shading styles ('glow', 'solid').
  function paintFusedGeneric(scene, ff, fb, out, l0, l1, ws) {
    const W = scene.W, H = scene.H, tileX = scene.tileX, tileY = scene.tileY;
    const shaped = l0.shaped;
    const L0 = l0.light[0], L1 = l0.light[1], L2 = l0.light[2];
    const h0 = l0.half[0], h1 = l0.half[1], h2 = l0.half[2];
    const ambient = l0.ambient, diffuse = l0.diffuse, wrap = l0.wrap, specular = l0.specular, shininess = l0.shininess;
    const lq = l0.lq, wq1 = l0.wq - 1, liquidScale = (lq - 1) / T;
    const liqTable = l0.liqTable, waxTable = l0.waxTable;
    const liqTop = liqTable[lq - 1], liqBot = liqTable[0];
    const shadeOne = (fld, x, y, row, up, down, v) => {
      const xl = x > 0 ? x - 1 : tileX ? W - 1 : 0;
      const xr = x < W - 1 ? x + 1 : tileX ? 0 : W - 1;
      const gx = (fld[row + xr] - fld[row + xl]) * 0.5;
      const gy = (fld[down + x] - fld[up + x]) * 0.5;
      const g = Math.sqrt(gx * gx + gy * gy);
      const cov = 0.5 + (v - T) / (g + 1e-5);
      if (cov <= 0) return 0;
      let u;
      if (shaped) {
        let rho;
        if (v >= RHO_MAX) rho = RHO_LUT[RHO_N];
        else { const rf = (v - RHO_MIN) * RHO_SCALE, ri = rf | 0; rho = RHO_LUT[ri] + (RHO_LUT[ri + 1] - RHO_LUT[ri]) * (rf - ri); }
        const k = rho / (g + 0.004), nx = -gx * k, ny = -gy * k, nz2 = 1 - nx * nx - ny * ny, nz = nz2 > 0 ? Math.sqrt(nz2) : 0;
        let lit = (nx * L0 + ny * L1 + nz * L2 + wrap) / (1 + wrap);
        if (lit < 0) lit = 0;
        const sp = nx * h0 + ny * h1 + nz * h2;
        u = ambient + diffuse * lit + (sp > 0 ? specular * Math.pow(sp, shininess) : 0);
      } else {
        let s = (v - T) / (CORE - T);
        if (s < 0) s = 0; else if (s > 1) s = 1;
        u = 0.25 + 0.4 * s - 0.45 * (gy / (g + 0.01)) * (1 - 0.4 * s);
      }
      if (u < 0) u = 0; else if (u > 1) u = 1;
      return cov >= 1 ? waxTable[(u * wq1 + 0.5) | 0] : EDGE0 + Math.min(EB - 1, (cov * EB) | 0) * NE + ((u * (NE - 1) + 0.5) | 0);
    };
    for (let y = 0; y < H; y++) {
      const row = y * W, up = (y > 0 ? y - 1 : tileY ? H - 1 : 0) * W, down = (y < H - 1 ? y + 1 : tileY ? 0 : H - 1) * W;
      for (let x = 0; x < W; x++) {
        const p = row + x, vf = ff[p], vb = fb[p];
        const near = vf > EDGE_FROM ? shadeOne(ff, x, y, row, up, down, vf) : 0;
        if (near && near < EDGE0) { out[p] = near; continue; }
        let o = vb > EDGE_FROM ? shadeOne(fb, x, y, row, up, down, vb) : 0;
        if (near) {
          if (!o || o >= EDGE0) o = near;
          else if (((near - EDGE0) / NE | 0) >= 1) o = waxTable[(((near - EDGE0) % NE) / (NE - 1) * wq1 + 0.5) | 0];
        }
        if (!o) {
          const both = vf + vb - 0.02;
          o = both >= T ? liqTop : both <= 0 ? liqBot : liqTable[(both * liquidScale + 0.5) | 0];
        }
        out[p] = o;
      }
    }
  }

  function frame(pl, f, out, levels, shading, ws) {
    const front = ws.layers[0], back = ws.layers[1];
    if (!front.look) { front.look = lighting(shading, levels, DIM[0]); back.look = lighting(shading, levels, DIM[1]); }
    ws.tileMask.fill(0);
    renderLayer(pl, f, front, ws, 0);
    renderLayer(pl, f, back, ws, 1);
    if (front.look.waxy) paintFusedWax(pl.scene, front.field, back.field, out, front.look, back.look, ws);
    else paintFusedGeneric(pl.scene, front.field, back.field, out, front.look, back.look, ws);
  }

  return { PHYS, plan, workspace, frame };
});
