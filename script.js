/* script.js
   Fixed typo + reworked glowing connector (Bezier curved path + moving pulses).
   Deterministic on-surface node placement, mobile-friendly input.
   Tweak CONFIG at top for spacing/zoom.
*/

/* ========== CONFIG ========== */
const CONFIG = {
  PLANET_COUNT: 5,
  TIERS_PER_PLANET: 5,
  CORE_RADIUS: 520,
  TIER_BASE_OFFSET: 160,
  TIER_SPACING: 160,
  CORE_PLANET_VISUAL: 420,
  TIER_VISUAL: 120,
  NODE_ICON: 22,
  NODE_LABEL_OFFSET: 14,
  NODE_MIN_RADIUS_FACTOR: 0.35,
  NODE_MAX_RADIUS_FACTOR: 0.85,
  ZOOM_FILL_PERCENT: 0.66,
  INITIAL_SCALE: 0.38,
  STAR_COUNT: 140,
  PULSE_SPEED: 0.20   // controls pulse speed
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

/* ========== Assets & Atlas ========== */
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
  return new Promise(resolve => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => { console.warn('Image failed to load:', src); resolve(null); };
  });
}

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
  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(atlas.canvas, meta.x, meta.y, meta.w, meta.h, x - size/2, y - size/2, size, size); ctx.restore();
}

/* ========== Background caches ========== */
let starCache = null;
function buildStarCache() {
  starCache = document.createElement('canvas');
  starCache.width = Math.floor(W * DPR);
  starCache.height = Math.floor(H * DPR);
  const sctx = starCache.getContext('2d'); sctx.scale(DPR, DPR);
  sctx.fillStyle = '#000'; sctx.fillRect(0,0,W,H);
  for (let i=0;i<CONFIG.STAR_COUNT;i++){
    const x = Math.random()*W, y = Math.random()*H, r = Math.random()*1.6+0.2;
    sctx.fillStyle = `rgba(255,255,255,${0.18 + Math.random()*0.72})`;
    sctx.fillRect(x,y,r,r);
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
  for (let r=80; r<maxR; r+=CONFIG.TIER_SPACING/2) {
    oc.beginPath(); oc.arc(W/2, H/2, r, 0, Math.PI*2); oc.stroke();
  }
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
    // fallback demo
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

/* ========== Deterministic node angle ========== */
function deterministicAngle(planetIndex, tierIndex, nodeIndex) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const step = ((planetIndex * 7) + (tierIndex * 11) + (nodeIndex * 13)) % 1000;
  return (step * golden) % (Math.PI*2);
}

/* ========== Layout: deterministic on-surface placement ========== */
let layout = { planets: [] };
function buildLayout() {
  layout.planets = [];
  for (let i=0;i<CONFIG.PLANET_COUNT;i++){
    const angle = i * (Math.PI*2 / CONFIG.PLANET_COUNT) - Math.PI/2;
    const px = Math.cos(angle) * CONFIG.CORE_RADIUS;
    const py = Math.sin(angle) * CONFIG.CORE_RADIUS;
    const pdata = achievements.planets[i] || { planetName: `Planet ${i+1}`, tiers: [] };
    const planet = { index: i, x: px, y: py, angle, data: pdata, tiers: [] };
    for (let t=0;t<CONFIG.TIERS_PER_PLANET;t++){
      const dist = (t===0) ? 0 : (CONFIG.TIER_BASE_OFFSET + (t-1) * CONFIG.TIER_SPACING);
      const tx = px + Math.cos(angle) * dist;
      const ty = py + Math.sin(angle) * dist;
      const tdata = pdata.tiers[t] || { tierName: `Tier ${t+1}`, achievements: [] };
      const tier = { index: t, x: tx, y: ty, data: tdata, achievements: [] };
      const count = tdata.achievements.length || 0;
      const planetRadius = (t===0) ? (CONFIG.CORE_PLANET_VISUAL/2) : (CONFIG.TIER_VISUAL/2);
      for (let n=0;n<count;n++){
        const ang = deterministicAngle(i,t,n);
        const rmin = CONFIG.NODE_MIN_RADIUS_FACTOR * planetRadius;
        const rmax = CONFIG.NODE_MAX_RADIUS_FACTOR * planetRadius;
        const rfrac = 0.35 + ((n * 37 + t * 13 + i * 19) % 100) / 100 * 0.6;
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

/* ========== Camera & Interaction ========== */
const camera = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
const targetCam = { x:0, y:0, scale: CONFIG.INITIAL_SCALE };
let easing = 0.14;
let focused = { planet: null, tier: null };
let hovered = null;

let pointer = { down:false, startX:0, startY:0, moved:false, startTime:0 };
canvas.addEventListener('pointerdown', e => {
  pointer.down = true; pointer.startX = e.clientX; pointer.startY = e.clientY; pointer.moved = false; pointer.startTime = Date.now();
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (pointer.down) {
    const dx = e.clientX - pointer.startX, dy = e.clientY - pointer.startY;
    if (Math.hypot(dx,dy) > 8) pointer.moved = true;
    if (pointer.moved) {
      const worldDx = dx / targetCam.scale;
      const worldDy = dy / targetCam.scale;
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
canvas.addEventListener('wheel', e => { e.preventDefault(); targetCam.scale = clamp(targetCam.scale - e.deltaY * 0.0015, 0.18, 10); }, { passive:false });

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

/* ========== Hover, Tap, UI ========== */
function updateHover(sx, sy) {
  const w = screenToWorld(sx, sy);
  hovered = null;
  outer:
  for (const p of layout.planets) {
    for (const t of p.tiers) {
      for (let i=0;i<t.achievements.length;i++){
        const a = t.achievements[i];
        if (dist(w.x,w.y,a._pos.x,a._pos.y) <= Math.max(12, a._pos.r / camera.scale + 6)) {
          hovered = { type: 'achievement', planet: p.index, tier: t.index, ach: i }; break outer;
        }
      }
      if (dist(w.x,w.y,t.x,t.y) < Math.max(18, CONFIG.TIER_VISUAL*0.4)) { hovered = { type:'tier', planet: p.index, tier: t.index }; break outer; }
    }
    if (dist(w.x,w.y,p.x,p.y) < Math.max(36, CONFIG.CORE_PLANET_VISUAL*0.18)) { hovered = { type:'planet', planet: p.index }; break outer; }
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
      showTitleAtPoint(p.x, p.y, (p.data.planetName||'').toUpperCase(), 'CLICK TO ZOOM');
    }
  } else {
    hideTitle();
  }
}

function handleTap(sx, sy) {
  updateHover(sx, sy);
  if (!hovered) { resetView(); return; }
  if (hovered.type === 'achievement') openDetail(hovered);
  else if (hovered.type === 'planet') zoomToPlanet(hovered.planet);
  else if (hovered.type === 'tier') zoomToTier(hovered.planet, hovered.tier);
}

function showTitleForNode(node) {
  const s = worldToScreen(node._pos.x, node._pos.y);
  titleCard.style.left = s.x + 'px';
  titleCard.style.top = (s.y - 40) + 'px';
  titleCardTitle.textContent = (node.data.title||'').toUpperCase();
  titleCardSubtitle.textContent = (node.data.description||'').slice(0,80);
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

/* ========== Detail panel ========== */
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
    if (a) { a.status = 'completed'; a.dateCompleted = new Date().toISOString(); localStorage.setItem('progress', JSON.stringify(achievements)); }
  } catch(e) { console.warn('complete failed', e); }
}

/* ========== Zoom helpers ========== */
function zoomToPlanet(idx) {
  const p = layout.planets[idx];
  const smin = Math.min(W,H);
  const req = (smin * CONFIG.ZOOM_FILL_PERCENT) / CONFIG.CORE_PLANET_VISUAL;
  targetCam.x = -p.x; targetCam.y = -p.y; targetCam.scale = req * 1.05;
  focused.planet = idx; focused.tier = null;
  hideDetail(); hideTitle();
}
function zoomToTier(pi, ti) {
  const t = layout.planets[pi].tiers[ti];
  const smin = Math.min(W,H);
  const req = (smin * CONFIG.ZOOM_FILL_PERCENT) / (CONFIG.TIER_VISUAL * 1.6);
  targetCam.x = -t.x; targetCam.y = -t.y; targetCam.scale = req * 1.12;
  focused.planet = pi; focused.tier = ti;
  hideDetail(); hideTitle();
}
function resetView() { targetCam.x = 0; targetCam.y = 0; targetCam.scale = CONFIG.INITIAL_SCALE; focused.planet = null; focused.tier = null; hideDetail(); hideTitle(); }

/* ========== Glowing connector: curved Bezier + moving pulses ========== */
/* Quadratic Bezier helper */
function bezierPoint(t, p0, cp, p1) {
  const u = 1 - t;
  const x = u*u*p0.x + 2*u*t*cp.x + t*t*p1.x;
  const y = u*u*p0.y + 2*u*t*cp.y + t*t*p1.y;
  return { x, y };
}
/* Get control point: midpoint plus perpendicular offset scaled by distance */
function controlPointFor(x1,y1,x2,y2, strength = 0.26) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  // perpendicular
  const px = -dy / (dist || 1);
  const py = dx / (dist || 1);
  const offset = Math.min(dist * strength, 260); // cap offset
  return { x: mx + px * offset, y: my + py * offset };
}

/* Draw curved glowing connector and moving pulses */
function drawGlowingConnectorBezier(x1,y1,x2,y2, accent, tNow) {
  // compute control point once (curve)
  const cp = controlPointFor(x1,y1,x2,y2, 0.22);

  // base thin stroke
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.quadraticCurveTo(cp.x, cp.y, x2, y2);
  ctx.stroke();
  ctx.restore();

  // glow stroke (fatter with shadow)
  ctx.save();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = accent;
  ctx.shadowBlur = 14;
  ctx.shadowColor = accent;
  ctx.globalAlpha = 0.11;
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.quadraticCurveTo(cp.x, cp.y, x2, y2);
  ctx.stroke();
  ctx.restore();

  // draw several small pulses moving along the curve (gives sense of flow)
  const pulses = 5; // number of light blobs per connector
  for (let i=0;i<pulses;i++){
    // phases offset so they are spaced
    const phase = (tNow * (CONFIG.PULSE_SPEED * 0.7) + i * (1 / pulses)) % 1;
    // easing so pulse has a head and tail
    const eased = (Math.sin(Math.PI * (phase)) ** 1.6); // fade-in/out
    const p = bezierPoint(phase, {x:x1,y:y1}, cp, {x:x2,y:y2});
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // main glow ring
    const size = 6 + eased * 8;
    ctx.fillStyle = accent;
    ctx.shadowBlur = 20 * eased;
    ctx.shadowColor = accent;
    ctx.globalAlpha = 0.9 * eased;
    ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI*2); ctx.fill();
    // small core bright dot
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, size*0.28), 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // optional series of micro points along the curve for a "trail" effect
  // draw faint micro dots along the curve spaced by some step
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = accent;
  for (let s=0; s<=1; s+=0.08) {
    const p = bezierPoint(s, {x:x1,y:y1}, cp, {x:x2,y:y2});
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

/* ========== Draw loop ========== */
let anim = 0;
function draw() {
  anim += 1/60;
  // smooth camera
  camera.x = lerp(camera.x, targetCam.x, easing);
  camera.y = lerp(camera.y, targetCam.y, easing);
  camera.scale = lerp(camera.scale, targetCam.scale, easing);

  ctx.clearRect(0,0,W,H);
  if (starCache) ctx.drawImage(starCache, 0, 0, W, H);

  ctx.save();
  ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // orbit cache in screen space
  if (orbitCache) {
    ctx.setTransform(1,0,0,1,0,0);
    ctx.drawImage(orbitCache, 0, 0, W*DPR, H*DPR, 0, 0, W, H);
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
    ctx.scale(camera.scale, camera.scale);
  }

  // center
  if (IMG.center) ctx.drawImage(IMG.center, -130, -130, 260, 260);

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';

  // planets and tiers; draw connectors using bezier function
  for (const p of layout.planets) {
    // core planet
    if (IMG.planet) ctx.drawImage(IMG.planet, p.x - CONFIG.CORE_PLANET_VISUAL/2, p.y - CONFIG.CORE_PLANET_VISUAL/2, CONFIG.CORE_PLANET_VISUAL, CONFIG.CORE_PLANET_VISUAL);
    else { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(p.x,p.y,CONFIG.CORE_PLANET_VISUAL/2,0,Math.PI*2); ctx.fill(); }

    ctx.save(); ctx.fillStyle = '#fff'; ctx.font='bold 14px Electrolize, Arial'; ctx.textAlign='center';
    ctx.fillText((p.data.planetName||'').toUpperCase(), p.x, p.y + CONFIG.CORE_PLANET_VISUAL/2 + 18 / camera.scale);
    ctx.restore();

    for (const t of p.tiers) {
      // draw connector curve with pulses
      drawGlowingConnectorBezier(p.x, p.y, t.x, t.y, accent, anim);

      // draw tier planet
      const tierSize = CONFIG.TIER_VISUAL;
      const tierKey = t.index === 0 ? 'planet' : `tier${Math.min(5, t.index+1)}`;
      if (t.index === 0 && IMG.planet) ctx.drawImage(IMG.planet, t.x - tierSize/2, t.y - tierSize/2, tierSize, tierSize);
      else if (IMG[tierKey]) ctx.drawImage(IMG[tierKey], t.x - tierSize/2, t.y - tierSize/2, tierSize, tierSize);
      else if (IMG.planet) ctx.drawImage(IMG.planet, t.x - tierSize/2, t.y - tierSize/2, tierSize, tierSize);
      else { ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(t.x,t.y,tierSize/2,0,Math.PI*2); ctx.fill(); }

      // junction floating
      const jx = t.x + (t.x - p.x) * 0.12;
      const jy = t.y + (t.y - p.y) * 0.12;
      drawAtlas('junction', jx, jy, 20, 1);

      // tier label
      ctx.save(); ctx.fillStyle = '#fff'; ctx.font='11px Electrolize, Arial'; ctx.textAlign='center';
      ctx.fillText((t.data.tierName||`Tier ${t.index+1}`).toUpperCase(), t.x, t.y - tierSize/2 - 8);
      ctx.restore();

      // nodes on surface: holo under, node icon, small label
      for (let ni=0; ni<t.achievements.length; ni++){
        const node = t.achievements[ni];
        // hologram under node using atlas
        drawAtlas('hologram', node._pos.x, node._pos.y, Math.max(36, node._pos.r*2.4), node._hover || 0);

        // node icon on top
        const key = (node.data.status === 'locked') ? 'lock' : 'node';
        drawAtlas(key, node._pos.x, node._pos.y, CONFIG.NODE_ICON, 1);

        // label
        const showLabel = camera.scale > 1.0 || (window.innerWidth > 700);
        if (showLabel) {
          ctx.save(); ctx.fillStyle = '#fff'; ctx.font='11px Electrolize, Arial'; ctx.textAlign='left';
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

/* ========== Init sequence ========== */
async function init() {
  document.documentElement.style.setProperty('--accent', (themeColorEl?.value) || '#00c8ff');

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
init().catch(e => console.error('Init error', e));

/* ========== Small utils/admin ========== */
function lerp(a,b,t){ return a + (b-a) * t; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

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

