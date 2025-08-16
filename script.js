/* script.js
   - Glowing gradient connectors (brighter towards destination)
   - Cached backgrounds (stars, orbit rings, vanishing point)
   - 5 core planets, 4 outer tiers each (20 tier planets total) deterministically placed
   - Nodes placed on planet surfaces with labels
   - Lock-on zoom behavior and scroll behavior reworked
   - Title card (minecraft-like) with placeholder icon
*/

/* CONFIG - tweak sizes / spacing here */
const CONFIG = {
  PLANET_COUNT: 5,
  TIERS_PER_PLANET: 5,            // includes tier 0 (core) + 4 outer = 20 tier planets total
  CORE_RADIUS: 520,
  TIER_BASE_OFFSET: 160,
  TIER_SPACING: 160,
  CORE_VISUAL: 420,
  TIER_VISUAL: 120,
  NODE_ICON: 22,
  NODE_LABEL_OFFSET: 28,
  NODE_MIN_RF: 0.35,
  NODE_MAX_RF: 0.85,
  ZOOM_FILL_PCT: 0.66,
  INITIAL_SCALE: 0.38,
  STAR_COUNT: 140,
  GLOW_THICKNESS: 3,
  LOCK_SCALE_THRESHOLD: 2.6, // if camera scale > this, lock-on behavior can be applied
  UNLOCK_SCALE_THRESHOLD: 1.2, // if below this, camera unlocks and recenters
};

/* Canvas setup */
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

/* UI elements */
const themeColorEl = document.getElementById('themeColor');
const monoToggle = document.getElementById('monoToggle');
const debugToggle = document.getElementById('debugToggle');
const resetBtn = document.getElementById('resetView');

const titleCard = document.getElementById('titleCard');
const cardIcon = document.getElementById('cardIcon');
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

/* Assets list */
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
    img.onerror = () => { console.warn('Image failed to load:', src); res(null); };
  });
}

/* Build a tiny atlas for icons */
async function buildAtlas() {
  const keys = ['node','lock','pulse','junction','hologram','completedTier'];
  const imgs = await Promise.all(keys.map(k => loadImage(ASSETS[k])));
  const cell = 128, cols = 3;
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
  const meta = atlas.map[key];
  if (!atlas.canvas || !meta) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(x,y,size/2,0,Math.PI*2); ctx.fill(); ctx.restore();
    return;
  }
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.drawImage(atlas.canvas, meta.x, meta.y, meta.w, meta.h, x - size/2, y - size/2, size, size);
  ctx.restore();
}

/* Background caches */
let starCache = null;
function buildStarCache() {
  starCache = document.createElement('canvas');
  starCache.width = Math.floor(W * DPR);
  starCache.height = Math.floor(H * DPR);
  const s = starCache.getContext('2d'); s.scale(DPR, DPR);
  s.fillStyle = '#000'; s.fillRect(0,0,W,H);
  for (let i=0;i<CONFIG.STAR_COUNT;i++){
    const x = Math.random()*W, y = Math.random()*H, r = Math.random()*1.6+0.2;
    s.fillStyle = `rgba(255,255,255,${0.18 + Math.random()*0.72})`;
    s.fillRect(x,y,r,r);
  }
}
let orbitCache = null;
function buildOrbitCache(maxR) {
  orbitCache = document.createElement('canvas');
  orbitCache.width = Math.floor(W * DPR);
  orbitCache.height = Math.floor(H * DPR);
  const oc = orbitCache.getContext('2d'); oc.scale(DPR, DPR);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
  oc.strokeStyle = accent; oc.globalAlpha = 0.06; oc.lineWidth = 1;
  // draw multiple rings that get perspective blur (simple)
  for (let r = 80; r < maxR; r += CONFIG.TIER_SPACING/2) {
    oc.beginPath(); oc.arc(W/2, H/2, r, 0, Math.PI*2); oc.stroke();
  }
  // vanishing point marker (subtle)
  const g = oc.createRadialGradient(W/2, H/2, 0, W/2, H/2, 300);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  oc.fillStyle = g; oc.beginPath(); oc.arc(W/2, H/2, 300, 0, Math.PI*2); oc.fill();
}

/* Load data (achievements.json or demo) */
let achievements = { planets: [] };
async function loadData() {
  try {
    const res = await fetch('./achievements.json');
    achievements = await res.json();
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
    console.warn('achievements.json missing — building demo', e);
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

/* Deterministic angle generator */
function deterministicAngle(planetIndex, tierIndex, nodeIndex) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const step = ((planetIndex * 7) + (tierIndex * 11) + (nodeIndex * 13)) % 1000;
  return (step * golden) % (Math.PI*2);
}

/* Layout: 5 core planets, each 5 tiers (first is core). Nodes on surface of each tier */
let layout = { planets: [] };
function buildLayout() {
  layout.planets = [];
  for (let i=0;i<CONFIG.PLANET_COUNT;i++){
    const angle = i * (Math.PI*2 / CONFIG.PLANET_COUNT) - Math.PI/2;
    const px = Math.cos(angle) * CONFIG.CORE_RADIUS;
    const py = Math.sin(angle) * CONFIG.CORE_RADIUS;
    const pdata = achievements.planets[i] || { planetName: `Planet ${i+1}`, tiers: [] };
    const planet = { index:i, x:px, y:py, angle, data: pdata, tiers: [] };
    for (let t=0;t<CONFIG.TIERS_PER_PLANET;t++){
      const dist = (t===0) ? 0 : (CONFIG.TIER_BASE_OFFSET + (t-1) * CONFIG.TIER_SPACING);
      const tx = px + Math.cos(angle) * dist;
      const ty = py + Math.sin(angle) * dist;
      const tdata = pdata.tiers[t] || { tierName: `Tier ${t+1}`, achievements: [] };
      const tier = { index:t, x:tx, y:ty, data: tdata, achievements: [] };
      const count = tdata.achievements.length || 0;
      const pr = (t===0)? (CONFIG.CORE_VISUAL/2) : (CONFIG.TIER_VISUAL/2);
      for (let n=0;n<count;n++){
        const ang = deterministicAngle(i,t,n);
        const rmin = CONFIG.NODE_MIN_RF * pr, rmax = CONFIG.NODE_MAX_RF * pr;
        const rfrac = 0.35 + ((n*37 + t*13 + i*19) % 100)/100 * 0.6;
        const nr = rmin + (rmax - rmin) * (rfrac - 0.35) / 0.6;
        const nx = tx + Math.cos(ang) * nr;
        const ny = ty + Math.sin(ang) * nr;
        tier.achievements.push({ data: tdata.achievements[n], _pos: { x:nx, y:ny, r: CONFIG.NODE_ICON }, _hover: 0 });
      }
      planet.tiers.push(tier);
    }
    layout.planets.push(planet);
  }
}

/* Camera & interaction */
const camera = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
const targetCam = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
let easing = 0.14;
let focused = { planet: null, tier: null };
let hovered = null;
let lockedPlanet = null; // index of planet camera locked to (null if none)

let pointer = { down:false, startX:0, startY:0, moved:false, startTime:0 };
canvas.addEventListener('pointerdown', e => {
  pointer.down = true; pointer.startX = e.clientX; pointer.startY = e.clientY; pointer.moved = false; pointer.startTime = Date.now();
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (pointer.down) {
    const dx = e.clientX - pointer.startX, dy = e.clientY - pointer.startY;
    if (Math.hypot(dx,dy) > 8) pointer.moved = true;
    if (pointer.moved && !lockedPlanet) {
      const worldDx = dx / targetCam.scale, worldDy = dy / targetCam.scale;
      targetCam.x -= worldDx; targetCam.y -= worldDy;
      pointer.startX = e.clientX; pointer.startY = e.clientY;
    }
  } else {
    updateHover(e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointerup', e => {
  canvas.releasePointerCapture?.(e.pointerId);
  if (!pointer.moved && (Date.now() - pointer.startTime) < 400) handleTap(e.clientX, e.clientY);
  pointer.down = false; pointer.moved = false;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  // wheel modifies targetCam.scale; if locked to a planet, zoom around that planet
  const delta = -e.deltaY * 0.0015;
  const newScale = clamp(targetCam.scale + delta, 0.18, 10);
  // if locked, keep camera x/y anchored to locked planet world pos
  if (lockedPlanet !== null) {
    const p = layout.planets[lockedPlanet];
    // set targetCam to keep planet centered
    targetCam.scale = newScale;
    targetCam.x = -p.x;
    targetCam.y = -p.y;
  } else {
    targetCam.scale = newScale;
  }

  // if scale drops below unlock threshold, unlock and recenter on origin
  if (targetCam.scale < CONFIG.UNLOCK_SCALE_THRESHOLD && lockedPlanet !== null) {
    lockedPlanet = null;
    // smooth recenter to 0
    // (we set targetCam.x/y to 0, leaving scale as is)
    targetCam.x = 0; targetCam.y = 0;
  }
}, { passive:false });

/* Screen-world transforms */
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

/* Hover/tap/interaction helpers */
function updateHover(sx, sy) {
  const w = screenToWorld(sx, sy);
  hovered = null;
  outer:
  for (const p of layout.planets) {
    for (const t of p.tiers) {
      for (let i=0;i<t.achievements.length;i++){
        const a = t.achievements[i];
        if (dist(w.x,w.y,a._pos.x,a._pos.y) <= Math.max(12, a._pos.r / camera.scale + 6)) {
          hovered = { type:'achievement', planet: p.index, tier: t.index, ach: i }; break outer;
        }
      }
      if (dist(w.x,w.y,t.x,t.y) < Math.max(18, CONFIG.TIER_VISUAL*0.4)) { hovered = { type:'tier', planet: p.index, tier: t.index }; break outer; }
    }
    if (dist(w.x,w.y,p.x,p.y) < Math.max(36, CONFIG.CORE_VISUAL*0.18)) { hovered = { type:'planet', planet: p.index }; break outer; }
  }

  if (hovered) {
    if (hovered.type === 'achievement') {
      const node = layout.planets[hovered.planet].tiers[hovered.tier].achievements[hovered.ach];
      showTitleForNode(node);
    } else if (hovered.type === 'tier') {
      const t = layout.planets[hovered.planet].tiers[hovered.tier];
      showTitleAtPoint(t.x, t.y, (t.data.tierName||'').toUpperCase(), `${t.data.achievements.length || 0} NODES`);
    } else if (hovered.type === 'planet') {
      const p = layout.planets[hovered.planet];
      showTitleAtPoint(p.x, p.y, (p.data.planetName||'').toUpperCase(), 'CLICK TO FOCUS');
    }
  } else {
    hideTitle();
  }
}

function handleTap(sx, sy) {
  updateHover(sx, sy);
  if (!hovered) { resetView(); return; }
  if (hovered.type === 'achievement') openDetail(hovered);
  else if (hovered.type === 'planet') {
    // click locks to planet (click => lock camera & zoom in)
    const idx = hovered.planet;
    lockToPlanet(idx);
    zoomToPlanet(idx);
  }
  else if (hovered.type === 'tier') {
    lockToPlanet(hovered.planet);
    zoomToTier(hovered.planet, hovered.tier);
  }
}

/* Title card (minecraft-like) */
function showTitleForNode(node) {
  const s = worldToScreen(node._pos.x, node._pos.y);
  titleCard.style.left = s.x + 'px';
  titleCard.style.top = (s.y - 46) + 'px';
  cardIcon.textContent = '★'; // placeholder icon (replace later)
  titleCardTitle.textContent = (node.data.title||'').toUpperCase();
  titleCardSubtitle.textContent = (node.data.description||'').slice(0,80);
  titleCard.classList.add('show');
}
function showTitleAtPoint(wx, wy, title, sub='') {
  const s = worldToScreen(wx, wy);
  titleCard.style.left = s.x + 'px';
  titleCard.style.top = (s.y - 46) + 'px';
  cardIcon.textContent = '★';
  titleCardTitle.textContent = title || '';
  titleCardSubtitle.textContent = sub || '';
  titleCard.classList.add('show');
}
function hideTitle() { titleCard.classList.remove('show'); }

/* Detail panel */
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
    if (a) { a.status = 'completed'; a.dateCompleted = (new Date()).toISOString(); localStorage.setItem('progress', JSON.stringify(achievements)); }
  } catch (e) { console.warn('complete failed', e); }
}

/* Lock / zoom helpers */
function lockToPlanet(idx) {
  lockedPlanet = idx;
  const p = layout.planets[idx];
  targetCam.x = -p.x; targetCam.y = -p.y;
}
function unlockCamera() {
  lockedPlanet = null;
}
function zoomToPlanet(idx) {
  const p = layout.planets[idx];
  const smin = Math.min(W, H);
  const req = (smin * CONFIG.ZOOM_FILL_PCT) / CONFIG.CORE_VISUAL;
  targetCam.x = -p.x; targetCam.y = -p.y; targetCam.scale = req * 1.02;
  focused.planet = idx; focused.tier = null;
  hideDetail(); hideTitle();
}
function zoomToTier(pidx, tidx) {
  const t = layout.planets[pidx].tiers[tidx];
  const smin = Math.min(W,H);
  const req = (smin * CONFIG.ZOOM_FILL_PCT) / (CONFIG.TIER_VISUAL * 1.6);
  targetCam.x = -t.x; targetCam.y = -t.y; targetCam.scale = req * 1.08;
  focused.planet = pidx; focused.tier = tidx;
  hideDetail(); hideTitle();
}
function resetView() {
  targetCam.x = 0; targetCam.y = 0; targetCam.scale = CONFIG.INITIAL_SCALE;
  focused.planet = null; focused.tier = null;
  lockedPlanet = null;
  hideDetail(); hideTitle();
}

/* Utility helpers */
function lerp(a,b,t){ return a + (b-a) * t; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

/* ---------- Glowing connector (no pulses) ----------
   Draws a smooth curved path (quadratic) from A->B and paints a gradient
   that gets brighter toward destination. Performance: gradient computed using screen coords,
   stroke applied with multiple passes for a soft glow effect.
*/
function controlPointFor(x1,y1,x2,y2, strength = 0.24) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const distn = Math.hypot(dx,dy);
  const px = -dy / (distn || 1), py = dx / (distn || 1);
  const offset = Math.min(distn * strength, 280);
  return { x: mx + px * offset, y: my + py * offset };
}
function drawGlowingPath(x1,y1,x2,y2, accent) {
  // convert world coords to screen coords for gradient calculation
  const s1 = worldToScreen(x1,y1);
  const s2 = worldToScreen(x2,y2);
  // compute control point in world space, then map to screen
  const cpw = controlPointFor(x1,y1,x2,y2, 0.22);
  const cp = worldToScreen(cpw.x, cpw.y);
  // gradient from source to dest (brighter near dest)
  const g = ctx.createLinearGradient(s1.x, s1.y, s2.x, s2.y);
  // more transparent near source, brighter near destination
  g.addColorStop(0, hexWithAlpha(accent, 0.06));
  g.addColorStop(0.6, hexWithAlpha(accent, 0.35));
  g.addColorStop(1, hexWithAlpha('#ffffff', 0.9));

  // draw thick blur layers (cheap glow)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // draw outer glow (soft)
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = g;
  ctx.lineWidth = CONFIG.GLOW_THICKNESS * 8 * camera.scale / 3;
  ctx.shadowBlur = 24;
  ctx.shadowColor = accent;
  ctx.beginPath();
  ctx.moveTo(s1.x, s1.y);
  ctx.quadraticCurveTo(cp.x, cp.y, s2.x, s2.y);
  ctx.stroke();
  ctx.restore();

  // draw mid glow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = g;
  ctx.lineWidth = CONFIG.GLOW_THICKNESS * 3;
  ctx.beginPath();
  ctx.moveTo(s1.x, s1.y);
  ctx.quadraticCurveTo(cp.x, cp.y, s2.x, s2.y);
  ctx.stroke();
  ctx.restore();

  // crisp core line
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = g;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(s1.x, s1.y);
  ctx.quadraticCurveTo(cp.x, cp.y, s2.x, s2.y);
  ctx.stroke();
  ctx.restore();
}

/* helper: convert hex color to rgba string with alpha */
function hexWithAlpha(hex, alpha) {
  // accept #rrggbb or rgba pass-through
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex.replace('rgb','rgba').replace(')',`, ${alpha})`);
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------- Main render loop ---------- */
let anim = 0;
function draw() {
  anim += 1/60;
  // camera smoothing
  camera.x = lerp(camera.x, targetCam.x, easing);
  camera.y = lerp(camera.y, targetCam.y, easing);
  camera.scale = lerp(camera.scale, targetCam.scale, easing);

  // if lockedPlanet is set, keep targetCam centered to it (enforce)
  if (lockedPlanet !== null) {
    const p = layout.planets[lockedPlanet];
    targetCam.x = -p.x; targetCam.y = -p.y;
  }

  // draw background (cached star + orbit)
  ctx.clearRect(0,0,W,H);
  if (starCache) ctx.drawImage(starCache, 0, 0, W, H);
  if (orbitCache) ctx.drawImage(orbitCache, 0, 0, W, H);

  // draw vanishing center glow (subtle)
  const centerAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
  ctx.save();
  const cg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H) * 0.45);
  cg.addColorStop(0, hexWithAlpha(centerAccent, 0.06));
  cg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cg; ctx.fillRect(0,0,W,H);
  ctx.restore();

  // world transform
  ctx.save();
  ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';

  // iterate planets and draw connectors (glow), planets, tiers, nodes
  for (const p of layout.planets) {
    // draw core planet
    if (IMG.planet) ctx.drawImage(IMG.planet, p.x - CONFIG.CORE_VISUAL/2, p.y - CONFIG.CORE_VISUAL/2, CONFIG.CORE_VISUAL, CONFIG.CORE_VISUAL);
    else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(p.x,p.y, CONFIG.CORE_VISUAL/2, 0, Math.PI*2); ctx.fill(); }

    // planet label
    ctx.save(); ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Electrolize, Arial'; ctx.textAlign = 'center';
    ctx.fillText((p.data.planetName||'').toUpperCase(), p.x, p.y + CONFIG.CORE_VISUAL/2 + 18 / camera.scale); ctx.restore();

    // draw tiers and connectors
    for (const t of p.tiers) {
      // draw glowing path from p->t using gradient brighter toward t
      drawGlowingPath(p.x, p.y, t.x, t.y, accent);

      // draw tier planet
      const size = CONFIG.TIER_VISUAL;
      const tierKey = t.index === 0 ? 'planet' : `tier${Math.min(5, t.index+1)}`;
      if (t.index === 0 && IMG.planet) ctx.drawImage(IMG.planet, t.x - size/2, t.y - size/2, size, size);
      else if (IMG[tierKey]) ctx.drawImage(IMG[tierKey], t.x - size/2, t.y - size/2, size, size);
      else if (IMG.planet) ctx.drawImage(IMG.planet, t.x - size/2, t.y - size/2, size, size);
      else { ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(t.x,t.y,size/2,0,Math.PI*2); ctx.fill(); }

      // junction (floating)
      const jx = t.x + (t.x - p.x) * 0.12;
      const jy = t.y + (t.y - p.y) * 0.12;
      drawAtlas('junction', jx, jy, 20, 1);

      // tier label
      ctx.save(); ctx.fillStyle = '#fff'; ctx.font='11px Electrolize, Arial'; ctx.textAlign='center';
      ctx.fillText((t.data.tierName||`Tier ${t.index+1}`).toUpperCase(), t.x, t.y - size/2 - 8); ctx.restore();

      // nodes ON surface: draw hologram under node then icon and label
      for (let ni=0; ni<t.achievements.length; ni++) {
        const node = t.achievements[ni];
        // hologram under node: alpha = node._hover
        drawAtlas('hologram', node._pos.x, node._pos.y, Math.max(36, node._pos.r * 2.4), node._hover || 0);
        // node icon
        const key = node.data.status === 'locked' ? 'lock' : 'node';
        drawAtlas(key, node._pos.x, node._pos.y, CONFIG.NODE_ICON, 1);
        // label (visible on larger zooms)
        if (camera.scale > 1.05 || window.innerWidth > 700) {
          ctx.save(); ctx.fillStyle = '#fff'; ctx.font = '11px Electrolize, Arial'; ctx.textAlign = 'left';
          ctx.fillText((node.data.title||'').toUpperCase(), node._pos.x + CONFIG.NODE_LABEL_OFFSET, node._pos.y + 4); ctx.restore();
        }
      }
    }
  }

  ctx.restore();

  // update hover alpha transitions
  for (const p of layout.planets) for (const t of p.tiers) for (const a of t.achievements) {
    const target = (hovered && hovered.type === 'achievement' && hovered.planet === p.index && hovered.tier === t.index && hovered.ach === t.achievements.indexOf(a)) ? 1 : 0;
    a._hover = lerp(a._hover || 0, target, 0.14);
  }

  // if zoomed-in beyond threshold and not locked, optionally auto-lock to nearest planet (optional)
  // we won't auto-lock; clicking locks. But unlock condition:
  if (lockedPlanet !== null && targetCam.scale < CONFIG.UNLOCK_SCALE_THRESHOLD) {
    lockedPlanet = null;
    // recenter to origin
    targetCam.x = 0; targetCam.y = 0;
  }

  requestAnimationFrame(draw);
}

/* ---------- Init flow ---------- */
async function init() {
  document.documentElement.style.setProperty('--accent', (themeColorEl?.value) || '#00c8ff');

  // preload visual assets used often
  IMG.center = await loadImage(ASSETS.center);
  IMG.planet = await loadImage(ASSETS.planet);
  IMG.planethover = await loadImage(ASSETS.planethover);
  IMG.tier2 = await loadImage(ASSETS.tier2);
  IMG.tier3 = await loadImage(ASSETS.tier3);
  IMG.tier4 = await loadImage(ASSETS.tier4);
  IMG.tier5 = await loadImage(ASSETS.tier5);

  await buildAtlas();
  buildStarCache();
  buildOrbitCache(Math.max(W,H) * 0.95);
  await loadData();
  buildLayout();

  camera.x = targetCam.x = 0; camera.y = targetCam.y = 0; camera.scale = targetCam.scale = CONFIG.INITIAL_SCALE;

  requestAnimationFrame(draw);
}
init().catch(e => console.error('Init failed', e));

/* ---------- Small admin helpers (kept) ---------- */
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

/* End of script.js */
