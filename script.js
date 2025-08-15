/* script.js - deterministic layout, 5 planets, tier1=core, no random positions,
   hologram drawn underneath node, title card above hologram, mobile improvements,
   reworked glowing orbital lines and pulses.
*/

/* CONFIGURATION - tweak these values */
const CONFIG = {
  PLANET_COUNT: 5,
  TIERS_PER_PLANET: 5,      // tier 0 = core, 1..4 outer
  CORE_RADIUS: 420,        // distance from center for core planet ring
  TIER_BASE_OFFSET: 120,   // distance from core for tier 1
  TIER_SPACING: 110,       // additional spacing between tiers
  PLANET_SIZE: 220,        // visual size (world units) for core planet
  TIER_SIZE: 48,           // size for tier icons
  ACH_ICON: 18,
  NODE_VIS_SCALE: 1.0,     // nodes always visible (no fade-in)
  ZOOM_TARGET_PERCENT: 0.55, // when zooming planet should fill ~55% of screen
  INITIAL_SCALE: 0.45,
  STAR_COUNT: 140,
  ORBIT_SPACING: 40,
  PULSE_SPEED: 0.18,
  MOBILE_MAX_ANIM_SCALE: 1.6 // reduce some effects on mobile
};

/* -------------------------------------------------------------
   Canvas + DPR setup
   ------------------------------------------------------------- */
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

/* -------------------------------------------------------------
   UI elements
   ------------------------------------------------------------- */
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

themeColorEl?.addEventListener('input', e => {
  document.documentElement.style.setProperty('--accent', e.target.value);
});
monoToggle?.addEventListener('change', e => {
  document.documentElement.style.setProperty('--mono', e.target.checked ? 1 : 0);
});
resetBtn?.addEventListener('click', () => resetView());
detailClose?.addEventListener('click', () => hideDetail());
completeBtn?.addEventListener('click', () => { if (currentDetail) completeAchievement(currentDetail); hideDetail(); });

/* -------------------------------------------------------------
   Asset loading (including tier2..tier5)
   ------------------------------------------------------------- */
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

const IMG = {}; // loaded images
async function loadImage(src) {
  return new Promise(res => {
    const img = new Image();
    img.src = src;
    img.onload = () => res(img);
    img.onerror = () => { console.warn('Image failed:', src); res(null); };
  });
}

/* Atlas for icons (reduces draw calls) */
const atlas = { canvas: null, ctx: null, map: {} };
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
    const img = imgs[i];
    if (img) atlas.ctx.drawImage(img, x, y, cell, cell);
    atlas.map[k] = { x, y, w:cell, h:cell, ok: !!img };
  });
}
function drawAtlas(key, x, y, size, alpha = 1) {
  if (!atlas.canvas || !atlas.map[key]) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(x, y, size/2, 0, Math.PI*2); ctx.fill(); ctx.restore(); return;
  }
  const meta = atlas.map[key];
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.drawImage(atlas.canvas, meta.x, meta.y, meta.w, meta.h, x - size/2, y - size/2, size, size);
  ctx.restore();
}

/* -------------------------------------------------------------
   Cached backgrounds: starCache + orbitCache
   ------------------------------------------------------------- */
let starCache = null;
function buildStarCache() {
  starCache = document.createElement('canvas');
  starCache.width = Math.floor(W * DPR);
  starCache.height = Math.floor(H * DPR);
  const sctx = starCache.getContext('2d');
  sctx.scale(DPR, DPR);
  sctx.fillStyle = '#000'; sctx.fillRect(0,0,W,H);
  for (let i=0;i<CONFIG.STAR_COUNT;i++){
    const x = Math.random()*W, y = Math.random()*H, r = Math.random()*1.6 + 0.2;
    sctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random()*0.8})`;
    sctx.fillRect(x, y, r, r);
  }
}
let orbitCache = null;
function buildOrbitCache(maxR) {
  orbitCache = document.createElement('canvas');
  orbitCache.width = Math.floor(W * DPR);
  orbitCache.height = Math.floor(H * DPR);
  const octx = orbitCache.getContext('2d');
  octx.scale(DPR, DPR);
  octx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
  octx.globalAlpha = 0.06;
  octx.lineWidth = 1;
  for (let r = 80; r < maxR; r += CONFIG.ORBIT_SPACING) {
    octx.beginPath();
    octx.arc(W/2, H/2, r, 0, Math.PI*2);
    octx.stroke();
  }
}

/* -------------------------------------------------------------
   Data: load achievements.json or fallback
   ------------------------------------------------------------- */
let achievements = { planets: [] };
async function loadData() {
  try {
    const res = await fetch('./achievements.json');
    achievements = await res.json();
    // merge saved progress if present
    const saved = localStorage.getItem('progress');
    if (saved) {
      const prog = JSON.parse(saved);
      prog.planets?.forEach((p,i) => {
        p.tiers?.forEach((t,j) => {
          t.achievements?.forEach((a,k) => {
            if (achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]) {
              achievements.planets[i].tiers[j].achievements[k].status = a.status;
              achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
            }
          });
        });
      });
    }
  } catch (e) {
    console.warn('Achievements missing — building demo', e);
    achievements = { planets: Array.from({length: CONFIG.PLANET_COUNT}).map((_,pi) => ({
      planetName: `Planet ${pi+1}`,
      tiers: Array.from({length: CONFIG.TIERS_PER_PLANET}).map((__,ti) => ({
        tierName: `Tier ${ti+1}`,
        achievements: Array.from({length:6}).map((___,ai) => ({
          title: `ACH ${pi+1}-${ti+1}-${ai+1}`,
          description: `How to get ACH ${pi+1}-${ti+1}-${ai+1}`,
          status: ti===0 ? 'available' : 'locked',
          dateCompleted: null
        }))
      }))
    }))};
  }
}

/* -------------------------------------------------------------
   Layout: deterministic positions — 5 cores evenly spaced,
   tiers placed radially outward with fixed offsets
   ------------------------------------------------------------- */
let layout = { planets: [] };
function buildLayout() {
  layout.planets = [];
  const total = CONFIG.PLANET_COUNT;
  for (let i=0;i<total;i++){
    const angle = i * (Math.PI*2 / total) - Math.PI/2;
    const px = Math.cos(angle) * CONFIG.CORE_RADIUS;
    const py = Math.sin(angle) * CONFIG.CORE_RADIUS;
    const planetData = achievements.planets[i] || { planetName: `Planet ${i+1}`, tiers: [] };
    const planet = { index: i, x: px, y: py, angle, data: planetData, tiers: [] };
    // tiers: tier 0 is core; others outward
    for (let t=0;t<CONFIG.TIERS_PER_PLANET; t++){
      const dist = CONFIG.TIER_BASE_OFFSET + t * CONFIG.TIER_SPACING;
      const tx = px + Math.cos(angle) * dist;
      const ty = py + Math.sin(angle) * dist;
      const tierData = planetData.tiers[t] || { tierName: `Tier ${t+1}`, achievements: [] };
      const tier = { index: t, x: tx, y: ty, data: tierData, achievements: [] };
      // nodes/nodes positions on the tier planet surface (compact), always visible
      const count = tierData.achievements.length || 0;
      for (let n=0;n<count;n++){
        const a = tierData.achievements[n];
        const relAngle = (n / Math.max(1,count)) * Math.PI * 2;
        // place nodes on circumference around tier center
        const nodeR = Math.max(CONFIG.TIER_SIZE * 0.9, 26);
        const nx = tx + Math.cos(relAngle) * nodeR;
        const ny = ty + Math.sin(relAngle) * nodeR;
        tier.achievements.push({ data: a, relAngle, _pos: { x: nx, y: ny, r: CONFIG.ACH_ICON }, _hoverAlpha: 0 });
      }
      planet.tiers.push(tier);
    }
    layout.planets.push(planet);
  }
}

/* -------------------------------------------------------------
   Camera / interaction state
   ------------------------------------------------------------- */
const camera = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
const targetCam = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
let easing = 0.12;
let focused = { planet: null, tier: null };
let hovered = null;
let pointer = { x:0, y:0, down:false, last: null };

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

/* pointer events - mobile friendly (touch) */
canvas.addEventListener('pointerdown', e => { pointer.down = true; pointer.last = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  if (pointer.down && pointer.last) {
    const dx = (e.clientX - pointer.last.x) / targetCam.scale;
    const dy = (e.clientY - pointer.last.y) / targetCam.scale;
    targetCam.x += dx; targetCam.y += dy;
    pointer.last = { x: e.clientX, y: e.clientY };
  } else {
    updateHover(e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointerup', e => {
  pointer.down = false; pointer.last = null; canvas.releasePointerCapture?.(e.pointerId);
  handleClick(e.clientX, e.clientY);
});
canvas.addEventListener('wheel', e => { e.preventDefault(); targetCam.scale = clamp(targetCam.scale - e.deltaY * 0.0015, 0.2, 8.0); }, { passive:false });

/* -------------------------------------------------------------
   Hover detection (deterministic)
   - Nodes are always visible; hover node if pointer within hit radius
   - junctions are visible always, hover not needed to show them
   ------------------------------------------------------------- */
function updateHover(sx, sy) {
  const w = screenToWorld(sx, sy);
  hovered = null;
  for (let p of layout.planets) {
    // planet hit
    if (dist(w.x, w.y, p.x, p.y) < Math.max(36, CONFIG.PLANET_SIZE*0.24)) { hovered = { type:'planet', planet: p.index }; break; }
    // tiers / nodes
    for (let t of p.tiers) {
      if (dist(w.x, w.y, t.x, t.y) < Math.max(22, CONFIG.TIER_SIZE*0.45)) { hovered = { type:'tier', planet: p.index, tier: t.index }; break; }
      // nodes
      for (let nIdx=0;nIdx<t.achievements.length;nIdx++){
        const node = t.achievements[nIdx];
        if (dist(w.x, w.y, node._pos.x, node._pos.y) < Math.max(12, node._pos.r/2)) {
          hovered = { type: 'achievement', planet: p.index, tier: t.index, ach: nIdx }; break;
        }
      }
      if (hovered) break;
    }
    if (hovered) break;
  }
  // UI
  if (hovered) {
    if (hovered.type === 'achievement') {
      const node = layout.planets[hovered.planet].tiers[hovered.tier].achievements[hovered.ach];
      showTitleAtNode(node, hovered); // title anchored to node (above hologram)
    } else if (hovered.type === 'planet') {
      const p = layout.planets[hovered.planet];
      showTitleAtPoint(p.x, p.y, (p.data.planetName||'').toUpperCase(), 'CLICK TO ZOOM');
    } else if (hovered.type === 'tier') {
      const t = layout.planets[hovered.planet].tiers[hovered.tier];
      showTitleAtPoint(t.x, t.y, (t.data.tierName||'').toUpperCase(), `${t.data.achievements.length || 0} NODES`);
    }
  } else {
    hideTitle();
  }
}

/* -------------------------------------------------------------
   Click handling
   - clicking planet zooms to it (fills ~55% of screen)
   - clicking junction will attempt to go to next tier if completed
   - clicking node opens detail panel
   ------------------------------------------------------------- */
function handleClick(sx, sy) {
  if (!hovered) { resetView(); return; }
  if (hovered.type === 'planet') {
    const p = layout.planets[hovered.planet];
    zoomTo(p.x, p.y, CONFIG.PLANET_SIZE, CONFIG.ZOOM_TARGET_PERCENT);
    focused.planet = hovered.planet; focused.tier = null;
    hideDetail(); hideTitle();
  } else if (hovered.type === 'tier') {
    const t = layout.planets[hovered.planet].tiers[hovered.tier];
    zoomTo(t.x, t.y, 260, CONFIG.ZOOM_TARGET_PERCENT);
    focused.planet = hovered.planet; focused.tier = hovered.tier;
    hideDetail(); hideTitle();
  } else if (hovered.type === 'achievement') {
    openDetail(hovered);
  }
}

/* compute zoom scale so that visualSize in world units fills percent of shorter screen side */
function zoomTo(wx, wy, visualSize=220, percent=0.55) {
  const smin = Math.min(W, H);
  const requiredScale = (smin * percent) / visualSize;
  targetCam.x = -wx;
  targetCam.y = -wy;
  targetCam.scale = requiredScale;
}

/* reset */
function resetView() {
  targetCam.x = 0; targetCam.y = 0; targetCam.scale = CONFIG.INITIAL_SCALE;
  focused.planet = null; focused.tier = null;
  hideDetail(); hideTitle();
}

/* -------------------------------------------------------------
   Title card anchored to node (will be shown above hologram)
   ------------------------------------------------------------- */
function showTitleAtNode(node, hoverInfo) {
  // position titleCard above the node's screen coordinates
  const s = worldToScreen(node._pos.x, node._pos.y);
  const left = s.x;
  const top = s.y - 36; // offset above hologram
  titleCard.style.left = left + 'px';
  titleCard.style.top = top + 'px';
  titleCardTitle.textContent = (node.data.title || '').toUpperCase();
  titleCardSubtitle.textContent = (node.data.description || '').slice(0, 80);
  titleCard.classList.add('show');
}
function showTitleAtPoint(wx, wy, title, subtitle='') {
  const s = worldToScreen(wx, wy);
  titleCard.style.left = s.x + 'px';
  titleCard.style.top = (s.y - 36) + 'px';
  titleCardTitle.textContent = (title || '').toUpperCase();
  titleCardSubtitle.textContent = (subtitle || '').toUpperCase();
  titleCard.classList.add('show');
}
function hideTitle() {
  titleCard.classList.remove('show');
}

/* -------------------------------------------------------------
   Detail panel
   ------------------------------------------------------------- */
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
    if (a) {
      a.status = 'completed'; a.dateCompleted = new Date().toISOString();
      localStorage.setItem('progress', JSON.stringify(achievements));
    }
  } catch (e) { console.warn('completeAchievement failed', e); }
}

/* -------------------------------------------------------------
   Drawing utilities
   ------------------------------------------------------------- */
function lerp(a,b,t){ return a + (b-a) * t; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

/* draw gradient line with glow + moving pulse
   from (x1,y1) to (x2,y2), progress p [0..1] moves the pulse */
function drawGlowingConnector(x1,y1,x2,y2, accent, progress, pulseSize = 6) {
  // base faint line
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.lineTo(x2,y2);
  ctx.stroke();
  ctx.restore();

  // glowing thicker path (shadow)
  ctx.save();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = accent;
  ctx.shadowBlur = 12;
  ctx.shadowColor = accent;
  ctx.globalAlpha = 0.12;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.restore();

  // moving pulse
  const px = x1 + (x2 - x1) * progress;
  const py = y1 + (y2 - y1) * progress;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = accent;
  ctx.shadowBlur = 18;
  ctx.shadowColor = accent;
  ctx.globalAlpha = 0.95;
  ctx.beginPath(); ctx.arc(px, py, pulseSize, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

/* draw planet by tier (tier 0 uses base planet.png, tiers 1..4 use tier2..tier5) */
function drawPlanetByTier(tierIndex, x, y, size) {
  if (tierIndex === 0) {
    if (IMG.planet) ctx.drawImage(IMG.planet, x - size/2, y - size/2, size, size);
    else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x,y,size/2,0,Math.PI*2); ctx.fill(); }
  } else {
    const key = `tier${Math.min(5, tierIndex+1)}`;
    if (IMG[key]) ctx.drawImage(IMG[key], x - size/2, y - size/2, size, size);
    else if (IMG.planet) ctx.drawImage(IMG.planet, x - size/2, y - size/2, size, size);
    else { ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x,y,size/2,0,Math.PI*2); ctx.fill(); }
  }
}

/* -------------------------------------------------------------
   Main draw loop - rAF
   ------------------------------------------------------------- */
let time = 0;
function draw() {
  time += 1/60;

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

  // draw orbit cache (in screen space) to keep crisp rings
  if (orbitCache) {
    ctx.setTransform(1,0,0,1,0,0);
    ctx.drawImage(orbitCache, 0, 0, W*DPR, H*DPR, 0, 0, W, H);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
    ctx.scale(camera.scale, camera.scale);
  }

  // center image
  if (IMG.center) ctx.drawImage(IMG.center, -110, -110, 220, 220);

  // draw planets and connectors deterministically
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
  for (const p of layout.planets) {
    // base planet (tier 0)
    drawPlanetByTier(0, p.x, p.y, CONFIG.PLANET_SIZE);

    // planet label ALL CAPS
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Electrolize, Arial'; ctx.textAlign = 'center';
    ctx.fillText((p.data.planetName || '').toUpperCase(), p.x, p.y + CONFIG.PLANET_SIZE/2 + 16 / camera.scale);
    ctx.restore();

    // draw tiers with connectors and pulses
    for (const t of p.tiers) {
      // base connector and animated pulse
      const prog = (time * (CONFIG.PULSE_SPEED + (t.index * 0.02))) % 1;
      drawGlowingConnector(p.x, p.y, t.x, t.y, accent, prog, 6);

      // draw tier planet image for tier index
      drawPlanetByTier(t.index, t.x, t.y, CONFIG.TIER_SIZE);

      // draw junction always (floating outside)
      const jx = t.x + (t.x - p.x) * 0.12;
      const jy = t.y + (t.y - p.y) * 0.12;
      drawAtlas('junction', jx, jy, 22, 1);

      // tier label
      ctx.save(); ctx.fillStyle = '#fff'; ctx.font = '11px Electrolize, Arial'; ctx.textAlign = 'center';
      ctx.fillText((t.data.tierName || `TIER ${t.index+1}`).toUpperCase(), t.x, t.y - CONFIG.TIER_SIZE/2 - 10); ctx.restore();

      // nodes (always visible)
      for (let n=0;n<t.achievements.length;n++){
        const node = t.achievements[n];
        // draw hologram under node first
        drawAtlas('hologram', node._pos.x, node._pos.y, Math.max(28, node._pos.r*2.2), node._hoverAlpha || 0.0);

        // draw node icon on top
        const iconKey = (node.data.status === 'locked') ? 'lock' : 'node';
        drawAtlas(iconKey, node._pos.x, node._pos.y, CONFIG.ACH_ICON, 1);

        // small title beside node on larger zooms
        if (camera.scale > 1.6) {
          ctx.save(); ctx.fillStyle = '#fff'; ctx.font = '10px Electrolize, Arial'; ctx.textAlign = 'left';
          ctx.fillText((node.data.title || '').toUpperCase(), node._pos.x + CONFIG.ACH_ICON/2 + 6, node._pos.y + 4); ctx.restore();
        }
      }
    }
  }

  ctx.restore();

  // atmosphere vignette when zoomed in (subtle)
  const atm = clamp((camera.scale - CONFIG.INITIAL_SCALE * 2) / (CONFIG.INITIAL_SCALE * 4), 0, 1);
  if (atm > 0.001) {
    const g = ctx.createRadialGradient(W/2, H/2, 60, W/2, H/2, Math.max(W,H)*0.75);
    g.addColorStop(0, `rgba(10,20,30,${0.06 * atm})`);
    g.addColorStop(1, `rgba(0,0,0,0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // update hovered node hologram alpha transitions
  for (const p of layout.planets) for (const t of p.tiers) for (const a of t.achievements) {
    if (hovered && hovered.type === 'achievement' && hovered.planet === p.index && hovered.tier === t.index && a === t.achievements?.[hovered.ach]) {
      a._hoverAlpha = lerp(a._hoverAlpha || 0, 1, 0.16);
    } else {
      a._hoverAlpha = lerp(a._hoverAlpha || 0, 0, 0.12);
    }
  }

  requestAnimationFrame(draw);
}

/* -------------------------------------------------------------
   Init sequence
   ------------------------------------------------------------- */
async function init() {
  // CSS accent
  document.documentElement.style.setProperty('--accent', (themeColorEl && themeColorEl.value) || '#00c8ff');

  // preload simple assets
  IMG.center = await loadImage(ASSETS.center);
  IMG.planet = await loadImage(ASSETS.planet);
  IMG.planethover = await loadImage(ASSETS.planethover);
  IMG.tier2 = await loadImage(ASSETS.tier2);
  IMG.tier3 = await loadImage(ASSETS.tier3);
  IMG.tier4 = await loadImage(ASSETS.tier4);
  IMG.tier5 = await loadImage(ASSETS.tier5);

  // atlas
  await buildAtlas();

  // caches
  buildStarCache();
  buildOrbitCache(Math.max(W,H) * 0.95);

  // load data
  await loadData();
  buildLayout();

  // initial camera
  camera.x = targetCam.x = 0; camera.y = targetCam.y = 0; camera.scale = targetCam.scale = CONFIG.INITIAL_SCALE;

  // start draw
  requestAnimationFrame(draw);
}
init().catch(e => console.error('init failed', e));

/* -------------------------------------------------------------
   Small utilities for admin UI used previously
   ------------------------------------------------------------- */
window.loginAdmin = () => {
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
window.editTitle = (i,j,k,v) => { achievements.planets[i].tiers[j].achievements[k].title = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editDesc = (i,j,k,v) => { achievements.planets[i].tiers[j].achievements[k].description = v; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.editStatus = (i,j,k,v) => { achievements.planets[i].tiers[j].achievements[k].status = v; achievements.planets[i].tiers[j].achievements[k].dateCompleted = v === 'completed' ? new Date().toISOString() : null; localStorage.setItem('progress', JSON.stringify(achievements)); };
window.downloadJson = () => { const blob = new Blob([JSON.stringify(achievements, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'achievements.json'; a.click(); };
window.bulkUnlock = () => { achievements.planets.forEach(p => p.tiers.forEach(t => t.achievements.forEach(a => a.status = 'available'))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All unlocked'); };
window.bulkReset = () => { achievements.planets.forEach(p => p.tiers.forEach((t, j) => t.achievements.forEach(a => { a.status = j === 0 ? 'available' : 'locked'; a.dateCompleted = null; }))); localStorage.setItem('progress', JSON.stringify(achievements)); alert('All reset'); };

/* End of script.js */
