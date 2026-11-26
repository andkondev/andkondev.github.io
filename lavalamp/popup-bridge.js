/*
 * Lets the extension's popup (ext/popup.js, unchanged) run on a web page.
 *
 * In Firefox the popup talks to the extension's background page through
 * `browser.runtime`. Here that is stood in for by the page around this frame
 * (window.parent.LavaDemo), which draws the demo browser. Loaded before
 * popup.js.
 */
'use strict';
(function () {
  const host = window.parent !== window ? window.parent.LavaDemo : null;

  window.browser = {
    runtime: {
      sendMessage(message) {
        if (message.type === 'set' && host) host.set(message.settings);
        return Promise.resolve({ settings: host ? host.get() : undefined, status: { state: 'idle' } });
      },
      onMessage: { addListener() {} },
    },
  };

  // popup.css fills a slider's track up to its knob with a Firefox-only rule.
  // Other browsers take the same position from --fill (popup-web.css).
  function fill() {
    for (const el of document.querySelectorAll('input[type=range]')) {
      const min = Number(el.min) || 0, max = Number(el.max) || 100;
      el.style.setProperty('--fill', ((Number(el.value) - min) / (max - min || 1)) * 100 + '%');
    }
  }

  // The extension changes Firefox's theme when a slider is let go, because a
  // new animation takes a moment to make. The page can follow while it moves.
  // `settings` is popup.js's own, already brought up to date by its listener.
  document.addEventListener('input', () => {
    if (host) host.set(settings); // eslint-disable-line no-undef
    fill();
  });
  for (const type of ['change', 'click', 'dblclick']) document.addEventListener(type, () => setTimeout(fill));
  window.addEventListener('load', () => setTimeout(fill));

  if (host && window.ResizeObserver) new ResizeObserver(() => host.size(document.body.offsetHeight)).observe(document.body);
})();
