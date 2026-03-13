const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- PHYSICS CONSTANTS ---
const GRAVITY = 0.03;
const THRUST = 0.12;
const ROT_SPEED = 0.06;
const DAMPING = 0.98;
const HULL_DAMAGE_SPEED = 1.5;

// --- GAME STATE ---
let ship = {
    x: 0, y: 0,
    vx: 1.5, vy: 0,
    angle: 0,
    fuel: 100,
    hull: 100,
    alive: true,
    landed: false,
    depth: 0,
    goal: 750
};

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// --- CAVE & LANDING PADS ---
let cavePoints = [];
let outposts = [];
const segmentWidth = 100;
let lastX = 0;

function initCave() {
    let curY = canvas.height / 2;
    let curGap = 400;
    ship.y = curY;

    for (let i = 0; i < 20; i++) {
        cavePoints.push({ x: i * segmentWidth, top: curY - curGap / 2, bottom: curY + curGap / 2 });
        lastX = i * segmentWidth;
    }
}

function updateCave() {
    // Generate cave ahead of ship
    if (lastX < ship.x + canvas.width + 200) {
        const last = cavePoints[cavePoints.length - 1];
        lastX += segmentWidth;

        // Random twists and turns
        let targetY = last.top + (last.bottom - last.top) / 2 + (Math.random() - 0.5) * 200;
        targetY = Math.max(200, Math.min(canvas.height - 200, targetY));

        let gap = 350 - (ship.depth / 3); // Gets tighter as you go
        gap = Math.max(200, gap);

        // Occasional Landing Zone
        const isLandingZone = Math.random() < 0.08 && cavePoints.length > 10;
        if (isLandingZone) {
            // Flatten the next 2 segments
            const flatY = targetY;
            cavePoints.push({ x: lastX, top: flatY - gap / 2, bottom: flatY + gap / 2, isPad: true });
            outposts.push({ x: lastX, y: flatY + gap / 2, used: false });
            lastX += segmentWidth;
            cavePoints.push({ x: lastX, top: flatY - gap / 2, bottom: flatY + gap / 2, isPad: true });
        } else {
            cavePoints.push({ x: lastX, top: targetY - gap / 2, bottom: targetY + gap / 2 });
        }

        if (cavePoints.length > 50) cavePoints.shift();
    }
}

function drawBackground() {
    ctx.fillStyle = "#000510";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Depth indicator background line
    ctx.strokeStyle = "rgba(74, 158, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
}

function drawCave() {
    const camX = ship.x - 150;

    // Walls
    ctx.fillStyle = "#1a1c2c";
    ctx.strokeStyle = "#4a9eff";
    ctx.lineWidth = 3;

    // Top Wall
    ctx.beginPath();
    ctx.moveTo(cavePoints[0].x - camX, 0);
    cavePoints.forEach(p => ctx.lineTo(p.x - camX, p.top));
    ctx.lineTo(cavePoints[cavePoints.length - 1].x - camX, 0);
    ctx.fill();
    ctx.stroke();

    // Bottom Wall
    ctx.beginPath();
    ctx.moveTo(cavePoints[0].x - camX, canvas.height);
    cavePoints.forEach(p => ctx.lineTo(p.x - camX, p.bottom));
    ctx.lineTo(cavePoints[cavePoints.length - 1].x - camX, canvas.height);
    ctx.fill();
    ctx.stroke();

    // Landing Pads
    ctx.strokeStyle = "#00ffcc";
    ctx.lineWidth = 5;
    cavePoints.forEach(p => {
        if (p.isPad) {
            ctx.beginPath();
            ctx.moveTo(p.x - camX, p.bottom - 2);
            ctx.lineTo(p.x + segmentWidth - camX, p.bottom - 2);
            ctx.stroke();
        }
    });

    // Outposts
    outposts.forEach(o => {
        if (o.x > camX - 100 && o.x < camX + canvas.width + 100) {
            ctx.fillStyle = o.used ? "#115544" : "#00ffcc";
            ctx.fillRect(o.x - camX, o.y - 25, 30, 20);
            ctx.fillStyle = "#fff"; ctx.font = "10px monospace";
            ctx.fillText("REFUEL", o.x - camX, o.y - 30);
        }
    });
}

function drawShip() {
    const camX = ship.x - 150;
    ctx.save();
    ctx.translate(ship.x - camX, ship.y);
    ctx.rotate(ship.angle);

    // Body
    ctx.fillStyle = "#ccc";
    ctx.fillRect(-15, -10, 30, 20);
    ctx.fillStyle = "#4af";
    ctx.fillRect(5, -5, 10, 10);

    // Thrusters
    if (ship.alive && !ship.landed && ship.fuel > 0 && (keys['Space'] || keys['KeyW'])) {
        ctx.fillStyle = "#ffaa00";
        ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-30, -8); ctx.lineTo(-30, 8); ctx.fill();
    }
    ctx.restore();
}

function update() {
    if (!ship.alive) return;

    if (ship.landed) {
        // Just sitting on a pad
        if (keys['Space'] || keys['KeyW']) ship.landed = false;
        return;
    }

    // Physics
    ship.vy += GRAVITY;
    if (ship.fuel > 0) {
        if (keys['KeyA']) ship.angle -= ROT_SPEED;
        if (keys['KeyD']) ship.angle += ROT_SPEED;
        if (keys['Space'] || keys['KeyW']) {
            ship.vx += Math.cos(ship.angle) * THRUST;
            ship.vy += Math.sin(ship.angle) * THRUST;
            ship.fuel -= 0.15;
        }
    }

    ship.vx *= DAMPING;
    ship.vy *= DAMPING;
    ship.x += ship.vx;
    ship.y += ship.vy;

    ship.depth = Math.floor(ship.x / 50);

    // Goal Check
    if (ship.depth >= ship.goal) {
        ship.alive = false;
        sploosh();
    }

    checkCollision();
    updateHUD();
}

function checkCollision() {
    const p1 = cavePoints.find((p, i) => i < cavePoints.length - 1 && ship.x >= p.x && ship.x <= cavePoints[i + 1].x);
    if (!p1) return;

    if (ship.y - 8 < p1.top || ship.y + 8 > p1.bottom) {
        const impact = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);

        // Land on pad?
        if (p1.isPad && ship.y + 8 >= p1.bottom && impact < HULL_DAMAGE_SPEED && Math.abs(ship.angle) < 0.4) {
            ship.y = p1.bottom - 8;
            ship.vx = 0; ship.vy = 0;
            ship.landed = true;
            // Refuel
            const outpost = outposts.find(o => Math.abs(o.x - p1.x) < 50);
            if (outpost && !outpost.used) {
                ship.fuel = Math.min(100, ship.fuel + 50);
                outpost.used = true;
            }
        } else {
            // Crash/Damage
            ship.hull -= impact * 2;
            ship.vx *= -0.4; ship.vy *= -0.4;
            if (ship.hull <= 0) {
                ship.alive = false;
                endGame("HULL BREACH: SIGNAL LOST");
            }
        }
    }
}

function sploosh() {
    // Create a blue curtain or flash
    ctx.fillStyle = "rgba(0, 100, 255, 0.8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    endGame("SUCCESS! REACHED THE INNER SEA.");
    setTimeout(() => window.location.href = "sea.html", 2500);
}

function updateHUD() {
    document.getElementById('depth').innerText = ship.depth + "m";
    document.getElementById('hull').innerText = Math.floor(ship.hull) + "%";
    // Also update fuel if element exists (might need to add to HTML)
    const fuelContainer = document.getElementById('fuel-container');
    if (!fuelContainer) {
        const ui = document.getElementById('ui');
        const f = document.createElement('div');
        f.id = 'fuel-container';
        f.innerHTML = '<div style="margin-top:10px; font-size:0.8rem; color:#ffaa00;">REACTION MASS</div><div style="font-size:1.2rem;" id="fuel">100%</div>';
        ui.appendChild(f);
    }
    document.getElementById('fuel').innerText = Math.floor(ship.fuel) + "%";
}

function endGame(text) {
    const msg = document.getElementById('msg');
    const txt = document.getElementById('text');
    msg.style.display = 'block';
    txt.innerText = text;
    txt.style.color = ship.hull > 0 ? "#00ffcc" : "#ff4444";
}

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    updateCave();
    drawCave();
    update();
    drawShip();
    requestAnimationFrame(loop);
}

initCave();
loop();
