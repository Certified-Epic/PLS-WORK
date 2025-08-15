// script.js (module)
// Three.js star chart: planets, zoom, nodes on planet surface, junctions, animated orbital lines,
// single title card UI, lazy loading & some performance optimizations.

// NOTE: this file uses Three (imported via <script> in index.html). It is written as a module
// (so we can use top-level await if desired). The code is synchronous-friendly but uses promises
// for texture loading.

// -------------------- Configuration constants --------------------
const CONFIG = {
  INITIAL_CAMERA_Z: 2200,
  PLANET_COUNT: 6,                // number of main planets
  PLANET_MIN_RADIUS: 80,
  PLANET_MAX_RADIUS: 180,
  PLANET_SPREAD: 1600,            // how far planets are spread from center
  TIER_COUNT: 5,                  // number of tiers per planet (for demo)
  NODES_PER_TIER: 6,
  NODE_SPRITE_SIZE: 36,           // screen pixels (sprite scale)
  JUNCTION_DIST_FACTOR: 1.25,     // multiplier outside planet radius for junction placement
  ZOOM_SCREEN_FRACTION: 0.55,     // target planet should occupy ~55% of vertical screen
  CAMERA_EASE: 0.08,              // camera lerp easing
  NODE_SHOW_START_SCALE: 1.6,     // start fading in nodes approaching this camera scale
  NODE_SHOW_END_SCALE: 3.2,       // fully visible at this scale
  LAZY_TEXTURE_THRESHOLD: 2.0     // when to load high-res detail textures
};

// -------------------- Global state --------------------
let renderer, scene, camera, controls, clock;
let planets = [];               // array of planet objects {mesh, radius, tiers: [...]}
let orbitalLines = [];          // array of {line, fromIndex, toIndex}
let nodeAtlasTexture = null;    // optional sprite atlas
let lowResNodeTexture = null;   // fallback node sprite
let lockTexture = null;
let pulseTexture = null;
let junctionTexture = null;
let hovered = null;             // {type:'planet'|'tier'|'node'|'junction', refs...}
let hoveredPlanet = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let titleCardEl, expandBtn, closeCardBtn;

// animation/camera targets
let cameraTarget = new THREE.Vector3(0, 0, 0);
let cameraDesiredPos = new THREE.Vector3(0, 0, CONFIG.INITIAL_CAMERA_Z);

// -------------------- Utility helpers --------------------

// Compute camera distance so that an object of `radius` (world units) occupies `screenFrac` fraction of screen height.
// Uses simple trigonometry: visibleHeight = 2 * distance * tan(fov/2)  => solve for distance.
function computeCameraDistanceForScreenFraction(radius, screenFrac, cameraFovDeg) {
  // visible height that would contain diameter (2 * radius)
  const visibleHeight = 2 * radius / screenFrac;
  const fovRad = THREE.MathUtils.degToRad(cameraFovDeg);
  const distance = (visibleHeight / 2) / Math.tan(fovRad / 2);
  return distance;
}

// Linear easing
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function vLerp(vFrom, vTo, t, target) {
  target.x = lerp(vFrom.x, vTo.x, t);
  target.y = lerp(vFrom.y, vTo.y, t);
  target.z = lerp(vFrom.z, vTo.z, t);
  return target;
}

// load texture helper (returns promise)
function loadTexture(url, options = {}) {
  return new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    loader.load(url,
      tex => { if (options.wrapRepeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; } resolve(tex); },
      undefined,
      () => { console.warn('texture load fail', url); resolve(null); }
    );
  });
}

// Convert polar placement (spherical) to world coordinates on sphere with center and radius
function pointOnSphere(center, sphereRadius, theta, phi) {
  // theta: angle from X axis in XY plane (azimuth), phi: angle from Z axis (polar)
  const x = sphereRadius * Math.sin(phi) * Math.cos(theta);
  const y = sphereRadius * Math.cos(phi); // use cos for 'latitude'
  const z = sphereRadius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(center.x + x, center.y + y, center.z + z);
}

// -------------------- Initialization --------------------
async function init() {
  // canvas + renderer
  const canvas = document.getElementById('threeCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
  renderer.outputEncoding = THREE.sRGBEncoding;

  // scene + camera + light
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10000);
  camera.position.set(0, 200, CONFIG.INITIAL_CAMERA_Z);
  cameraTarget.set(0, 0, 0);

  clock = new THREE.Clock();

  // simple ambient + directional
  scene.add(new THREE.AmbientLight(0xaaaaaa, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1000, 2000, 1000);
  scene.add(dir);

  // controls for debugging (disabled in production if you want)
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enabled = true; // can be toggled

  // UI references
  titleCardEl = document.getElementById('titleCard');
  const header = document.getElementById('titleCardHeader');
  // we set values later via showTitleCard()
  expandBtn = document.getElementById('expandBtn');
  closeCardBtn = document.getElementById('closeCardBtn');

  // load low-res textures (always)
  lowResNodeTexture = await loadTexture('assets/node.png');
  lockTexture = await loadTexture('assets/lock.png');
  pulseTexture = await loadTexture('assets/pulse.png');
  junctionTexture = await loadTexture('assets/junction.png');

  // create background starfield as a cached canvas texture (bitmap caching)
  createStaticStarfield();

  // create planets and orbital lines
  createPlanetsAndLines();

  // event listeners
  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  document.getElementById('resetBtn').addEventListener('click', resetView);
  document.getElementById('themeColor').addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--accent', e.target.value);
  });

  // start render loop
  animate();
}

// -------------------- Starfield caching --------------------
let starfieldMesh = null;
function createStaticStarfield() {
  // draw once on an offscreen canvas to save CPU each frame
  const off = document.createElement('canvas');
  off.width = 2048; off.height = 2048;
  const ctx = off.getContext('2d');
  ctx.fillStyle = 'black'; ctx.fillRect(0, 0, off.width, off.height);

  // draw many tiny stars
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * off.width, y = Math.random() * off.height;
    const r = Math.random() * 1.6;
    ctx.globalAlpha = 0.6 + Math.random() * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.9})`;
    ctx.fillRect(x, y, r, r);
  }

  const texture = new THREE.CanvasTexture(off);
  texture.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(8000, 8000);
  const mat = new THREE.MeshBasicMaterial({ map: texture, depthWrite: false, transparent: true, opacity: 0.95 });
  starfieldMesh = new THREE.Mesh(geo, mat);
  starfieldMesh.rotation.x = -Math.PI / 2;
  starfieldMesh.position.y = -800; // far below center
  scene.add(starfieldMesh);
}


// -------------------- Create demo planets & orbital lines --------------------
function createPlanetsAndLines() {
  // We'll create a few planets scattered in a large area. Each planet will have tiers (small circles).
  const baseGeom = new THREE.SphereGeometry(1, 32, 24); // use scale to set radius
  for (let i = 0; i < CONFIG.PLANET_COUNT; i++) {
    const radius = THREE.MathUtils.lerp(CONFIG.PLANET_MIN_RADIUS, CONFIG.PLANET_MAX_RADIUS, Math.random());
    // position in a ring-ish spread with variation
    const angle = (i / CONFIG.PLANET_COUNT) * Math.PI * 2 + (Math.random() * 0.6 - 0.3);
    const r = CONFIG.PLANET_SPREAD * (0.6 + Math.random() * 0.9);
    const px = Math.cos(angle) * r;
    const pz = Math.sin(angle) * r;
    const py = (Math.random() - 0.5) * 300;

    const geom = baseGeom.clone();
    geom.scale(radius, radius, radius);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.6, 0.3),
      roughness: 0.7,
      metalness: 0.05
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(px, py, pz);
    mesh.userData = { planetIndex: i, radius };
    scene.add(mesh);

    // tiers placeholder (we'll place nodes relative to planet center)
    const tiers = [];
    for (let t = 0; t < CONFIG.TIER_COUNT; t++) {
      const tier = { tierIndex: t, achievements: [] };
      // create node sprites around planet surface (but initially hidden until zoom)
      for (let n = 0; n < CONFIG.NODES_PER_TIER; n++) {
        // sprite setup: low res for now
        const spriteMat = new THREE.SpriteMaterial({ map: lowResNodeTexture, depthTest: true, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(CONFIG.NODE_SPRITE_SIZE, CONFIG.NODE_SPRITE_SIZE, 1);
        // store metadata for raycasting & lazy update
        sprite.userData = { planetIndex: i, tierIndex: t, nodeIndex: n, status: (t === 0 ? 'available' : 'locked') };
        sprite.visible = false;
        scene.add(sprite);
        tier.achievements.push(sprite);
      }
      tiers.push(tier);
    }

    planets.push({ mesh, radius, tiers, position: mesh.position.clone() });
  }

  // create orbital connecting lines between planets (glowing, animated pulse)
  for (let i = 0; i < planets.length; i++) {
    const a = planets[i];
    const b = planets[(i + 1) % planets.length]; // simple ring for demo
    const pts = [a.position.clone(), b.position.clone()];
    const geom = new THREE.BufferGeometry().setFromPoints(pts);

    // compute a per-vertex 'u' attribute (normalized distance along line)
    const positions = geom.attributes.position.array;
    const dist = a.position.distanceTo(b.position);
    const aU = new Float32Array(positions.length / 3);
    aU[0] = 0; aU[1] = 1; // since only two vertices

    geom.setAttribute('aU', new THREE.BufferAttribute(aU, 1));

    // shader material for animated pulse
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff') },
        uGlow: { value: 1.2 }
      },
      vertexShader: `
        attribute float aU;
        varying float vU;
        void main(){
          vU = aU;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision mediump float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uGlow;
        varying float vU;
        void main(){
          float pulse = smoothstep(0.0, 1.0, sin((uTime*1.6 - vU*6.2831)) * 0.5 + 0.5);
          float alpha = pow(pulse, 2.0) * 0.9;
          // base soft line
          float base = 0.08;
          float glow = base + alpha * uGlow;
          gl_FragColor = vec4(uColor * (0.6 + pulse*0.8), glow);
        }`
    });

    const line = new THREE.Line(geom, mat);
    scene.add(line);
    orbitalLines.push({ line, from: i, to: (i + 1) % planets.length });
  }
}

// -------------------- Raycast & pointer events --------------------
function onPointerMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // raycast to find planet or node under cursor
  raycaster.setFromCamera(mouse, camera);
  // test nodes first (sprites)
  const allNodes = [];
  planets.forEach(p => p.tiers.forEach(t => t.achievements.forEach(s => allNodes.push(s))));
  const intersectsNodes = raycaster.intersectObjects(allNodes, true);

  if (intersectsNodes.length) {
    const s = intersectsNodes[0].object;
    hovered = { type: 'node', sprite: s, planetIndex: s.userData.planetIndex, tierIndex: s.userData.tierIndex, nodeIndex: s.userData.nodeIndex };
    showTitleCardForNode(hovered);
    // also show hologram under node: handled by sprite userData._holo lerp in animate
  } else {
    // if no node hovered, test planets
    const planetMeshes = planets.map(p => p.mesh);
    const intersects = raycaster.intersectObjects(planetMeshes, true);
    if (intersects.length) {
      const pm = intersects[0].object;
      hovered = { type: 'planet', planetIndex: pm.userData.planetIndex, mesh: pm };
      // show junctions for this planet only
      hoveredPlanet = hovered.planetIndex;
      showTooltipForPlanet(hovered);
    } else {
      hovered = null;
      hoveredPlanet = null;
      hideTooltip();
      hideTitleCard(); // if no hover, hide lightweight card
    }
  }
}

function onPointerDown(event) {
  // click: handle zooming or selecting node
  if (!hovered) return;
  if (hovered.type === 'planet') {
    // click planet -> zoom in so the planet occupies ~50-60% of screen height
    const p = planets[hovered.planetIndex];
    zoomToPlanet(hovered.planetIndex);
  } else if (hovered.type === 'node') {
    // click node -> open expanded details
    showExpandedDetailsForNode(hovered);
  }
}

// -------------------- Zoom & camera animation --------------------
function zoomToPlanet(planetIndex) {
  const p = planets[planetIndex];
  const desiredFraction = CONFIG.ZOOM_SCREEN_FRACTION;
  const planetRadius = p.radius;
  const distance = computeCameraDistanceForScreenFraction(planetRadius, desiredFraction, camera.fov);
  // aim camera at planet center, and place camera along the direction it currently is (or offset)
  const dir = new THREE.Vector3().subVectors(camera.position, cameraTarget).normalize();
  // place the camera so it's centered on the planet from current viewing angle
  cameraTarget.copy(p.position);
  cameraDesiredPos.copy(p.position).add(new THREE.Vector3(0, planetRadius * 0.2, distance));
}

// Reset view
function resetView() {
  cameraDesiredPos.set(0, 200, CONFIG.INITIAL_CAMERA_Z);
  cameraTarget.set(0, 0, 0);
  stateFocusedNull();
}

// set focus null
function stateFocusedNull() {
  // nothing for now, could reset highlighted tier
}

// -------------------- Title card UI --------------------
let titleCardVisible = false;
function showTitleCardForNode({ sprite, planetIndex, tierIndex, nodeIndex }) {
  // lightweight title card (shows up on node hover)
  const data = sprite.userData;
  const header = document.getElementById('titleCardHeader');
  const body = document.getElementById('titleCardBody');
  header.textContent = (data.title || `NODE ${planetIndex}-${tierIndex}-${nodeIndex}`).toUpperCase();
  body.textContent = (data.short || 'Hover to preview. Click for details.');
  showCard();
}
function showCard() {
  titleCardEl.classList.remove('hidden');
  setTimeout(() => titleCardEl.classList.add('show'), 10);
  titleCardVisible = true;
}
function hideTitleCard() {
  titleCardEl.classList.remove('show');
  setTimeout(() => titleCardEl.classList.add('hidden'), 180);
  titleCardVisible = false;
}

function showExpandedDetailsForNode(hoverObj) {
  // expand the card with details — simulate lazy loaded long description/textures
  const { sprite } = hoverObj;
  const header = document.getElementById('titleCardHeader');
  const body = document.getElementById('titleCardBody');

  header.textContent = (sprite.userData.title || 'Achievement').toUpperCase();
  // lazy load more info (simulate by waiting then adding details)
  body.textContent = 'Loading details...';
  showCard();

  // Example of lazy texture loading if we need detailed images for the node:
  const highResUrl = sprite.userData.highResTextureUrl; // may be undefined
  if (highResUrl) {
    loadTexture(highResUrl).then(tex => {
      if (tex) {
        // do something with high-res texture (e.g., show in card or apply to sprite)
        body.textContent = sprite.userData.description || 'Detailed description loaded.';
      } else {
        body.textContent = sprite.userData.description || 'No extra details.';
      }
    });
  } else {
    // no high res — just show stored info
    body.textContent = sprite.userData.description || 'No extra details.';
  }

  // ensure only one card visible; if you want a modal view you can toggle CSS to scale in
}

// -------------------- Tooltip for planets --------------------
let tooltipEl = null;
function showTooltipForPlanet(hovered) {
  // simple DOM tooltip - for brevity we only show header in the titleCard to avoid duplicate elements
  // (per your requirement, node hologram will not be shown in tooltip)
  // Implementation: reuse title card to show planet info when hovered
  const p = planets[hovered.planetIndex];
  const header = document.getElementById('titleCardHeader');
  const body = document.getElementById('titleCardBody');
  header.textContent = (p.mesh.userData.name || `PLANET ${hovered.planetIndex}`).toUpperCase();
  body.textContent = `Tier count: ${p.tiers.length} — click to zoom.`;
  showCard();
}

// Hide tooltip
function hideTooltip() {
  hideTitleCard();
}

// -------------------- Animation loop --------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // animate orbital lines (pass uTime)
  orbitalLines.forEach(o => {
    const mat = o.line.material;
    if (mat && mat.uniforms) mat.uniforms.uTime.value += dt * 0.8;
  });

  // camera interpolation toward desired position and target
  vLerp(camera.position, cameraDesiredPos, CONFIG.CAMERA_EASE, camera.position);
  // camera lookAt interpolation: smoothly move cameraTarget -> new
  const currentLook = new THREE.Vector3();
  camera.getWorldDirection(currentLook);
  // smooth lookAt by moving a control point
  const camDirTarget = cameraTarget.clone();
  camera.lookAt(camDirTarget);

  // controls damping (use only for debug)
  controls.update();

  // node visibility & hologram fade: we compute a vis value based on camera distance (or camera.scale)
  const camScale = computeCameraScaleEquivalent();

  planets.forEach((p, pi) => {
    p.tiers.forEach((tier, ti) => {
      tier.achievements.forEach((sprite, ni) => {
        // compute desired visibility factor
        const vis = clamp((camera.position.distanceTo(p.position) < 1000 ? 1 : 1 - (camera.position.distanceTo(p.position) / 2000)), 0, 1);
        // another approach: map distance to scale thresholds
        const showFactor = clamp((CONFIG.NODE_SHOW_END_SCALE - camScale) / (CONFIG.NODE_SHOW_END_SCALE - CONFIG.NODE_SHOW_START_SCALE), 0, 1);
        // position node either on surface or expanded based on focused state — simple implementation: keep on surface
        const theta = (ni / Math.max(1, tier.achievements.length)) * Math.PI * 2 + (ti * 0.4);
        const phi = Math.PI * 0.45 + ni * 0.02;
        const pos = pointOnSphere(p.position, p.radius * 0.86, theta, phi);
        sprite.position.copy(pos);
        // face camera (sprite) - Three.js handles it
        // fade based on showFactor
        sprite.material.opacity = showFactor;
        sprite.visible = showFactor > 0.05;
        // we will manage _holo opacity on sprite.userData for hover effect (not shown here)
      });
    });
  });

  renderer.render(scene, camera);
}

// Helper to compute an approximate camera "scale" relative to scene (not exactly camera.scale like 2D)
function computeCameraScaleEquivalent() {
  // approximate scale = initialDistance / currentDistance
  const init = CONFIG.INITIAL_CAMERA_Z;
  const cur = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
  return init / Math.max(1, cur);
}

// -------------------- Resize --------------------
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// -------------------- Boot --------------------
init().catch(err => console.error(err));
