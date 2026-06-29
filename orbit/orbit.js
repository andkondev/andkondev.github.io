(function () {
    "use strict";

    const W = 590;
    const H = 383;
    const ASSET_VERSION = "20260629-original-assets";
    const TICK_MS = 50;
    const GRAVITY = 12000;
    const COLLISION_DISTANCE = 36;
    const MIN_DRAG_DISTANCE = 39;
    const BODY_HIT_DISTANCE = 15;
    const EXPLOSION_FRAMES = 6;
    const EXPLOSION_FRAME_MS = 100;

    const canvas = document.getElementById("orbit-canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;
    const runToggle = document.getElementById("run-toggle");
    const resetButton = document.getElementById("reset-button");
    const trailToggle = document.getElementById("trail-toggle");
    const typeToggle = document.getElementById("type-toggle");
    const help = document.getElementById("orbit-help");
    const status = document.getElementById("orbit-status");

    function versioned(src) {
        return src + (src.indexOf("?") === -1 ? "?" : "&") + "v=" + ASSET_VERSION;
    }

    function loadImage(src) {
        const image = new Image();
        image.addEventListener("load", function () {
            dirty = true;
        });
        image.src = versioned(src);
        return image;
    }

    const images = {
        background: loadImage("assets/explore-background.png"),
        instructions: loadImage("assets/create-orbit-instructions.png"),
        moon: loadImage("assets/moon-small.png"),
        explosion: loadImage("assets/explosion-strip-clean.png")
    };

    const collisionSound = new Audio(versioned("assets/t026542a-pcm.wav"));
    collisionSound.preload = "auto";

    const planet = { x: 294, y: 207, r: 29 };
    const defaultBody = { x: 450, y: 207, vx: 0, vy: -6.8, r: 7 };
    const body = { x: defaultBody.x, y: defaultBody.y, vx: defaultBody.vx, vy: defaultBody.vy, r: defaultBody.r };

    let running = false;
    let collision = false;
    let collisionStartedAt = 0;
    let collisionPoint = { x: 0, y: 0 };
    let showInstructions = true;
    let dragMode = null;
    let trail = [];
    let lastFrame = performance.now();
    let tickAccumulator = 0;
    let dirty = true;

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function distance(ax, ay, bx, by) {
        return Math.hypot(ax - bx, ay - by);
    }

    function resetOrbit() {
        body.x = defaultBody.x;
        body.y = defaultBody.y;
        body.vx = defaultBody.vx;
        body.vy = defaultBody.vy;
        running = false;
        collision = false;
        showInstructions = true;
        dragMode = null;
        trail = [];
        tickAccumulator = 0;
        runToggle.textContent = "Start";
        dirty = true;
        syncUi();
    }

    function startOrbit() {
        if (collision) {
            return;
        }

        running = true;
        showInstructions = false;
        dragMode = null;
        tickAccumulator = 0;
        runToggle.textContent = "Stop";
        dirty = true;
        syncUi();
    }

    function stopOrbit() {
        if (collision) {
            return;
        }

        running = false;
        tickAccumulator = 0;
        runToggle.textContent = "Start";
        dirty = true;
        syncUi();
    }

    function syncUi() {
        help.classList.toggle("is-hidden", !showInstructions || running || collision);
        status.classList.toggle("is-hidden", !typeToggle.checked);
    }

    function eventPoint(event) {
        const rect = canvas.getBoundingClientRect();

        return {
            x: clamp(((event.clientX - rect.left) / rect.width) * W, 0, W),
            y: clamp(((event.clientY - rect.top) / rect.height) * H, 0, H)
        };
    }

    function clampBody(x, y) {
        let nextX = clamp(x, 15, W - 15);
        let nextY = clamp(y, 15, H - 15);
        const dx = nextX - planet.x;
        const dy = nextY - planet.y;
        const d = Math.hypot(dx, dy) || 1;

        if (d < MIN_DRAG_DISTANCE) {
            nextX = planet.x + (dx / d) * MIN_DRAG_DISTANCE;
            nextY = planet.y + (dy / d) * MIN_DRAG_DISTANCE;
        }

        return { x: nextX, y: nextY };
    }

    function classifyOrbit() {
        if (collision) {
            return "COLLISION!!!";
        }

        const dx = body.x - planet.x;
        const dy = body.y - planet.y;
        const d = Math.hypot(dx, dy) || 1;
        const speed = Math.hypot(body.vx, body.vy);
        const escape = Math.sqrt((2 * GRAVITY) / d);

        if (speed > escape) {
            return "OPEN ORBIT";
        }

        const radialSpeed = Math.abs((body.vx * dx + body.vy * dy) / d);
        const tangentialSq = speed * speed - radialSpeed * radialSpeed;
        const circularSq = GRAVITY / d;
        const mismatch = Math.abs(tangentialSq - circularSq);

        if (radialSpeed < 0.65 && mismatch < 5.2) {
            return d < 150 ? "SMALL CIRCULAR ORBIT" : "LARGE CIRCULAR ORBIT";
        }

        if (radialSpeed < 2.1 && mismatch < 24) {
            return "SLIGHTLY ELLIPTICAL ORBIT";
        }

        return "HIGHLY ELLIPTICAL ORBIT";
    }

    function addTrailDot() {
        if (!trailToggle.checked || body.x < 0 || body.x >= W || body.y < 0 || body.y >= H) {
            return;
        }

        trail.push({ x: Math.round(body.x), y: Math.round(body.y) });
        if (trail.length > 3000) {
            trail.shift();
        }
    }

    function findCollisionPoint(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const fx = from.x - planet.x;
        const fy = from.y - planet.y;
        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - COLLISION_DISTANCE * COLLISION_DISTANCE;
        const disc = b * b - 4 * a * c;

        if (disc < 0 || a === 0) {
            return null;
        }

        const root = Math.sqrt(disc);
        const t1 = (-b - root) / (2 * a);
        const t2 = (-b + root) / (2 * a);
        const t = t1 >= 0 && t1 <= 1 ? t1 : t2 >= 0 && t2 <= 1 ? t2 : null;

        if (t === null) {
            return null;
        }

        return { x: from.x + dx * t, y: from.y + dy * t };
    }

    function triggerCollision(point) {
        collision = true;
        running = true;
        collisionPoint = point;
        collisionStartedAt = performance.now();
        body.x = point.x;
        body.y = point.y;
        body.vx = 0;
        body.vy = 0;
        runToggle.textContent = "Stop";
        try {
            collisionSound.currentTime = 0;
            const playResult = collisionSound.play();
            if (playResult && typeof playResult.catch === "function") {
                playResult.catch(function () {});
            }
        } catch (_) {}
        dirty = true;
        syncUi();
    }

    function stepPhysics() {
        if (!running || collision) {
            return;
        }

        const previous = { x: body.x, y: body.y };
        const dx = planet.x - body.x;
        const dy = planet.y - body.y;
        const d = Math.hypot(dx, dy) || 1;
        const gravity = GRAVITY / (d * d);

        body.vx += (dx / d) * gravity;
        body.vy += (dy / d) * gravity;
        body.x += body.vx;
        body.y += body.vy;
        addTrailDot();

        const impact = findCollisionPoint(previous, body);
        if (impact || distance(body.x, body.y, planet.x, planet.y) <= COLLISION_DISTANCE) {
            triggerCollision(impact || { x: body.x, y: body.y });
        }

        dirty = true;
    }

    function drawBackground() {
        if (images.background.complete && images.background.naturalWidth > 0) {
            ctx.drawImage(images.background, 0, 0);
            return;
        }

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, W, H);
    }

    function drawInstructions() {
        if (!showInstructions || running || collision) {
            return;
        }

        if (images.instructions.complete && images.instructions.naturalWidth > 0) {
            ctx.drawImage(images.instructions, 10, 117);
        }
    }

    function drawMoon() {
        if (collision) {
            return;
        }

        if (running && (body.x < -20 || body.x > W + 20 || body.y < -20 || body.y > H + 20)) {
            return;
        }

        if (images.moon.complete && images.moon.naturalWidth > 0) {
            ctx.drawImage(images.moon, Math.round(body.x - 7), Math.round(body.y - 7));
        }
    }

    function drawArrow() {
        if (running || collision) {
            return;
        }

        const endX = body.x + body.vx * 10;
        const endY = body.y + body.vy * 10;
        const angle = Math.atan2(endY - body.y, endX - body.x);

        ctx.strokeStyle = "#ffd653";
        ctx.fillStyle = "#ffd653";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(body.x, body.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - Math.cos(angle - 0.45) * 9, endY - Math.sin(angle - 0.45) * 9);
        ctx.lineTo(endX - Math.cos(angle + 0.45) * 9, endY - Math.sin(angle + 0.45) * 9);
        ctx.closePath();
        ctx.fill();
    }

    function drawExplosion(now) {
        if (!collision) {
            return;
        }

        let frame = Math.floor((now - collisionStartedAt) / EXPLOSION_FRAME_MS);
        if (frame >= EXPLOSION_FRAMES) {
            resetOrbit();
            return;
        }

        if (images.explosion.complete && images.explosion.naturalWidth > 0) {
            const frameWidth = 60;
            const sourceX = Math.min(frame * frameWidth, images.explosion.naturalWidth - frameWidth);
            ctx.drawImage(
                images.explosion,
                sourceX,
                0,
                frameWidth,
                61,
                Math.round(collisionPoint.x - 30),
                Math.round(collisionPoint.y - 30),
                frameWidth,
                61
            );
        }
    }

    function draw(now) {
        drawBackground();
        drawInstructions();

        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < trail.length; i += 1) {
            ctx.fillRect(trail[i].x, trail[i].y, 1, 1);
        }

        drawArrow();
        drawMoon();
        drawExplosion(now);

        status.textContent = classifyOrbit();
    }

    function frame(now) {
        const elapsed = Math.min(250, now - lastFrame);
        lastFrame = now;

        if (running && !collision) {
            tickAccumulator += elapsed;
            while (tickAccumulator >= TICK_MS) {
                tickAccumulator -= TICK_MS;
                stepPhysics();
            }
        } else if (collision) {
            dirty = true;
        }

        if (dirty || running || collision) {
            dirty = false;
            draw(now);
        }

        requestAnimationFrame(frame);
    }

    canvas.addEventListener("pointerdown", function (event) {
        if (running || collision) {
            return;
        }

        const point = eventPoint(event);
        dragMode = distance(point.x, point.y, body.x, body.y) < BODY_HIT_DISTANCE ? "body" : "vector";

        if (dragMode === "body") {
            const clamped = clampBody(point.x, point.y);
            body.x = clamped.x;
            body.y = clamped.y;
        } else {
            body.vx = (point.x - body.x) * 0.1;
            body.vy = (point.y - body.y) * 0.1;
        }

        canvas.setPointerCapture(event.pointerId);
        dirty = true;
    });

    canvas.addEventListener("pointermove", function (event) {
        if (!dragMode || running || collision) {
            return;
        }

        const point = eventPoint(event);
        if (dragMode === "body") {
            const clamped = clampBody(point.x, point.y);
            body.x = clamped.x;
            body.y = clamped.y;
        } else {
            body.vx = (point.x - body.x) * 0.1;
            body.vy = (point.y - body.y) * 0.1;
        }
        dirty = true;
    });

    function finishPointer(event) {
        if (!dragMode) {
            return;
        }

        dragMode = null;
        if (canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId);
        }
    }

    canvas.addEventListener("pointerup", finishPointer);
    canvas.addEventListener("pointercancel", finishPointer);

    runToggle.addEventListener("click", function () {
        if (running) {
            stopOrbit();
        } else {
            startOrbit();
        }
    });

    resetButton.addEventListener("click", resetOrbit);
    trailToggle.addEventListener("change", function () {
        dirty = true;
    });
    typeToggle.addEventListener("change", function () {
        syncUi();
        dirty = true;
    });

    window.__orbitToyDebug = {
        getState: function () {
            return {
                body: { x: body.x, y: body.y, vx: body.vx, vy: body.vy },
                running: running,
                collision: collision,
                trailLength: trail.length,
                status: classifyOrbit(),
                ticks: trail.length
            };
        }
    };

    resetOrbit();
    requestAnimationFrame(frame);
}());
