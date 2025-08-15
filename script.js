/* script.js - cleaned and fixed version
   Features:
   - canvas + DPR handling
   - preload images (simple, resilient)
   - build small atlas for icons
   - offscreen star cache and orbit cache
   - scattered planets and tiers
   - click planet -> smooth zoom
   - nodes on planet, expand when focused
   - junctions (floating) shown when planet hovered
   - single title card and single detail panel
   - hologram image drawn under hovered node
   - animated glowing pulses on connectors
   - well-commented and structured
*/

/* ===== CONFIG ===== */
const CONFIG = {
  initialScale: 0.45,
  planetFocusPercent: 0.55, // planet fills ~55% of screen when focused
  nodeShowStart: 1.6,
  nodeShowEnd: 3.0,
  atmosphereStart: 2.2,
  atmosphereFull: 4.2,
  starCount: 180,
  orbitSpacing: 40,
  pulseBase: 0.18
};

/* ===== Canvas setup ===== */
const canvas = document.getElementById('starChart');
const ctx = canvas.getContext('2d', { alpha: true });

let DPR = Math.max(1, window.devicePixelRatio || 1);
let W = 0, H = 0;
function resizeCanvas() {
  DPR = Math.max(1, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ===== DOM UI refs ===== */
const themeColorEl = document.getElementById('themeColor');
const monoToggleEl = document.getElementById('monoToggle');
const debugToggleEl = document.getElementById('debugToggle');
const resetViewBtn = document.getElementById('resetView');

const titleCard = document.getElementById('titleCard');
const titleCardTitle = document.getElementById('titleCardTitle');
const titleCardSubtitle = document.getElementById('titleCardSubtitle');

const detailPanel = document.getElementById('detailPanel');
const detailTitle = document.getElementById('detailTitle');
const detailDesc = document.getElementById('detailDesc');
const detailCloseBtn = document.getElementById('detailClose');
const completeBtn = document.getElementById('completeBtn');

/* UI events */
if (themeColorEl) themeColorEl.addEventListener('input', e => {
  document.documentElement.style.setProperty('--accent', e.target.value);
});
if (monoToggleEl) monoToggleEl.addEventListener('change', e => {
  document.documentElement.style.setProperty('--mono', e.target.checked ? 1 : 0);
});
if (resetViewBtn) resetViewBtn.addEventListener('click', () => {
  resetView();
});
if (detailCloseBtn) detailCloseBtn.addEventListener('click', () => hideDetail());
if (completeBtn) completeBtn.addEventListener('click', () => {
  if (currentDetail) markComplete(currentDetail);
  hideDetail();
});

/* ===== Asset paths ===== */
const ASSETS = {
  center: 'assets/center.png',
  planet: 'assets/planet.png',
  planethover: 'assets/planethover.png',
  node: 'assets/node.png',
  lock: 'assets/lock.png',
  pulse: 'assets/pulse.png',
  junction: 'assets/junction.png',
  hologram: 'assets/achievementnodehologram.png',
  completedTier: 'assets/completedplanettier.png'
};

/* storage for loaded images */
const IMG = {};
const atlas = { canvas: null, ctx: null, map: {} };

/* safe image loader */
function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn('Image failed to load:', src);
      resolve(null);
    };
  });
}

/* build small atlas for icons to reduce drawImage calls count */
async function buildAtlas() {
  const keys = ['node','lock','pulse','junction','hologram','completedTier'];
  const imgs = await Promise.all(keys.map(k => loadImage(ASSETS[k])));
  const cell = 128;
  const cols = 3;
  const rows = Math.ceil(keys.length / cols);
  atlas.canvas = document.createElement('canvas');
  atlas.canvas.width = cell * cols;
  atlas.canvas.height = cell * rows;
  atlas.ctx = atlas.canvas.getContext('2d');
  keys.forEach((k, i) => {
    const img = imgs[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cell, y = row * cell;
    if (img) atlas.ctx.drawImage(img, x, y, cell, cell);
    atlas.map[k] = { x, y, w: cell, h: cell, loaded: !!img };
  });
}

/* draw a sprite from atlas */
function drawAtlas(key, x, y, size, alpha = 1) {
  if (!atlas.canvas || !atlas.map[key]) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.arc(x, y, size/2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    return;
  }
  const meta = atlas.map[key];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(atlas.canvas, meta.x, meta.y, meta.w, meta.h, x - size/2, y - size/2, size, size);
  ctx.restore();
}

/* ===== Offscreen caches for performance ===== */
let starCache = null;
function buildStarCache() {
  starCache = document.createElement('canvas');
  starCache.width = Math.floor(W * DPR);
  starCache.height = Math.floor(H * DPR);
  const sc = starCache.getContext('2d');
  sc.scale(DPR, DPR);
  sc.fillStyle = '#000';
  sc.fillRect(0,0,W,H);
  for (let i=0;i<CONFIG.starCount;i++){
    const x = Math.random()*W, y = Math.random()*H, r = Math.random()*1.6 + 0.2;
    sc.fillStyle = `rgba(255,255,255,${0.2 + Math.random()*0.8})`;
    sc.fillRect(x, y, r, r);
  }
}

let orbitCache = null;
function buildOrbitCache(maxRadius) {
  orbitCache = document.createElement('canvas');
  orbitCache.width = Math.floor(W * DPR);
  orbitCache.height = Math.floor(H * DPR);
  const oc = orbitCache.getContext('2d');
  oc.scale(DPR, DPR);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
  oc.strokeStyle = accent;
  oc.globalAlpha = 0.05;
  oc.lineWidth = 1;
  for (let r = 80; r < maxRadius; r += CONFIG.orbitSpacing) {
    oc.beginPath();
    oc.arc(W/2, H/2, r, 0, Math.PI*2);
    oc.stroke();
  }
}

/* ===== Load achievements.json or fallback demo ===== */
let achievements = { planets: [] };
async function loadData() {
  try {
    const res = await fetch('./achievements.json');
    achievements = await res.json();
    const saved = localStorage.getItem('progress');
    if (saved) {
      const prog = JSON.parse(saved);
      prog.planets?.forEach((p, i) => {
        p.tiers?.forEach((t, j) => {
          t.achievements?.forEach((a, k) => {
            if (achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]) {
              achievements.planets[i].tiers[j].achievements[k].status = a.status;
              achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
            }
          });
        });
      });
    }
  } catch (e) {
    console.warn('achievements.json not found — building demo data', e);
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`,
      tiers: Array.from({length:4}).map((__,ti)=>({
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

/* ===== Layout: scatter planets widely ===== */
let layout = { planets: [] };
function buildLayout() {
  layout.planets = [];
  const total = achievements.planets.length;
  const scatterRadius = Math.min(W, H) * 0.38;
  for (let i=0;i<total;i++){
    const baseAngle = i * (Math.PI*2/total);
    const angle = baseAngle + (Math.random()-0.5)*0.6;
    const rr = scatterRadius * (0.6 + Math.random()*0.9);
    const x = Math.cos(angle) * rr;
    const y = Math.sin(angle) * rr;
    const planet = { index: i, x, y, angle, data: achievements.planets[i], tiers: [] };
    const tierCount = planet.data.tiers.length;
    for (let j=0;j<tierCount;j++){
      const distFromPlanet = 120 + j * 110;
      const spread = ((j % 3) - 1) * 0.18 * (j+1);
      const tx = x + Math.cos(angle + spread) * distFromPlanet;
      const ty = y + Math.sin(angle + spread) * distFromPlanet;
      const tier = { index: j, x: tx, y: ty, data: planet.data.tiers[j], achievements: [] };
      tier.achievements = tier.data.achievements.map((a,k) => ({ data: a, relAngle: (k / Math.max(1, tier.data.achievements.length)) * Math.PI*2, _pos: null, _hoverAlpha: 0 }));
      planet.tiers.push(tier);
    }
    layout.planets.push(planet);
  }
}

/* ===== Camera & interaction state ===== */
const camera = { x:0, y:0, scale: CONFIG.initialScale };
const targetCamera = { x:0, y:0, scale: CONFIG.initialScale };
let easing = 0.12;

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

/* focused & hovered */
let focused = { planet: null, tier: null };
let hovered = null;
let pointer = { x: 0, y: 0, down: false, lastDrag: null };

/* pointer events */
canvas.addEventListener('pointerdown', e => {
  pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  if (pointer.down && pointer.lastDrag) {
    const dx = (e.clientX - pointer.lastDrag.x) / targetCamera.scale;
    const dy = (e.clientY - pointer.lastDrag.y) / targetCamera.scale;
    targetCamera.x += dx; targetCamera.y += dy;
  }
  pointer.lastDrag = { x: e.clientX, y: e.clientY };
  if (!pointer.down) updateHover(e.clientX, e.clientY);
});
canvas.addEventListener('pointerup', e => {
  pointer.down = false; pointer.lastDrag = null;
  handleClick(e.clientX, e.clientY);
  canvas.releasePointerCapture?.(e.pointerId);
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  targetCamera.scale = Math.max(0.2, Math.min(8.0, targetCamera.scale - e.deltaY * 0.0015));
}, { passive: false });

/* ===== Click handling (zooming and interactions) ===== */
function handleClick(sx, sy) {
  if (hovered) {
    if (hovered.type === 'planet') {
      zoomToPlanet(hovered.index);
      return;
    } else if (hovered.type === 'tier') {
      zoomToTier(hovered.pIndex, hovered.tIndex);
      return;
    } else if (hovered.type === 'junction') {
      // check unlock: current tier achievements completed?
      const p = layout.planets[hovered.pIndex];
      const t = p.tiers[hovered.tIndex];
      const allCompleted = t.data.achievements.every(a => a.status === 'completed');
      if (allCompleted && p.tiers[hovered.tIndex+1]) {
        zoomToTier(hovered.pIndex, hovered.tIndex+1);
      } else {
        showTitleCard('JUNCTION LOCKED', 'Complete all achievements in this tier to unlock');
      }
      return;
    } else if (hovered.type === 'achievement') {
      openDetailPanel(hovered);
      return;
    }
  } else {
    resetView();
  }
}

/* compute zoom so that the target world point fills targetPercent of the smaller screen dimension */
function zoomToPoint(wx, wy, targetPercent=CONFIG.planetFocusPercent, visualSize=220) {
  const screenMin = Math.min(W, H);
  const requiredScale = (screenMin * targetPercent) / visualSize;
  targetCamera.x = -wx;
  targetCamera.y = -wy;
  targetCamera.scale = requiredScale;
}

/* zoom helpers */
function zoomToPlanet(pIndex) {
  const p = layout.planets[pIndex];
  zoomToPoint(p.x, p.y, CONFIG.planetFocusPercent, 220);
  focused.planet = pIndex; focused.tier = null;
  hideDetailPanel(); hideTitleCard();
}
function zoomToTier(pIndex, tIndex) {
  const t = layout.planets[pIndex].tiers[tIndex];
  // more aggressive zoom to show nodes
  zoomToPoint(t.x, t.y, CONFIG.planetFocusPercent * 1.05, 260);
  targetCamera.scale *= 1.6;
  focused.planet = pIndex; focused.tier = tIndex;
  hideDetailPanel(); hideTitleCard();
}
function resetView() {
  targetCamera.x = 0; targetCamera.y = 0; targetCamera.scale = CONFIG.initialScale;
  focused.planet = null; focused.tier = null;
  hideDetailPanel(); hideTitleCard();
}

/* ===== Hover detection ===== */
function updateHover(sx, sy) {
  const w = screenToWorld(sx, sy);
  hovered = null;
  // planet hit
  for (let i=0;i<layout.planets.length;i++){
    const p = layout.planets[i];
    const r = Math.max(28, 60 / camera.scale);
    if (dist(w.x, w.y, p.x, p.y) < r) { hovered = { type: 'planet', index: i }; break; }
  }
  if (!hovered) {
    for (let i=0;i<layout.planets.length;i++){
      const p = layout.planets[i];
      for (let j=0;j<p.tiers.length;j++){
        const t = p.tiers[j];
        // tier
        if (dist(w.x,w.y,t.x,t.y) < Math.max(18, 40 / camera.scale)) { hovered = { type: 'tier', pIndex: i, tIndex: j }; break; }
        // junction (slightly outside)
        const jx = t.x + (t.x - p.x) * 0.12;
        const jy = t.y + (t.y - p.y) * 0.12;
        if (dist(w.x,w.y,jx,jy) < Math.max(14, 28 / camera.scale)) { hovered = { type: 'junction', pIndex: i, tIndex: j, x: jx, y: jy }; break; }
        // achievements
        for (let k=0;k<t.achievements.length;k++){
          const a = t.achievements[k];
          if (a._pos && dist(w.x,w.y,a._pos.x, a._pos.y) < Math.max(8, a._pos.r / camera.scale + 6)) {
            hovered = { type: 'achievement', pIndex: i, tIndex: j, aIndex: k }; break;
          }
        }
        if (hovered) break;
      }
      if (hovered) break;
    }
  }

  if (hovered) {
    if (hovered.type === 'achievement') {
      const a = layout.planets[hovered.pIndex].tiers[hovered.tIndex].achievements[hovered.aIndex];
      showTitleCard((a.data.title||'').toUpperCase(), (a.data.status||'').toUpperCase());
    } else if (hovered.type === 'planet') {
      showTitleCard((layout.planets[hovered.index].data.planetName||'').toUpperCase(), 'CLICK TO ZOOM');
    } else if (hovered.type === 'tier') {
      showTitleCard((layout.planets[hovered.pIndex].tiers[hovered.tIndex].data.tierName||'').toUpperCase(), 'TIER');
    } else if (hovered.type === 'junction') {
      showTitleCard('JUNCTION', 'Click to travel if unlocked');
    }
  } else {
    hideTitleCard();
  }
}

/* ===== Title card & detail panel UI helpers ===== */
let titleHideTimeout = null;
function showTitleCard(title, subtitle) {
  if (!titleCard) return;
  titleCardTitle.textContent = title || '';
  titleCardSubtitle.textContent = subtitle || '';
  titleCard.classList.add('show');
  if (titleHideTimeout) clearTimeout(titleHideTimeout);
  titleHideTimeout = setTimeout(() => hideTitleCard(), 4000);
}
function hideTitleCard() {
  if (!titleCard) return;
  titleCard.classList.remove('show');
  if (titleHideTimeout) { clearTimeout(titleHideTimeout); titleHideTimeout = null; }
}

let currentDetail = null;
function openDetailPanel(h) {
  const p = layout.planets[h.pIndex];
  const t = p.tiers[h.tIndex];
  const a = t.achievements[h.aIndex];
  if (!detailPanel) return;
  currentDetail = { pIndex: h.pIndex, tIndex: h.tIndex, aIndex: h.aIndex };
  detailTitle.textContent = (a.data.title || '').toUpperCase();
  detailDesc.textContent = a.data.description || '';
  detailPanel.classList.add('show');
}
function hideDetailPanel() {
  if (!detailPanel) return;
  detailPanel.classList.remove('show');
  currentDetail = null;
}
function markComplete(detail) {
  try {
    const a = achievements.planets[detail.pIndex].tiers[detail.tIndex].achievements[detail.aIndex];
    a.status = 'completed';
    a.dateCompleted = (new Date()).toISOString();
    localStorage.setItem('progress', JSON.stringify(achievements));
  } catch (e) {
    console.warn('markComplete failed', e);
  }
}

/* ===== Utility ===== */
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

/* ===== Main draw loop (rAF) - optimized usage of caches ===== */
let anim = 0;
function draw() {
  anim += 1/60;
  // smooth camera towards target
  camera.x = lerp(camera.x, targetCamera.x, easing);
  camera.y = lerp(camera.y, targetCamera.y, easing);
  camera.scale = lerp(camera.scale, targetCamera.scale, easing);

  // draw background using cache
  ctx.clearRect(0,0,W,H);
  if (starCache) ctx.drawImage(starCache, 0, 0, W, H);

  // prepare world transform
  ctx.save();
  ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // draw orbit cache in screen space (to keep rings crisp)
  if (orbitCache) {
    // draw orbit cache at screen origin because it was rendered in screen coordinates
    ctx.setTransform(1,0,0,1,0,0);
    ctx.drawImage(orbitCache, 0, 0, W*DPR, H*DPR, 0, 0, W, H);
    // restore world transform
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
    ctx.scale(camera.scale, camera.scale);
  }

  // center star core
  if (IMG.center) ctx.drawImage(IMG.center, -110, -110, 220, 220);

  // draw planets and connectors
  for (let p of layout.planets) {
    // planethover underlay if hovered
    const planetVisualSize = 220;
    const planetHover = hovered && hovered.type === 'planet' && hovered.index === p.index;
    if (planetHover && IMG.planethover) {
      ctx.save();
      ctx.globalAlpha = 0.36;
      ctx.drawImage(IMG.planethover, p.x - planetVisualSize*0.9/2, p.y - planetVisualSize*0.9/2, planetVisualSize*0.9, planetVisualSize*0.9);
      ctx.restore();
    }
    // planet image (lazy loaded)
    if (IMG.planet) ctx.drawImage(IMG.planet, p.x - planetVisualSize/2, p.y - planetVisualSize/2, planetVisualSize, planetVisualSize);
    else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(p.x,p.y,planetVisualSize/2,0,Math.PI*2); ctx.fill(); }

    // planet label ALL CAPS
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Electrolize, Arial'; ctx.textAlign = 'center';
    ctx.fillText((p.data.planetName||'').toUpperCase(), p.x, p.y + planetVisualSize/2 + 18 / camera.scale);
    ctx.restore();

    // tiers connectors and pulses
    for (let t of p.tiers) {
      // base line
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
      ctx.lineWidth = 2 / Math.max(0.6, camera.scale);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.restore();

      // moving pulses (two layers)
      for (let i=0;i<2;i++){
        const prog = (anim * (CONFIG.pulseBase + i*0.06) + (t.index*0.14) + (p.index*0.08)) % 1;
        const px = p.x + (t.x - p.x) * prog;
        const py = p.y + (t.y - p.y) * prog;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9 * (0.35 + Math.sin(anim*4 + i)*0.12);
        ctx.beginPath();
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
        ctx.arc(px, py, 6 + Math.sin(anim*6 + i)*1.4, 0, Math.PI*2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // junction - only show when parent planet hovered
      const jx = t.x + (t.x - p.x) * 0.12;
      const jy = t.y + (t.y - p.y) * 0.12;
      const showJunction = hovered && hovered.type === 'planet' && hovered.index === p.index;
      if (showJunction) drawAtlas('junction', jx, jy, 28, 1);
    }
  }

  // nodes drawing - compact on tier surface; expand when focused
  for (let p of layout.planets) {
    for (let t of p.tiers) {
      const vis = clamp((camera.scale - CONFIG.nodeShowStart) / (CONFIG.nodeShowEnd - CONFIG.nodeShowStart), 0, 1);
      const compactR = Math.max(36, 0.9 * 36);
      const isFocused = (focused.planet === p.index && focused.tier === t.index);

      if (isFocused) {
        // expanded rings
        const perRing = 10;
        const rings = Math.ceil(t.achievements.length / perRing);
        let idx = 0;
        for (let ring = 0; ring < rings; ring++){
          const count = Math.min(perRing, t.achievements.length - ring*perRing);
          const ringR = 36 + ring * 48;
          for (let n=0;n<count;n++){
            const ang = (n / count)*Math.PI*2 + ring*0.12 + anim*0.02;
            const ax = t.x + Math.cos(ang) * ringR;
            const ay = t.y + Math.sin(ang) * ringR;
            const node = t.achievements[idx];
            ctx.save();
            ctx.globalAlpha = 0.12 + (node.data.status === 'available' ? 0.16 : 0.05);
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
            ctx.lineWidth = 1.6 / Math.max(0.6, camera.scale);
            ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(ax,ay); ctx.stroke();
            ctx.restore();

            drawAtlas(node.data.status === 'locked' ? 'lock' : 'node', ax, ay, 18, vis);
            if (node.data.status === 'available') drawAtlas('pulse', ax, ay, 26, vis*0.9);

            node._pos = { x: ax, y: ay, r: 12, alpha: vis };
            idx++;
          }
        }
      } else {
        // compact placement around tier
        for (let n=0;n<t.achievements.length;n++){
          const node = t.achievements[n];
          const ang = node.relAngle + anim*0.006;
          const ax = t.x + Math.cos(ang) * compactR;
          const ay = t.y + Math.sin(ang) * compactR;
          drawAtlas(node.data.status === 'locked' ? 'lock' : 'node', ax, ay, 18, vis);
          if (node.data.status === 'available') drawAtlas('pulse', ax, ay, 24, vis*0.9);
          node._pos = { x: ax, y: ay, r: 12, alpha: vis };
        }
      }
    }
  }

  // draw hologram under hovered node (single)
  if (hovered && hovered.type === 'achievement') {
    const node = layout.planets[hovered.pIndex].tiers[hovered.tIndex].achievements[hovered.aIndex];
    node._hoverAlpha = node._hoverAlpha === undefined ? 0 : node._hoverAlpha;
    node._hoverAlpha = lerp(node._hoverAlpha, 1, 0.16);
    drawAtlas('hologram', node._pos.x, node._pos.y, Math.max(28, node._pos.r*2.2), node._hoverAlpha);
  }
  // fade holograms on others
  for (let p of layout.planets) for (let t of p.tiers) for (let a of t.achievements) {
    if (!(hovered && hovered.type === 'achievement' && hovered.pIndex === p.index && hovered.tIndex === t.index && a === t.achievements?.[hovered.aIndex])) {
      a._hoverAlpha = a._hoverAlpha === undefined ? 0 : a._hoverAlpha;
      a._hoverAlpha = lerp(a._hoverAlpha, 0, 0.12);
      if (a._hoverAlpha > 0.02 && a._pos) drawAtlas('hologram', a._pos.x, a._pos.y, Math.max(26, a._pos.r*2.0), a._hoverAlpha * 0.6);
    }
  }

  ctx.restore();

  // atmosphere vignette on top when zoomed (entering atmosphere)
  const atm = clamp((camera.scale - CONFIG.atmosphereStart) / (CONFIG.atmosphereFull - CONFIG.atmosphereStart), 0, 1);
  if (atm > 0.001) {
    const g = ctx.createRadialGradient(W/2, H/2, 60, W/2, H/2, Math.max(W,H)*0.75);
    g.addColorStop(0, `rgba(10,20,30,${0.06 * atm})`);
    g.addColorStop(0.6, `rgba(0,0,0,${0.0})`);
    g.addColorStop(1, `rgba(0,0,0,0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // debug overlay
  if (debugToggleEl && debugToggleEl.checked) {
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = 'rgba(255,0,0,0.12)';
    ctx.fillRect(8,62,150,28);
    ctx.fillStyle = '#fff'; ctx.fillText('DEBUG', 14, 80);
    ctx.restore();
  }

  requestAnimationFrame(draw);
}

/* ===== Init sequence: load assets, build caches, layout, start loop ===== */
async function init() {
  // set CSS accent
  document.documentElement.style.setProperty('--accent', (themeColorEl && themeColorEl.value) || '#00c8ff');

  // preload simple assets needed for draw
  IMG.center = await loadImage(ASSETS.center);
  IMG.planet = await loadImage(ASSETS.planet);
  IMG.planethover = await loadImage(ASSETS.planethover);

  // build atlas (icons + hologram)
  await buildAtlas();

  // build caches
  buildStarCache();
  buildOrbitCache(Math.max(W, H) * 0.95);

  // load data and layout
  await loadData();
  buildLayout();

  // set initial camera targets
  camera.x = targetCamera.x = 0; camera.y = targetCamera.y = 0; camera.scale = targetCamera.scale = CONFIG.initialScale;

  // start draw loop
  requestAnimationFrame(draw);
}

init().catch(e => console.error('Init failed:', e));

/* Expose small debug API */
window._starChart = { layout, achievements, zoomToPlanet: (i)=>zoomToPlanet(i), zoomToTier: (p,t)=>zoomToTier(p,t), resetView };

/* End of script.js */
