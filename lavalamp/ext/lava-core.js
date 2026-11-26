/*
 * Lava lamp simulation shared by the draft pages, the theme build (Node) and
 * the new-tab page. Everything is a function of a loop phase t in [0, 1),
 * built only from whole-number harmonics, so the last frame meets the first.
 *
 * Two steps per frame:
 *   renderField  sums soft balls into a scalar field (wax where it exceeds T)
 *   shade        turns the field into palette indices, lighting the wax and
 *                anti-aliasing its edge
 * The output is always one byte per pixel into a 256-colour palette, which is
 * what lets a draft be baked straight into the theme's indexed APNG.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lava = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TAU = Math.PI * 2;
  const T = 0.32; // field value where liquid becomes wax
  const CORE = 1.05; // field value treated as deep inside the wax
  const SURFACE = Math.sqrt(1 - Math.cbrt(T)); // ball surface radius / kernel radius

  // Palette layout: 0 unused, then liquid, wax, and the edge blends.
  const NL = 48, NW = 159, NE = 16, EB = 3;
  const LIQ0 = 1, WAX0 = LIQ0 + NL, EDGE0 = WAX0 + NW; // EDGE0 + EB * NE === 256

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // `parcels` is per 1024x256 of travel area. Radii in px.
  const DEFAULT_MOTION = {
    parcels: 11, // how many bodies of wax
    big: [22, 32], small: [12, 17], bigShare: 0.6,
    sinkShare: 0.3, // the rest rise
    surge: 0.8, // 0 = steady drift, 1 = each parcel nearly stalls between pushes
    tail: 1, // how far the trailing balls hang back
    pinch: 0.5, // share of parcels whose last ball breaks off and rejoins
    sway: 1,
  };
  const BALL_SIZES = [1, 0.76, 0.56, 0.42];

  /**
   * Each parcel of wax is a chain of balls following the same path a moment
   * apart: bunched into one round mass when it stalls, drawn out into a
   * teardrop with a neck when it moves fast.
   *
   * kind 'tile': a patch that repeats seamlessly both ways. Parcels travel one
   *   tile height per loop.
   * kind 'top':  a wide strip for the tabs and toolbar that repeats sideways
   *   only. Parcels pass up or down through it, travelling `periodY` (taller
   *   than the strip) per loop. Nothing is placed where it would straddle
   *   x = keepLeft, where the side strip is laid over this one. With
   *   `clearLeft`, no wax enters the first keepLeft pixels at all (not even
   *   wrapped round from the right-hand end), for a side strip that is
   *   partly see-through and so cannot hide it.
   * kind 'side': a tall, narrow strip for the sidebar that repeats downward
   *   only. Each parcel rises and sinks around its own spot, so the whole
   *   height holds different wax and nothing travels fast.
   * kind 'lamp': a full page with wax pooled at the floor and ceiling.
   */
  function makeScene(opts) {
    const kind = opts.kind || 'tile';
    if (kind === 'lamp') return makeLamp(opts);
    const W = opts.W, H = opts.H;
    const rand = rng(opts.seed == null ? 1 : opts.seed);
    const extra = rng((opts.seed == null ? 1 : opts.seed) ^ 0x51f15e); // values the strips added
    const m = Object.assign({}, DEFAULT_MOTION, opts.motion);
    const side = kind === 'side';
    const periodY = kind === 'top' ? opts.periodY || H * 2 : H;
    const n = opts.count || Math.max(3, Math.round((m.parcels * W * periodY) / (1024 * 256)));
    const keepLeft = opts.keepLeft || 0;
    const parcels = [];
    for (let i = 0; i < n; i++) {
      const big = rand() < m.bigShare;
      const range = big ? m.big : m.small;
      const r = range[0] + rand() * (range[1] - range[0]);
      const ns = 2 + Math.floor(rand() * 2); // pushes per loop
      const amp = 55 + extra() * 50; // side: how far it rises and sinks
      const travel = side ? 4 * amp : periodY; // px covered per loop
      const count = (big ? 3 : 2) + (rand() < 0.5 ? 1 : 0);
      const balls = [];
      let lag = 0; // in loops
      for (let k = 0; k < count; k++) {
        const rk = r * BALL_SIZES[k];
        if (k > 0) lag += (m.tail * 0.62 * (r * BALL_SIZES[k - 1] + rk)) / travel;
        balls.push({ r: rk, lag, pinch: 0, pinchPhase: 0 });
      }
      if (rand() < m.pinch) {
        balls[count - 1].pinch = 0.7 + rand() * 0.8;
        balls[count - 1].pinchPhase = rand();
      }
      // Drawn in a fixed order so a seed always gives the same layout.
      const slot = (i + 0.15 + rand() * 0.7) / n;
      const yJitter = rand() * 0.1;
      const dir = rand() < m.sinkShare ? 1 : -1; // -1 rises
      const surge = (m.surge * (0.65 + 0.35 * rand()) * periodY) / (TAU * ns);
      const ps = rand();
      const swayA = rand(), px = rand(), swayB = rand(), px2 = rand();
      const breathe = 0.04 + rand() * 0.05, nb = 1 + Math.floor(rand() * 3), pb = rand();
      const ax = side ? 2 + swayA * 4 : m.sway * (6 + swayA * 16);
      const ax2 = side ? 1 + swayB * 2 : m.sway * (2 + swayB * 5);
      let x, y;
      if (side) {
        x = (opts.centerX || W / 2) + (extra() - 0.5) * 8;
        y = slot * H;
      } else {
        // Furthest this parcel's wax reaches sideways (its faint glow may cross).
        const reach = r * 1.25 + ax + ax2;
        const lo = keepLeft ? keepLeft + 4 + reach : 0;
        const hi = keepLeft ? W + (opts.clearLeft ? 0 : keepLeft) - 4 - reach : W;
        x = lo + slot * (hi - lo);
        // Golden-ratio spacing spreads parcels evenly along the travel.
        y = ((i * 0.6180339887 + yJitter) % 1) * periodY;
      }
      parcels.push({
        x, y, bob: side, amp, dir, surge, ns, ps, ps2: extra(),
        ax, px, ax2, px2, breathe, nb, pb, balls,
      });
    }
    return {
      W, H, kind, parcels,
      periodX: W, periodY,
      wrapX: !side, wrapY: true,
      // Whether the image itself repeats along each axis (so shading may look
      // across the edge to the far side).
      tileX: !side, tileY: periodY === H,
    };
  }

  function makeLamp(opts) {
    const W = opts.W, H = opts.H;
    const rand = rng(opts.seed == null ? 1 : opts.seed);
    const count = opts.count || 11;
    const blobs = [];
    for (let i = 0; i < count; i++) {
      const big = rand() < 0.5;
      const r = H * (big ? 0.07 + rand() * 0.045 : 0.035 + rand() * 0.025);
      const lobes = [];
      for (let k = 1 + Math.floor(rand() * 3); k > 0; k--) {
        lobes.push({ dist: r * (0.55 + rand() * 0.45), r: r * (0.5 + rand() * 0.3), spin: rand() < 0.5 ? 1 : -1, phase: rand() });
      }
      blobs.push({
        lobes, r,
        x: ((i + 0.2 + rand() * 0.6) * W) / count,
        y: H * (0.42 + rand() * 0.16),
        ax: W * (0.02 + rand() * 0.05), px: rand(),
        ay: H * (0.4 + rand() * 0.14), ny: big ? 1 : 1 + Math.floor(rand() * 2), py: rand(),
        ay2: H * (0.02 + rand() * 0.03), py2: rand(),
        ar: 0.08 + rand() * 0.1, nr: 1 + Math.floor(rand() * 3), pr: rand(),
      });
    }
    return {
      W, H, kind: 'lamp', blobs,
      periodX: W, periodY: H, wrapX: false, wrapY: false, tileX: false, tileY: false,
      ceiling: { strength: 0.85, thick: H * 0.05, wobble: H * 0.02 },
      floor: { strength: 1.0, thick: H * 0.16, wobble: H * 0.05 },
    };
  }

  /**
   * The two scenes of the strip layout for a draft: `top` across the tabs and
   * toolbar, `side` down the window's left edge (drawn over the top strip).
   */
  function makeStripScenes(draft, strips, opts) {
    const top = strips.top, side = strips.side;
    return {
      top: makeScene({
        W: top.W, H: top.H, kind: 'top', periodY: top.periodY, keepLeft: side.W, clearLeft: !!(opts && opts.clearLeft),
        seed: draft.seed, motion: draft.motion,
      }),
      side: makeScene({
        W: side.W, H: side.H, kind: 'side', centerX: side.centerX, count: Math.round(side.H / side.spacing),
        seed: draft.seed + 1, motion: Object.assign({}, draft.motion, side.motion),
      }),
    };
  }

  /** Fill `field` (Float32Array W*H) with the scalar field at loop phase t. */
  function renderField(scene, t, field) {
    const W = scene.W, H = scene.H;
    if (scene.parcels) {
      field.fill(0.02);
      for (let i = 0; i < scene.parcels.length; i++) {
        const p = scene.parcels[i];
        const breathe = 1 + p.breathe * Math.sin(TAU * (p.nb * t + p.pb));
        for (let k = 0; k < p.balls.length; k++) {
          const b = p.balls[k];
          // Each ball is where the head was `lag` ago, so the chain stretches
          // with speed. A pinching tail lets its lag swell until it lets go.
          const lag = b.lag * (1 + b.pinch * (0.5 + 0.5 * Math.sin(TAU * (t + b.pinchPhase))));
          const tk = t - lag;
          const cx = p.x + p.ax * Math.sin(TAU * (tk + p.px)) + p.ax2 * Math.sin(TAU * (2 * tk + p.px2));
          const cy = p.bob
            // Rise, hang, sink: the second harmonic makes one way quicker.
            ? p.y - p.amp * (Math.sin(TAU * (tk + p.ps)) + 0.25 * Math.sin(TAU * (2 * tk + p.ps2)))
            : p.y + p.dir * scene.periodY * tk + p.surge * Math.sin(TAU * (p.ns * tk + p.ps));
          splat(scene, field, cx, cy, b.r * breathe, 1);
        }
      }
      if (scene.kind === 'top') {
        // The strip's lower edge can show (a wide sidebar, a very tall
        // toolbar). Thin the wax out over the last rows so it melts away
        // there instead of ending in a straight cut.
        const FADE = 28;
        for (let y = H - FADE; y < H; y++) {
          const s = (H - 1 - y) / FADE, k = s * s * (3 - 2 * s);
          for (let i = y * W, end = i + W; i < end; i++) field[i] = 0.02 + (field[i] - 0.02) * k;
        }
      }
      return;
    }
    const ceil = scene.ceiling, floor = scene.floor;
    const ceilH = new Float32Array(W), floorH = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      ceilH[x] = ceil.thick + ceil.wobble * Math.sin(TAU * (3 * u + t)) + ceil.wobble * 0.6 * Math.sin(TAU * (5 * u - 2 * t + 0.3));
      floorH[x] = floor.thick + floor.wobble * Math.sin(TAU * (2 * u - t + 0.15)) + floor.wobble * 0.5 * Math.sin(TAU * (5 * u + 2 * t + 0.6));
    }
    for (let y = 0; y < H; y++) {
      const base = 0.02 + 0.12 * Math.pow(y / (H - 1), 1.5);
      const row = y * W;
      for (let x = 0; x < W; x++) {
        let v = base;
        const kc = 1 - y / ceilH[x];
        if (kc > 0) v += ceil.strength * kc * kc;
        const kf = 1 - (H - 1 - y) / floorH[x];
        if (kf > 0) v += floor.strength * kf * kf;
        field[row + x] = v;
      }
    }
    for (let i = 0; i < scene.blobs.length; i++) {
      const b = scene.blobs[i];
      const cx = b.x + b.ax * Math.sin(TAU * (t + b.px));
      const cy = b.y + b.ay * Math.sin(TAU * (b.ny * t + b.py)) + b.ay2 * Math.sin(TAU * (2 * b.ny * t + b.py2));
      const pulse = 1 + b.ar * Math.sin(TAU * (b.nr * t + b.pr));
      const c = Math.cos(TAU * (b.ny * t + b.py));
      const stretch = 1 + 0.28 * c * c; // tallest at mid-stroke
      splat(scene, field, cx, cy, b.r * pulse, stretch);
      for (let j = 0; j < b.lobes.length; j++) {
        const l = b.lobes[j];
        const a = TAU * (l.spin * t + l.phase);
        splat(scene, field, cx + (l.dist * Math.cos(a)) / stretch, cy + l.dist * Math.sin(a) * stretch, l.r * pulse, stretch);
      }
    }
  }

  // Add one ball of surface radius r, optionally stretched vertically.
  // Compact kernel, so it costs only its own bounding box. Positions wrap at
  // the scene's periods, which may be larger than the buffer.
  function splat(scene, field, cx, cy, r, stretch) {
    const W = scene.W, H = scene.H, PX = scene.periodX, PY = scene.periodY;
    const R = r / SURFACE, R2 = R * R;
    const ry = R * stretch, rx = R / stretch;
    const y0 = Math.ceil(cy - ry), y1 = Math.floor(cy + ry);
    const x0 = Math.ceil(cx - rx), x1 = Math.floor(cx + rx);
    for (let y = y0; y <= y1; y++) {
      let yi = y;
      if (yi < 0 || yi >= PY) {
        if (!scene.wrapY) continue;
        yi = ((yi % PY) + PY) % PY;
      }
      if (yi >= H) continue;
      const dy = (y - cy) / stretch, dy2 = dy * dy, row = yi * W;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) * stretch;
        const d2 = dx * dx + dy2;
        if (d2 >= R2) continue;
        let xi = x;
        if (xi < 0 || xi >= PX) {
          if (!scene.wrapX) continue;
          xi = ((xi % PX) + PX) % PX;
        }
        if (xi >= W) continue;
        const q = 1 - d2 / R2;
        field[row + xi] += q * q * q;
      }
    }
  }

  /**
   * Field -> palette indices. `levels` ({liquid, wax}) limits how many shades
   * of each ramp are used; fewer shades make a smaller APNG.
   *
   * Wax tone runs 0 (shadow) to 1 (hot). Three models, chosen by `style`:
   *
   * 'glow' (default): tone rises with depth into the wax and with how much
   *   the surface faces down, toward the lamp's bulb. Reads as a soft light
   *   source: dark crown, glowing core and underside.
   * 'solid': the wax is treated as a rounded solid. A sphere-like surface
   *   normal is recovered from the field, then lit by the bulb below (diffuse,
   *   wrapped a little because wax lets light through) plus a small highlight
   *   from the room. Reads as a 3D object, but an opaque, glossy one.
   * 'wax': the same recovered shape, lit the way translucent wax in a lamp
   *   is. Light from the bulb passes through, so nothing falls to black: the
   *   shading is soft (half-Lambert), thin parts (rims, necks) glow brighter
   *   than the dense core, and there is no highlight, since the gloss in a
   *   real lamp sits on the glass, not on the wax.
   *
   * `rgb` ({ out, ramps }) is optional: `out` (3 bytes per pixel) also gets
   * the same picture in full colour from makeRamps() tables, with no limit
   * on shades and a smooth edge. That is the better source for a lossy
   * encoder (WebP), which spends bytes on the steps between palette shades.
   *
   * With `rgb.alpha` the output is 4 bytes per pixel, meant to be drawn over
   * the flat colour of open liquid (the theme's frame colour). Wax pixels are
   * opaque. Liquid pixels are mostly transparent (ramps.liquidAlpha, a third
   * opaque by default) and their colour is exaggerated by the inverse, so
   * that drawn over the frame colour they come out as the liquid's real
   * colour. The point: whatever error a lossy encoder makes in the liquid
   * and its glow is shrunk about three times when the browser draws it,
   * which hides the blocks lossy compression leaves in dark, smooth areas.
   * Two things that were tried and dropped: storing the glow itself as exact
   * opacity came out several times larger, and keeping a few pixels of
   * liquid round the wax opaque (to move the jump between exaggerated and
   * true colour off the wax's edge) drew a visible outline round every blob.
   */
  function shade(scene, field, out, levels, style, rgb) {
    const W = scene.W, H = scene.H;
    const px = rgb ? rgb.out : null, RL = rgb ? rgb.ramps.liquid : null, RW = rgb ? rgb.ramps.wax : null;
    const RN = rgb ? rgb.ramps.size - 1 : 0;
    const alpha = !!(rgb && rgb.alpha), stride = alpha ? 4 : 3;
    const RB = alpha ? rgb.ramps.liquidBoosted : null, LA = alpha ? rgb.ramps.liquidAlpha : 0;
    const model = (style && style.model) || 'glow';
    const waxy = model === 'wax';
    const shaped = waxy || model === 'solid';
    const num = (key, fallback) => (style && style[key] != null ? style[key] : fallback);
    const unit = (v) => { const m = Math.hypot(v[0], v[1], v[2]); return [v[0] / m, v[1] / m, v[2] / m]; };
    // x right, y down, z toward the viewer
    const L = unit((style && style.light) || [-0.25, 0.75, 0.6]);
    const room = unit((style && style.highlight) || [-0.5, -0.55, 0.67]);
    const half = unit([room[0], room[1], room[2] + 1]); // halfway to the viewer
    const ambient = num('ambient', 0.05), diffuse = num('diffuse', 0.78), wrap = num('wrap', 0.3);
    const specular = num('specular', 0.35), shininess = num('shininess', 28);
    const waxBase = num('base', 0.22), waxShade = num('shade', 0.48), waxGlow = num('glow', 0.22);
    const invEdge = 1 / (1 - Math.cbrt(T));
    const lq = (levels && levels.liquid) || NL, wq = (levels && levels.wax) || NW;
    const liquidScale = (lq - 1) / T, liquidStep = (NL - 1) / (lq - 1);
    const waxStep = (NW - 1) / (wq - 1);
    for (let y = 0; y < H; y++) {
      const up = (y > 0 ? y - 1 : scene.tileY ? H - 1 : 0) * W;
      const down = (y < H - 1 ? y + 1 : scene.tileY ? 0 : H - 1) * W;
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const v = field[row + x];
        let coverage = 0, g = 0, gx = 0, gy = 0;
        if (v > T - 0.12) {
          const xl = x > 0 ? x - 1 : scene.tileX ? W - 1 : 0;
          const xr = x < W - 1 ? x + 1 : scene.tileX ? 0 : W - 1;
          gx = (field[row + xr] - field[row + xl]) * 0.5;
          gy = (field[down + x] - field[up + x]) * 0.5;
          g = Math.sqrt(gx * gx + gy * gy);
          coverage = 0.5 + (v - T) / (g + 1e-5); // share of this pixel inside the wax
        }
        // Full colour: the liquid's own colour here, which the wax (if any)
        // is then laid over by its coverage.
        let li = 0;
        if (px) li = (v >= T ? RN : v <= 0 ? 0 : ((v / T) * RN + 0.5) | 0) * 3;
        if (coverage <= 0) {
          const f = v >= T ? lq - 1 : v <= 0 ? 0 : (v * liquidScale + 0.5) | 0;
          out[row + x] = LIQ0 + ((f * liquidStep + 0.5) | 0);
          if (alpha) {
            const o = (row + x) * 4;
            px[o] = RB[li]; px[o + 1] = RB[li + 1]; px[o + 2] = RB[li + 2]; px[o + 3] = LA;
          } else if (px) {
            const o = (row + x) * 3;
            px[o] = RL[li]; px[o + 1] = RL[li + 1]; px[o + 2] = RL[li + 2];
          }
          continue;
        }
        let u;
        if (shaped) {
          // For one ball the field fixes how far out from the centre we are
          // (0 centre, 1 edge); the field's slope says in which direction.
          // Together they give the normal of a sphere. Where balls merge the
          // field overshoots 1, so it is eased toward 1 (no hard plateau) and
          // the fading slope, via the 0.004, gives a gently flattened top.
          const vs = v < 0.8 ? v : 0.8 + 0.2 * Math.tanh((v - 0.8) * 5);
          let rho2 = (1 - Math.cbrt(vs)) * invEdge;
          rho2 = rho2 < 0 ? 0 : rho2 > 1 ? 1 : rho2;
          const k = Math.sqrt(rho2) / (g + 0.004);
          const nx = -gx * k, ny = -gy * k;
          const nz2 = 1 - nx * nx - ny * ny;
          const nz = nz2 > 0 ? Math.sqrt(nz2) : 0;
          const facing = nx * L[0] + ny * L[1] + nz * L[2];
          if (waxy) {
            const soft = 0.5 + 0.5 * facing; // never reaches black
            const thin = nx * nx + ny * ny; // 0 at the dense centre, 1 at the rim
            u = waxBase + waxShade * soft + waxGlow * thin * (0.35 + 0.65 * soft);
          } else {
            let lit = (facing + wrap) / (1 + wrap);
            if (lit < 0) lit = 0;
            const sp = nx * half[0] + ny * half[1] + nz * half[2];
            u = ambient + diffuse * lit + (sp > 0 ? specular * Math.pow(sp, shininess) : 0);
          }
        } else {
          let s = (v - T) / (CORE - T);
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          u = 0.25 + 0.4 * s - 0.45 * (gy / (g + 0.01)) * (1 - 0.4 * s);
        }
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        if (coverage >= 1) {
          out[row + x] = WAX0 + ((((u * (wq - 1) + 0.5) | 0) * waxStep + 0.5) | 0);
        } else {
          out[row + x] = EDGE0 + Math.min(EB - 1, (coverage * EB) | 0) * NE + ((u * (NE - 1) + 0.5) | 0);
        }
        if (px) {
          const o = (row + x) * stride, wi = ((u * RN + 0.5) | 0) * 3;
          if (coverage >= 1) {
            px[o] = RW[wi]; px[o + 1] = RW[wi + 1]; px[o + 2] = RW[wi + 2];
            if (alpha) px[o + 3] = 255;
          } else {
            px[o] = RL[li] + (RW[wi] - RL[li]) * coverage + 0.5;
            px[o + 1] = RL[li + 1] + (RW[wi + 1] - RL[li + 1]) * coverage + 0.5;
            px[o + 2] = RL[li + 2] + (RW[wi + 2] - RL[li + 2]) * coverage + 0.5;
            if (alpha) px[o + 3] = 255; // the edge is opaque too: its blend with the liquid is in the colour
          }
        }
      }
    }
  }

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(l) {
    const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  }
  function luminance(r, g, b) {
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
  }
  function parseHex(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function ramp(stops, f) {
    let k = 0;
    while (k < stops.length - 2 && f > stops[k + 1][0]) k++;
    const a = stops[k], b = stops[k + 1];
    const m = Math.max(0, Math.min(1, (f - a[0]) / (b[0] - a[0])));
    const ca = parseHex(a[1]), cb = parseHex(b[1]);
    return [ca[0] + (cb[0] - ca[0]) * m, ca[1] + (cb[1] - ca[1]) * m, ca[2] + (cb[2] - ca[2]) * m];
  }
  // Pull a colour's luminance into [lo, hi], keeping its hue where possible.
  function boundLuminance(c, lo, hi) {
    const L = luminance(c[0], c[1], c[2]);
    if (L > hi) return c.map((v) => linearToSrgb(srgbToLinear(v) * (hi / L)));
    if (L < lo) {
      let lin = c.map((v) => Math.min(1, srgbToLinear(v) * (L > 0 ? lo / L : 1)));
      const L2 = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
      if (L2 < lo) lin = lin.map((v) => v + ((1 - v) * (lo - L2)) / (1 - L2)); // out of gamut: add white
      return lin.map(linearToSrgb);
    }
    return c.map(Math.round);
  }

  // Text over the lava needs 4.5:1. Light text limits how bright the lava may
  // get; dark text limits how dark.
  const DARK_MAX_LUMINANCE = 0.14, LIGHT_MIN_LUMINANCE = 0.225;

  /**
   * 256 RGB triples for a look ({mode, liquid, wax} with ramps of [pos, hex]).
   * Pass unbounded = true where no text sits on top (the new-tab page).
   */
  function makePalette(look, unbounded) {
    const lo = unbounded || look.mode === 'dark' ? 0 : LIGHT_MIN_LUMINANCE;
    const hi = unbounded || look.mode !== 'dark' ? 1 : look.maxLuminance || DARK_MAX_LUMINANCE;
    const pal = new Uint8Array(256 * 3);
    const put = (i, c) => {
      const b = boundLuminance(c, lo, hi);
      pal[i * 3] = b[0]; pal[i * 3 + 1] = b[1]; pal[i * 3 + 2] = b[2];
    };
    for (let j = 0; j < NL; j++) put(LIQ0 + j, ramp(look.liquid, j / (NL - 1)));
    for (let j = 0; j < NW; j++) put(WAX0 + j, ramp(look.wax, j / (NW - 1)));
    const shore = ramp(look.liquid, 1);
    for (let b = 0; b < EB; b++) {
      const c = (b + 0.5) / EB;
      for (let j = 0; j < NE; j++) {
        const w = ramp(look.wax, j / (NE - 1));
        put(EDGE0 + b * NE + j, [shore[0] + (w[0] - shore[0]) * c, shore[1] + (w[1] - shore[1]) * c, shore[2] + (w[2] - shore[2]) * c]);
      }
    }
    put(0, ramp(look.liquid, 0));
    return pal;
  }

  /**
   * The same two colour ramps as makePalette(), at `size` steps each instead
   * of a few dozen, for shade()'s full-colour output. Brightness is bounded
   * the same way, so the text-contrast check on the palette covers these too
   * (a mix of two bounded colours is never brighter than the brighter one).
   */
  function makeRamps(look, unbounded, size, maxBoost) {
    const n = size || 1024;
    const lo = unbounded || look.mode === 'dark' ? 0 : LIGHT_MIN_LUMINANCE;
    const hi = unbounded || look.mode !== 'dark' ? 1 : look.maxLuminance || DARK_MAX_LUMINANCE;
    const table = (stops) => {
      const t = new Uint8Array(n * 3);
      for (let j = 0; j < n; j++) t.set(boundLuminance(ramp(stops, j / (n - 1)), lo, hi), j * 3);
      return t;
    };
    const liquid = table(look.liquid);
    // For shade()'s transparent output: the liquid ramp with its distance
    // from the base colour (open liquid) multiplied by k, to be shown at
    // opacity 1/k. k is the largest whole-opacity factor that keeps every
    // exaggerated colour inside 0-255.
    const base = [liquid[0], liquid[1], liquid[2]];
    let k = maxBoost || 8;
    for (let j = 0; j < n; j++) {
      for (let c = 0; c < 3; c++) {
        const d = liquid[j * 3 + c] - base[c];
        if (d > 0) k = Math.min(k, (255 - base[c]) / d);
        else if (d < 0) k = Math.min(k, base[c] / -d);
      }
    }
    const liquidAlpha = Math.min(255, Math.ceil(255 / k));
    const boost = 255 / liquidAlpha;
    const liquidBoosted = new Uint8Array(n * 3);
    for (let i = 0; i < n * 3; i++) liquidBoosted[i] = Math.max(0, Math.min(255, Math.round(base[i % 3] + (liquid[i] - base[i % 3]) * boost)));
    return { size: n, liquid, wax: table(look.wax), base, liquidAlpha, liquidBoosted };
  }

  return { T, WAX0, DARK_MAX_LUMINANCE, LIGHT_MIN_LUMINANCE, makeScene, makeStripScenes, renderField, shade, makePalette, makeRamps, luminance };
});
