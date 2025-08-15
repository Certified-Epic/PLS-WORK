/* script.js
   Step-by-step implementation with:
   - top navbar
   - scene + camera with wide shot
   - planet click -> zoom close-up (planet ~50-60% of screen)
   - nodes laid on planet surface, fade-in as you approach
   - junctions floating outside planet surface, gateway to next tier
   - glowing animated orbital lines with pulses
   - single title card (hover) and single detail panel (click)
   - performance: offscreen caches (bitmap), rAF loop, lazy load of high-res textures,
                  simple sprite atlas approach
*/

/* ============================
   0. Quick config (tweak here)
   ============================ */
const CONFIG = {
  canvasPaddingTop: 0,              // topbar height (unused for canvas math but kept)
  initialScale: 0.45,              // camera scale for wide shot
  planetVisibleScale: 2.6,         // scale when a planet is clicked; will be refined to fill 50-60%
  planetFocusPercent: 0.55,        // target: planet should fill ~55% of min(screenWidth,screenHeight)
  nodeShowStart: 1.6,              // camera scale where nodes start to fade in
  nodeShowEnd: 3.0,                // camera scale where nodes fully visible
  atmosphereStart: 2.1,            // start showing atmosphere vignette
  atmosphereFull: 4.2,             // full atmosphere effect
  starCount: 220,                  // reduce for performance
  pulseSpeedBase: 0.18,
  orbitRingSpacing: 40,            // cached orbital ring spacing
  maxOrbitRadiusFactor: 0.95       // how far rings fill
};

/* ============================
   1. Canvas + resize + DPR
   ============================ */
const canvas = document.getElementById('starChart');
const ctx = canvas.getContext('2d', { alpha: true });

let DPR = Math.max(1, window.devicePixelRatio || 1);
let W = 0, H = 0;
function resize(){
  DPR = Math.max(1, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize);
resize();

/* ============================
   2. UI DOM references (top nav + cards)
   ============================ */
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

themeColorEl.addEventListener('input', e => {
  document.documentElement.style.setProperty('--accent', e.target.value);
});
monoToggle.addEventListener('change', e => {
  document.documentElement.style.setProperty('--mono', e.target.checked ? 1 : 0);
});
resetBtn.addEventListener('click', () => resetView());

detailClose?.addEventListener('click', () => hideDetail());
completeBtn?.addEventListener('click', () => {
  if(currentDetail) {
    markComplete(currentDetail);
    hideDetail();
  }
});

/* ============================
   3. Camera & smoothing
   ============================ */
const camera = { x:0, y:0, scale: CONFIG.initialScale };
const targetCam = { x:0, y:0, scale: CONFIG.initialScale };
let easing = 0.14;

function camToWorld(screenX, screenY){
  const cx = W/2 + camera.x * camera.scale;
  const cy = H/2 + camera.y * camera.scale;
  return { x: (screenX - cx) / camera.scale, y: (screenY - cy) / camera.scale };
}
function worldToScreen(wx, wy){
  const cx = W/2 + camera.x * camera.scale;
  const cy = H/2 + camera.y * camera.scale;
  return { x: cx + wx * camera.scale, y: cy + wy * camera.scale };
}

/* ============================
   4. Preload & sprite atlas (simple)
   - We create an offscreen atlas to reduce draw calls for small icons.
   - Lazy load high-res planet textures later when zoomed.
   ============================ */
const IMG = {
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

const loaded = {};
async function loadImagePromise(src){
  return new Promise(res => {
    const img = new Image();
    img.src = src;
    img.onload = () => res(img);
    img.onerror = () => { console.warn('Failed to load', src); res(null); };
  });
}

/* small "atlas" combining icons: node, lock, pulse, junction, hologram
   We draw them onto an offscreen canvas and remember positions to draw from atlas. */
const atlas = { canvas: null, ctx: null, map: {} };
async function buildAtlas(){
  const keys = ['node','lock','pulse','junction','hologram','completedTier'];
  const images = await Promise.all(keys.map(k => loadImagePromise(IMG[k])));
  // atlas size - keep small
  const cell = 128;
  const cols = 3;
  const rows = Math.ceil(keys.length / cols);
  atlas.canvas = document.createElement('canvas');
  atlas.canvas.width = cell * cols;
  atlas.canvas.height = cell * rows;
  atlas.ctx = atlas.canvas.getContext('2d');
  keys.forEach((k,i) => {
    const img = images[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cell, y = row * cell;
    if(img) atlas.ctx.drawImage(img, x, y, cell, cell);
    atlas.map[k] = { x, y, w:cell, h:cell, img: img };
  });
}

/* ============================
   5. Offscreen caches (bitmap) for static backgrounds
   - Starfield and orbital ring caches to avoid recalculating every frame.
   ============================ */
let starCache = null;
function buildStarCache(){
  starCache = document.createElement('canvas');
  starCache.width = Math.floor(W * DPR);
  starCache.height = Math.floor(H * DPR);
  const sctx = starCache.getContext('2d');
  sctx.scale(DPR, DPR);
  // black background (transparent is ok since page background covers)
  sctx.fillStyle = '#000';
  sctx.fillRect(0,0,W,H);
  // draw stars and subtle nebulae
  for(let i=0;i<CONFIG.starCount;i++){
    const x = Math.random()*W, y = Math.random()*H;
    const r = Math.random()*1.6 + 0.2;
    sctx.fillStyle = 'rgba(255,255,255,' + (0.2 + Math.random()*0.8) + ')';
    sctx.fillRect(x, y, r, r);
  }
  // optional soft nebula blobs
  for(let n=0;n<6;n++){
    const nx = Math.random()*W, ny = Math.random()*H, nr = 200 + Math.random()*320;
    const g = sctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
    g.addColorStop(0, 'rgba(60,100,140,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = g; sctx.beginPath(); sctx.arc(nx,ny,nr,0,Math.PI*2); sctx.fill();
  }
}

/* orbit cache - we'll draw lightly used static strokes and reuse them */
let orbitCache = null;
function buildOrbitCache(maxRadius){
  orbitCache = document.createElement('canvas');
  orbitCache.width = Math.floor(W * DPR);
  orbitCache.height = Math.floor(H * DPR);
  const octx = orbitCache.getContext('2d');
  octx.scale(DPR, DPR);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
  octx.strokeStyle = accent;
  octx.globalAlpha = 0.05;
  octx.lineWidth = 1;
  for(let r = 80; r < maxRadius; r += CONFIG.orbitRingSpacing){
    octx.beginPath();
    octx.arc(W/2, H/2, r, 0, Math.PI*2);
    octx.stroke();
  }
}

/* ============================
   6. Example data / achievements.json load
   - We attempt to fetch ./achievements.json; if missing, build demo data.
   ============================ */
let achievements = { planets: [] };
async function loadData(){
  try{
    const res = await fetch('./achievements.json');
    achievements = await res.json();
    // if local progress exists merge it
    const saved = localStorage.getItem('progress');
    if(saved){
      const prog = JSON.parse(saved);
      // naive merge: copy statuses
      prog.planets?.forEach((p,i)=>{
        p.tiers?.forEach((t,j)=>{
          t.achievements?.forEach((a,k)=>{
            if(achievements.planets?.[i]?.tiers?.[j]?.achievements?.[k]){
              achievements.planets[i].tiers[j].achievements[k].status = a.status;
              achievements.planets[i].tiers[j].achievements[k].dateCompleted = a.dateCompleted || null;
            }
          });
        });
      });
    }
  }catch(e){
    console.warn('Could not fetch achievements.json — building demo data', e);
    // build small demo structure with 5 planets x 4 tiers x ~6 achievements
    achievements = { planets: Array.from({length:5}).map((_,pi)=>({
      planetName: `Planet ${pi+1}`,
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

/* ============================
   7. Layout generation: scatter planets, tiers, node positions
   - Planets are sparsely distributed across a large space (Step 2)
   - tier positions placed relative to planet with some random spread
   ============================ */
let layout = { planets: [] };
function buildLayout(){
  layout.planets = [];
  const count = achievements.planets.length;
  const radius = Math.min(W,H) * 0.36; // core orbit radius for scattering
  for(let i=0;i<count;i++){
    // distribute around circle but add randomized radius and angle jitter so planets are scattered
    const angle = i * (Math.PI*2 / count) + (Math.random()-0.5)*0.6;
    const rr = radius * (0.6 + Math.random()*0.9); // variable distance
    const x = Math.cos(angle) * rr;
    const y = Math.sin(angle) * rr;
    const planet = { index:i, x, y, angle, data: achievements.planets[i] };
    planet.tiers = [];
    // tiers: place outward from planet with some perpendicular offsets (Step 5)
    const tierCount = planet.data.tiers.length;
    for(let j=0;j<tierCount;j++){
      const baseDist = 120 + j * 110;
      // small spread angle so tiers not in straight line
      const spread = ((j % 3)-1) * 0.18 * (j+1);
      const tx = x + Math.cos(angle + spread) * baseDist;
      const ty = y + Math.sin(angle + spread) * baseDist;
      const tier = { index: j, x: tx, y: ty, data: planet.data.tiers[j] };
      // precompute achievement positions (compact: on surface) — will be updated during draw for expanded rings
      tier.achievements = tier.data.achievements.map((a,k) => ({ data: a, relAngle: (k / Math.max(1, tier.data.achievements.length)) * Math.PI*2 }));
      planet.tiers.push(tier);
    }
    layout.planets.push(planet);
  }
}

/* ============================
   8. Interaction helpers & state
   ============================ */
let focused = { planet: null, tier: null }; // focused indices
let hovered = null; // {type:'planet'|'tier'|'achievement'|'junction', planet, tier, achIndex}

let pointer = { x:0, y:0, down:false };
canvas.addEventListener('pointerdown', e => {
  pointer.down = true; pointer.x = e.clientX; pointer.y = e.clientY;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointerup', e => {
  pointer.down = false;
  handleClick(e.clientX, e.clientY);
  canvas.releasePointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  if(!pointer.down) updateHover(e.clientX, e.clientY);
  else {
    // drag to pan
    // implement simple drag panning (translate targetCam)
    // we use world space delta for smoother panning
    if(pointer.lastDrag){
      const dx = (e.clientX - pointer.lastDrag.x) / targetCam.scale;
      const dy = (e.clientY - pointer.lastDrag.y) / targetCam.scale;
      targetCam.x += dx; targetCam.y += dy;
    }
    pointer.lastDrag = { x: e.clientX, y: e.clientY };
  }
});
canvas.addEventListener('pointercancel', () => { pointer.down = false; pointer.lastDrag = null; });

function resetView(){
  targetCam.x = 0; targetCam.y = 0; targetCam.scale = CONFIG.initialScale;
  focused.planet = null; focused.tier = null; hideDetail(); hideTitle();
}

/* handle click (zoom logic) Step 3 and Step 5 */
function handleClick(screenX, screenY){
  const w = screenToWorld(screenX, screenY);
  // if clicking on a hovered achievement show details; else handle planet / tier / junction click
  if(hovered){
    if(hovered.type === 'achievement'){
      openDetail(hovered);
      return;
    }
    if(hovered.type === 'junction'){
      // check unlock condition: previous tier all completed
      const planet = layout.planets[hovered.planet];
      const tier = planet.tiers[hovered.tier];
      const prev = tier.data; // current tier; we want to zoom to next tier if all achievements in this tier completed
      const completedAll = prev.achievements.every(a => a.status === 'completed');
      if(completedAll && planet.tiers[hovered.tier + 1]){
        const next = planet.tiers[hovered.tier + 1];
        zoomToTierPlanet(hovered.planet, next.index);
      } else {
        // small hint (use title card)
        showTitle({ title: 'JUNCTION LOCKED', subtitle: 'Complete all achievements in this tier to unlock' });
      }
      return;
    }
    if(hovered.type === 'planet'){
      zoomToPlanet(hovered.planet);
      return;
    }
    if(hovered.type === 'tier'){
      // zoom to tier planet (close-up)
      zoomToTierPlanet(hovered.planet, hovered.tier);
      return;
    }
  } else {
    // click empty space => reset focus
    resetView();
  }
}

/* zoom-to-planet: compute camera target such that planet fills ~50-60% of min(W,H) (Step 3).
   We set targetCam.x,y so world pos maps to center and set scale accordingly. */
function zoomToPlanet(planetIndex){
  const p = layout.planets[planetIndex];
  // compute required scale to make planet appear ~CONFIG.planetFocusPercent of viewport
  const screenMin = Math.min(W, H);
  // planet texture or base size: use a base size, can be adjusted per-planet
  const planetVisualSize = 220; // in world units (drawn size at scale=1)
  const requiredScale = (screenMin * CONFIG.planetFocusPercent) / planetVisualSize;
  // set camera target to center planet
  targetCam.x = -p.x;
  targetCam.y = -p.y;
  targetCam.scale = requiredScale;
  focused.planet = planetIndex; focused.tier = null;
  hideDetail(); hideTitle();
}

/* zoom to a tier planet (closer) — we want nodes visible and planet to occupy ~60% */
function zoomToTierPlanet(planetIndex, tierIndex){
  const t = layout.planets[planetIndex].tiers[tierIndex];
  const screenMin = Math.min(W, H);
  const planetVisualSize = 260; // slightly bigger when focusing a tier
  const requiredScale = (screenMin * CONFIG.planetFocusPercent) / planetVisualSize * 1.05;
  targetCam.x = -t.x;
  targetCam.y = -t.y;
  targetCam.scale = requiredScale * 1.8; // go closer so nodes are visible
  focused.planet = planetIndex; focused.tier = tierIndex;
  hideDetail(); hideTitle();
}

/* ============================
   9. Hover detection (single source of truth)
   - we check planet -> tier -> nodes -> junction
   - when hovering a planet we reveal its junction icons (Step 5)
   ============================ */
function updateHover(screenX, screenY){
  const w = camToWorld(screenX, screenY);
  hovered = null;
  const pickRadius = 22 / camera.scale; // tolerant pick radius
  // planets
  for(let i=0;i<layout.planets.length;i++){
    const p = layout.planets[i];
    if(dist(w.x,w.y,p.x,p.y) < Math.max(28, 60 / camera.scale)){
      hovered = { type:'planet', planet:i };
      break;
    }
  }
  if(!hovered){
    // tiers & junctions & achievements
    for(let i=0;i<layout.planets.length;i++){
      const p = layout.planets[i];
      for(let j=0;j<p.tiers.length;j++){
        const t = p.tiers[j];
        if(dist(w.x,w.y,t.x,t.y) < Math.max(18, 40 / camera.scale)){
          hovered = { type:'tier', planet:i, tier:j };
          break;
        }
        // junction hit detection (slightly outside)
        const jx = t.x + (t.x - p.x) * 0.12;
        const jy = t.y + (t.y - p.y) * 0.12;
        if(dist(w.x,w.y,jx,jy) < Math.max(14, 28 / camera.scale)){
          hovered = { type:'junction', planet:i, tier:j, pos:{x:jx,y:jy} };
          break;
        }
        // achievements: both compact and expanded have _pos computed each frame; we use that for detection
        for(let k=0;k<t.achievements.length;k++){
          const a = t.achievements[k];
          if(a._pos && dist(w.x,w.y,a._pos.x,a._pos.y) < Math.max(8, a._pos.r / camera.scale + 8)){
            hovered = { type:'achievement', planet:i, tier:j, ach:k };
            break;
          }
        }
        if(hovered) break;
      }
      if(hovered) break;
    }
  }

  // show UI accordingly
  if(hovered){
    if(hovered.type === 'achievement'){
      const a = layout.planets[hovered.planet].tiers[hovered.tier].achievements[hovered.ach];
      showTitle({ title: (a.data.title||'').toUpperCase(), subtitle:(a.data.status||'') });
    } else if(hovered.type === 'planet'){
      const p = layout.planets[hovered.planet];
      showTitle({ title: (p.data.planetName||'').toUpperCase(), subtitle:'Click to zoom • Hover to reveal junctions' });
    } else if(hovered.type === 'tier'){
      const t = layout.planets[hovered.planet].tiers[hovered.tier];
      showTitle({ title: (t.data.tierName||'').toUpperCase(), subtitle:`${t.data.achievements.length} NODES` });
    } else if(hovered.type === 'junction'){
      showTitle({ title: 'JUNCTION', subtitle:'Click to travel if unlocked' });
    }
  } else {
    hideTitle();
  }
}

/* ============================
   10. Title & detail UI helpers (single visible at a time)
   - title card is fixed top-right (not near cursor). Hover triggers fade in.
   - detail panel is modal-like center panel with scale+fade.
   ============================ */
let titleTimer = null;
function showTitle({ title, subtitle }){
  titleCardTitle.textContent = (title||'').toUpperCase();
  titleCardSubtitle.textContent = subtitle || '';
  titleCard.classList.add('show');
  titleCard.style.opacity = '1';
  // auto-hide after 4s if not hovered
  if(titleTimer) clearTimeout(titleTimer);
  titleTimer = setTimeout(() => { hideTitle(); }, 4000);
}
function hideTitle(){
  if(titleTimer){ clearTimeout(titleTimer); titleTimer = null; }
  titleCard.classList.remove('show');
}

let currentDetail = null;
function openDetail(h){
  const a = layout.planets[h.planet].tiers[h.tier].achievements[h.ach];
  currentDetail = { planet:h.planet, tier:h.tier, ach:h.ach };
  detailTitle.textContent = (a.data.title||'').toUpperCase();
  detailDesc.textContent = a.data.description || '';
  detailPanel.classList.add('show');
}
function hideDetail(){
  detailPanel.classList.remove('show'); currentDetail = null;
}
function markComplete(detail){
  const a = achievements.planets[detail.planet].tiers[detail.tier].achievements[detail.ach];
  if(a){ a.status = 'completed'; a.dateCompleted = new Date().toISOString(); localStorage.setItem('progress', JSON.stringify(achievements)); }
}

/* ============================
   11. Rendering helpers and sprite draw
   ============================ */
function drawAtlasSprite(key, sx, sy, size, alpha=1){
  // atlas.map[key] has coordinates if buildAtlas executed
  if(atlas.map && atlas.map[key]){
    const cell = atlas.map[key];
    // draw from atlas canvas onto main ctx
    // we scale down/up accordingly
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(atlas.canvas, cell.x, cell.y, cell.w, cell.h, sx - size/2, sy - size/2, size, size);
    ctx.restore();
  } else {
    // fallback: draw simple circle
    ctx.save(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, size/2, 0, Math.PI*2); ctx.fill(); ctx.restore();
  }
}

/* ============================
   12. Main draw loop (rAF)
   - We use cached star & orbit bitmaps to reduce CPU on background
   - We progressively reveal nodes and draw holograms on hover.
   ============================ */
let animTime = 0;
function drawLoop(ts){
  animTime += 1/60;
  // camera smoothing
  camera.x = lerp(camera.x, targetCam.x, easing);
  camera.y = lerp(camera.y, targetCam.y, easing);
  camera.scale = lerp(camera.scale, targetCam.scale, easing);

  // clear & draw cached star background
  ctx.clearRect(0,0,W,H);
  if(starCache) ctx.drawImage(starCache, 0, 0, W, H);
  // transform into world space (centered)
  ctx.save();
  ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // draw orbit caches centered at world origin
  if(orbitCache) {
    // orbit cache was drawn using screen coordinates; we draw it centered at 0,0 adjusting by W/2,H/2
    ctx.save();
    // draw orbits by sampling the orbitCache onto world coords
    ctx.setTransform(1,0,0,1,0,0); // temporarily reset to screen space
    ctx.drawImage(orbitCache, 0, 0, W*DPR, H*DPR, 0, 0, W, H);
    // restore world transform
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
    ctx.scale(camera.scale, camera.scale);
    ctx.restore();
  }

  // center image (star core)
  if(loaded.center) ctx.drawImage(loaded.center, -110, -110, 220, 220);

  // draw planets, tiers, and connections
  for(let p of layout.planets){
    // planet base (tint if locked/completed could be applied here)
    const planetSize = 220; // base visual size
    ctx.save();
    // planethover underlay (if hovered)
    const isPlanetHover = hovered && hovered.type === 'planet' && hovered.planet === p.index;
    if(loaded.planethover && isPlanetHover){
      // draw underlay slightly larger
      ctx.globalAlpha = 0.38;
      ctx.drawImage(loaded.planethover, p.x - planetSize * 0.9 / 2, p.y - planetSize * 0.9 / 2, planetSize*0.9, planetSize*0.9);
      ctx.globalAlpha = 1;
    }
    // lazy load planet image: if high-res is available load earlier; fallback to base
    if(loaded.planet) ctx.drawImage(loaded.planet, p.x - planetSize/2, p.y - planetSize/2, planetSize, planetSize);
    else {
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(p.x,p.y,planetSize/2,0,Math.PI*2); ctx.fill();
    }
    // planet label (caps)
    ctx.font = 'bold 14px Electrolize, Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText((p.data.planetName||'').toUpperCase(), p.x, p.y + planetSize/2 + 18 / camera.scale);
    ctx.restore();

    // draw each tier's connector from planet to tier (with glowing pulses)
    for(let t of p.tiers){
      // base connector
      ctx.save();
      const lineAlpha = 0.12;
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
      ctx.lineWidth = 2 / Math.max(0.6, camera.scale);
      ctx.globalAlpha = lineAlpha;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      ctx.restore();

      // animated pulses along line (moving circles)
      for(let k=0;k<2;k++){
        const prog = (animTime * (CONFIG.pulseSpeedBase + k*0.06) + (t.index*0.14) + (p.index*0.08)) % 1;
        const px = p.x + (t.x - p.x) * prog;
        const py = p.y + (t.y - p.y) * prog;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.9 * (0.35 + Math.sin(animTime*4 + k)*0.12);
        ctx.beginPath(); ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff';
        ctx.arc(px, py, 6 + Math.sin(animTime*6 + k)*1.4, 0, Math.PI*2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // junction (floating slightly outside planet) shown only when parent planet hovered (Step 5)
      const jx = t.x + (t.x - p.x) * 0.12;
      const jy = t.y + (t.y - p.y) * 0.12;
      const showJunc = hovered && hovered.type === 'planet' && hovered.planet === p.index;
      if(showJunc){
        drawAtlasSprite('junction', jx, jy, 28, 1);
      }
    } // end tiers loop
  } // end planets loop

  // draw nodes: we render on top of tiers; nodes positions are computed to be on surface (compact)
  for(let p of layout.planets){
    for(let t of p.tiers){
      // compute node alpha based on camera.scale (nodes fade in as you approach) Step 4
      const vis = clamp((camera.scale - CONFIG.nodeShowStart) / (CONFIG.nodeShowEnd - CONFIG.nodeShowStart), 0, 1);
      // compact nodes: placed on circumference around tier center (so they "lay on the planet")
      const compactR = Math.max( (TIER_VISUAL_SIZE := 60), 18 );
      // but if focused on this tier, we expand them out into rings — compute expanded positions
      let expanded = (focused.planet === p.index && focused.tier === t.index);
      let idx = 0;
      if(expanded){
        // expanded into rings; compute positions
        const perRing = 10;
        const rings = Math.ceil(t.achievements.length / perRing);
        let aidx = 0;
        for(let ring=0; ring<rings; ring++){
          const count = Math.min(perRing, t.achievements.length - ring*perRing);
          const ringR = 36 + ring * 48;
          for(let n=0;n<count;n++){
            const ang = (n/count) * Math.PI*2 + ring*0.12 + animTime*0.02;
            const ax = t.x + Math.cos(ang) * ringR;
            const ay = t.y + Math.sin(ang) * ringR;
            const node = t.achievements[aidx];
            // draw branch glow
            ctx.save(); ctx.globalAlpha = 0.12 + (node.data.status==='available'?0.16:0.05); ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c8ff'; ctx.lineWidth = 1.2 / Math.max(0.6, camera.scale); ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(ax,ay); ctx.stroke(); ctx.restore();
            // draw node icon (node or lock)
            const iconKey = (node.data.status === 'locked') ? 'lock' : 'node';
            drawAtlasSprite(iconKey, ax, ay, 18, vis);
            // pulse on top if available
            if(node.data.status === 'available') drawAtlasSprite('pulse', ax, ay, 28, vis*0.9);
            // hologram under node when hovered: fades in/out (hover state handled later)
            node._pos = { x:ax, y:ay, r:12, alpha: vis };
            aidx++;
          }
        }
      } else {
        // compact: nodes placed on small circle around tier surface
        for(let n=0;n<t.achievements.length;n++){
          const node = t.achievements[n];
          const ang = node.relAngle + animTime*0.006; // slow spin to avoid static layout
          const ax = t.x + Math.cos(ang) * (compactR);
          const ay = t.y + Math.sin(ang) * (compactR);
          drawAtlasSprite(node.data.status === 'locked' ? 'lock' : 'node', ax, ay, 18, vis);
          if(node.data.status === 'available') drawAtlasSprite('pulse', ax, ay, 26, vis*0.9);
          node._pos = { x:ax, y:ay, r:12, alpha:vis };
        }
      }
    } // end tiers
  } // end planets

  // draw hologram onto hovered node (centered on the node, per request)
  if(hovered && hovered.type === 'achievement'){
    const node = layout.planets[hovered.planet].tiers[hovered.tier].achievements[hovered.ach];
    if(node && node._pos){
      // fade hologram in/out using node._hoverAlpha
      node._hoverAlpha = node._hoverAlpha === undefined ? 0 : node._hoverAlpha;
      node._hoverAlpha = lerp(node._hoverAlpha, 1, 0.16);
      drawAtlasSprite('hologram', node._pos.x, node._pos.y, Math.max(28, node._pos.r*2.4), node._hoverAlpha);
    }
  }
  // fade out hologram for other nodes
  for(let p of layout.planets) for(let t of p.tiers) for(let a of t.achievements){
    if(!(hovered && hovered.type === 'achievement' && hovered.planet == p.index && hovered.tier == t.index && a === t.achievements[hovered.ach])){
      a._hoverAlpha = a._hoverAlpha === undefined ? 0 : a._hoverAlpha;
      a._hoverAlpha = lerp(a._hoverAlpha, 0, 0.12);
      // if there's residual alpha, draw smaller subtle hologram
      if(a._hoverAlpha > 0.02) drawAtlasSprite('hologram', a._pos.x, a._pos.y, Math.max(26, a._pos.r*2.2), a._hoverAlpha * 0.6);
    }
  }

  ctx.restore();

  // draw atmosphere vignette when zoomed in (Step: atmospheric approach)
  const atmosFactor = clamp((camera.scale - CONFIG.atmosphereStart) / (CONFIG.atmosphereFull - CONFIG.atmosphereStart), 0, 1);
  if(atmosFactor > 0.001){
    // radial gradient centered on screen
    const g = ctx.createRadialGradient(W/2, H/2, 60, W/2, H/2, Math.max(W,H)*0.75);
    g.addColorStop(0, `rgba(10,20,30,${0.06 * atmosFactor})`);
    g.addColorStop(0.6, `rgba(0,0,0,${0.0})`);
    g.addColorStop(1, `rgba(0,0,0,0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  // UI debug overlay if needed
  if(debugToggle && debugToggle.checked){
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = 'rgba(255,0,0,0.2)';
    ctx.fillRect(6, 60, 160, 28);
    ctx.fillStyle = '#fff';
    ctx.fillText('DEBUG ON', 12, 80);
    ctx.restore();
  }

  // update camera to match smoothing for next frame
  requestAnimationFrame(drawLoop);
}

/* ============================
   13. Lazy load & init sequence
   - build atlas, caches, load data, build layout, then start draw loop
   ============================ */
async function init(){
  // set CSS accent var
  document.documentElement.style.setProperty('--accent', themeColorEl.value);
  // load smaller images into "loaded" map (center & planet placeholder & planethover)
  loaded.center = await loadImagePromise(IMG.center);
  loaded.planet = await loadImagePromise(IMG.planet);
  loaded.planethover = await loadImagePromise(IMG.planethover);
  // build atlas (icons + hologram)
  await buildAtlas();
  // build caches
  buildStarCache();
  buildOrbitCache(Math.max(W,H) * CONFIG.maxOrbitRadiusFactor);
  // load achievements data & layout
  await loadData();
  buildLayout();
  // seed initial camera/target
  camera.x = targetCam.x = 0; camera.y = targetCam.y = 0; camera.scale = targetCam.scale = CONFIG.initialScale;
  // start animation loop
  requestAnimationFrame(drawLoop);
}
init();

/* ============================
   14. Detail + title helpers reuse (exposed to user)
   ============================ */
function showTitleCard(text, sub){
  showTitle({ title:text, subtitle:sub });
}
function openDetailFromHover(){
  if(hovered && hovered.type === 'achievement') openDetail(hovered);
}

/* ============================
   15. Utility functions
   ============================ */
function lerp(a,b,t){ return a + (b-a) * t; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }
function showTitle(obj){ titleCardTitle.textContent = (obj.title||'').toUpperCase(); titleCardSubtitle.textContent = obj.subtitle||''; titleCard.classList.add('show'); }
function hideTitle(){ titleCard.classList.remove('show'); }

/* ============================
   16. Debug: expose a small API for testing in console
   ============================ */
window._SC = {
  layout, achievements, resetView, zoomToPlanet, zoomToTierPlanet
};

/* End of script.js */
