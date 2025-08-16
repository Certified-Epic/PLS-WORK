/* script.js — Reworked per your feedback
   - Deterministic layout, nodes on-surface but hidden until zoom/focus
   - Glowing gradient connectors (no pulses) that get brighter toward destination
   - Orbit rings cached around center with a visible vanishing point
   - planethover overlay under planet when hovering (scale animation)
   - achievement hologram under each node, title card larger than hologram
   - junctions placed outside tier planets
   - clicking a planet locks and zooms; wheel zoom behavior respects lock/unlock
   - performance: star/orbit caches; minimal per-frame expensive ops
*/

/* ========== CONFIG ========== */
const CONFIG = {
  PLANET_COUNT: 5,
  TIERS_PER_PLANET: 5,            // includes tier 0 (planet core) + outer tiers
  CORE_RADIUS: 520,
  TIER_BASE_OFFSET: 160,
  TIER_SPACING: 220,              // bigger spacing to avoid overlap
  CORE_VISUAL: 420,               // core planet image visual size
  TIER_VISUAL: 140,               // tier planet visual size
  NODE_ICON: 22,
  NODE_LABEL_OFFSET: 28,
  NODE_MIN_RF: 0.34,
  NODE_MAX_RF: 0.82,
  ZOOM_FILL_PCT: 0.72,            // larger zoom so planet fills more of screen
  INITIAL_SCALE: 0.35,
  STAR_COUNT: 160,
  GLOW_THICKNESS: 3,
  NODE_SHOW_SCALE: 1.1,           // nodes only visible if camera.scale >= this or focused
  LOCK_SCALE_THRESHOLD: 2.5,
  UNLOCK_SCALE_THRESHOLD: 1.1
};

/* ========== Canvas setup ========== */
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

/* ========== UI refs ========== */
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

/* ========== Assets ========== */
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

/* safe loader */
function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn('Image failed to load:', src); resolve(null); };
  });
}

/* small atlas for node/hologram icons */
async function buildAtlas() {
  const keys = ['node','lock','pulse','junction','hologram','completedTier'];
  const imgs = await Promise.all(keys.map(k => loadImage(ASSETS[k])));
  const cell = 128, cols = 3;
  atlas.canvas = document.createElement('canvas');
  atlas.canvas.width = cell * cols;
  atlas.canvas.height = cell * Math.ceil(keys.length / cols);
  atlas.ctx = atlas.canvas.getContext('2d');
  keys.forEach((k,i) => {
    const col = i % cols, row = Math.floor(i/cols);
    const x = col * cell, y = row * cell;
    if (imgs[i]) atlas.ctx.drawImage(imgs[i], x, y, cell, cell);
    atlas.map[k] = { x, y, w: cell, h: cell, ok: !!imgs[i] };
  });
}
function drawAtlas(key, x, y, size, alpha = 1) {
  const meta = atlas.map[key];
  if (!atlas.canvas || !meta) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.arc(x,y,size/2,0,Math.PI*2); ctx.fill(); ctx.restore();
    return;
  }
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.drawImage(atlas.canvas, meta.x, meta.y, meta.w, meta.h, x - size/2, y - size/2, size, size);
  ctx.restore();
}

/* ========== Cached backgrounds ========== */
let starCache = null;
function buildStarCache() {
  starCache = document.createElement('canvas');
  starCache.width = Math.floor(W * DPR);
  starCache.height = Math.floor(H * DPR);
  const s = starCache.getContext('2d');
  s.scale(DPR, DPR);
  s.fillStyle = '#000'; s.fillRect(0,0,W,H);
  for (let i=0;i<CONFIG.STAR_COUNT;i++){
    const x = Math.random()*W, y = Math.random()*H, r = Math.random()*1.6 + 0.2;
    s.fillStyle = `rgba(255,255,255,${0.2 + Math.random()*0.8})`;
    s.fillRect(x, y, r, r);
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
  // rings centered on vanishing point
  for (let r = 80; r < maxR; r += CONFIG.TIER_SPACING/2) {
    oc.beginPath(); oc.arc(W/2, H/2, r, 0, Math.PI*2); oc.stroke();
  }
  // subtle vanishing radial gradient
  const g = oc.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)/1.6);
  g.addColorStop(0, 'rgba(255,255,255,0.04)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  oc.fillStyle = g; oc.beginPath(); oc.arc(W/2, H/2, Math.max(W,H)/1.6, 0, Math.PI*2); oc.fill();
}

/* ========== Data load ========== */
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

/* ========== Deterministic placement helpers ========== */
function goldenAngle(i) {
  return (i * 2.399963229728653) % (Math.PI * 2); // golden angle
}
function deterministicAngle(planetIndex, tierIndex, nodeIndex) {
  const base = goldenAngle(planetIndex * 7 + tierIndex * 13 + nodeIndex * 19);
  return base;
}

/* ========== Layout: deterministic (no overlap), nodes on-surface ========== */
let layout = { planets: [] };
function buildLayout() {
  layout.planets = [];
  for (let i=0;i<CONFIG.PLANET_COUNT;i++){
    const coreAngle = i * (Math.PI*2 / CONFIG.PLANET_COUNT) - Math.PI/2;
    const px = Math.cos(coreAngle) * CONFIG.CORE_RADIUS;
    const py = Math.sin(coreAngle) * CONFIG.CORE_RADIUS;
    const pdata = achievements.planets[i] || { planetName: `Planet ${i+1}`, tiers: [] };
    const planet = { index: i, x: px, y: py, angle: coreAngle, data: pdata, tiers: [] };

    for (let t=0;t<CONFIG.TIERS_PER_PLANET;t++){
      // spread tiers radially but offset angle a bit so they don't align straight outward
      const tierAngle = coreAngle + (t - (CONFIG.TIERS_PER_PLANET-1)/2) * 0.22 + (i * 0.04);
      const dist = (t === 0) ? 0 : (CONFIG.TIER_BASE_OFFSET + (t-1) * CONFIG.TIER_SPACING + i * 12);
      const tx = px + Math.cos(tierAngle) * dist;
      const ty = py + Math.sin(tierAngle) * dist;
      const tdata = pdata.tiers[t] || { tierName: `Tier ${t+1}`, achievements: [] };
      const tier = { index: t, x: tx, y: ty, data: tdata, achievements: [] };

      const planetRadius = (t===0) ? (CONFIG.CORE_VISUAL/2) : (CONFIG.TIER_VISUAL/2);
      const count = tdata.achievements.length || 0;
      // spread nodes evenly around the planet surface using deterministic angles
      for (let n=0;n<count;n++){
        const ang = deterministicAngle(i,t,n) + (n * 0.12);
        const rmin = CONFIG.NODE_MIN_RF * planetRadius;
        const rmax = CONFIG.NODE_MAX_RF * planetRadius;
        const rfrac = 0.35 + ((n * 23 + t*11 + i*17) % 100)/100 * 0.6;
        const nr = rmin + (rmax - rmin) * ((rfrac - 0.35) / 0.6);
        const nx = tx + Math.cos(ang) * nr;
        const ny = ty + Math.sin(ang) * nr;
        tier.achievements.push({ data: tdata.achievements[n], _pos: { x: nx, y: ny, r: CONFIG.NODE_ICON }, _hover: 0 });
      }

      layout.planets[i].tiers.push(tier);
    }

    layout.planets.push(planet);
  }
}

/* ========== Camera and interaction ========== */
const camera = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
const targetCam = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
let easing = 0.12;
let focused = { planet: null, tier: null };
let hovered = null;
let lockedPlanet = null;

let pointer = { down:false, startX:0, startY:0, moved:false, startTime:0 };
canvas.addEventListener('pointerdown', e => {
  pointer.down = true; pointer.startX = e.clientX; pointer.startY = e.clientY; pointer.moved = false; pointer.startTime = Date.now();
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (pointer.down) {
    const dx = e.clientX - pointer.startX, dy = e.clientY - pointer.startY;
    if (Math.hypot(dx,dy) > 8) pointer.moved = true;
    if (pointer.moved && lockedPlanet === null) {
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
  const delta = -e.deltaY * 0.0016;
  const newScale = clamp(targetCam.scale + delta, 0.18, 8.0);

  // if locked to planet keep it centered; otherwise zoom toward cursor
  if (lockedPlanet !== null) {
    targetCam.scale = newScale;
    const p = layout.planets[lockedPlanet];
    targetCam.x = -p.x; targetCam.y = -p.y;
  } else {
    // zoom toward cursor: compute world coord of mouse, then adjust targetCam so that point remains under cursor
    const sx = e.clientX, sy = e.clientY;
    const before = screenToWorld(sx, sy);
    targetCam.scale = newScale;
    const after = screenToWorld(sx, sy);
    // offset target so that world point before stays at same screen pos
    targetCam.x += (after.x - before.x);
    targetCam.y += (after.y - before.y);
  }

  // auto-unlock if zoomed out enough
  if (targetCam.scale < CONFIG.UNLOCK_SCALE_THRESHOLD && lockedPlanet !== null) {
    lockedPlanet = null;
    // gently recenter
    targetCam.x = 0; targetCam.y = 0;
  }
}, { passive:false });

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

/* ========== Hover / tap / UI ========== */
function updateHover(sx, sy) {
  const w = screenToWorld(sx, sy);
  hovered = null;
  outer:
  for (const p of layout.planets) {
    for (const t of p.tiers) {
      for (let i=0;i<t.achievements.length;i++){
        const a = t.achievements[i];
        if (dist(w.x, w.y, a._pos.x, a._pos.y) <= Math.max(12, a._pos.r / camera.scale + 6)) {
          hovered = { type:'achievement', planet: p.index, tier: t.index, ach: i }; break outer;
        }
      }
      if (dist(w.x, w.y, t.x, t.y) < Math.max(18, CONFIG.TIER_VISUAL*0.4)) { hovered = { type:'tier', planet: p.index, tier: t.index }; break outer; }
    }
    if (dist(w.x, w.y, p.x, p.y) < Math.max(36, CONFIG.CORE_VISUAL*0.18)) { hovered = { type:'planet', planet: p.index }; break outer; }
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
    const idx = hovered.planet;
    lockedPlanet = idx;
    zoomToPlanet(idx);
  } else if (hovered.type === 'tier') {
    lockedPlanet = hovered.planet;
    zoomToTier(hovered.planet, hovered.tier);
  }
}

/* Title card functions */
function showTitleForNode(node) {
  const s = worldToScreen(node._pos.x, node._pos.y);
  titleCard.style.left = s.x + 'px';
  titleCard.style.top = (s.y - 56) + 'px';
  cardIcon.textContent = '★'; // placeholder icon; replace later if needed
  titleCardTitle.textContent = (node.data.title || '').toUpperCase();
  titleCardSubtitle.textContent = (node.data.description || '').slice(0, 80);
  titleCard.classList.add('show');
}
function showTitleAtPoint(wx, wy, title, sub='') {
  const s = worldToScreen(wx, wy);
  titleCard.style.left = s.x + 'px';
  titleCard.style.top = (s.y - 56) + 'px';
  cardIcon.textContent = '★';
  titleCardTitle.textContent = title || '';
  titleCardSubtitle.textContent = sub || '';
  titleCard.classList.add('show');
}
function hideTitle() {
  titleCard.classList.remove('show');
}

/* Detail panel */
let currentDetail = null;
function openDetail(h) {
  const a = layout.planets[h.planet].tiers[h.tier].achievements[h.ach];
  if (!a) return;
  currentDetail = { planet: h.planet, tier: h.tier, ach: h.ach };
  detailTitle.textContent = (a.data.title || '').toUpperCase();
  detailDesc.textContent = a.data.description || '';
  detailPanel.classList.add('show');
}
function hideDetail() { detailPanel.classList.remove('show'); currentDetail = null; }
function completeAchievement(detail) {
  try {
    const a = achievements.planets[detail.planet].tiers[detail.tier].achievements[detail.ach];
    if (a) { a.status = 'completed'; a.dateCompleted = new Date().toISOString(); localStorage.setItem('progress', JSON.stringify(achievements)); }
  } catch (e) { console.warn('complete failed', e); }
}

/* zoom helpers */
function zoomToPlanet(idx) {
  const p = layout.planets[idx];
  const smin = Math.min(W, H);
  const requiredScale = (smin * CONFIG.ZOOM_FILL_PCT) / CONFIG.CORE_VISUAL;
  targetCam.x = -p.x; targetCam.y = -p.y; targetCam.scale = requiredScale * 1.02;
  focused.planet = idx; focused.tier = null;
  hideDetail(); hideTitle();
}
function zoomToTier(pi, ti) {
  const t = layout.planets[pi].tiers[ti];
  const smin = Math.min(W, H);
  const requiredScale = (smin * CONFIG.ZOOM_FILL_PCT) / (CONFIG.TIER_VISUAL * 1.4);
  targetCam.x = -t.x; targetCam.y = -t.y; targetCam.scale = requiredScale * 1.02;
  focused.planet = pi; focused.tier = ti;
  hideDetail(); hideTitle();
}
function resetView() {
  targetCam.x = 0; targetCam.y = 0; targetCam.scale = CONFIG.INITIAL_SCALE;
  focused.planet = null; focused.tier = null; lockedPlanet = null;
  hideDetail(); hideTitle();
}

/* ========== Glow connector (efficient, no pulse)
   - Draws quadratic curve in screen space.
   - Uses a linear gradient from source->dest that becomes brighter near dest.
   - Uses 3 lightweight strokes: soft outer glow, mid glow, crisp core.
*/
function controlPointFor(x1,y1,x2,y2, strength = 0.22) {
  const mx = (x1 + x2)/2, my = (y1 + y2)/2;
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const px = -dy / dist, py = dx / dist;
  const offset = Math.min(dist * strength, 300);
  return { x: mx + px * offset, y: my + py * offset };
}
function drawGlowingGradientPathWorld(aX, aY, bX, bY, accent) {
  // map to screen coords
  const sA = worldToScreen(aX, aY);
  const sB = worldToScreen(bX, bY);
  const cp = controlPointFor(sA.x, sA.y, sB.x, sB.y, 0.22);

  // gradient: fainter at source, strong near dest (white-ish)
  const grad = ctx.createLinearGradient(sA.x, sA.y, sB.x, sB.y);
  grad.addColorStop(0, hexWithAlpha(accent, 0.06));
  grad.addColorStop(0.6, hexWithAlpha(accent, 0.36));
  grad.addColorStop(1, hexWithAlpha('#ffffff', 0.9));

  // outer soft glow
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = grad;
  ctx.lineWidth = CONFIG.GLOW_THICKNESS * 6 * Math.max(1, camera.scale / 1.5);
  ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.quadraticCurveTo(cp.x, cp.y, sB.x, sB.y);
  ctx.stroke();
  ctx.restore();

  // mid glow
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = grad;
  ctx.lineWidth = CONFIG.GLOW_THICKNESS * 2.6;
  ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.quadraticCurveTo(cp.x, cp.y, sB.x, sB.y);
  ctx.stroke();
  ctx.restore();

  // core crisp
  ctx.save();
  ctx.globalAlpha = 1.0;
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.quadraticCurveTo(cp.x, cp.y, sB.x, sB.y);
  ctx.stroke();
  ctx.restore();
}

/* helper: hex -> rgba string */
function hexWithAlpha(hex, alpha) {
  if (!hex) return `rgba(255,255,255,${alpha})`;
  if (hex.startsWith('rgba')) return hex.replace('rgba','rgba'); // pass-through
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ========== Render loop ========== */
let t = 0;
function draw() {
  t += 1/60;
  // smooth camera to target
  camera.x = lerp(camera.x, targetCam.x, easing);
  camera.y = lerp(camera.y, targetCam.y, easing);
  camera.scale = lerp(camera.scale, targetCam.scale, easing);

  // if locked to planet, enforce centering
  if (lockedPlanet !== null) {
    const p = layout.planets[lockedPlanet];
    targetCam.x = -p.x; targetCam.y = -p.y;
  }

  // background caches
  ctx.clearRect(0,0,W,H);
  if (starCache) ctx.drawImage(starCache, 0, 0, W, H);
  if (orbitCache) ctx.drawImage(orbitCache, 0, 0, W, H);

  // vanishing point subtle glow
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
  ctx.save();
  const vg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)/2);
  vg.addColorStop(0, hexWithAlpha(accent, 0.045));
  vg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
  ctx.restore();

  // world transform
  ctx.save();
  ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // draw planets and tiers
  for (const p of layout.planets) {
    // draw core planet
    if (IMG.planet) ctx.drawImage(IMG.planet, p.x - CONFIG.CORE_VISUAL/2, p.y - CONFIG.CORE_VISUAL/2, CONFIG.CORE_VISUAL, CONFIG.CORE_VISUAL);
    else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(p.x,p.y, CONFIG.CORE_VISUAL/2, 0, Math.PI*2); ctx.fill(); }

    // planet label
    ctx.save(); ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Electrolize, Arial'; ctx.textAlign = 'center';
    ctx.fillText((p.data.planetName||'').toUpperCase(), p.x, p.y + CONFIG.CORE_VISUAL/2 + 20 / camera.scale);
    ctx.restore();

    // tiers
    for (const tTier of p.tiers) {
      // draw glowing connector from core -> tier
      drawGlowingGradientPathWorld(p.x, p.y, tTier.x, tTier.y, accent);

      // draw tier planet
      const size = CONFIG.TIER_VISUAL;
      const key = tTier.index === 0 ? 'planet' : `tier${Math.min(5, tTier.index+1)}`;
      if (tTier.index === 0 && IMG.planet) ctx.drawImage(IMG.planet, tTier.x - size/2, tTier.y - size/2, size, size);
      else if (IMG[key]) ctx.drawImage(IMG[key], tTier.x - size/2, tTier.y - size/2, size, size);
      else if (IMG.planet) ctx.drawImage(IMG.planet, tTier.x - size/2, tTier.y - size/2, size, size);
      else { ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(tTier.x,tTier.y,size/2,0,Math.PI*2); ctx.fill(); }

      // planethover overlay when hovering planet (draw under planet, scaled)
      if (hovered && hovered.type === 'planet' && hovered.planet === p.index) {
        if (IMG.planethover) {
          ctx.save();
          const hSize = size * 1.4;
          ctx.globalAlpha = 0.36;
          ctx.drawImage(IMG.planethover, tTier.x - hSize/2, tTier.y - hSize/2, hSize, hSize);
          ctx.restore();
        }
      }

      // junction placed outside (offset from tier center)
      const dx = tTier.x - p.x, dy = tTier.y - p.y; const d = Math.hypot(dx,dy) || 1;
      const jx = tTier.x + (dx/d) * (size/2 + 22);
      const jy = tTier.y + (dy/d) * (size/2 + 22);
      drawAtlas('junction', jx, jy, 24, 1);

      // tier label
      ctx.save(); ctx.fillStyle = '#fff'; ctx.font='11px Electrolize, Arial'; ctx.textAlign='center';
      ctx.fillText((tTier.data.tierName||`Tier ${tTier.index+1}`).toUpperCase(), tTier.x, tTier.y - size/2 - 10);
      ctx.restore();

      // decide if nodes should be visible: show if camera.scale >= NODE_SHOW_SCALE OR this tier is focused
      const showNodes = (camera.scale >= CONFIG.NODE_SHOW_SCALE) || (focused.planet === p.index && focused.tier === tTier.index);

      // draw node connecting lines (paths) around or between nodes only when visible
      if (showNodes && tTier.achievements.length > 0) {
        // connect nodes in order (wrap-around) with glowing path
        for (let ni=0; ni<tTier.achievements.length; ni++) {
          const a = tTier.achievements[ni];
          const b = tTier.achievements[(ni+1) % tTier.achievements.length];
          drawGlowingGradientPathWorld(a._pos.x, a._pos.y, b._pos.x, b._pos.y, accent);
        }
      }

      // draw nodes (hologram under, icon on top)
      for (const node of tTier.achievements) {
        // hologram under the node (alpha fades by hover status)
        const holoAlpha = node._hover || 0;
        if (holoAlpha > 0.02) drawAtlas('hologram', node._pos.x, node._pos.y, Math.max(36, node._pos.r * 2.6), holoAlpha * 0.92);

        // node icon only if visible (same condition)
        if (showNodes) {
          const ik = node.data.status === 'locked' ? 'lock' : 'node';
          drawAtlas(ik, node._pos.x, node._pos.y, CONFIG.NODE_ICON, 1);
          // label when zoomed enough
          if (camera.scale > 1.2) {
            ctx.save(); ctx.fillStyle = '#fff'; ctx.font='11px Electrolize, Arial'; ctx.textAlign='left';
            ctx.fillText((node.data.title||'').toUpperCase(), node._pos.x + CONFIG.NODE_LABEL_OFFSET, node._pos.y + 4);
            ctx.restore();
          }
        }
      }
    }
  }

  ctx.restore();

  // update hover hologram alpha transitions
  for (const p of layout.planets) for (const tt of p.tiers) for (const a of tt.achievements) {
    const target = (hovered && hovered.type === 'achievement' && hovered.planet === p.index && hovered.tier === tt.index && hovered.ach === tt.achievements.indexOf(a)) ? 1 : 0;
    a._hover = lerp(a._hover || 0, target, 0.14);
  }

  // unlock if zoomed out below threshold
  if (lockedPlanet !== null && targetCam.scale < CONFIG.UNLOCK_SCALE_THRESHOLD) {
    lockedPlanet = null;
    targetCam.x = 0; targetCam.y = 0;
  }

  requestAnimationFrame(draw);
}

/* ========== Init sequence ========== */
async function init() {
  document.documentElement.style.setProperty('--accent', (themeColorEl?.value) || '#00c8ff');

  // preload visuals
  IMG.center = await loadImage(ASSETS.center);
  IMG.planet = await loadImage(ASSETS.planet);
  IMG.planethover = await loadImage(ASSETS.planethover);
  IMG.tier2 = await loadImage(ASSETS.tier2);
  IMG.tier3 = await loadImage(ASSETS.tier3);
  IMG.tier4 = await loadImage(ASSETS.tier4);
  IMG.tier5 = await loadImage(ASSETS.tier5);

  await buildAtlas();
  buildStarCache();
  buildOrbitCache(Math.max(W, H) * 0.95);
  await loadData();
  buildLayout();

  camera.x = targetCam.x = 0; camera.y = targetCam.y = 0; camera.scale = targetCam.scale = CONFIG.INITIAL_SCALE;

  requestAnimationFrame(draw);
}
init().catch(e => console.error('Init error', e));

/* ========== Utilities & admin ========== */
function lerp(a,b,t){ return a + (b-a) * t; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

/* admin helpers kept */
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

