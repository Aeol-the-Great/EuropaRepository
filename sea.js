import * as THREE from 'three';

// --- CONFIG ---
const WATER_COLOR = 0x011a3a;
const FOG_DENSITY = 0.1;
const CEILING_Y = 50;
const FLOOR_Y = -150;
const RENDER_DISTANCE = 150;
const BASE_CULL = 40;
const LIGHT_CULL = 80;

// --- CHALLENGE STATE ---
let objectives = { jellyfish: 0, crystals: 0, scans: 0 };
const TARGET = 3;
let gameStarted = false;

window.startGame = function() {
    const screen = document.getElementById('start-screen');
    if (screen) screen.style.display = 'none';
    gameStarted = true;
    document.body.requestPointerLock();
};

// --- HUD MARKERS ---
const markersDiv = document.getElementById('markers-container');
function createMarkerDOM(text, color) {
    if (!markersDiv) return null;
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.color = color;
    el.style.fontFamily = 'monospace';
    el.style.fontSize = '12px';
    el.style.border = `1px solid ${color}`;
    el.style.padding = '2px 4px';
    el.style.backgroundColor = 'rgba(0, 5, 20, 0.6)';
    el.style.transform = 'translate(-50%, -50%)';
    el.style.pointerEvents = 'none';
    el.style.textShadow = '0 0 5px ' + color;
    el.innerText = text;
    el.style.display = 'none';
    markersDiv.appendChild(el);
    return el;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(WATER_COLOR);
scene.fog = new THREE.Fog(WATER_COLOR, 40, 60); // Fog matches culling bubble

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, FLOOR_Y + 10, 50);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- LIGHTING ---
scene.add(new THREE.AmbientLight(0x1a2a4a, 1.2));
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

// --- ENVIRONMENT ---

const stalagmites = [];
function createCavern() {
    for (let i = 0; i < 120; i++) {
        const height = 40 + Math.random() * 80;
        const radius = 3 + Math.random() * 5;
        const isStalactite = Math.random() > 0.5;

        const col = createFacetedColumn(height, radius, isStalactite);
        // Cluster them more densely around the origin too
        const x = (Math.random() - 0.5) * 600;
        const z = (Math.random() - 0.5) * 600;

        if (isStalactite) {
            col.rotation.x = Math.PI;
            col.position.set(x, CEILING_Y - height / 2, z);
        } else {
            col.position.set(x, FLOOR_Y + height / 2, z);
        }

        scene.add(col);
        stalagmites.push({ mesh: col, x, z, r: radius, scanned: false, domMarker: createMarkerDOM('[COLUMN]', '#4a9eff') });
    }
    // Floor/Ceiling with clear visibility
    const fMat = new THREE.MeshStandardMaterial({
        color: 0x0a1a2a,
        emissive: 0x001122, // Subtle glow to prevent "pitch black"
        roughness: 0.8
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), fMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; scene.add(floor);

    const cMat = new THREE.MeshStandardMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.1, emissive: 0x224488 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), cMat);
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
        const count = s.name === "Jelly" ? 120 : 40; // Tripled jellyfish density

        // Custom Jellyfish Marker Geometry
        const markerGeo = new THREE.RingGeometry(1.5, 2, 16);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });

        for (let i = 0; i < count; i++) {
            const group = new THREE.Group();
            
            // Core Body
            const bodyGeo = new THREE.SphereGeometry(1.2, 12, 12);
            const bodyMat = new THREE.MeshBasicMaterial({ color: s.color });
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            group.add(body);
            
            // Glow Halo (Zero performance cost compared to PointLight)
            const haloGeo = new THREE.SphereGeometry(2.5, 12, 12);
            const haloMat = new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.15, depthWrite: false });
            const halo = new THREE.Mesh(haloGeo, haloMat);
            group.add(halo);

            // Add Mission objective hover marker
            if (s.name === "Jelly") {
                const marker = new THREE.Mesh(markerGeo, markerMat);
                marker.position.y = 3.5;
                // Billboard effect is handled in animate loop
                group.add(marker);
                group.userData.marker = marker;
            }

            group.position.set((Math.random() - 0.5) * 600, FLOOR_Y + 10 + Math.random() * 160, (Math.random() - 0.5) * 600);
            scene.add(group);
            creatures.push({ 
                group, 
                type: s.name, 
                vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.3),
                domMarker: s.name === "Jelly" ? createMarkerDOM(`[${s.name.toUpperCase()}]`, '#' + s.color.toString(16).padStart(6, '0')) : null
            });
        }
    });
}
createBeings();

// --- SEARCHLIGHT ENHANCEMENT ---
const searchLight = new THREE.SpotLight(0xffffff, 100, 500, Math.PI / 6, 0.4, 0.5);
searchLight.position.set(0, 0, 1);
camera.add(searchLight);
searchLight.target.position.set(0, 0, -20);
camera.add(searchLight.target);
scene.add(camera);

// --- REFINED VISIBILITY & CULLING ---

// --- PLAYER-CENTRIC VISIBILITY SENSOR ---
const playerPos = new THREE.Vector3();
const objPos = new THREE.Vector3();

function updateMaterials() {
    camera.getWorldPosition(playerPos);

    scene.traverse(obj => {
        if (obj.isMesh && obj.material && obj.material.fog !== undefined) {
            // Environment (Floor/Ceiling) remains constant visual anchors
            if (obj.geometry.type === "PlaneGeometry") {
                obj.visible = true;
                obj.material.fog = true;
                return;
            }

            obj.getWorldPosition(objPos);
            const dist = playerPos.distanceTo(objPos);

            // UNIFORM SPHERE CULLING: 60m hard limit
            if (dist < 60) {
                obj.visible = true;
                // Gradual fade starts at 30m, matching the fog config
                obj.material.fog = (dist > 30);
            } else {
                obj.visible = false;
            }
        }
    });
}

const crystals = [];
function createCrystals() {
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff, 
        emissive: 0x00ffff, 
        transparent: true, 
        opacity: 0.8,
        flatShading: true
    });
    
    for (let i = 0; i < 60; i++) {
        const group = new THREE.Group();
        const baseGeo = new THREE.OctahedronGeometry(2);
        
        // Main Gem
        const m1 = new THREE.Mesh(baseGeo, mat);
        m1.scale.set(1, 1.8, 1);
        group.add(m1);

        // Sub Gem A
        const m2 = new THREE.Mesh(baseGeo, mat);
        m2.scale.set(0.6, 1.2, 0.6);
        m2.position.set(1.2, -1, 1.2);
        m2.rotation.set(0.2, 0.5, -0.3);
        group.add(m2);

        // Sub Gem B
        const m3 = new THREE.Mesh(baseGeo, mat);
        m3.scale.set(0.7, 1.0, 0.7);
        m3.position.set(-1.0, -0.5, -1.5);
        m3.rotation.set(-0.4, 0.2, 0.4);
        group.add(m3);

        const light = new THREE.PointLight(0x00ffff, 0.8, 15);
        group.add(light);

        group.position.set((Math.random() - 0.5) * 600, FLOOR_Y + 2, (Math.random() - 0.5) * 600);
        group.userData.domMarker = createMarkerDOM('[CRYSTAL]', '#00ffff');
        scene.add(group);
        crystals.push(group);
    }
}
createCrystals();

// --- INPUT & PHYSICS ---
const K = { KeyW: false, KeyS: false, KeyA: false, KeyD: false, Space: false, ShiftLeft: false };
window.addEventListener('keydown', e => K[e.code] = true);
window.addEventListener('keyup', e => K[e.code] = false);

let yaw = 0, pitch = 0;
document.addEventListener('mousemove', e => {
    if (gameStarted && document.pointerLockElement) {
        yaw -= e.movementX * 0.002; pitch -= e.movementY * 0.002;
        pitch = Math.max(-1.4, Math.min(1.4, pitch));
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
});
document.addEventListener('click', () => {
    if (gameStarted) document.body.requestPointerLock();
});

let vel = new THREE.Vector3();
const projVec = new THREE.Vector3();

// --- HUD MARKER UPDATER ---
function updateDOMMarker(worldPos, domEl, isActive) {
    if (!domEl) return;
    if (!isActive) { domEl.style.display = 'none'; return; }

    const dist = camera.position.distanceTo(worldPos);
    if (dist > 100) { domEl.style.display = 'none'; return; } // Sonar range

    projVec.copy(worldPos).project(camera);
    if (projVec.z > 1) { domEl.style.display = 'none'; return; } // Behind camera

    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    
    domEl.style.display = 'block';
    domEl.style.left = `${(projVec.x * halfW) + halfW}px`;
    domEl.style.top = `${-(projVec.y * halfH) + halfH}px`;
    
    // Scale distance opacity (fade out edges of sonar range)
    let op = 1.0 - (dist / 100);
    domEl.style.opacity = Math.max(0.1, op).toFixed(2);
    
    // Pulse effect
    domEl.style.transform = `translate(-50%, -50%) scale(${1 + Math.sin(Date.now() * 0.005) * 0.1})`;
}

function animate() {
    requestAnimationFrame(animate);
    
    if (!gameStarted) return;

    const input = new THREE.Vector3();
    if (K.KeyW) input.z -= 1; if (K.KeyS) input.z += 1;
    if (K.KeyA) input.x -= 1; if (K.KeyD) input.x += 1;
    if (K.Space) input.y += 1; if (K.ShiftLeft) input.y -= 1;

    input.normalize().multiplyScalar(0.005).applyQuaternion(camera.quaternion);
    vel.add(input).multiplyScalar(0.98);
    camera.position.add(vel);

    // Collision & Objectives
    camera.position.x = Math.max(-300, Math.min(300, camera.position.x));
    camera.position.y = Math.max(FLOOR_Y + 5, Math.min(CEILING_Y - 5, camera.position.y));
    camera.position.z = Math.max(-300, Math.min(300, camera.position.z));

    // Interactions & Markers
    creatures.forEach((c, idx) => {
        c.group.position.add(c.vel);

        // Billboard the marker to face the camera
        if (c.group.userData.marker) c.group.userData.marker.lookAt(camera.position);

        const dist = camera.position.distanceTo(c.group.position);
        let isActive = (c.type === "Jelly" && objectives.jellyfish < TARGET);
        
        updateDOMMarker(c.group.position, c.domMarker, isActive);

        if (dist < 8 && isActive) {
            objectives.jellyfish++;
            if (c.domMarker) c.domMarker.remove();
            scene.remove(c.group);
            creatures.splice(idx, 1);
        }
    });

    crystals.forEach((c, idx) => {
        let isActive = (objectives.crystals < TARGET);
        updateDOMMarker(c.position, c.userData.domMarker, isActive);

        if (camera.position.distanceTo(c.position) < 8 && isActive) {
            objectives.crystals++;
            if (c.userData.domMarker) c.userData.domMarker.remove();
            scene.remove(c);
            crystals.splice(idx, 1);
        }
    });

    stalagmites.forEach(s => {
        const dx = camera.position.x - s.x; const dz = camera.position.z - s.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        
        // Use an offset position for the marker so it appears on the pillar, not purely at origin
        const markerPos = new THREE.Vector3(s.x, camera.position.y - 5, s.z);
        updateDOMMarker(markerPos, s.domMarker, !s.scanned && objectives.scans < TARGET);

        if (d < 15 && !s.scanned && objectives.scans < TARGET) {
            s.scanned = true; 
            objectives.scans++;
            if (s.domMarker) s.domMarker.remove();
        }
        if (d < s.r + 2) {
            const a = Math.atan2(dz, dx);
            camera.position.x = s.x + Math.cos(a) * (s.r + 2);
            camera.position.z = s.z + Math.sin(a) * (s.r + 2);
        }
    });

    if (objectives.jellyfish >= TARGET && objectives.crystals >= TARGET && objectives.scans >= TARGET) {
        // Clear all remaining markers
        creatures.forEach(c => { if(c.domMarker) c.domMarker.style.display = 'none'; });
        crystals.forEach(c => { if(c.userData.domMarker) c.userData.domMarker.style.display = 'none'; });
        stalagmites.forEach(s => { if(s.domMarker) s.domMarker.style.display = 'none'; });
    }

    updateHUD();
    updateMaterials();
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
