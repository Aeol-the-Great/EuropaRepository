const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- GAME CONFIG & LEVELS ---
const LEVELS = [
    { name: "ICE VALLEYS", width: 2, fuel: 100, outposts: 1, color: "#888" },
    { name: "CRACKED CRUST", width: 3, fuel: 80, outposts: 2, color: "#777" },
    { name: "CHAOS REGION", width: 4, fuel: 60, outposts: 3, color: "#666" }
];

let currentLevelIdx = 0;
const FUEL_DRIP_BASE = 0.22; // 1.5x increase compared to original 0.15

// --- PHYSICS ---
const GRAVITY = 0.04;
const THRUST = 0.12;
const ROT_SPEED = 0.05;
const SAFE_SPEED = 1.3;

// --- STATE ---
let ship = { x: 200, y: 100, vx: 1.5, vy: 0, angle: 0, fuel: 100, width: 40, height: 50, alive: true, landed: false };
const keys = {};
let cameraX = 0;
let terrain = [];
let outposts = [];
let worldWidth = 0;
let landingPadStart, landingPadEnd;

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

function initLevel() {
    const level = LEVELS[currentLevelIdx];
    worldWidth = canvas.width * level.width;
    ship = { x: 200, y: 100, vx: 1.5, vy: 0, angle: 0, fuel: level.fuel, width: 40, height: 50, alive: true, landed: false };
    terrain = [];
    outposts = [];
    cameraX = 0;

    // Generate Filled Grey Terrain
    const segments = 60 * level.width;
    const segmentWidth = worldWidth / segments;
    landingPadStart = segments - 10;
    landingPadEnd = segments - 2;

    let h = canvas.height * 0.8;
    for (let i = 0; i <= segments; i++) {
        if (i < landingPadStart || i > landingPadEnd) {
            h += (Math.random() - 0.5) * 100;
            h = Math.max(canvas.height * 0.4, Math.min(canvas.height - 20, h));
        }
        terrain.push({ x: i * segmentWidth, y: h });

        // Outposts (Refueling Checkpoints)
        if (i > 15 && i < landingPadStart - 20 && Math.random() < (0.05)) {
            if (outposts.length < level.outposts) {
                outposts.push({ x: i * segmentWidth, y: h, name: "REFUEL STATION", used: false });
            }
        }
    }

    // Safety check for pad
    for (let i = landingPadStart; i <= landingPadEnd; i++) terrain[i].y = terrain[landingPadStart].y;
}

function drawBackground() {
    // Space & Stars
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 100; i++) {
        let x = (Math.sin(i * 123) * 1000 + 1000) % canvas.width;
        let y = (Math.cos(i * 456) * 1000 + 1000) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
    }

    // Jupiter in background
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#ffccaa";
    ctx.beginPath();
    ctx.arc(canvas.width * 0.8, 150, 80, 0, Math.PI * 2);
    ctx.fill();
    // Bands
    ctx.fillStyle = "#aa7755";
    ctx.fillRect(canvas.width * 0.8 - 80, 130, 160, 10);
    ctx.fillRect(canvas.width * 0.8 - 80, 160, 160, 15);
    ctx.restore();
}

function drawTerrain() {
    const level = LEVELS[currentLevelIdx];
    ctx.fillStyle = level.color;
    ctx.beginPath();
    ctx.moveTo(0 - cameraX, canvas.height);
    terrain.forEach(p => ctx.lineTo(p.x - cameraX, p.y));
    ctx.lineTo(worldWidth - cameraX, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Outline
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Landing Pad (Goal)
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(terrain[landingPadStart].x - cameraX, terrain[landingPadStart].y);
    ctx.lineTo(terrain[landingPadEnd].x - cameraX, terrain[landingPadEnd].y);
    ctx.stroke();

    // Outposts
    outposts.forEach(o => {
        ctx.fillStyle = o.used ? "#333" : "#444";
        ctx.fillRect(o.x - cameraX - 25, o.y - 35, 50, 35);
        ctx.fillStyle = "#fff";
        ctx.font = "10px monospace";
        ctx.fillText(o.name, o.x - cameraX - 25, o.y - 45);
        if (!o.used) {
            ctx.fillStyle = "#00ffcc";
            ctx.fillRect(o.x - cameraX - 5, o.y - 50, 10, 5); // Fuel Icon
        }
    });
}

function drawShip() {
    ctx.save();
    ctx.translate(ship.x - cameraX, ship.y);
    ctx.rotate(ship.angle);

    // Body
    ctx.fillStyle = "#ccc";
    ctx.fillRect(-15, -20, 30, 30);
    ctx.fillStyle = "#4af";
    ctx.fillRect(-8, -15, 16, 10);

    // Legs
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, 10); ctx.lineTo(-25, 25);
    ctx.moveTo(15, 10); ctx.lineTo(25, 25);
    ctx.stroke();

    if (ship.alive && !ship.landed && ship.fuel > 0 && (keys['KeyS'] || keys['Space'] || keys['ArrowDown'])) {
        ctx.fillStyle = "#ffaa00";
        ctx.beginPath();
        ctx.moveTo(-10, 10); ctx.lineTo(10, 10);
        ctx.lineTo(0, 35 + Math.random() * 10);
        ctx.fill();
    }
    ctx.restore();
}

function update() {
    if (!ship.alive || ship.landed) return;

    ship.vy += GRAVITY;

    if (ship.fuel > 0) {
        if (keys['KeyA'] || keys['ArrowLeft']) ship.angle -= ROT_SPEED;
        if (keys['KeyD'] || keys['ArrowRight']) ship.angle += ROT_SPEED;
        if (keys['KeyS'] || keys['Space'] || keys['ArrowDown']) {
            ship.vx += Math.sin(ship.angle) * THRUST;
            ship.vy -= Math.cos(ship.angle) * THRUST;
            ship.fuel -= FUEL_DRIP_BASE;
        }
    }

    ship.x += ship.vx;
    ship.y += ship.vy;
    ship.fuel = Math.max(0, ship.fuel);

    cameraX = ship.x - canvas.width / 2;
    cameraX = Math.max(0, Math.min(worldWidth - canvas.width, cameraX));

    // Refuel Checkpoints
    outposts.forEach(o => {
        if (!o.used && Math.abs(ship.x - o.x) < 30 && Math.abs(ship.y - (o.y - 15)) < 30 && ship.vy > 0) {
            ship.fuel = Math.min(100, ship.fuel + 40);
            o.used = true;
        }
    });

    checkCollision();
    updateHUD();
}

function checkCollision() {
    const segments = terrain.length - 1;
    const segmentWidth = worldWidth / segments;
    const idx = Math.floor(ship.x / segmentWidth);

    if (idx < 0 || idx >= segments) {
        ship.alive = false;
        endGame("OFF COURSE");
        return;
    }

    const groundY = terrain[idx].y;
    if (ship.y + 15 >= groundY) {
        ship.y = groundY - 15;
        if (idx >= landingPadStart && idx <= landingPadEnd) {
            if (Math.abs(ship.vy) <= SAFE_SPEED && Math.abs(ship.angle) < 0.3) {
                ship.landed = true;
                if (currentLevelIdx < LEVELS.length - 1) {
                    setTimeout(() => { currentLevelIdx++; initLevel(); }, 2000);
                    endGame("LEVEL COMPLETE - NEXT SECTOR...");
                } else {
                    endGame("MISSION SUCCESS: EUROPA CONQUERED");
                }
            } else {
                ship.alive = false; endGame("IMPACT: CRITICAL SPEED");
            }
        } else {
            ship.alive = false; endGame("IMPACT: ROUGH TERRAIN");
        }
    }
}

function updateHUD() {
    const fuelEl = document.getElementById('fuel');
    const vvelEl = document.getElementById('vvel');
    const altEl = document.getElementById('alt');

    if (fuelEl) fuelEl.innerText = Math.floor(ship.fuel) + '%';
    if (vvelEl) {
        vvelEl.innerText = Math.abs(ship.vy).toFixed(1);
        vvelEl.style.color = Math.abs(ship.vy) > SAFE_SPEED ? '#ff4444' : '#00ffcc';
    }
    if (altEl) altEl.innerText = Math.floor(canvas.height - ship.y);

    // Mission Log inject (to show level)
    let log = document.getElementById('level-info');
    if (!log) {
        log = document.createElement('div');
        log.id = 'level-info';
        log.style.color = '#4a9eff';
        log.style.marginTop = '10px';
        log.style.fontSize = '0.9rem';
        document.getElementById('ui').appendChild(log);
    }
    log.innerText = `LEVEL: ${LEVELS[currentLevelIdx].name}`;
}

function endGame(text) {
    const msg = document.getElementById('msg');
    const txt = document.getElementById('text');
    msg.style.display = 'block';
    txt.innerText = text;
    txt.style.color = ship.landed ? "#00ffcc" : "#ff4444";
}

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawTerrain();
    update();
    drawShip();
    requestAnimationFrame(loop);
}

initLevel();
loop();
