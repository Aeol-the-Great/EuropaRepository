const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- PHYSICS (Antimatter-Enhanced) ---
const GRAVITY = 0.04;
const THRUST = 0.14; // Slightly faster
const ROT_SPEED = 0.06;
const DAMPING = 0.992; // Reduced friction (was 0.98)
const HULL_DAMAGE_SPEED = 2.0;

// --- STATE ---
let ship = {
    x: 100, y: 100,
    vx: 2.0, vy: 0,
    angle: Math.PI / 2, // Start pointing right
    fuel: 100,
    hull: 100,
    alive: true,
    landed: false,
    depth: 0,
    goal: 350
};

let score = 0;
let targets = [];
let lasers = [];
let particles = [];
let gameStarted = false;

window.startGame = function() {
    document.getElementById('start-screen').style.display = 'none';
    gameStarted = true;
};

const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault(); // Prevent page scrolling
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

window.addEventListener('mousedown', (e) => {
    if (!gameStarted || !ship.alive || ship.landed) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const camX = ship.x - 200;
    const camY = ship.y - canvas.height / 2;
    
    const worldX = mouseX + camX;
    const worldY = mouseY + camY;
    
    // Auto-Aim: Generous click lock-on distance
    let nearest = null;
    let minDist = Infinity;

    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (t.locked) continue; // Already locked
        const dist = Math.hypot(t.x - worldX, t.y - worldY);
        if (dist < minDist && dist <= t.radius + 30) {
            minDist = dist;
            nearest = t;
        }
    }
    
    if (nearest) {
        nearest.locked = true;
        nearest.lockTime = Date.now();
    }
});

// --- CAVE SLANT CONFIG ---
const SLANT_ANGLE = 20 * (Math.PI / 180); // 20 degrees down
const segmentWidth = 120;
const SLANT_STEP = segmentWidth * Math.tan(SLANT_ANGLE); // Vertical drop per segment
let cavePoints = [];
let lastX = 0;
let lastY = canvas.height / 2;

function initCave() {
    cavePoints = [];
    lastX = 0;
    lastY = canvas.height / 2;
    ship.y = lastY;
    ship.x = 100;
    ship.vx = 2.0;
    ship.vy = 0;
    ship.angle = Math.PI / 2;
    ship.landed = false;
    
    score = 0;
    targets = [];
    lasers = [];
    particles = [];

    // Initial 20 segments
    for (let i = 0; i < 20; i++) {
        let curY = lastY + i * SLANT_STEP;
        let gap = 480;
        cavePoints.push({ x: i * segmentWidth, top: curY - gap / 2, bottom: curY + gap / 2 });
        lastX = i * segmentWidth;
    }
    lastY = cavePoints[cavePoints.length - 1].top + (cavePoints[cavePoints.length - 1].bottom - cavePoints[cavePoints.length - 1].top) / 2;
}

function updateCave() {
    if (lastX < ship.x + canvas.width + 300) {
        lastX += segmentWidth;
        lastY += SLANT_STEP; // Constant downward slant

        // Random jitter on top of the slant
        let targetY = lastY + (Math.random() - 0.5) * 100;

        let gap = 456 - (ship.depth / 2.5);
        gap = Math.max(264, gap);

        cavePoints.push({ x: lastX, top: targetY - gap / 2, bottom: targetY + gap / 2 });

        if (cavePoints.length > 80) cavePoints.shift();
    }
}

function drawBackground() {
    ctx.fillStyle = "#000510";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawCave() {
    const camX = ship.x - 200;
    const camY = ship.y - canvas.height / 2; // Follow ship vertically too

    ctx.fillStyle = "#1a1c2c";
    ctx.strokeStyle = "#4a9eff";
    ctx.lineWidth = 3;

    // Top Wall
    ctx.beginPath();
    ctx.moveTo(cavePoints[0].x - camX, -5000);
    cavePoints.forEach(p => ctx.lineTo(p.x - camX, p.top - camY));
    ctx.lineTo(cavePoints[cavePoints.length - 1].x - camX, -5000);
    ctx.fill(); ctx.stroke();

    // Bottom Wall
    ctx.beginPath();
    ctx.moveTo(cavePoints[0].x - camX, 5000);
    cavePoints.forEach(p => ctx.lineTo(p.x - camX, p.bottom - camY));
    ctx.lineTo(cavePoints[cavePoints.length - 1].x - camX, 5000);
    ctx.fill(); ctx.stroke();


}

function drawShip() {
    const camX = ship.x - 200;
    const camY = ship.y - canvas.height / 2;

    ctx.save();
    ctx.translate(ship.x - camX, ship.y - camY);
    ctx.rotate(ship.angle);

    // LANDER SPRITE (1:1 matching lander.js)
    ctx.fillStyle = "#ccc";
    ctx.fillRect(-15, -20, 30, 30);
    ctx.fillStyle = "#4af";
    ctx.fillRect(-8, -15, 16, 10);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-15, 10); ctx.lineTo(-25, 25); ctx.moveTo(15, 10); ctx.lineTo(25, 25); ctx.stroke();

    // Thrust effect
    if (ship.alive && !ship.landed && (keys['Space'] || keys['KeyW'])) {
        ctx.fillStyle = "#ffaa00";
        ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(10, 10); ctx.lineTo(0, 30); ctx.fill();
    }
    ctx.restore();
}

function drawEntities() {
    const camX = ship.x - 200;
    const camY = ship.y - canvas.height / 2;
    const now = Date.now();

    ctx.save();
    // Targets
    targets.forEach(t => {
        const screenX = t.x - camX;
        const screenY = t.y - camY;
        const ratio = (now - t.spawnTime) / 3000;
        
        // Danger circle
        ctx.fillStyle = t.locked ? `rgba(0, 255, 204, 0.4)` : `rgba(255, 0, 0, ${0.2 + ratio * 0.5})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, t.locked ? t.radius : t.radius * ratio, 0, Math.PI * 2);
        ctx.fill();
        
        // Triangle Lock-on Reticle
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(now * (t.locked ? 0.01 : 0.002)); // Spin faster when locked
        ctx.strokeStyle = t.locked ? `#00ffcc` : `rgb(255, ${255 * (1 - ratio)}, ${255 * (1 - ratio)})`;
        ctx.lineWidth = 3;
        
        const r = t.radius + 5;
        ctx.beginPath();
        // Equilateral triangle
        for(let i=0; i<3; i++) {
            const angle = (i * 2 * Math.PI / 3);
            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Inner inverted triangle
        ctx.rotate(Math.PI);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=0; i<3; i++) {
            const angle = (i * 2 * Math.PI / 3);
            const px = Math.cos(angle) * (r * 0.6);
            const py = Math.sin(angle) * (r * 0.6);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        
        ctx.restore();
        
        // Shrinking Lock Timer Ring
        if (t.locked) {
            const lockRatio = 1 - ((now - t.lockTime) / 500);
            if (lockRatio > 0) {
                ctx.strokeStyle = '#00ffcc';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(screenX, screenY, Math.max(0, t.radius * lockRatio), 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    });

    // Particles (Blast Waves)
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= 0.05;
        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }
        
        const screenX = p.x - camX;
        const screenY = p.y - camY;
        const currentRad = p.maxRad * (1 - p.life);
        
        ctx.fillStyle = `rgba(${p.color}, ${p.life * 0.4})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, currentRad, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = `rgba(${p.color}, ${p.life})`;
        ctx.lineWidth = 6 * p.life;
        ctx.beginPath();
        ctx.arc(screenX, screenY, currentRad, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        l.life -= 0.05;
        if (l.life <= 0) {
            lasers.splice(i, 1);
            continue;
        }
        
        ctx.strokeStyle = `rgba(0, 255, 204, ${l.life})`;
        ctx.lineWidth = 5 * l.life;
        ctx.beginPath();
        
        // Ship nose calculation based on rotation
        const noseDist = 25;
        const shipScreenX = (ship.x - camX) + Math.cos(ship.angle - Math.PI/2) * noseDist;
        const shipScreenY = (ship.y - camY) + Math.sin(ship.angle - Math.PI/2) * noseDist;
        
        ctx.moveTo(shipScreenX, shipScreenY);
        ctx.lineTo(l.destX - camX, l.destY - camY);
        ctx.stroke();
    }
    ctx.restore();
}

function update() {
    if (!gameStarted || !ship.alive) return;

    // Target Spawning
    if (Math.random() < 0.015 && targets.length < 5) {
        const spawnX = ship.x + canvas.width * 0.8;
        const seg = cavePoints.find((p, i) => i < cavePoints.length - 1 && spawnX >= p.x && spawnX <= cavePoints[i + 1].x);
        if (seg) {
            const gap = seg.bottom - seg.top;
            const spawnY = seg.top + gap * 0.2 + Math.random() * gap * 0.6;
            targets.push({ x: spawnX, y: spawnY, spawnTime: Date.now(), radius: 35 });
        }
    }

    // Target Lifecycle & Blast Waves
    const now = Date.now();
    for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        if (t.locked) {
            if (now - t.lockTime > 500) {
                // Fire Laser!
                score += 100;
                lasers.push({ life: 1.0, destX: t.x, destY: t.y });
                particles.push({ x: t.x, y: t.y, color: '0, 255, 204', life: 1.0, maxRad: 100 });
                targets.splice(i, 1);
            }
        } else if (now - t.spawnTime > 3000) {
            // Kaboom!
            ship.hull -= 20;
            particles.push({ x: t.x, y: t.y, color: '255, 0, 0', life: 1.0, maxRad: 250 });
            targets.splice(i, 1);
            if (ship.hull <= 0) {
                ship.alive = false;
                endGame("HULL BREACH: STALACTITE IMPACT");
            }
        }
    }

    // Physics (Matching Lander.js Key Logic)
    ship.vy += GRAVITY;
    if (keys['KeyA']) ship.angle -= ROT_SPEED;
    if (keys['KeyD']) ship.angle += ROT_SPEED;
    if (keys['Space'] || keys['KeyW']) {
        ship.vx += Math.sin(ship.angle) * THRUST;
        ship.vy -= Math.cos(ship.angle) * THRUST;
    }

    ship.vx *= DAMPING;
    ship.vy *= DAMPING;
    ship.x += ship.vx;
    ship.y += ship.vy;

    ship.depth = Math.floor(ship.x / 50);

    if (ship.depth >= ship.goal) {
        ship.alive = false;
        sploosh();
    }

    checkCollision();
    updateHUD();
}

function checkCollision() {
    const seg = cavePoints.find((p, i) => i < cavePoints.length - 1 && ship.x >= p.x && ship.x <= cavePoints[i + 1].x);
    if (!seg) return;

    const camY = ship.y - canvas.height / 2;
    if (ship.y - 15 < seg.top || ship.y + 15 > seg.bottom) {
        const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);

        ship.hull -= speed * 4;
        ship.vx *= -0.5; ship.vy *= -0.5;
        if (ship.hull <= 0) {
            ship.alive = false;
            endGame("HULL BREACH: SIGNAL LOST");
        }
    }
}

function sploosh() {
    ctx.fillStyle = "rgba(0, 100, 255, 1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    endGame("SUCCESS! YOU REACHED THE INNER SEA.");
    setTimeout(() => window.location.href = "sea.html", 3000);
}

function updateHUD() {
    const ui = document.getElementById('ui');
    if (!document.getElementById('fuel-status')) {
        const f = document.createElement('div');
        f.id = 'fuel-status';
        f.innerHTML = '<div style="margin-top:10px; font-size:0.8rem; color:#ffaa00;">ANTIMATTER DRIVE</div><div style="font-size:1.2rem; color:#00ffcc;">STABLE (INFINITE)</div>';
        ui.appendChild(f);
    }
    const depthEl = document.getElementById('depth');
    const hullEl = document.getElementById('hull');
    const scoreEl = document.getElementById('score');
    if (depthEl) depthEl.innerText = (ship.depth / 10).toFixed(1) + " km down";
    if (hullEl) hullEl.innerText = Math.floor(ship.hull) + "%";
    if (scoreEl) scoreEl.innerText = score;
}

function endGame(text) {
    const msg = document.getElementById('msg');
    const txt = document.getElementById('text');
    msg.style.display = 'block';
    txt.innerText = text;
    txt.style.color = ship.hull > 0 ? "#00ffcc" : "#ff4444";

    const retryBtn = document.querySelector('button[onclick="location.reload()"]');
    if (retryBtn) {
        retryBtn.innerText = "RETRY DESCENT";
        retryBtn.onclick = () => {
            msg.style.display = 'none';
            ship.alive = true; ship.hull = 100;
            initCave();
        };
    }
}

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    updateCave();
    drawCave();
    drawEntities();
    update();
    drawShip();
    requestAnimationFrame(loop);
}

initCave();
loop();
