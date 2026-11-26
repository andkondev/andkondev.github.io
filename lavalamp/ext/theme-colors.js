/*
 * The Firefox theme colours derived from a draft, and the text-contrast
 * check on them. Shared by the build (which writes them into manifest.json)
 * and the style drafts page (which previews them), so the two cannot drift.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LavaTheme = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // How solid the address bar is at rest (it is fully solid when focused).
  const FIELD_ALPHA = 0.88;

  /**
   * Default colours for a draft. `accent` ({line, deep}) is optional: `line`
   * colours the thin things (selected-tab outline, focused address bar
   * border, loading dot), `deep` fills the highlighted row in lists, under
   * white text. Without one, the draft's own accent does both jobs.
   */
  function colors(d, palette, accent) {
    const dark = d.mode === 'dark';
    const line = accent ? accent.line : d.accent;
    const hex = (i) => '#' + [0, 1, 2].map((c) => palette[i * 3 + c].toString(16).padStart(2, '0')).join('');
    const frame = hex(1); // open liquid
    const ink = dark ? '255, 255, 255' : '0, 0, 0';
    return {
      frame, frame_inactive: frame,
      tab_background_text: d.text, tab_text: d.text,
      tab_selected: dark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.28)',
      tab_line: line, tab_loading: line,
      toolbar: 'rgba(0, 0, 0, 0)', // clear, so the lava is not dimmed under it
      toolbar_text: d.text, icons: d.text, icons_attention: line,
      // The address bar at rest is the menu colour, a little see-through, so
      // the bar, its list and the menus read as one family of panels.
      toolbar_field: dark ? sheer(d.popup, FIELD_ALPHA) : 'rgba(255, 255, 255, 0.78)',
      toolbar_field_text: dark ? '#ffffff' : '#15141a',
      toolbar_field_border: `rgba(${ink}, 0.14)`,
      // Firefox paints the address bar's suggestion list with this colour (it
      // is the focused address bar, grown downward), so it matches the menus
      // and is opaque: the page must not show through a list of text.
      toolbar_field_focus: dark ? d.popup : '#ffffff',
      toolbar_field_border_focus: line,
      toolbar_top_separator: 'rgba(0, 0, 0, 0)',
      toolbar_bottom_separator: `rgba(${ink}, 0.14)`,
      button_background_hover: `rgba(${ink}, 0.10)`,
      button_background_active: `rgba(${ink}, 0.16)`,
      popup: d.popup, popup_text: d.text, popup_border: `rgba(${ink}, 0.2)`,
      popup_highlight: accent ? accent.deep : d.accent,
      popup_highlight_text: accent ? '#ffffff' : dark ? '#15141a' : '#ffffff',
      sidebar: d.popup, sidebar_text: d.text, sidebar_border: `rgba(${ink}, 0.2)`,
      ntp_background: frame, ntp_text: d.text,
    };
  }

  /**
   * The final theme colours: the draft's defaults, then the chrome style's
   * overrides. A style may write '@accent' or '@deep' to follow the accent,
   * and '@tint' to take the chosen tab tint ({fill}). `menu` ({fill}), if
   * given, replaces the draft's own colour for menus, sidebar panels, the
   * address bar and its list.
   */
  function resolve(d, palette, chrome, accent, tint, menu) {
    const out = colors(d, palette, accent);
    if (menu) {
      out.popup = out.sidebar = out.toolbar_field_focus = menu.fill;
      out.toolbar_field = sheer(menu.fill, FIELD_ALPHA);
    }
    const line = accent ? accent.line : d.accent, deep = accent ? accent.deep : d.accent;
    const overrides = (chrome && chrome.colors) || {};
    // '@accent-soft' and '@accent-faint' are the accent as a see-through line.
    for (const key of Object.keys(overrides)) {
      const v = overrides[key];
      out[key] = v === '@accent' ? line : v === '@deep' ? deep
        : v === '@accent-soft' ? sheer(line, 0.5) : v === '@accent-faint' ? sheer(line, 0.3)
        : v === '@tint' ? (tint ? tint.fill : out[key]) : v;
    }
    return out;
  }

  /** Whether a chrome style takes the tab tint. */
  function usesTint(chrome) {
    const overrides = (chrome && chrome.colors) || {};
    return Object.keys(overrides).some((key) => overrides[key] === '@tint');
  }

  function parseColor(s) {
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) {
      const n = parseInt(m[1], 16);
      return [n >> 16, (n >> 8) & 255, n & 255, 1];
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (m) {
      const p = m[1].split(',').map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    throw new Error('Unsupported colour: ' + s);
  }
  /** A colour made see-through. */
  function sheer(color, alpha) {
    const c = parseColor(color);
    return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
  }
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const luminance = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));
  function ratio(fg, bg) {
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  /**
   * Worst-case contrast of each kind of text against every colour the lava
   * can take, with the theme's translucent layers painted over it.
   * Returns [{ label, worst }].
   */
  function contrast(palette, themeColors) {
    const c = (k) => parseColor(themeColors[k]);
    // [label, text colour, layers painted over the lava, bottom first]
    const cases = [
      ['inactive tab text on lava', 'tab_background_text', []],
      ['selected tab text', 'tab_text', ['tab_selected']],
      ['toolbar text and icons', 'toolbar_text', ['toolbar']],
      ['address bar text', 'toolbar_field_text', ['toolbar', 'toolbar_field']],
    ];
    const report = cases.map(([label, textKey, layers]) => {
      let worst = Infinity;
      for (let i = 1; i < 256; i++) {
        let bg = [palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]];
        for (const layer of layers) bg = over(c(layer), bg);
        worst = Math.min(worst, ratio(c(textKey), bg));
      }
      return { label, worst };
    });
    // Menus and the focused address bar are opaque, so no lava is behind them.
    report.push({ label: 'address bar list text', worst: ratio(c('toolbar_field_text'), c('toolbar_field_focus')) });
    report.push({ label: 'menu text', worst: ratio(c('popup_text'), c('popup')) });
    report.push({ label: 'highlighted list row text', worst: ratio(c('popup_highlight_text'), c('popup_highlight')) });
    return report;
  }

  return { colors, resolve, usesTint, contrast };
});
