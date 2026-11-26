/*
 * What the settings mean: the scenes to simulate, the colours of the lava and
 * of Firefox's own UI. Used by the background page, the bake workers, the
 * popup's preview and the Node build, so all four agree.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.LavaShared = factory(root.Lava, root.LavaDrafts, root.LavaTheme);
})(typeof self !== 'undefined' ? self : this, function (Lava, Drafts, Theme) {
  'use strict';

  const find = (list, id) => list.find((x) => x.id === id);
  const draft = find(Drafts.drafts, 'midnight-wax');
  const chrome = find(Drafts.chromeStyles, 'tint');
  const violet = find(Drafts.accents, 'violet');
  const rgba = (fill) => /rgba\(([^)]+)\)/.exec(fill)[1].split(',').map(Number);

  /*
   * The looks. Each is a starting colour table over the same frames; the
   * Colour and Background sliders turn its wax and its liquid round the
   * colour wheel. `line` colours thin things (address bar border, loading
   * dot), `deep` fills the highlighted list row under white text, `tint` is
   * the selected tab's see-through fill, `menu` the menus and address bar.
   */
  const LIGHT = { mode: 'light', tint: [255, 255, 255, 0.6], menu: { fill: '#f9f9fb' } };
  const LOOKS = {
    midnight: {
      mode: 'dark', text: draft.text, liquid: draft.liquid, wax: draft.wax,
      line: violet.line, deep: violet.deep, tint: rgba(find(Drafts.tints, 'violet').fill), menu: find(Drafts.menus, 'charcoal'),
    },
    // The same violet-to-orange wax, brightened, in pale lavender.
    daylight: Object.assign({}, LIGHT, {
      text: '#1d1030', line: '#6a2bd6', deep: violet.deep,
      liquid: [[0, '#ebe4ff'], [0.6, '#e2d6fc'], [1, '#d3bef6']],
      wax: [[0, '#7c5ce6'], [0.35, '#9a5cf0'], [0.6, '#c85ad8'], [0.78, '#f06a9c'], [0.9, '#ff8a6a'], [1, '#ffb45a']],
    }),
    // The 1970s lamp: red wax in amber. The wax runs from crimson to a
    // yellow-orange underside, and the liquid darkens beside it, because a
    // light look cannot have deep shadows: its depth has to come from the
    // bright end and from the rim.
    classic: Object.assign({}, LIGHT, {
      text: '#1f0d08', line: '#b3200f', deep: '#8a1a0c',
      liquid: [[0, '#f7b81e'], [0.6, '#f5a61a'], [1, '#ec7f16']],
      wax: [[0, '#b8102c'], [0.3, '#d81e1c'], [0.55, '#f24a16'], [0.75, '#ff7c22'], [0.92, '#ffb347'], [1, '#ffd070']],
    }),
  };

  const FPS = Drafts.fps, FRAMES = Drafts.loopSeconds * FPS;
  const DEFAULTS = { on: true, look: 'midnight', hue: 0, bg: 0, speed: 1, size: 1, amount: 1, sidebar: 'left', wide: false, tab: 0.8 };
  // Size and amount are capped because the animation's file, and with it
  // Firefox's memory use, grows with the amount of wax on screen.
  // `tab` is how solid the selected tab's fill is; the rest is lava showing through.
  const RANGES = { hue: [0, 359, 1], bg: [0, 359, 1], tab: [0, 1, 0.05], speed: [0.25, 2, 0.05], size: [0.6, 1.4, 0.1], amount: [0.5, 1.5, 0.1] };
  const SIDES = ['off', 'left', 'right'];

  function clean(s) {
    const out = Object.assign({}, DEFAULTS);
    if (!s) return out;
    for (const k of Object.keys(RANGES)) {
      const [lo, hi] = RANGES[k], v = Number(s[k]);
      if (Number.isFinite(v)) out[k] = Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100;
    }
    for (const k of ['on', 'wide']) if (typeof s[k] === 'boolean') out[k] = s[k];
    if (Object.prototype.hasOwnProperty.call(LOOKS, s.look)) out.look = s.look;
    else if (s.light === true) out.look = 'daylight'; // settings saved by 0.2
    if (SIDES.includes(s.sidebar)) out.sidebar = s.sidebar;
    else if (s.sidebar === false) out.sidebar = 'off'; // settings saved before 0.3
    return out;
  }
  /** The blobs' shape, as far as the popup's preview shows it. */
  const shapeKey = (s) => s.size + '|' + s.amount;
  /** Colours and timing untouched: a packaged file can be used as it is. */
  const isPlain = (s) => s.look === 'midnight' && s.hue === 0 && s.bg === 0 && s.speed === 1;
  const isLight = (s) => LOOKS[s.look].mode === 'light';

  // The rule the wax moves by (wax-core.js). It is part of every built
  // animation's key, so one kept from a version with another rule is rebuilt.
  const MOTION = 'wax1';
  /**
   * The theme's images for these settings, in drawing order (first on top).
   * `key` names the animation's shape: one with the `stock` key is the
   * packaged file, any other is built here and kept. A `veil` strip is
   * see-through where there is no wax, because unlike the packaged side
   * strip it is laid over lava it was not made to join up with.
   */
  function strips(s) {
    const shape = shapeKey(s), plain = shape === '1|1', out = [];
    if (s.sidebar !== 'off') {
      const right = s.sidebar === 'right', key = `${MOTION}|${shape}|${s.wide ? 'wide' : 'narrow'}|${s.sidebar}`;
      out.push({ name: 'side', key, stock: plain && !s.wide && !right, veil: right || s.wide, mirror: right, align: right ? 'right top' : 'left top', tiling: 'repeat-y' });
    }
    out.push({ name: 'top', key: `${MOTION}|${shape}`, stock: plain, veil: false, mirror: false, align: 'left top', tiling: 'repeat-x' });
    return out;
  }

  const scaled = (range, k) => [range[0] * k, range[1] * k];
  function motionFor(s) {
    const m = draft.motion;
    return Object.assign({}, m, { parcels: m.parcels * s.amount, big: scaled(m.big, s.size), small: scaled(m.small, s.size) });
  }
  // The wide side strip: the narrow strip's column of small blobs along the
  // window edge, plus a few larger ones further in.
  const WIDE = { W: 320, more: 7, big: [24, 34], small: [15, 20], bigShare: 0.6, from: 96, rise: 1.3 };
  function widen(column, s) {
    const more = Lava.makeScene({
      W: WIDE.W, H: column.H, kind: 'side', count: Math.max(2, Math.round(WIDE.more * s.amount)), seed: draft.seed + 2,
      motion: Object.assign({}, draft.motion, { big: scaled(WIDE.big, s.size), small: scaled(WIDE.small, s.size), bigShare: WIDE.bigShare }),
    });
    more.parcels.forEach((p, i) => {
      // Spread across the strip, keeping each blob's glow inside its far edge.
      const hi = WIDE.W - 2 * p.balls[0].r - 10;
      p.x = WIDE.from + ((i * 0.6180339887 + 0.35) % 1) * Math.max(0, hi - WIDE.from);
      p.amp *= WIDE.rise;
    });
    return Object.assign({}, more, { parcels: column.parcels.concat(more.parcels) });
  }
  /** { top, side } scenes for the strips behind the toolbar and down the sidebar. */
  function scenes(s) {
    const side = Drafts.strips.side;
    const out = Lava.makeStripScenes(Object.assign({}, draft, { motion: motionFor(s) }), {
      top: Drafts.strips.top,
      side: Object.assign({}, side, {
        spacing: side.spacing / s.amount,
        motion: Object.assign({}, side.motion, { big: scaled(side.motion.big, s.size), small: scaled(side.motion.small, s.size) }),
      }),
    }, {});
    if (s.wide) out.side = widen(out.side, s);
    return out;
  }
  /** A small scene with the same blobs per area, for the popup. */
  function previewScene(s, W, H) {
    const scene = Lava.makeScene({ W, H, kind: 'top', periodY: Drafts.strips.top.periodY, seed: draft.seed, motion: motionFor(s) });
    scene.kind = 'pane'; // no fade along the lower edge
    return scene;
  }

  function rotateRgb(c, deg) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d === 0) return c.slice();
    const sat = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (((h * 60 + deg) % 360) + 360) % 360;
    const k = (1 - Math.abs(2 * l - 1)) * sat, x = k * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - k / 2;
    const rgb = h < 60 ? [k, x, 0] : h < 120 ? [x, k, 0] : h < 180 ? [0, k, x] : h < 240 ? [0, x, k] : h < 300 ? [x, 0, k] : [k, 0, x];
    return rgb.map((v) => Math.round((v + m) * 255));
  }
  const parseHex = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const rotate = (hex, deg) => (deg ? toHex(rotateRgb(parseHex(hex), deg)) : hex);

  const toLinear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const toSrgb = (l) => 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);
  const brightness = (lin) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  /**
   * A wax colour turned round the colour wheel and then brought back to the
   * brightness it had. Hues differ a lot in how bright they are (green far
   * brighter than red or blue), so a plain turn would squash or even reverse
   * the step from the wax's shadowed side to its lit side, which is all that
   * makes a blob look round. Where the new hue cannot be that bright at full
   * strength, white is mixed in.
   */
  function turn(hex, deg) {
    if (!deg) return hex;
    const want = brightness(parseHex(hex).map(toLinear));
    let lin = rotateRgb(parseHex(hex), deg).map(toLinear);
    const got = brightness(lin);
    if (got <= 0) return toHex([0, 1, 2].map(() => toSrgb(want)));
    lin = lin.map((v) => (v * want) / got);
    const peak = Math.max(lin[0], lin[1], lin[2]);
    if (peak > 1) {
      const fit = lin.map((v) => v / peak), white = (want - want / peak) / (1 - want / peak);
      lin = fit.map((v) => v + (1 - v) * white);
    }
    return toHex(lin.map(toSrgb));
  }

  // The palette entry shade() gives open liquid, far from any wax.
  const OPEN = (() => {
    const out = new Uint8Array(1);
    Lava.shade({ W: 1, H: 1 }, new Float32Array([0.02]), out, draft.levels, draft.shading);
    return out[0];
  })();
  /**
   * A colour table for a see-through strip: open liquid is clear and the glow
   * beside the wax is a veil of the glow's own colour, thick enough that over
   * open liquid it comes out as the colour it replaces. Wax stays solid.
   *
   * Firefox mixes that veil with whatever lava is under it, and a mix of two
   * very different hues can be darker than both. If `text` (a hex colour)
   * over any such mix would fall below 4.5:1, the glow is made solid
   * instead: then every pixel is a colour from the table, which is checked.
   */
  function veil(palette, text) {
    const shore = Lava.WAX0 - 1; // the liquid right beside the wax
    const out = palette.slice(), alpha = new Uint8Array(256).fill(255);
    const at = (i, c) => palette[i * 3 + c];
    const d = [0, 1, 2].map((c) => at(shore, c) - at(OPEN, c));
    const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
    for (let i = 0; i < Lava.WAX0; i++) {
      const t = i <= OPEN ? 0 : ((at(i, 0) - at(OPEN, 0)) * d[0] + (at(i, 1) - at(OPEN, 1)) * d[1] + (at(i, 2) - at(OPEN, 2)) * d[2]) / dd;
      alpha[i] = Math.round(255 * Math.max(0, Math.min(1, t)));
      // The glow's colour, nudged so that at this thickness over open liquid
      // it lands exactly on the colour it replaces.
      const a = alpha[i] / 255;
      for (let c = 0; c < 3; c++) out[i * 3 + c] = a > 0.05 ? Math.max(0, Math.min(255, Math.round(at(OPEN, c) + (at(i, c) - at(OPEN, c)) / a))) : at(shore, c);
    }
    const ink = Lava.luminance(...parseHex(text)) + 0.05;
    let readable = true;
    for (let i = OPEN + 1; i < shore && readable; i++) {
      const a = alpha[i] / 255;
      for (let under = 1; under < 256; under++) {
        const mix = (c) => at(under, c) + (out[i * 3 + c] - at(under, c)) * a;
        const paper = Lava.luminance(mix(0), mix(1), mix(2)) + 0.05;
        if (Math.max(ink, paper) / Math.min(ink, paper) < 4.5) { readable = false; break; }
      }
    }
    if (readable) return { palette: out, alpha };
    for (let i = 0; i < Lava.WAX0; i++) alpha[i] = i <= OPEN ? 0 : 255;
    return { palette: palette.slice(), alpha };
  }

  /** { palette, colors, veil }: the lava's colour table, Firefox's theme colours, and the table for see-through strips. */
  function theme(s) {
    const look = LOOKS[s.look], light = look.mode === 'light';
    const l = Object.assign({}, draft, {
      mode: look.mode, text: look.text, popup: look.menu.fill,
      wax: look.wax.map(([p, c]) => [p, turn(c, s.hue)]),
      liquid: look.liquid.map(([p, c]) => [p, rotate(c, s.bg)]),
    });
    const palette = Lava.makePalette(l);
    let tint = s.bg ? rotateRgb(look.tint.slice(0, 3), s.bg) : look.tint.slice(0, 3);
    let deep = parseHex(rotate(look.deep, s.bg));
    const line = rotate(look.line, s.bg);
    let colors;
    // Some hues are much brighter than the default; darken the fills under
    // text until the text on them is readable again.
    for (let i = 0; i < 20; i++) {
      colors = Theme.resolve(l, palette, chrome, { line, deep: toHex(deep) }, { fill: `rgba(${tint.map(Math.round).join(', ')}, ${s.tab})` }, look.menu);
      const report = Theme.contrast(palette, colors);
      const worst = (label) => report.find((r) => r.label === label).worst;
      const tabOk = worst('selected tab text') >= 4.5, rowOk = worst('highlighted list row text') >= 4.5;
      if (tabOk && rowOk) break;
      if (!tabOk && !light) tint = tint.map((v) => v * 0.85); // a light look's tab fill is white: always readable
      if (!rowOk) deep = deep.map((v) => v * 0.85);
    }
    return { palette, colors, veil: veil(palette, colors.tab_background_text) };
  }

  return {
    FPS, FRAMES, DEFAULTS, RANGES, LOOKS: Object.keys(LOOKS), SIDES, OPEN,
    LEVELS: draft.levels, SHADING: draft.shading, LOOP_SECONDS: Drafts.loopSeconds,
    clean, shapeKey, isPlain, isLight, strips, scenes, previewScene, theme,
  };
});
