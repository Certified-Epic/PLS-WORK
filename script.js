/* script.js
   Reworked so nodes lie on planet surfaces, stronger zoom, deterministic layout,
   spread-out planets/tiers, mobile-friendly pointer handling (tap vs drag),
   hologram drawn under node, title card above hologram.

   Tweak the CONFIG block near the top to tune spacing and zoom levels.
*/

/* ------------- CONFIG ------------- */
const CONFIG = {
  PLANET_COUNT: 5,
  TIERS_PER_PLANET: 5,           // tier 0 = core (on-planet), 1..4 outward
  CORE_RADIUS: 520,              // spread the core planets further out
  TIER_BASE_OFFSET: 160,         // how far tier 1 is from core planet center
  TIER_SPACING: 160,             // distance between subsequent tiers (increase for more spread)
  CORE_PLANET_VISUAL: 420,       // larger visual planet for the core when zoomed
  TIER_VISUAL: 120,              // size for tier planets
  NODE_ICON: 22,                 // size of node icon
  NODE_LABEL_OFFSET: 28,         // label offset from node
  NODE_MIN_RADIUS_FACTOR: 0.35,  // min fraction of planet radius for node placement
  NODE_MAX_RADIUS_FACTOR: 0.85,  // max fraction
  ZOOM_FILL_PERCENT: 0.66,       // when zooming planet should fill ~66% of screen
  INITIAL_SCALE: 0.38,           // slightly more zoomed out initially
  STAR_COUNT: 140,
  PULSE_SPEED: 0.18
};

/* ------------- Canvas setup ------------- */
const canvas = document.getElementById('starChart');
const ctx = canvas.getContext('2d', { alpha: true });
let DPR = Math.max(1, window.devicePixelRatio || 1);
let W = 0, H = 0;
function resize() {
  DPR = Math.max(1, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/* ------------- UI refs ------------- */
const themeColorEl = document.getElementById('themeColor');
const monoToggle = document.getElementById('monoToggle');
const debugToggle = document.getElementById('debugToggle');
const resetBtn = document.getElementById('resetView');

const titleCard = document.getElementById('titleCard');
const titleCardTitle = document.getElementById('titleCardTitle');
const titleCardSubtitle = document.getElementById('titleCardSubtitle');

const detailPanel = document.getElementById('detailPanel');
const detailTitle = document.getElementById('detailTitle');
const detailDesc = document.getElementById('detailDesc');
const detailClose = document.getElementById('detailClose');
const completeBtn = document.getElementById('completeBtn');

themeColorEl?.addEventListener('input', e => document.documentElement.style.setProperty('--accent', e.target.value));
monoToggle?.addEventListener('change', e => document.documentElement.style.setProperty('--mono', e.target.checked ? 1 : 0));
resetBtn?.addEventListener('click', () => resetView());
detailClose?.addEventListener('click', () => hideDetail());
completeBtn?.addEventListener('click', () => { if (currentDetail) completeAchievement(currentDetail); hideDetail(); });

/* ------------- Assets & atlas ------------- */
const ASSETS = {
  center: 'assets/center.png',
  planet: 'assets/planet.png',
  planethover: 'assets/planethover.png',
  tier2: 'assets/tier2.png',
  tier3: 'assets/tier3.png',
  tier4: 'assets/tier4.png',
  tier5: 'assets/tier5.png',
  node: 'assets/node.png',
  lock: 'assets/lock.png',
  pulse: 'assets/pulse.png',
  junction: 'assets/junction.png',
  hologram: 'assets/achievementnodehologram.png',
  completedTier: 'assets/completedplanettier.png'
};
const IMG = {};
const atlas = { canvas: null, ctx: null, map: {} };

function loadImage(src) {
  return new Promise(res => {
    const img = new Image();
    img.src = src;
    img.onload = () => res(img);
    img.onerror = () => { console.warn('Failed image', src); res(null); };
  });
}

async function buildAtlas() {
  const keys = ['node','lock','pulse','junction','hologram','completedTier'];
  const imgs = await Promise.all(keys.map(k => loadImage(ASSETS[k])));
  const cell = 128; const cols = 3;
  atlas.canvas = document.createElement('canvas');
  atlas.canvas.width = cell * cols;
  atlas.canvas.height = cell * Math.ceil(keys.length / cols);
  atlas.ctx = atlas.canvas.getContext('2d');
  keys.forEach((k,i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * cell, y = row * cell;
    if (imgs[i]) atlas.ctx.drawImage(imgs[i], x, y, cell, cell);
    atlas.map[k] = { x, y, w: cell, h: cell, ok: !!imgs[i] };
  });
}
function drawAtlas(key, x, y, size, alpha = 1) {
  if (!atlas.canvas || !atlas.map[key]) { ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(x, y, size/2, 0, Math.PI*2); ctx.fill(); ctx.restore(); return; }
  const m = atlas.map[key];
  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(atlas.canvas, m.x, m.y, m.w, m.h, x - size/2, y - size/2, size, size); ctx.restore();
}

/* ------------- Background caches ------------- */
let starCache = null;
function buildStarCache() {
  starCache = document.createElement('canvas');
  starCache.width = Math.floor(W * DPR);
  starCache.height = Math.floor(H * DPR);
  const s = starCache.getContext('2d'); s.scale(DPR,DPR);
  s.fillStyle = '#000'; s.fillRect(0,0,W,H);
  for (let i=0;i<CONFIG.STAR_COUNT;i++){
    const x = Math.random()*W, y = Math.random()*H, r = Math.random()*1.6 + 0.2;
    s.fillStyle = `rgba(255,255,255,${0.2 + Math.random()*0.8})`;
    s.fillRect(x,y,r,r);
  }
}
let orbitCache = null;
function buildOrbitCache(maxR) {
  orbitCache = document.createElement('canvas');
  orbitCache.width = Math.floor(W * DPR);
  orbitCache.height = Math.floor(H * DPR);
  const oc = orbitCache.getContext('2d'); oc.scale(DPR,DPR);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
  oc.strokeStyle = accent; oc.globalAlpha = 0.05; oc.lineWidth = 1;
  for (let r=80; r<maxR; r+=40) { oc.beginPath(); oc.arc(W/2, H/2, r, 0, Math.PI*2); oc.stroke(); }
}

/* ------------- Data load ------------- */
let achievements = { planets: [] };
async function loadData() {
  try {
    const r = await fetch('./achievements.json'); achievements = await r.json();
    const saved = localStorage.getItem('progress');
    if (saved) {
      const prog = JSON.parse(saved);
      prog.planets?.forEach((p,i) => p.tiers?.forEach((t,j) => t.achievements?.forEach((a,k) => {
        if (achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]) {
          achievements.planets[i].tiers[j].achievements[k].status = a.status;
          achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
        }
      })));
    }
  } catch (e) {
    console.warn('achievements.json missing - building demo', e);
    achievements = { planets: Array.from({length:CONFIG.PLANET_COUNT}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`,
      tiers: Array.from({length:CONFIG.TIERS_PER_PLANET}).map((__,ti)=>({
        tierName: `Tier ${ti+1}`,
        achievements: Array.from({length:6}).map((___,ai)=>({
          title: `ACH ${pi+1}-${ti+1}-${ai+1}`,
          description: `How to get ACH ${pi+1}-${ti+1}-${ai+1}`,
          status: ti===0 ? 'available' : 'locked',
          dateCompleted: null
        }))
      }))
    }))};
  }
}

/* ------------- Deterministic angle generator (no runtime randomness) ------------- */
function deterministicAngle(planetIndex, tierIndex, nodeIndex) {
  // Golden angle distribution for even spread
  const golden = Math.PI * (3 - Math.sqrt(5)); // ~2.3999
  // combine indices into a step for determinism
  const step = ((planetIndex * 7) + (tierIndex * 11) + (nodeIndex * 13)) % 1000;
  return (step * golden) % (Math.PI*2);
}

/* ------------- Layout: deterministic positions and on-surface node placement ------------- */
let layout = { planets: [] };
function buildLayout() {
  layout.planets = [];
  const total = CONFIG.PLANET_COUNT;
  for (let i=0;i<total;i++){
    const angle = i * (Math.PI*2 / total) - Math.PI/2; // evenly spaced
    const px = Math.cos(angle) * CONFIG.CORE_RADIUS;
    const py = Math.sin(angle) * CONFIG.CORE_RADIUS;
    const pdata = achievements.planets[i] || { planetName: `Planet ${i+1}`, tiers: [] };
    const planet = { index: i, x: px, y: py, angle, data: pdata, tiers: [] };

    // tiers: deterministic radial placement (tier0 = core center)
    for (let t=0;t<CONFIG.TIERS_PER_PLANET;t++){
      const dist = (t===0) ? 0 : (CONFIG.TIER_BASE_OFFSET + (t-1) * CONFIG.TIER_SPACING);
      const tx = px + Math.cos(angle) * dist;
      const ty = py + Math.sin(angle) * dist;
      const tdata = pdata.tiers[t] || { tierName:`Tier ${t+1}`, achievements: [] };
      const tier = { index: t, x: tx, y: ty, data: tdata, achievements: [] };

      // nodes: place on the planet/tier surface (not a surrounding circle)
      const count = tdata.achievements.length || 0;
      const planetRadius = (t===0) ? (CONFIG.CORE_PLANET_VISUAL/2) : (CONFIG.TIER_VISUAL/2);
      for (let n=0;n<count;n++){
        const ang = deterministicAngle(i, t, n);
        // radius relative to planet radius (spread across surface)
        const rmin = CONFIG.NODE_MIN_RADIUS_FACTOR * planetRadius;
        const rmax = CONFIG.NODE_MAX_RADIUS_FACTOR * planetRadius;
        // deterministic pseudo-random radius by using node index
        const rfrac = 0.35 + ((n * 37 + t * 13 + i * 19) % 100) / 100 * 0.6; // 0.35 .. 0.95
        const nr = rmin + (rmax - rmin) * (rfrac - 0.35) / 0.6;
        const nx = tx + Math.cos(ang) * nr;
        const ny = ty + Math.sin(ang) * nr;
        tier.achievements.push({ data: tdata.achievements[n], _pos: { x: nx, y: ny, r: CONFIG.NODE_ICON }, _hover: 0 });
      }
      planet.tiers.push(tier);
    }
    layout.planets.push(planet);
  }
}

/* ------------- Camera + interactions ------------- */
const camera = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
const targetCam = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
let easing = 0.14;
let focused = { planet: null, tier: null };
let hovered = null;

/* pointer/tap handling */
let pointer = { down:false, startX:0, startY:0, moved:false, startTime:0 };
canvas.addEventListener('pointerdown', e => {
  pointer.down = true; pointer.startX = e.clientX; pointer.startY = e.clientY; pointer.moved = false; pointer.startTime = Date.now();
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (pointer.down) {
    const dx = e.clientX - pointer.startX, dy = e.clientY - pointer.startY;
    if (Math.hypot(dx,dy) > 8) pointer.moved = true;
    // panning (drag)
    if (pointer.moved) {
      const worldDx = dx / targetCam.scale;
      const worldDy = dy / targetCam.scale;
      targetCam.x -= worldDx; // subtract because we moved screen right -> camera should move left
      targetCam.y -= worldDy;
      pointer.startX = e.clientX; pointer.startY = e.clientY;
    }
  } else {
    updateHover(e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointerup', e => {
  canvas.releasePointerCapture?.(e.pointerId);
  if (!pointer.moved && (Date.now() - pointer.startTime) < 400) {
    // treat as tap
    handleTap(e.clientX, e.clientY);
  }
  pointer.down = false; pointer.moved = false;
});
canvas.addEventListener('wheel', e => { e.preventDefault(); targetCam.scale = clamp(targetCam.scale - e.deltaY * 0.0015, 0.18, 10); }, { passive:false });

/* transforms */
function screenToWorld(sx, sy) {
  const cx = W/2 + camera.x * camera.scale;
  const cy = H/2 + camera.y * camera.scale;
  return { x: (sx - cx) / camera.scale, y: (sy - cy) / camera.scale };
}
function worldToScreen(wx, wy) {
  const cx = W/2 + camera.x * camera.scale;
  const cy = H/2 + camera.y * camera.scale;
  return { x: cx + wx * camera.scale, y: cy + wy * camera.scale };
}

/* ------------- Hover & Tap actions ------------- */
function updateHover(screenX, screenY) {
  const w = screenToWorld(screenX, screenY);
  hovered = null;
  // check achievements first (so nodes get priority)
  for (const p of layout.planets) {
    for (const t of p.tiers) {
      for (let i=0;i<t.achievements.length;i++){
        const a = t.achievements[i];
        if (dist(w.x,w.y,a._pos.x,a._pos.y) <= Math.max(12, a._pos.r / camera.scale + 6)) {
          hovered = { type:'achievement', planet: p.index, tier: t.index, ach: i };
          break;
        }
      }
      if (hovered) break;
      // tier center
      if (dist(w.x,w.y,t.x,t.y) < Math.max(18, CONFIG.TIER_VISUAL*0.4)) { hovered = { type:'tier', planet: p.index, tier: t.index }; break; }
    }
    if (hovered) break;
    // planet center (core)
    if (dist(w.x,w.y,p.x,p.y) < Math.max(36, CONFIG.CORE_PLANET_VISUAL*0.18)) { hovered = { type:'planet', planet: p.index }; break; }
  }

  // update UI
  if (hovered) {
    if (hovered.type === 'achievement') {
      const node = layout.planets[hovered.planet].t iers[hovered.tier].achievements[hovered.ach];
      // show title anchored to that node
      showTitleForNode(node);
    } else if (hovered.type === 'tier') {
      const t = layout.planets[hovered.planet].tiers[hovered.tier];
      showTitleAtPoint(t.x, t.y, (t.data.tierName||'').toUpperCase(), `${t.data.achievements.length || 0} NODES`);
    } else if (hovered.type === 'planet') {
      const p = layout.planets[hovered.planet];
      showTitleAtPoint(p.x, p.y, (p.data.planetName||'').toUpperCase(), 'CLICK TO ZOOM');
    }
  } else {
    hideTitle();
  }
}

function handleTap(screenX, screenY) {
  // if hovered, act on hovered; otherwise detect by coordinates
  updateHover(screenX, screenY);
  if (!hovered) { resetView(); return; }
  if (hovered.type === 'achievement') openDetail(hovered);
  else if (hovered.type === 'planet') zoomToPlanet(hovered.planet);
  else if (hovered.type === 'tier') zoomToTier(hovered.planet, hovered.tier);
}

/* ------------- Title card helpers ------------- */
function showTitleForNode(node) {
  const s = worldToScreen(node._pos.x, node._pos.y);
  titleCard.style.left = s.x + 'px';
  titleCard.style.top = (s.y - 40) + 'px';
  titleCardTitle.textContent = (node.data.title || '').toUpperCase();
  titleCardSubtitle.textContent = (node.data.description || '').slice(0, 80);
  titleCard.classList.add('show');
}
function showTitleAtPoint(wx, wy, title, sub='') {
  const s = worldToScreen(wx, wy);
  titleCard.style.left = s.x + 'px';
  titleCard.style.top = (s.y - 40) + 'px';
  titleCardTitle.textContent = title || '';
  titleCardSubtitle.textContent = sub || '';
  titleCard.classList.add('show');
}
function hideTitle() { titleCard.classList.remove('show'); }

/* ------------- Detail panel ------------- */
let currentDetail = null;
function openDetail(h) {
  const a = layout.planets[h.planet].tiers[h.tier].achievements[h.ach];
  if (!a) return;
  currentDetail = { planet: h.planet, tier: h.tier, ach: h.ach };
  detailTitle.textContent = (a.data.title||'').toUpperCase();
  detailDesc.textContent = a.data.description || '';
  detailPanel.classList.add('show');
}
function hideDetail() { detailPanel.classList.remove('show'); currentDetail = null; }
function completeAchievement(detail) {
  try {
    const a = achievements.planets[detail.planet].tiers[detail.tier].achievements[detail.ach];
    a.status = 'completed'; a.dateCompleted = (new Date()).toISOString();
    localStorage.setItem('progress', JSON.stringify(achievements));
  } catch(e) { console.warn('complete failed', e); }
}

/* ------------- Zoom helpers ------------- */
function zoomToPlanet(index) {
  const p = layout.planets[index];
  const screenMin = Math.min(W,H);
  const requiredScale = (screenMin * CONFIG.ZOOM_FILL_PERCENT) / CONFIG.CORE_PLANET_VISUAL;
  targetCam.x = -p.x; targetCam.y = -p.y; targetCam.scale = requiredScale * 1.05; // small boost
  focused.planet = index; focused.tier = null;
  hideDetail(); hideTitle();
}
function zoomToTier(pIndex, tIndex) {
  const t = layout.planets[pIndex].tiers[tIndex];
  const screenMin = Math.min(W,H);
  const requiredScale = (screenMin * CONFIG.ZOOM_FILL_PERCENT) / (CONFIG.TIER_VISUAL * 1.6);
  targetCam.x = -t.x; targetCam.y = -t.y; targetCam.scale = requiredScale * 1.2;
  focused.planet = pIndex; focused.tier = tIndex;
  hideDetail(); hideTitle();
}
function resetView() { targetCam.x = 0; targetCam.y = 0; targetCam.scale = CONFIG.INITIAL_SCALE; focused.planet = null; focused.tier = null; hideDetail(); hideTitle(); }

/* ------------- Drawing utilities ------------- */
function lerp(a,b,t){ return a + (b-a) * t; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

function drawGlowingConnector(x1,y1,x2,y2, accent, prog) {
  // faint stroke
  ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = accent; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.restore();
  // glow stroke
  ctx.save(); ctx.lineWidth = 2.8; ctx.strokeStyle = accent; ctx.shadowBlur = 10; ctx.shadowColor = accent; ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); ctx.restore();
  // pulse
  const px = x1 + (x2 - x1) * prog, py = y1 + (y2 - y1) * prog;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = accent; ctx.shadowBlur = 18; ctx.shadowColor = accent; ctx.globalAlpha = 0.92; ctx.beginPath(); ctx.arc(px, py, 6 + Math.sin(perfTime*6)*1.2, 0, Math.PI*2); ctx.fill(); ctx.restore();
}

let perfTime = 0;

/* ------------- Main draw loop ------------- */
let animTime = 0;
function draw() {
  animTime += 1/60;
  perfTime = animTime;
  // smooth camera
  camera.x = lerp(camera.x, targetCam.x, easing);
  camera.y = lerp(camera.y, targetCam.y, easing);
  camera.scale = lerp(camera.scale, targetCam.scale, easing);

  // background
  ctx.clearRect(0,0,W,H);
  if (starCache) ctx.drawImage(starCache, 0, 0, W, H);

  // world transform
  ctx.save();
  ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // draw orbit cache (screen space)
  if (orbitCache) {
    ctx.setTransform(1,0,0,1,0,0);
    ctx.drawImage(orbitCache, 0, 0, W*DPR, H*DPR, 0, 0, W, H);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
    ctx.scale(camera.scale, camera.scale);
  }

  // center image
  if (IMG.center) ctx.drawImage(IMG.center, -130, -130, 260, 260);

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';

  // planets & tiers
  for (const p of layout.planets) {
    // draw core planet (tier 0)
    const coreSize = CONFIG.CORE_PLANET_VISUAL;
    if (IMG.planet) ctx.drawImage(IMG.planet, p.x - coreSize/2, p.y - coreSize/2, coreSize, coreSize);
    else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(p.x,p.y,coreSize/2,0,Math.PI*2); ctx.fill(); }

    // label
    ctx.save(); ctx.fillStyle = '#fff'; ctx.font='bold 14px Electrolize, Arial'; ctx.textAlign = 'center'; ctx.fillText((p.data.planetName||'').toUpperCase(), p.x, p.y + coreSize/2 + 18 / camera.scale); ctx.restore();

    // tiers connectors + pulses + tier planet draw
    for (const t of p.tiers) {
      // connector progress
      const prog = (animTime * (CONFIG.PULSE_SPEED + (t.index * 0.02))) % 1;
      drawGlowingConnector(p.x, p.y, t.x, t.y, accent, prog);

      // draw tier planet (choose tier image if available)
      const tierSize = CONFIG.TIER_VISUAL;
      const tierKey = t.index === 0 ? 'planet' : `tier${Math.min(5, t.index+1)}`; // tier2..tier5 keys
      if (t.index === 0 && IMG.planet) ctx.drawImage(IMG.planet, t.x - tierSize/2, t.y - tierSize/2, tierSize, tierSize);
      else if (IMG[tierKey]) ctx.drawImage(IMG[tierKey], t.x - tierSize/2, t.y - tierSize/2, tierSize, tierSize);
      else if (IMG.planet) ctx.drawImage(IMG.planet, t.x - tierSize/2, t.y - tierSize/2, tierSize, tierSize);
      else { ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(t.x,t.y,tierSize/2,0,Math.PI*2); ctx.fill(); }

      // junction always visible (floating)
      const jx = t.x + (t.x - p.x) * 0.12;
      const jy = t.y + (t.y - p.y) * 0.12;
      drawAtlas('junction', jx, jy, 20, 1);

      // tier label
      ctx.save(); ctx.fillStyle = '#fff'; ctx.font='11px Electrolize, Arial'; ctx.textAlign='center'; ctx.fillText((t.data.tierName||`Tier ${t.index+1}`).toUpperCase(), t.x, t.y - tierSize/2 - 8); ctx.restore();

      // nodes drawn ON planet surface: hologram (under), node icon (on top), label nearby
      for (let ni=0; ni<t.achievements.length; ni++){
        const node = t.achievements[ni];
        // draw hologram under node with alpha
        drawAtlas('hologram', node._pos.x, node._pos.y, Math.max(36, node._pos.r*2.4), node._hover || 0);

        // node icon
        const key = (node.data.status === 'locked') ? 'lock' : 'node';
        drawAtlas(key, node._pos.x, node._pos.y, CONFIG.NODE_ICON, 1);

        // label (if zoomed enough or always show small)
        const showLabel = camera.scale > 1.1 || (window.innerWidth > 700);
        if (showLabel) {
          ctx.save(); ctx.fillStyle = '#fff'; ctx.font = '11px Electrolize, Arial'; ctx.textAlign = 'left';
          ctx.fillText((node.data.title||'').toUpperCase(), node._pos.x + CONFIG.NODE_LABEL_OFFSET, node._pos.y + 4);
          ctx.restore();
        }
      }
    }
  }

  ctx.restore();

  // hologram hover alpha transitions
  for (const p of layout.planets) for (const t of p.tiers) for (const a of t.achievements) {
    const target = (hovered && hovered.type === 'achievement' && hovered.planet === p.index && hovered.tier === t.index && hovered.ach === t.achievements.indexOf(a)) ? 1 : 0;
    a._hover = lerp(a._hover || 0, target, 0.14);
  }

  requestAnimationFrame(draw);
}

/* ------------- Init (load assets, build caches, layout) ------------- */
async function init() {
  document.documentElement.style.setProperty('--accent', (themeColorEl?.value) || '#00c8ff');

  // preload images used often
  IMG.center = await loadImage(ASSETS.center);
  IMG.planet = await loadImage(ASSETS.planet);
  IMG.planethover = await loadImage(ASSETS.planethover);
  IMG.tier2 = await loadImage(ASSETS.tier2);
  IMG.tier3 = await loadImage(ASSETS.tier3);
  IMG.tier4 = await loadImage(ASSETS.tier4);
  IMG.tier5 = await loadImage(ASSETS.tier5);

  // build small atlas for icons/hologram
  await buildAtlas();

  // caches
  buildStarCache();
  buildOrbitCache(Math.max(W, H) * 0.95);

  // data and layout
  await loadData();
  buildLayout();

  // initial camera
  camera.x = targetCam.x = 0; camera.y = targetCam.y = 0; camera.scale = targetCam.scale = CONFIG.INITIAL_SCALE;

  // start draw
  requestAnimationFrame(draw);
}
init().catch(e => console.error('Init error', e));

/* ------------- Utilities & admin helpers ------------- */
function lerp(a,b,t){ return a + (b-a) * t; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function dist(a,b,c,d){ return Math.hypot(a-c, b-d); }

window.loginAdmin = function() {
  const pass = document.getElementById('adminPassword')?.value;
  if (pass === 'admin') {
    let html = '';
    achievements.planets.forEach((p,i) => {
      html += `<h3>${p.planetName}</h3>`;
      p.tiers.forEach((t,j) => {
        html += `<h4>${t.tierName}</h4>`;
        t.achievements.forEach((a,k) => {
          html += `<div style="margin-bottom:6px;"><input style="width:45%;margin-right:6px" value="${(a.title||'')}" onchange="editTitle(${i},${j},${k},this.value)"><input style="width:45%" value="${(a.description||'')}" onchange="editDesc(${i},${j},${k},this.value)"><select onchange="editStatus(${i},${j},${k},this.value)"><option ${a.status==='locked'?'selected':''}>locked</option><option ${a.status==='available'?'selected':''}>available</option><option ${a.status==='completed'?'selected':''}>completed</option></select></div>`;
        });
      });
    });
    document.getElementById('editContent').innerHTML = html;
    document.getElementById('adminPassword').style.display = 'none';
  } else alert('Wrong password');
};
window.editTitle = (i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].title = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editDesc = (i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].description = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editStatus = (i,j,k,v)=>{ achievements.planets[i].tiers[j].achievements[k].status = v; achievements.planets[i].tiers[j].achievements[k].dateCompleted = v==='completed'? new Date().toISOString():null; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.downloadJson = ()=>{ const blob = new Blob([JSON.stringify(achievements,null,2)], { type:'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'achievements.json'; a.click(); };
window.bulkUnlock = ()=>{ achievements.planets.forEach(p=>p.tiers.forEach(t=>t.achievements.forEach(a=>a.status='available'))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All unlocked'); };
window.bulkReset = ()=>{ achievements.planets.forEach(p=>p.tiers.forEach((t,j)=>t.achievements.forEach(a=>{ a.status = j===0? 'available':'locked'; a.dateCompleted = null; }))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All reset'); };

/* End of file */
