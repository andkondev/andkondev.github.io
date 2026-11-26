/*
 * The controls. The preview here follows every movement of a slider; the
 * browser's own theme follows when the slider is let go.
 */
'use strict';

const S = LavaShared;
const $ = (id) => document.getElementById(id);
const sliders = Object.keys(S.RANGES), toggles = ['on', 'wide'], choices = ['look', 'sidebar'];
const radios = (name) => [...document.querySelectorAll(`input[name=${name}]`)];
let settings = S.clean(null);

for (const id of sliders) {
  const [min, max, step] = S.RANGES[id];
  Object.assign($(id), { min, max, step });
}

// ---------- preview ----------
const canvas = $('preview'), ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const image = ctx.createImageData(W, H), pixels = new Uint32Array(image.data.buffer);
const idx = new Uint8Array(W * H), colours = new Uint32Array(256);
let plan, space, shape, palette, phase = 0, last = 0;

function prepare() {
  if (shape !== S.shapeKey(settings)) {
    shape = S.shapeKey(settings);
    plan = LavaWax.plan(S.previewScene(settings, W, H), S.FRAMES);
    space = LavaWax.workspace(plan.scene);
  }
  palette = S.theme(settings).palette;
  for (let i = 0; i < 256; i++) colours[i] = (255 << 24) | (palette[i * 3 + 2] << 16) | (palette[i * 3 + 1] << 8) | palette[i * 3];
}
function draw(now) {
  requestAnimationFrame(draw);
  if (now - last < 1000 / S.FPS - 1) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (last && !still) phase = (phase + ((now - last) / 1000) * settings.speed / S.LOOP_SECONDS) % 1;
  last = now;
  LavaWax.frame(plan, Math.floor(phase * S.FRAMES) % S.FRAMES, idx, S.LEVELS, S.SHADING, space);
  for (let i = 0; i < pixels.length; i++) pixels[i] = colours[idx[i]];
  ctx.putImageData(image, 0, 0);
}

// ---------- colour sliders ----------
// Each one's track shows what its positions give for the chosen look, and
// its knob the colour chosen. `lift` brightens a colour for display: a dark
// look's liquid is close to black, and a track of near-blacks says nothing.
const WAX = Lava.WAX0 + Math.round(0.7 * 158), LIQUID = Lava.WAX0 - 1; // a typical wax shade; the liquid beside the wax
const css = (table, i, lift) => `rgb(${[0, 1, 2].map((c) => Math.min(255, Math.round(table[i * 3 + c] * lift))).join(', ')})`;
const tracks = {};
function track(key, entry, lift) {
  const id = settings.look + key;
  if (!tracks[id]) {
    const stops = [];
    for (let v = 0; v <= 360; v += 30) stops.push(css(S.theme(S.clean({ look: settings.look, [key]: Math.min(v, 359) })).palette, entry, lift));
    tracks[id] = `linear-gradient(to right, ${stops.join(', ')})`;
  }
  return tracks[id];
}
function paint(id, entry, lift) {
  $(id).style.setProperty('--track', track(id, entry, lift));
  $(id).style.setProperty('--now', css(palette, entry, lift));
}

// ---------- controls ----------
const times = (v) => v.toFixed(2).replace(/0$/, '') + '×';
function show() {
  for (const id of sliders) $(id).value = settings[id];
  for (const id of toggles) $(id).checked = settings[id];
  for (const name of choices) for (const el of radios(name)) el.checked = el.value === settings[name];
  for (const id of ['speed', 'size', 'amount']) $(id + 'Out').textContent = times(settings[id]);
  $('tabOut').textContent = Math.round(settings.tab * 100) + '%';
  $('wideRow').hidden = settings.sidebar === 'off';
  document.body.classList.toggle('off', !settings.on);
  document.documentElement.className = (S.isLight(settings) ? 'light ' : '') + settings.look;
  prepare();
  paint('hue', WAX, 1);
  paint('bg', LIQUID, S.isLight(settings) ? 1 : 2.6);
}
function read() {
  const next = {};
  for (const id of sliders) next[id] = $(id).value;
  for (const id of toggles) next[id] = $(id).checked;
  for (const name of choices) next[name] = (radios(name).find((el) => el.checked) || {}).value;
  settings = S.clean(next);
}
function showStatus(status) {
  const el = $('status');
  el.className = status.state === 'error' ? 'error' : '';
  el.textContent = status.state === 'building' ? `Building ${Math.round(status.progress * 100)}%`
    : status.state === 'applying' ? 'Applying…'
    : status.state === 'error' ? 'Failed: ' + status.text : '';
}
const send = () => browser.runtime.sendMessage({ type: 'set', settings }).then((r) => showStatus(r.status));

for (const id of sliders) {
  $(id).addEventListener('input', () => { read(); show(); });
  $(id).addEventListener('change', () => { read(); send(); });
  // Double-click a slider to put just that one back.
  $(id).addEventListener('dblclick', () => {
    settings = S.clean(Object.assign({}, settings, { [id]: S.DEFAULTS[id] }));
    show();
    send();
  });
}
for (const el of toggles.map($).concat(...choices.map(radios))) el.addEventListener('change', () => { read(); show(); send(); });
// Reset puts everything back except the On switch.
$('reset').addEventListener('click', () => {
  settings = S.clean({ on: settings.on });
  show();
  send();
});

browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'status') showStatus(message.status);
});
browser.runtime.sendMessage({ type: 'get' }).then((r) => {
  settings = S.clean(r.settings);
  show();
  showStatus(r.status);
});

show();
requestAnimationFrame(draw);
