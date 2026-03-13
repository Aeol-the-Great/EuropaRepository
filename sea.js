import * as THREE from 'three';

// --- CONFIG ---
const WATER_COLOR = 0x011a3a;
const FOG_DENSITY = 0.04;
const CEILING_Y = 50;
const FLOOR_Y = -150;
const RENDER_DISTANCE = 100;

// --- CHALLENGE STATE ---
let objectives = { jellyfish: 0, crystals: 0, scans: 0 };
const TARGET = 3;

const scene = new THREE.Scene();
scene.background = new THREE.Color(WATER_COLOR);
scene.fog = new THREE.FogExp2(WATER_COLOR, FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- LIGHTING ---
scene.add(new THREE.AmbientLight(0x1a2a4a, 0.5));
const headLight = new THREE.SpotLight(0xffffff, 5, 200, Math.PI / 4, 0.5);
camera.add(headLight);
headLight.position.set(0, 0, 1);
headLight.target.position.set(0, 0, -10);
camera.add(headLight.target);
scene.add(camera);

// --- ENVIRONMENT ---
// --- FACETED STALACTITE GENERATOR ---
function createFacetedColumn(height, radius, isStalactite) {
    // A cylinder with 5 radial segments gives a nice faceted rock/crystal look
    const geo = new THREE.CylinderGeometry(radius * 0.2, radius, height, 5, 6);
    const posAttr = geo.attributes.position;

    // Add randomness to vertices for natural facets
    for (let i = 0; i < posAttr.count; i++) {
        const y = posAttr.getY(i);
        const ratio = 1 - (y + height / 2) / height; // 0 at base, 1 at tip
        if (ratio > 0.1) { // Keep base relatively stable
            const jitter = (Math.random() - 0.5) * radius * 0.5;
            posAttr.setX(i, posAttr.getX(i) + jitter);
            posAttr.setZ(i, posAttr.getZ(i) + jitter);
        }
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
        color: isStalactite ? 0x4a9eff : 0x1a2a4a,
        flatShading: true,
        shininess: 80,
        emissive: isStalactite ? 0x112244 : 0x000000
    });

    return new THREE.Mesh(geo, mat);
}

const stalagmites = [];
function createCavern() {
    for (let i = 0; i < 120; i++) {
        const height = 80 + Math.random() * 120;
        const radius = 5 + Math.random() * 8;
        const isStalactite = Math.random() > 0.5;

        const col = createFacetedColumn(height, radius, isStalactite);
        const x = (Math.random() - 0.5) * 1500;
        const z = (Math.random() - 0.5) * 1500;

        if (isStalactite) {
            col.rotation.x = Math.PI;
            col.position.set(x, CEILING_Y - height / 2, z);
        } else {
            col.position.set(x, FLOOR_Y + height / 2, z);
        }

        scene.add(col);
        stalagmites.push({ mesh: col, x, z, r: radius, scanned: false });
    }
    // Floor/Ceiling
    const pGeo = new THREE.PlaneGeometry(3000, 3000);
    const fMat = new THREE.MeshStandardMaterial({ color: 0x0a1a2a });
    const floor = new THREE.Mesh(pGeo, fMat); floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; scene.add(floor);
    const ceil = new THREE.Mesh(pGeo, new THREE.MeshStandardMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.2 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = CEILING_Y; scene.add(ceil);
}
createCavern();

// --- CREATURES ---
const creatures = [];
const species = [
    { color: 0x00ffcc, name: "Jelly" },   // Collectible
    { color: 0xff00ff, name: "Xeno-Ray" },
    { color: 0xffff00, name: "Glow-Eel" },
    { color: 0xff4400, name: "Void-Crab" }
];

function createBeings() {
    species.forEach((s, sIdx) => {
        for (let i = 0; i < 15; i++) {
            const group = new THREE.Group();
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.8), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.8 }));
            group.add(body);
            const light = new THREE.PointLight(s.color, 2, 20); group.add(light);

            group.position.set((Math.random() - 0.5) * 800, FLOOR_Y + 20 + Math.random() * 150, (Math.random() - 0.5) * 800);
            scene.add(group);
            creatures.push({ group, type: s.name, vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.2) });
        }
    });
}
createBeings();

const crystals = [];
function createCrystals() {
    const geo = new THREE.OctahedronGeometry(3);
    const mat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff });
    for (let i = 0; i < 30; i++) {
        const c = new THREE.Mesh(geo, mat);
        c.position.set((Math.random() - 0.5) * 900, FLOOR_Y + 2, (Math.random() - 0.5) * 900);
        scene.add(c);
        crystals.push(c);
    }
}
createCrystals();

// --- INPUT & PHYSICS ---
const K = { KeyW: false, KeyS: false, KeyA: false, KeyD: false, Space: false, ShiftLeft: false };
window.addEventListener('keydown', e => K[e.code] = true);
window.addEventListener('keyup', e => K[e.code] = false);

let yaw = 0, pitch = 0;
document.addEventListener('mousemove', e => {
    if (document.pointerLockElement) {
        yaw -= e.movementX * 0.002; pitch -= e.movementY * 0.002;
        pitch = Math.max(-1.4, Math.min(1.4, pitch));
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
});
document.addEventListener('click', () => document.body.requestPointerLock());

let vel = new THREE.Vector3();
camera.position.set(0, 0, 50);

function animate() {
    requestAnimationFrame(animate);

    const input = new THREE.Vector3();
    if (K.KeyW) input.z -= 1; if (K.KeyS) input.z += 1;
    if (K.KeyA) input.x -= 1; if (K.KeyD) input.x += 1;
    if (K.Space) input.y += 1; if (K.ShiftLeft) input.y -= 1;

    input.normalize().multiplyScalar(0.005).applyQuaternion(camera.quaternion);
    vel.add(input).multiplyScalar(0.98);
    camera.position.add(vel);

    // Collision & Objectives
    camera.position.y = Math.max(FLOOR_Y + 5, Math.min(CEILING_Y - 5, camera.position.y));

    // Interactions
    creatures.forEach((c, idx) => {
        c.group.position.add(c.vel);
        const dist = camera.position.distanceTo(c.group.position);
        if (dist < 8 && c.type === "Jelly" && objectives.jellyfish < TARGET) {
            objectives.jellyfish++;
            scene.remove(c.group);
            creatures.splice(idx, 1);
        }
    });

    crystals.forEach((c, idx) => {
        if (camera.position.distanceTo(c.position) < 8 && objectives.crystals < TARGET) {
            objectives.crystals++;
            scene.remove(c);
            crystals.splice(idx, 1);
        }
    });

    stalagmites.forEach(s => {
        const dx = camera.position.x - s.x; const dz = camera.position.z - s.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 15 && !s.scanned && objectives.scans < TARGET) {
            s.scanned = true; objectives.scans++;
        }
        if (d < s.r + 2) {
            const a = Math.atan2(dz, dx);
            camera.position.x = s.x + Math.cos(a) * (s.r + 2);
            camera.position.z = s.z + Math.sin(a) * (s.r + 2);
        }
    });

    updateHUD();
    renderer.render(scene, camera);
}

function updateHUD() {
    // Depth starts at 15.5km (ice bottom) and goes down to 50km (floor)
    // FLOOR_Y is -150, CEILING_Y is 50. Total 200 units.
    // Let's map 0 to 15.5 and -200 (distance) to 50.
    const depthRel = Math.abs(camera.position.y - CEILING_Y);
    const depthKM = 15.5 + (depthRel / 200) * (50 - 15.5);
    const d = document.getElementById('depth');
    if (d) d.innerText = depthKM.toFixed(2);

    const coords = document.querySelector('.coordinates');
    if (coords) {
        const lat = (14.22 + camera.position.x / 1000).toFixed(4);
        const long = (125.4 + camera.position.z / 1000).toFixed(4);
        coords.innerText = `LAT: ${lat}'N | LONG: ${long}'W`;
    }

    const el = document.getElementById('objectives');
    if (el) {
        el.innerHTML = `MISSION CHALLENGE:<br>
        [${objectives.jellyfish}/${TARGET}] JELLYFISH COLLECTED<br>
        [${objectives.crystals}/${TARGET}] CRYSTALS GATHERED<br>
        [${objectives.scans}/${TARGET}] COLUMNS SCANNED`;
        if (objectives.jellyfish >= TARGET && objectives.crystals >= TARGET && objectives.scans >= TARGET) {
            el.innerHTML = "<b style='color:#0f0'>CHALLENGE COMPLETE - RETURN TO HUB</b>";
        }
    }
}

animate();
