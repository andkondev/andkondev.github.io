/*
 * The lava lamp drafts. Each one is a look (colours) plus a motion (how the
 * wax is sized and moves). The drafts page shows them all; `node build.js
 * --draft <id>` bakes one into the Firefox theme.
 *
 * mode 'dark' means light text over the lava, which caps how bright the lava
 * may be; mode 'light' means dark text, which lets the lava be vivid.
 * A draft may trade readability for brightness with `maxLuminance` (raises
 * the cap) and `minContrast` (the text contrast the build then accepts,
 * 4.5 unless stated).
 * `liquid` runs from open liquid (0) to the glow right beside the wax (1).
 * `wax` runs from the shadowed crown of a blob (0) to its lit underside (1).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LavaDrafts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {
    tile: { W: 1024, H: 256 },
    loopSeconds: 30,
    fps: 48,
    levels: { liquid: 24, wax: 48 }, // a draft may override with its own

    // The two-strip layout (build with --layout strips). Firefox only shows a
    // theme image in an L: across the top and down the left edge. One wide
    // strip and one tall strip cover that without a small tile repeating.
    strips: {
      top: { W: 1920, H: 160, periodY: 320 },
      // Laid over the top strip along the window's left edge.
      side: { W: 80, H: 1280, centerX: 26, spacing: 112, motion: { big: [14, 19], small: [9, 12], bigShare: 0.55 } },
    },

    // Accent colours for the dark drafts (build with --accent <id>). `line`
    // is for thin things: the selected-tab outline, the focused address bar
    // border, the loading dot. `deep` fills the highlighted row in the
    // address bar's list, under white text.
    accents: [
      { id: 'ember', name: 'Ember', line: '#ff8f5a', deep: '#74321c' },
      { id: 'pink', name: 'Pink', line: '#ff7ab8', deep: '#7a1f5c' },
      { id: 'magenta', name: 'Magenta', line: '#e56ad8', deep: '#6a1f78' },
      { id: 'violet', name: 'Violet', line: '#a78bfa', deep: '#3d2a8c' },
      { id: 'frost', name: 'Frost', line: '#ece8ff', deep: '#3b3470' },
      { id: 'aqua', name: 'Aqua', line: '#5fd4c8', deep: '#12524e' },
    ],

    // Fills for the selected tab in the tinted chrome styles (build with
    // --tint <id>). Kept dark and see-through so the tab's text stays readable
    // and the lava still shows a little. `swatch` is only for the picker.
    tints: [
      { id: 'magenta', name: 'Magenta', fill: 'rgba(96, 22, 86, 0.6)', swatch: '#601656' },
      { id: 'rose', name: 'Rose', fill: 'rgba(122, 24, 60, 0.6)', swatch: '#7a183c' },
      { id: 'ember', name: 'Ember', fill: 'rgba(116, 46, 24, 0.6)', swatch: '#742e18' },
      { id: 'violet', name: 'Violet', fill: 'rgba(62, 36, 140, 0.6)', swatch: '#3e248c' },
      { id: 'indigo', name: 'Indigo', fill: 'rgba(24, 20, 84, 0.65)', swatch: '#181454' },
      { id: 'teal', name: 'Teal', fill: 'rgba(14, 78, 80, 0.6)', swatch: '#0e4e50' },
      { id: 'smoke', name: 'Smoke', fill: 'rgba(0, 0, 0, 0.45)', swatch: '#26242c' },
    ],

    // Colours for menus, the address bar, its list and sidebar panels (build
    // with --menu <id>). These are opaque: no lava shows through a menu. The
    // first matches the Midnight drafts' own menu colour.
    menus: [
      { id: 'indigo', name: 'Indigo', fill: '#15103a' },
      { id: 'violet', name: 'Violet', fill: '#231654' },
      { id: 'plum', name: 'Plum', fill: '#2a1036' },
      { id: 'wine', name: 'Wine', fill: '#2e0f20' },
      { id: 'ember', name: 'Ember', fill: '#2c1610' },
      { id: 'teal', name: 'Teal', fill: '#0b2a2e' },
      { id: 'charcoal', name: 'Charcoal', fill: '#1c1b22' },
      { id: 'black', name: 'Black', fill: '#0b0a12' },
    ],

    // How the tabs and toolbar are dressed, as overrides of the theme colours
    // the build derives from a draft (build with --chrome <id>). Written for
    // the dark drafts. Everything a theme can change here is a colour: it
    // cannot change a tab's shape, border width, blur or font. '@accent' and
    // '@deep' follow the chosen accent; '@tint' takes the chosen tab tint.
    chromeStyles: [
      // Listed first so it sits right under the accent picker on the styles page.
      {
        id: 'tint',
        name: '7. Tinted tab, no outline',
        blurb: 'Style 5 without the border: the selected tab is only a deep, see-through fill in the chosen tint. The accent colours the thin border of the address bar and the line under the toolbar.',
        colors: {
          tab_selected: '@tint', tab_line: 'rgba(0, 0, 0, 0)',
          // With no tab outline the accent would otherwise show only on focus.
          toolbar_field_border: '@accent-soft', toolbar_bottom_separator: '@accent-faint',
        },
      },
      {
        id: 'clear',
        name: '1. Clear',
        blurb: 'The current look. Lava shows at full strength everywhere; the selected tab is a faint dark tint with an accent outline.',
        colors: {},
      },
      {
        id: 'glass',
        name: '2. Smoked glass',
        blurb: 'A dark see-through bar under the tabs, and the selected tab is the same glass, so tab and bar read as one piece. No outline.',
        colors: {
          toolbar: 'rgba(10, 8, 32, 0.5)', tab_selected: 'rgba(10, 8, 32, 0.5)', tab_line: 'rgba(0, 0, 0, 0)',
          toolbar_field: 'rgba(6, 5, 20, 0.6)', toolbar_bottom_separator: 'rgba(255, 255, 255, 0.10)',
        },
      },
      {
        id: 'solid-tab',
        name: '3. Solid tab',
        blurb: 'The selected tab and the address bar are opaque indigo with a thin violet border. Lava everywhere else.',
        colors: {
          tab_selected: '#1b1242', tab_line: '#4a35a0',
          toolbar_field: '#120c30', toolbar_field_border: '#4a35a0',
        },
      },
      {
        id: 'pill',
        name: '4. Light pill',
        blurb: 'The selected tab is a pale translucent pill with a white outline, the address bar a pale glass. The brightest option that still passes the text check.',
        colors: {
          tab_selected: 'rgba(255, 255, 255, 0.07)', tab_line: 'rgba(255, 255, 255, 0.45)', tab_text: '#ffffff',
          toolbar_field: 'rgba(20, 16, 52, 0.55)', toolbar_field_border: 'rgba(255, 255, 255, 0.22)',
        },
      },
      {
        id: 'ember-tab',
        name: '5. Tinted tab',
        blurb: 'The selected tab is filled with the chosen tint and outlined in the accent colour.',
        colors: { tab_selected: '@tint' },
      },
      {
        id: 'band',
        name: '6. Solid toolbar',
        blurb: 'The toolbar is an opaque indigo band joined to the selected tab. Lava only behind the tab strip and down the side: the calmest option.',
        colors: {
          toolbar: '#130d33', tab_selected: '#130d33', tab_line: 'rgba(0, 0, 0, 0)',
          toolbar_field: 'rgba(255, 255, 255, 0.08)', toolbar_field_border: 'rgba(255, 255, 255, 0.12)',
          toolbar_bottom_separator: '#2e2168',
        },
      },
    ],
    drafts: [
      {
        id: 'midnight-wax',
        name: 'B3. Midnight, translucent',
        blurb: "B2's 3D shape, lit like real wax instead of a plastic ball. Light passes through the wax, so nothing falls to black, the rims and necks glow brighter than the dense core, and the glossy highlight is gone. Same blobs and motion as B.",
        mode: 'dark',
        text: '#f7ecf3', accent: '#ff8f5a', popup: '#15103a', page: '#1c1b22',
        shading: { model: 'wax', light: [-0.15, 0.9, 0.4] },
        levels: { liquid: 24, wax: 96 },
        liquid: [[0, '#0a0820'], [0.6, '#150b32'], [1, '#2e1258']],
        wax: [[0, '#1c0a40'], [0.35, '#42187c'], [0.6, '#8a2498'], [0.78, '#c8387e'], [0.9, '#ea5a52'], [1, '#ff9a4a']],
        seed: 5,
        motion: { parcels: 7, big: [28, 40], small: [16, 21], bigShare: 0.7, surge: 0.75, tail: 1.15, pinch: 0.6, sway: 1.3 },
      },
      {
        id: 'midnight-solid',
        name: 'B2. Midnight, solid',
        blurb: "B reshaded as 3D objects. Each blob is lit like a rounded solid by the bulb below: one material colour, a bright underside, a shadowed crown and a small highlight, instead of B's flat orange-in-violet glow. Same blobs and motion as B.",
        mode: 'dark',
        text: '#f7ecf3', accent: '#ff8f5a', popup: '#15103a', page: '#1c1b22',
        shading: { model: 'solid', ambient: 0.1 },
        levels: { liquid: 24, wax: 96 }, // smooth 3D shading needs finer steps
        liquid: [[0, '#0a0820'], [0.7, '#120a2c'], [1, '#221046']],
        wax: [[0, '#0e0626'], [0.3, '#34146a'], [0.6, '#7a2494'], [0.82, '#c23a7c'], [0.92, '#e05a5a'], [1, '#ffa07a']],
        seed: 5,
        motion: { parcels: 7, big: [28, 40], small: [16, 21], bigShare: 0.7, surge: 0.75, tail: 1.15, pinch: 0.6, sway: 1.3 },
      },
      {
        id: 'ember',
        name: 'E. Ember',
        blurb: "A's blobs on B's indigo background, kept fully readable. Light text caps how bright the wax may get, so the lit undersides are deep red-orange rather than A's glowing orange.",
        mode: 'dark',
        text: '#f7ecf3', accent: '#ff8f5a', popup: '#15103a', page: '#1c1b22',
        liquid: [[0, '#0a0820'], [0.55, '#190d38'], [1, '#42144e']],
        wax: [[0, '#5a0e0c'], [0.4, '#b01d11'], [0.75, '#e23a14'], [1, '#ff7a22']],
        seed: 11,
        motion: { parcels: 11, big: [22, 32], small: [12, 17], bigShare: 0.6, surge: 0.8, tail: 1, pinch: 0.5 },
      },
      {
        id: 'ember-bright',
        name: 'F. Ember, brighter',
        blurb: "The same, with A's wax colours closer to full strength. The trade: where a tab label crosses the hottest wax, text contrast drops to 3:1 (the others hold 4.5:1).",
        mode: 'dark',
        maxLuminance: 0.245, minContrast: 3,
        text: '#f7ecf3', accent: '#ff8f5a', popup: '#15103a', page: '#1c1b22',
        liquid: [[0, '#0a0820'], [0.55, '#190d38'], [1, '#42144e']],
        wax: [[0, '#d42714'], [0.45, '#ec4018'], [0.8, '#fb6a1c'], [1, '#ff9a36']],
        seed: 11,
        motion: { parcels: 11, big: [22, 32], small: [12, 17], bigShare: 0.6, surge: 0.8, tail: 1, pinch: 0.5 },
      },
      {
        id: 'classic',
        name: 'A. Classic',
        blurb: 'The 1970s original: red wax in amber liquid. Dark text, so the colours can be vivid. Medium blobs that stretch and pinch.',
        mode: 'light',
        text: '#1f0d08', accent: '#b3200f', popup: '#fff3d6', page: '#fbfbfe',
        liquid: [[0, '#f7b81e'], [0.6, '#f6aa1c'], [1, '#f2901f']],
        wax: [[0, '#d42714'], [0.45, '#ec4018'], [0.8, '#fb6a1c'], [1, '#ff9a36']],
        seed: 11,
        motion: { parcels: 11, big: [22, 32], small: [12, 17], bigShare: 0.6, surge: 0.8, tail: 1, pinch: 0.5 },
      },
      {
        id: 'midnight',
        name: 'B. Midnight',
        blurb: 'Dark theme: violet-to-ember wax in indigo. Light text caps the brightness, so it glows rather than shines. Few, large, slow masses.',
        mode: 'dark',
        text: '#f7ecf3', accent: '#ff8f5a', popup: '#15103a', page: '#1c1b22',
        liquid: [[0, '#0a0820'], [0.55, '#190d38'], [1, '#371660']],
        wax: [[0, '#45187a'], [0.4, '#8c2a9c'], [0.75, '#d44a66'], [1, '#f58a2c']],
        seed: 5,
        motion: { parcels: 7, big: [28, 40], small: [16, 21], bigShare: 0.7, surge: 0.75, tail: 1.15, pinch: 0.6, sway: 1.3 },
      },
      {
        id: 'lagoon',
        name: 'C. Lagoon',
        blurb: 'Dark theme: sea-green wax in deep teal. Many small droplets that keep splitting and rejoining.',
        mode: 'dark',
        text: '#eafaf6', accent: '#5fe0b0', popup: '#062430', page: '#1c1b22',
        liquid: [[0, '#03101c'], [0.6, '#072838'], [1, '#0c4656']],
        wax: [[0, '#0a5266'], [0.45, '#118a86'], [0.8, '#3cc48a'], [1, '#b6f07a']],
        seed: 23,
        motion: { parcels: 18, big: [14, 20], small: [8, 12], bigShare: 0.4, surge: 0.85, tail: 1.1, pinch: 0.85 },
      },
      {
        id: 'sorbet',
        name: 'D. Sorbet',
        blurb: 'Light theme: violet wax in pink. Dark text. Tall, strongly stretched blobs with long tails.',
        mode: 'light',
        text: '#1d0f2e', accent: '#6a2bd6', popup: '#ffe9f4', page: '#fbfbfe',
        liquid: [[0, '#f8bcdc'], [0.6, '#f4a8d3'], [1, '#ec8fca']],
        wax: [[0, '#7a3ee0'], [0.5, '#9a4ef0'], [0.85, '#c45ef2'], [1, '#f484dc']],
        seed: 31,
        motion: { parcels: 9, big: [20, 28], small: [12, 16], bigShare: 0.65, surge: 0.9, tail: 1.5, pinch: 0.4, sinkShare: 0.2 },
      },
    ],
  };
});
