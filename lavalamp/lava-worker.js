/*
 * Draws the lava for the demo browser on the page, off the main thread.
 *
 * The files in ext/ are the Lava Lamp Controls extension's own, unchanged.
 * The extension draws every frame once, into an animated image that Firefox
 * then plays. Here the same frames are drawn as they are needed:
 *
 *   { type: 'set', settings }            -> { type: 'ready' }
 *   { type: 'frame', phase, view, spare } -> { type: 'frame', images: [{ name, w, h, right, buffer }] }
 *
 * `view` is the demo window's size, so only the part on show is coloured in.
 * `spare` hands back the buffers of the frame before, to be used again.
 */
'use strict';
importScripts('ext/lava-core.js', 'ext/wax-core.js', 'ext/drafts.js', 'ext/theme-colors.js', 'ext/shared.js');

const S = LavaShared;
const plans = {}; // strip name -> { key, plan, space, idx }
let strips = [];  // what to draw, bottom first: { name, mirror, colours }

function table(palette, alpha) {
  const out = new Uint32Array(256);
  for (let i = 0; i < 256; i++) out[i] = ((alpha ? alpha[i] : 255) << 24 | palette[i * 3 + 2] << 16 | palette[i * 3 + 1] << 8 | palette[i * 3]) >>> 0;
  return out;
}

function set(given) {
  const s = S.clean(given);
  strips = [];
  if (!s.on) return;
  const look = S.theme(s);
  let scenes = null;
  // S.strips lists the strip on top first; drawing wants the one underneath first.
  for (const strip of S.strips(s).reverse()) {
    // The same wax whichever edge the side strip is on: only mirrored.
    const key = strip.name === 'side' ? `${S.shapeKey(s)}|${s.wide}` : S.shapeKey(s);
    let made = plans[strip.name];
    if (!made || made.key !== key) {
      scenes = scenes || S.scenes(s);
      const plan = LavaWax.plan(scenes[strip.name], S.FRAMES);
      made = plans[strip.name] = { key, plan, space: LavaWax.workspace(plan.scene), idx: new Uint8Array(plan.scene.W * plan.scene.H) };
    }
    const colours = strip.veil ? table(look.veil.palette, look.veil.alpha) : table(look.palette, null);
    strips.push({ name: strip.name, mirror: strip.mirror, colours });
  }
}

function frame(message) {
  const images = [], spare = message.spare || {};
  const f = Math.floor(message.phase * S.FRAMES) % S.FRAMES;
  for (const strip of strips) {
    const { plan, space, idx } = plans[strip.name];
    const W = plan.scene.W, H = plan.scene.H;
    const w = Math.max(1, Math.min(W, message.view.w)), h = Math.max(1, Math.min(H, message.view.h));
    LavaWax.frame(plan, f, idx, S.LEVELS, S.SHADING, space);
    const kept = spare[strip.name];
    const buffer = kept && kept.byteLength === w * h * 4 ? kept : new ArrayBuffer(w * h * 4);
    const out = new Uint32Array(buffer), colours = strip.colours;
    // A mirrored strip is pinned to the right-hand edge, so it is its
    // right-hand end that is on show.
    if (strip.mirror) for (let y = 0; y < h; y++) for (let x = 0, at = y * w, from = y * W + W - 1; x < w; x++) out[at + x] = colours[idx[from - x]];
    else for (let y = 0; y < h; y++) for (let x = 0, at = y * w, from = y * W; x < w; x++) out[at + x] = colours[idx[from + x]];
    images.push({ name: strip.name, w, h, right: strip.mirror, buffer });
  }
  postMessage({ type: 'frame', images }, images.map((image) => image.buffer));
}

onmessage = (e) => {
  if (e.data.type === 'set') {
    set(e.data.settings);
    postMessage({ type: 'ready' });
  } else if (e.data.type === 'frame') {
    frame(e.data);
  }
};
