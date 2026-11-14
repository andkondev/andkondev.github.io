/*
 * The lava in the Lava Lamp window: the same simulation, colours and shading
 * as the Lava Lamp Firefox theme (assets/lava-core.js is that theme's own
 * simulation file, unchanged), drawn live into a canvas.
 *
 *   AndkonLavaLamp.start(canvas)
 *
 * It only draws while the canvas is actually on screen (its window open and
 * not minimised, the tab visible).
 */
(function () {
    "use strict";

    // The theme's look ("Midnight, translucent"): violet-to-ember wax in indigo.
    const LOOK = {
        mode: "dark",
        liquid: [[0, "#0a0820"], [0.6, "#150b32"], [1, "#2e1258"]],
        wax: [[0, "#1c0a40"], [0.35, "#42187c"], [0.6, "#8a2498"], [0.78, "#c8387e"], [0.9, "#ea5a52"], [1, "#ff9a4a"]]
    };
    const SHADING = { model: "wax", light: [-0.15, 0.9, 0.4] };
    const LEVELS = { liquid: 24, wax: 96 };
    // The theme's motion, with smaller blobs, more of them and less sideways
    // sway, to suit a small window.
    const MOTION = { parcels: 14, big: [22, 32], small: [12, 17], bigShare: 0.65, surge: 0.75, tail: 1.15, pinch: 0.6, sway: 0.8 };
    // Blobs travel twice the window's height per loop, so a loop twice as long
    // as the theme's 30 s gives about the theme's speed.
    const LOOP_MS = 60000;
    const FRAME_MS = 1000 / 30;
    const SEED = 5;

    function start(canvas) {
        const Lava = window.Lava;
        const context = canvas.getContext("2d");
        if (!Lava || !context) {
            return;
        }

        const width = canvas.width;
        const height = canvas.height;
        // A 'top' scene: wax passes up or down through the picture. keepLeft
        // with clearLeft keeps every blob clear of the side edges, where it
        // would otherwise wrap round to the other side.
        const scene = Lava.makeScene({
            W: width, H: height, kind: "top", periodY: height * 2,
            keepLeft: 1, clearLeft: true, seed: SEED, motion: MOTION
        });
        // The theme's top strip melts away along its lower edge; a window
        // should not, and the fade is keyed on the scene's kind.
        scene.kind = "pane";

        const palette = Lava.makePalette(LOOK);
        const colours = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            colours[i] = (255 << 24) | (palette[i * 3 + 2] << 16) | (palette[i * 3 + 1] << 8) | palette[i * 3];
        }
        const field = new Float32Array(width * height);
        const indices = new Uint8Array(width * height);
        const image = context.createImageData(width, height);
        const pixels = new Uint32Array(image.data.buffer);
        let lastDrawn = -Infinity;

        function draw(now) {
            Lava.renderField(scene, (now % LOOP_MS) / LOOP_MS, field);
            Lava.shade(scene, field, indices, LEVELS, SHADING);
            for (let i = 0; i < pixels.length; i++) {
                pixels[i] = colours[indices[i]];
            }
            context.putImageData(image, 0, 0);
            canvas.dataset.frames = String((Number(canvas.dataset.frames) || 0) + 1);
        }

        function tick(now) {
            // offsetParent is null while the window is closed or minimised.
            if (canvas.offsetParent === null || document.hidden) {
                window.setTimeout(function () {
                    window.requestAnimationFrame(tick);
                }, 400);
                return;
            }

            if (now - lastDrawn >= FRAME_MS - 1) {
                lastDrawn = now;
                draw(now);
            }
            window.requestAnimationFrame(tick);
        }

        draw(performance.now());
        window.requestAnimationFrame(tick);
    }

    window.AndkonLavaLamp = { start: start };
}());
