/*
 * The demo browser at the top of the page.
 *
 * The control panel is the extension's own popup, in a frame (popup.html).
 * It reports each change here (window.LavaDemo), and this file does what the
 * extension's background page does in Firefox: works out the theme's colours
 * (ext/shared.js, the extension's own) and shows the lava. The lava itself is
 * drawn by lava-worker.js.
 */
// The demo browser's tabs: each shows one of the three pages. The row of tabs
// along the top and the column in a wide sidebar are the same three tabs.
(function () {
  'use strict';

  const fx = document.getElementById('fx');
  const address = document.getElementById('fxAddress');
  if (!fx || !address) return;
  const PAGES = { home: '', privacy: '#privacy', links: '#links' };
  const FROM = { '#privacy': 'privacy', '#no-warranty': 'privacy', '#links': 'links', '#support': 'links' };
  const tabs = Array.from(fx.querySelectorAll('[role=tab]'));

  function open(page, remember) {
    if (!(page in PAGES)) page = 'home';
    for (const tab of tabs) {
      const on = tab.dataset.page === page;
      tab.classList.toggle('is-selected', on);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const name of Object.keys(PAGES)) document.getElementById('page-' + name).hidden = name !== page;
    address.textContent = 'andkon.dev/lavalamp' + (PAGES[page] ? '/' + PAGES[page] : '');
    fx.dataset.page = page;
    if (remember) { try { history.replaceState(null, '', location.pathname + location.search + PAGES[page]); } catch (e) { /* the page still works */ } }
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => open(tab.dataset.page, true));
    tab.addEventListener('keydown', (e) => {
      const row = Array.from(tab.parentElement.querySelectorAll('[role=tab]'));
      const at = row.indexOf(tab);
      const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (at + 1) % row.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (at + row.length - 1) % row.length
        : e.key === 'Home' ? 0 : e.key === 'End' ? row.length - 1 : -1;
      if (to < 0) return;
      e.preventDefault();
      open(row[to].dataset.page, true);
      row[to].focus();
    });
  }
  window.addEventListener('hashchange', () => open(FROM[location.hash] || 'home'));
  open(FROM[location.hash] || 'home');
})();

(function () {
  'use strict';

  const S = window.LavaShared;
  const root = document.documentElement;
  const fx = document.getElementById('fx');
  const frame = document.getElementById('fxFrame');
  const panel = document.getElementById('fxPanel');
  const button = document.getElementById('fxButton');
  const canvases = { top: document.getElementById('lavaTop'), side: document.getElementById('lavaSide') };
  if (!S || !fx) return;

  // Firefox's own dark theme, for when the lava is switched off.
  const OFF = {
    frame: '#1c1b22', tab_background_text: '#fbfbfe', tab_selected: '#42414d', tab_text: '#fbfbfe',
    toolbar: '#2b2a33', toolbar_text: '#fbfbfe', icons: '#fbfbfe', toolbar_field: '#1c1b22', toolbar_field_text: '#fbfbfe',
    toolbar_field_border: 'rgba(255, 255, 255, 0.14)', toolbar_field_border_focus: '#a78bfa', toolbar_bottom_separator: 'rgba(0, 0, 0, 0.3)',
    button_background_hover: 'rgba(255, 255, 255, 0.10)', button_background_active: 'rgba(255, 255, 255, 0.16)',
    ntp_background: '#2b2a33', ntp_text: '#fbfbfe', popup: '#1c1b22', popup_text: '#fbfbfe', popup_border: 'rgba(255, 255, 255, 0.2)',
    popup_highlight: '#4a3a8c', popup_highlight_text: '#ffffff',
  };

  let settings = S.clean(null);
  let coloursFor = '';

  function paint() {
    const key = settings.on ? [settings.look, settings.hue, settings.bg, settings.tab].join('|') : 'off';
    if (key !== coloursFor) {
      coloursFor = key;
      const c = settings.on ? S.theme(settings).colors : OFF;
      const light = settings.on && S.isLight(settings);
      const on = (el, vars) => { for (const name of Object.keys(vars)) el.style.setProperty(name, vars[name]); };
      on(fx, {
        '--frame': c.frame, '--tab-text': c.tab_background_text, '--tab-selected': c.tab_selected, '--tab-selected-text': c.tab_text,
        '--toolbar': c.toolbar, '--toolbar-text': c.toolbar_text, '--icons': c.icons,
        '--field': c.toolbar_field, '--field-text': c.toolbar_field_text, '--field-border': c.toolbar_field_border,
        '--hover': c.button_background_hover, '--active': c.button_background_active,
        '--content': c.ntp_background, '--content-text': c.ntp_text, '--panel-border': c.popup_border,
      });
      on(root, { '--bg': c.popup, '--text': c.popup_text, '--accent': c.popup_highlight, '--accent-text': c.popup_highlight_text, '--line': c.toolbar_field_border_focus });
      root.style.colorScheme = light ? 'light' : 'dark';
      root.classList.toggle('light', light);
    }
    fx.dataset.on = String(settings.on);
    fx.dataset.sidebar = settings.on ? settings.sidebar : 'off';
    fx.dataset.wide = String(settings.on && settings.sidebar !== 'off' && settings.wide);
  }

  // ---------- the lava ----------
  let worker = null, busy = false, wanted = null, waiting = false, redraw = true;
  let phase = 0, last = 0, asked = 0, seen = true, spare = {};
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  function send() {
    if (!worker || busy || !wanted) return;
    busy = true;
    worker.postMessage({ type: 'set', settings: wanted });
    wanted = null;
  }
  function show(images) {
    const used = {};
    for (const image of images) {
      const canvas = canvases[image.name];
      if (canvas.width !== image.w || canvas.height !== image.h) { canvas.width = image.w; canvas.height = image.h; }
      canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.buffer), image.w, image.h), 0, 0);
      canvas.classList.toggle('right', image.right);
      canvas.hidden = false;
      used[image.name] = true;
      spare[image.name] = image.buffer;
    }
    for (const name of Object.keys(canvases)) if (!used[name]) canvases[name].hidden = true;
    fx.dataset.frames = String((Number(fx.dataset.frames) || 0) + 1);
  }
  function tick(now) {
    requestAnimationFrame(tick);
    if (!seen || document.hidden) { last = 0; return; }
    if (last && !still.matches) phase = (phase + ((now - last) / 1000) * settings.speed / S.LOOP_SECONDS) % 1;
    last = now;
    if (!worker || waiting) return;
    if (!redraw && (still.matches || !settings.on || now - asked < 1000 / S.FPS - 1)) return;
    waiting = true;
    redraw = false;
    asked = now;
    const buffers = Object.keys(spare).map((name) => spare[name]);
    worker.postMessage({ type: 'frame', phase, view: { w: fx.clientWidth, h: fx.clientHeight }, spare }, buffers);
    spare = {};
  }
  function start() {
    try { worker = new Worker('lava-worker.js'); } catch (e) { worker = null; }
    if (!worker) { fx.dataset.lava = 'none'; return; }
    worker.onmessage = (e) => {
      if (e.data.type === 'ready') { busy = false; redraw = true; send(); }
      if (e.data.type === 'frame') { waiting = false; show(e.data.images); }
    };
    worker.onerror = () => { fx.dataset.lava = 'none'; worker = null; };
    wanted = settings;
    send();
    if (window.IntersectionObserver) new IntersectionObserver((entries) => { seen = entries[entries.length - 1].isIntersecting; }).observe(fx);
    window.addEventListener('resize', () => { redraw = true; });
    requestAnimationFrame(tick);
  }

  // ---------- what the popup's frame calls ----------
  window.LavaDemo = {
    get: () => settings,
    set(next) {
      settings = S.clean(next);
      paint();
      wanted = settings;
      send();
    },
    size(height) {
      if (height > 0) fx.style.setProperty('--panel-h', height + 'px');
    },
  };

  // The toolbar button opens and closes the panel, as it does in Firefox.
  button.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  });

  paint();
  frame.src = 'popup.html';
  start();
})();
