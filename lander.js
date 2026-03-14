const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- MISSION CONFIG ---
const LEVELS = [
    { name: "ICE VALLEYS", width: 1.5, fuel: 100, color: "#888" },
    { name: "CRACKED CRUST", width: 2, fuel: 50, color: "#777" },
    { name: "CHAOS REGION", width: 3, fuel: 40, color: "#666" }
];

const FUEL_DRIP_BASE = 0.22;
const GRAVITY = 0.04;
const THRUST = 0.12;
const ROT_SPEED = 0.05;
const SAFE_SPEED = 1.3;

// --- STATE ---
let ship = { x: 200, y: 100, vx: 1.5, vy: 0, angle: 0, fuel: 100, width: 40, height: 50, alive: true, landed: false };
let currentLevelIdx = 0;
let terrain = [];
let outposts = [];
let worldWidth = 0;
let cameraX = 0;
let backBarrierX = 0; // Moves forward to block previous levels
let padStart, padEnd;
let transitioning = false;

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

function generateTerrain(startIdx, segmentsCount, levelWidth, color) {
    const segmentWidth = (canvas.width * levelWidth) / segmentsCount;
    let startX = startIdx === 0 ? 0 : terrain[terrain.length - 1].x;
    let startH = startIdx === 0 ? canvas.height * 0.8 : terrain[terrain.length - 1].y;

    // Transition Zone (flat pad at the start of new section)
    if (startIdx > 0) {
        for (let i = 0; i < 10; i++) {
            terrain.push({ x: startX + i * segmentWidth, y: startH });
        }
        startX += 10 * segmentWidth;
    }

    // New Terrain
    const newSegments = segmentsCount - (startIdx > 0 ? 10 : 0);
    const localPadStart = newSegments - 10;
    const localPadEnd = newSegments - 2;

    for (let i = 0; i <= newSegments; i++) {
        if (i < localPadStart || i > localPadEnd) {
            startH += (Math.random() - 0.5) * 100;
            startH = Math.max(canvas.height * 0.4, Math.min(canvas.height - 20, startH));
        }
        terrain.push({ x: startX + i * segmentWidth, y: startH });

        // Potential Refuel Station
        if (i > 5 && i < localPadStart - 10 && Math.random() < 0.04) {
            outposts.push({ x: startX + i * segmentWidth, y: startH, name: "REFUEL", used: false });
        }
    }

    // Global Pad limits for checking current goal
    padStart = terrain.length - (newSegments - localPadStart) - 1;
    padEnd = terrain.length - 1;
}

function initLevel(seamless = false) {
    const level = LEVELS[currentLevelIdx];
    if (!seamless) {
        terrain = [];
        outposts = [];
        generateTerrain(0, 60 * level.width, level.width, level.color);
        worldWidth = terrain[terrain.length - 1].x;
    } else {
        transitioning = true;
        const oldWorldWidth = worldWidth;
        generateTerrain(terrain.length, 60 * level.width, level.width, level.color);
        worldWidth = terrain[terrain.length - 1].x;
        backBarrierX = oldWorldWidth - 50; // Block off the previous pad area
        ship.landed = false;
        ship.fuel = 100; // Refill to true 100%
        transitioning = false;
    }
}

function drawBackground() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#fff";
    for (let i = 0; i < 50; i++) {
        let x = (Math.sin(i * 123) * 1000 + 1000) % canvas.width;
        let y = (Math.cos(i * 456) * 1000 + 1000) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
    }

    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#ffccaa";
    ctx.beginPath(); ctx.arc(canvas.width * 0.8, 150, 80, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function drawWorld() {
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.moveTo(0 - cameraX, canvas.height);
    terrain.forEach((p, i) => {
        if (p.x >= cameraX - 200 && p.x <= cameraX + canvas.width + 200) {
            ctx.lineTo(p.x - cameraX, p.y);
        }
    });
    ctx.lineTo(worldWidth - cameraX, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Outline & Pad
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pad Background Station
    let pxStart = terrain[padStart].x - cameraX;
    let pyStart = terrain[padStart].y;
    let pWidth = terrain[padEnd].x - terrain[padStart].x;
    
    ctx.fillStyle = "#222";
    ctx.fillRect(pxStart + pWidth * 0.2, pyStart - 60, pWidth * 0.6, 60);
    
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pxStart + pWidth * 0.3, pyStart - 60); ctx.lineTo(pxStart + pWidth * 0.3, pyStart - 90);
    ctx.moveTo(pxStart + pWidth * 0.7, pyStart - 60); ctx.lineTo(pxStart + pWidth * 0.7, pyStart - 80);
    ctx.stroke();
    if (Date.now() % 1000 < 500) {
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(pxStart + pWidth * 0.3 - 2, pyStart - 92, 4, 4);
        ctx.fillRect(pxStart + pWidth * 0.7 - 2, pyStart - 82, 4, 4);
    }

    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(pxStart, pyStart, pWidth, canvas.height - pyStart);

    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pxStart, pyStart);
    ctx.lineTo(pxStart + pWidth, pyStart);
    ctx.stroke();

    // Outposts
    outposts.forEach(o => {
        if (o.x > cameraX - 100 && o.x < cameraX + canvas.width + 100) {
            ctx.fillStyle = o.used ? "#333" : "#444";
            ctx.fillRect(o.x - cameraX - 15, o.y - 20, 30, 20);
            if (!o.used) {
                ctx.fillStyle = "#00ffcc";
                ctx.fillRect(o.x - cameraX - 3, o.y - 25, 6, 2);
            }
        }
    });

    // Border cutoff handled by camera clamp
}

function drawShip() {
    ctx.save();
    ctx.translate(ship.x - cameraX, ship.y);
    ctx.rotate(ship.angle);
    ctx.fillStyle = "#ccc";
    ctx.fillRect(-15, -20, 30, 30);
    ctx.fillStyle = "#4af";
    ctx.fillRect(-8, -15, 16, 10);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-15, 10); ctx.lineTo(-25, 25); ctx.moveTo(15, 10); ctx.lineTo(25, 25); ctx.stroke();
    if (ship.alive && !ship.landed && ship.fuel > 0 && (keys['KeyS'] || keys['Space'])) {
        ctx.fillStyle = "#ffaa00";
        ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(10, 10); ctx.lineTo(0, 30); ctx.fill();
    }
    ctx.restore();
}

function update() {
    if (!ship.alive || (ship.landed && currentLevelIdx === LEVELS.length - 1)) return;

    if (!ship.landed) {
        ship.vy += GRAVITY;
        if (ship.fuel > 0) {
            if (keys['KeyA']) ship.angle -= ROT_SPEED;
            if (keys['KeyD']) ship.angle += ROT_SPEED;
            if (keys['KeyS'] || keys['Space']) {
                ship.vx += Math.sin(ship.angle) * THRUST;
                ship.vy -= Math.cos(ship.angle) * THRUST;
                ship.fuel -= FUEL_DRIP_BASE;
            }
        }
        ship.x += ship.vx;
        ship.y += ship.vy;
        ship.fuel = Math.max(0, ship.fuel);
    } else {
        // Wilderness Takeoff
        if (ship.fuel > 0 && (keys['KeyS'] || keys['Space'])) {
            ship.landed = false;
            ship.y -= 2; // Bump off surface
            ship.vy = -0.5;
        }
    }

    // Barrier Collision
    if (ship.x < backBarrierX + 20) {
        ship.x = backBarrierX + 20;
        ship.vx = Math.abs(ship.vx) * 0.5;
    }

    cameraX = ship.x - canvas.width / 2;
    cameraX = Math.max(backBarrierX, Math.min(worldWidth - canvas.width, cameraX));

    outposts.forEach(o => {
        if (!o.used && Math.abs(ship.x - o.x) < 30 && Math.abs(ship.y - (o.y - 15)) < 30) {
            ship.fuel = Math.min(100, ship.fuel + 50);
            o.used = true;
        }
    });

    checkCollision();
    updateHUD();
}

function checkCollision() {
    if (ship.landed) return;

    // Find segment
    const seg = terrain.find((p, i) => i < terrain.length - 1 && ship.x >= p.x && ship.x <= terrain[i + 1].x);
    if (!seg) {
        if (ship.x > worldWidth) ship.alive = false;
        return;
    }

    if (ship.y + 15 >= seg.y) {
        ship.y = seg.y - 15;
        const segIdx = terrain.indexOf(seg);

        // Universal Safe Landing Check
        if (Math.abs(ship.vy) <= SAFE_SPEED && Math.abs(ship.angle) < 0.3) {
            ship.landed = true;
            ship.vx = 0;
            ship.vy = 0;

            // Check if we landed on the official progression pad
            if (segIdx >= padStart && segIdx <= padEnd) {
                if (currentLevelIdx < LEVELS.length - 1) {
                    currentLevelIdx++;
                    initLevel(true); // Instant seamless transition
                } else {
                    endGame("MISSION SUCCESS: EUROPA CONQUERED");
                    setTimeout(() => window.location.href = "cave.html", 3000);
                }
            }
            // If safely landed elsewhere, they can just take off again (landed state handles this)
        } else {
            ship.alive = false;
            endGame(Math.abs(ship.vy) > SAFE_SPEED ? "CRITICAL IMPACT" : "ROUGH IMPACT");
        }
    }
}

// --- REFINED HUD & RETRY LOGIC ---
function updateHUD() {
    const fuelEl = document.getElementById('fuel');
    const vvelEl = document.getElementById('vvel');
    const altEl = document.getElementById('alt');
    if (fuelEl) fuelEl.innerText = Math.floor(ship.fuel) + '%';
    if (vvelEl) {
        vvelEl.innerText = Math.abs(ship.vy).toFixed(1);
        vvelEl.style.color = Math.abs(ship.vy) > SAFE_SPEED ? '#ff4444' : '#00ffcc';
    }
    if (altEl) altEl.innerText = Math.max(0, Math.floor(canvas.height - ship.y));
}

function endGame(text) {
    const msg = document.getElementById('msg');
    const txt = document.getElementById('text');
    msg.style.display = 'block';
    txt.innerText = text;
    txt.style.color = ship.landed ? "#00ffcc" : "#ff4444";

    // Set up RETRY ZONE button
    const retryBtn = document.querySelector('.btn[onclick="location.reload()"]');
    if (retryBtn) {
        retryBtn.innerText = "RETRY ZONE";
        retryBtn.removeAttribute('onclick');
        retryBtn.onclick = () => {
            msg.style.display = 'none';
            resetToLevelStart();
        };
    }
}

function resetToLevelStart() {
    ship.alive = true;
    ship.landed = false;
    ship.fuel = LEVELS[currentLevelIdx].fuel;
    ship.angle = 0;
    ship.vx = 1.5;
    ship.vy = 0;
    ship.y = 100;

    // Find the x position of the start of the current level
    // Each level has 60 segments.
    let segmentIndex = 0;
    for (let i = 0; i < currentLevelIdx; i++) {
        segmentIndex += 60 * LEVELS[i].width;
    }
    ship.x = terrain[segmentIndex].x + 200;
    cameraX = ship.x - canvas.width / 2;
}

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawWorld();
    update();
    drawShip();
    requestAnimationFrame(loop);
}

initLevel();
loop();
