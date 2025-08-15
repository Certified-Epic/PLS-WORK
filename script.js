// script.js — Fit-on-load, cursor zoom, wider spacing, nodes-on-planet, optimized draws

const canvas = document.getElementById('starChart');
const ctx = canvas.getContext('2d', { alpha: false });

let W = innerWidth, H = innerHeight;
function resize(){
  W = innerWidth; H = innerHeight;
  canvas.width = W; canvas.height = H;
  buildStaticLayer(); // rebuild star/orbit background
}
addEventListener('resize', resize);
resize();

// UI
const themeColorInput = document.getElementById('themeColor');
const themeGradientSelect = document.getElementById('themeGradient');
const resetViewBtn = document.getElementById('resetView');
themeColorInput.addEventListener('input', e => setTheme(e.target.value));
themeGradientSelect.addEventListener('change', () => buildStaticLayer());
resetViewBtn.addEventListener('click', ()=> autoFit());

// Assets (assumes assets/ folder exists)
const assets = {
  center: loadImg('./assets/center.png'),
  planet: loadImg('./assets/planet.png'),
  planethover: loadImg('./assets/planethover.png'),
  node: loadImg('./assets/node.png'),
  lock: loadImg('./assets/lock.png'),
  pulse: loadImg('./assets/pulse.png'),
  junction: loadImg('./assets/junction.png'),
  hologram: loadImg('./assets/achievementnodehologram.png'),
  tier2: loadImg('./assets/tier2.png'),
  tier3: loadImg('./assets/tier3.png'),
  tier4: loadImg('./assets/tier4.png'),
  tier5: loadImg('./assets/tier5.png'),
  completedTier: loadImg('./assets/completedplanettier.png'),
};
function loadImg(src){ const i=new Image(); i.src=src; return i; }

// Data loading
let achievements = { planets: [] };
async function loadData(){
  try{
    const r = await fetch('./achievements.json');
    achievements = await r.json();
  } catch(e){
    console.warn('achievements.json error', e);
    achievements = { planets: Array.from({length:8}).map((_,i)=>({
      planetName:`Planet ${i+1}`,
      tiers: Array.from({length:5}).map((__,j)=>({ tierName:`Tier ${j+1}`, achievements: Array.from({length:6}).map((___,k)=>({ title:`N${i+1}-${j+1}-${k+1}`, description:'Demo', status: j===0?'available':'locked' })) }))
    }))};
  }
  prepareLayout();
  autoFit();
}
loadData();

// Camera & interaction state
const camera = { x:0, y:0, scale:0.5 };
const target = { x:0, y:0, scale:0.5 }; // smoothed target
let easing = 0.12;
let focused = null; // {planetIndex}
let hovered = null;
let t = 0;

// Layout constants — increased spacing so planets appear far apart
const CORE_RADIUS = 380;   // inner core radius
const ORBIT_GAP = 260;     // distance between orbits (in world units) - increased
const PLANET_SIZE = 86;    // default size (tier planets)
const FOCUS_PLANET_SCREEN_RATIO = 0.60; // when focused, planet occupies ~60% of screen
const MAX_PLANET_PER_ORBIT = 5; // keep per-orbit modest to avoid overlap
const TIER_SPACING = 160;  // distance from core planet outwards for tiers
const NODE_SIZE = 18;
const HOLO_SCALE = 1.4;

// Offscreen static layer (stars + base orbits)
let off = document.createElement('canvas');
let offCtx = off.getContext('2d');
function buildStaticLayer(){
  off.width = W; off.height = H;
  offCtx.clearRect(0,0,W,H);

  // stars (reduced count for performance)
  for(let i=0;i<380;i++){
    offCtx.fillStyle = 'white';
    offCtx.globalAlpha = Math.random()*0.7 + 0.05;
    const x = Math.random()*W, y = Math.random()*H, s = Math.random()*1.6+0.2;
    offCtx.fillRect(x,y,s,s);
  }
  offCtx.globalAlpha = 1;

  // central concentric orbits (perspective)
  offCtx.strokeStyle = 'rgba(255,255,255,0.06)';
  offCtx.lineWidth = 1;
  const cx = W/2, cy = H/2;
  const maxR = Math.hypot(W, H) * 0.8;
  for(let r = CORE_RADIUS; r < maxR; r += ORBIT_GAP){
    offCtx.beginPath(); offCtx.arc(cx, cy, r, 0, Math.PI*2); offCtx.stroke();
  }
}

// Theme helpers
let cachedGrad = null;
function setTheme(hex){
  document.documentElement.style.setProperty('--accent', hex);
  cachedGrad = hex;
  buildStaticLayer();
}
setTheme(themeColorInput.value);

// Utility math (screen/world conversions)
function worldToScreen(wx,wy){
  return { x: (wx + camera.x) * camera.scale + W/2, y: (wy + camera.y) * camera.scale + H/2 };
}
function screenToWorld(sx,sy){
  return { x: (sx - W/2)/camera.scale - camera.x, y: (sy - H/2)/camera.scale - camera.y };
}

// Planet placement logic — spread out but on orbits, avoid linearity
function prepareLayout(){
  const n = achievements.planets.length;
  achievements.planets.forEach((p, idx)=>{
    // orbit index (spread planets across many orbits; few per orbit)
    const orbitIndex = Math.floor(idx / MAX_PLANET_PER_ORBIT);
    const within = idx % MAX_PLANET_PER_ORBIT;
    const orbitRadius = CORE_RADIUS + (orbitIndex * ORBIT_GAP) + (orbitIndex * 24);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const baseAngle = within * (Math.PI*2 / MAX_PLANET_PER_ORBIT) + orbitIndex*golden;
    // small outward jitter to avoid perfect circle alignment
    const radialJitter = (Math.sin(idx*13.7) + Math.cos(idx*7.3)) * 12;
    const x = Math.cos(baseAngle) * (orbitRadius + radialJitter);
    const y = Math.sin(baseAngle) * (orbitRadius + radialJitter) * 0.96;
    p._pos = { x, y, angle: baseAngle, orbitRadius };
    // compute tier positions for later (scattered slightly away from center)
    p.tiers.forEach((t, j)=>{
      const angle = baseAngle + (j*0.18) * ((j%2) ? 1 : -1);
      const dist = TIER_SPACING + j * (TIER_SPACING*0.7) + (j*6);
      const tx = x + Math.cos(angle) * dist;
      const ty = y + Math.sin(angle) * dist * 0.96;
      t._pos = {x:tx, y:ty};
    });
  });
}

// Fit all planets on screen on initial load (autoFit)
function autoFit(){
  if(!achievements.planets || achievements.planets.length === 0) return;
  // compute bounding box of planet positions (world coords)
  let minX=1e9, maxX=-1e9, minY=1e9, maxY=-1e9;
  achievements.planets.forEach(p=>{
    const x = p._pos.x, y = p._pos.y;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    p.tiers.forEach(t=>{
      minX = Math.min(minX, t._pos.x); maxX = Math.max(maxX, t._pos.x);
      minY = Math.min(minY, t._pos.y); maxY = Math.max(maxY, t._pos.y);
    });
  });
  // include some padding
  const padding = 140;
  const worldW = (maxX - minX) + padding;
  const worldH = (maxY - minY) + padding;
  // determine target scale so entire worldW/worldH fits viewport
  const scaleX = W / worldW;
  const scaleY = H / worldH;
  const fitScale = Math.min(scaleX, scaleY) * 0.85; // reduce slightly to keep margin
  target.scale = Math.max(0.22, Math.min(1.2, fitScale)); // clamp so we don't zoom too close
  // center target on bounding box center
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  target.x = -centerX;
  target.y = -centerY;
  // update camera instantly on first load (no huge pan)
  camera.x = target.x; camera.y = target.y; camera.scale = target.scale;
}

// zoom toward pointer (wheel) — preserves world position under cursor
canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  const delta = -e.deltaY * 0.0016;
  const oldScale = target.scale;
  const newScale = clamp(target.scale * (1 + delta), 0.18, 8.0);
  // world coordinate under cursor before zoom
  const worldBefore = screenToWorld(e.clientX, e.clientY);
  target.scale = newScale;
  // world coordinate after zoom (if camera stayed same)
  const worldAfter = screenToWorld(e.clientX, e.clientY);
  // adjust camera target so worldBefore remains under cursor
  target.x += (worldAfter.x - worldBefore.x);
  target.y += (worldAfter.y - worldBefore.y);
}, { passive:false });

// pointer pan
let isDown = false, start = null;
canvas.addEventListener('pointerdown', (e)=>{
  isDown = true; start = {x:e.clientX, y:e.clientY, tx: target.x, ty: target.y};
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e)=>{
  if(isDown && start){
    const dx = (e.clientX - start.x) / target.scale;
    const dy = (e.clientY - start.y) / target.scale;
    target.x = start.tx + dx; target.y = start.ty + dy;
  }
});
canvas.addEventListener('pointerup', (e)=>{
  isDown = false; start = null; canvas.releasePointerCapture?.(e.pointerId);
});

// click to focus
canvas.addEventListener('click', (e)=>{
  if(hovered && hovered.type === 'planet'){
    focusPlanet(hovered.index, e.clientX, e.clientY);
  } else if(hovered && hovered.type === 'node'){
    openDetail(hovered.p, hovered.t, hovered.n);
  } else if(hovered && hovered.type === 'junction'){
    // if allowed, zoom to next planet or tier
    const h = hovered;
    const p = achievements.planets[h.index];
    // require this tier to be completed to follow junction
    const allDone = p.tiers[h.tierIndex].achievements.every(a=>a.status==='completed');
    if(allDone && achievements.planets[h.index + 1]){
      focusPlanet(h.index + 1);
    } else {
      showTempMessage('Tier locked — complete achievements first');
    }
  }
});

// focus a planet — zoom so it fills ~60% of screen centered at planet world pos.
// if cursorX/Y provided, bias zoom center toward cursor to keep feeling of zoom focus
function focusPlanet(index, cursorX=null, cursorY=null){
  const p = achievements.planets[index];
  if(!p || !p._pos) return;
  const world = p._pos;
  // compute scale so planet occupies ~60% of screen; planet size in world units we'll treat as PLANET_SIZE
  // desiredScale = (screenDesiredPx / planetWorldSizePx) but planetWorldSizePx ~ PLANET_SIZE (constant), so:
  const screenDesired = Math.min(W,H) * FOCUS_PLANET_SCREEN_RATIO;
  const desired = screenDesired / (PLANET_SIZE * 1.0);
  target.scale = clamp(desired, 1.8, 9.0);
  // center on planet, but if cursor given, do offset so pointer remains near same relative position
  const desiredWorldX = world.x;
  const desiredWorldY = world.y;
  if(cursorX !== null && cursorY !== null){
    // compute world under cursor now then compute offset so it stays near cursor after zoom
    const before = screenToWorld(cursorX, cursorY);
    // set scale first then compute world under cursor after scale
    const prevScale = camera.scale;
    const tempScale = target.scale;
    // compute what camera.x/y would need to be to keep before under cursor
    // worldToScreen: sx = (wx + camx) * s + W/2  -> camx = sx/s - wx - W/(2s)
    // We want worldBefore to be at same screen cursor, so compute camx/ camy after scale:
    const camxAfter = (cursorX - W/2)/tempScale - before.x;
    const camyAfter = (cursorY - H/2)/tempScale - before.y;
    target.x = camxAfter;
    target.y = camyAfter;
  } else {
    target.x = -desiredWorldX;
    target.y = -desiredWorldY;
  }
  focused = { index };
}

// small message popup (temporary)
function showTempMessage(txt){
  const hc = document.getElementById('hoverCard');
  hc.textContent = txt; hc.style.left = (W/2)+'px'; hc.style.top = (H - 80)+'px';
  hc.classList.add('show');
  setTimeout(()=> hc.classList.remove('show'), 1600);
}

// open detail modal for node
const modal = document.getElementById('detailModal');
function openDetail(pIdx, tIdx, nIdx){
  const a = achievements.planets[pIdx].tiers[tIdx].achievements[nIdx];
  document.getElementById('detailTitle').textContent = a.title || 'Achievement';
  document.getElementById('detailDesc').textContent = a.description || '';
  document.getElementById('detailStatus').textContent = 'Status: ' + a.status;
  document.getElementById('detailDate').textContent = a.dateCompleted ? `Completed: ${new Date(a.dateCompleted).toLocaleString()}` : '';
  document.getElementById('completeBtn').onclick = ()=>{ a.status='completed'; a.dateCompleted=new Date().toISOString(); saveProgress(); modal.classList.add('hidden'); };
  modal.classList.remove('hidden');
}
document.getElementById('closeDetail').addEventListener('click', ()=> modal.classList.add('hidden'));

// save progress
function saveProgress(){ localStorage.setItem('progress', JSON.stringify(achievements)); }

// node-on-planet placement helper (distributes nodes on planet surface)
function projectNodes(cx, cy, radius, count){
  const pts = [];
  const rings = Math.max(1, Math.ceil(count / 8));
  let idx = 0;
  for(let r=0;r<rings;r++){
    const ringCount = Math.ceil(count / rings);
    const rr = radius * (0.45 + (r / (rings + 1)) * 0.5);
    for(let k=0;k<ringCount;k++){
      const ang = (k / ringCount) * Math.PI * 2 + r*0.2;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr * 0.9;
      pts.push({x,y});
      idx++; if(idx>=count) break;
    }
    if(idx>=count) break;
  }
  return pts;
}

// glow moving line (path pulse) — draws a light streak moving along the line
function drawMovingGlow(x1,y1,x2,y2, speed, offset){
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx,dy);
  if(len < 1) return;
  const nx = dx / len, ny = dy / len;
  const seg = Math.max(24, 120 / target.scale);
  const prog = ((t * speed) + offset) % 1;
  const start = prog * (len + seg) - seg;
  const a = Math.max(0, start);
  const b = Math.min(len, start + seg);
  // base faint line
  ctx.save();
  ctx.lineWidth = Math.max(1.2, 2.2 / target.scale);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  // bright traveling segment
  if(b > a){
    ctx.lineWidth = Math.max(2.4, 4 / target.scale);
    ctx.strokeStyle = cachedGrad || 'rgba(138,243,255,0.95)';
    ctx.shadowBlur = 10;
    ctx.shadowColor = cachedGrad || 'rgba(138,243,255,0.95)';
    ctx.beginPath(); ctx.moveTo(x1 + nx*a, y1 + ny*a); ctx.lineTo(x1 + nx*b, y1 + ny*b); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// tick + render loop
let last = performance.now();
function loop(now){
  const dt = Math.min(0.033, (now - last)/1000);
  last = now;
  t += dt;

  // smooth camera interpolate towards target
  camera.x = lerp(camera.x, target.x, easing);
  camera.y = lerp(camera.y, target.y, easing);
  camera.scale = lerp(camera.scale, target.scale, easing);

  // clear & draw static offscreen
  ctx.clearRect(0,0,W,H);
  if(off) ctx.drawImage(off, 0, 0);

  // apply camera transform
  ctx.save();
  ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // center visual
  if(assets.center.complete) ctx.drawImage(assets.center, -PLANET_SIZE/2, -PLANET_SIZE/2, PLANET_SIZE, PLANET_SIZE);

  // reset hovered each frame
  hovered = null;

  // draw planets and tiers
  achievements.planets.forEach((p, idx)=>{
    const pos = p._pos;
    if(!pos) return;
    // draw orbit arc for this planet's orbit (subtle)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1 / camera.scale;
    ctx.beginPath();
    ctx.arc(0,0, pos.orbitRadius, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();

    // planet draw
    const px = pos.x, py = pos.y;
    const planetR = PLANET_SIZE * 0.9;

    // detect mouse-over (use screen coords)
    const s = worldToScreen(px, py);
    const screenDist = Math.hypot(mouseX - s.x, mouseY - s.y);
    const hoverThresh = Math.max(28, planetR * camera.scale * 0.6);
    const isPlanetHover = screenDist < hoverThresh;

    // draw main planet icon (choose tier style if needed)
    if(assets.planet.complete) ctx.drawImage(assets.planet, px - planetR/2, py - planetR/2, planetR, planetR);
    // small label when zoomed out
    if(camera.scale < 1.6){
      ctx.save(); ctx.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue('--font-main') || 'Electrolize'}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.fillText(p.planetName || `Planet ${idx+1}`, px, py + planetR*0.65); ctx.restore();
    }

    // show junction only when hovering the planet and draw path
    if(isPlanetHover){
      const jx = px + Math.cos(pos.angle) * (planetR + 36);
      const jy = py + Math.sin(pos.angle) * (planetR + 36);
      if(assets.junction.complete) ctx.drawImage(assets.junction, jx - 12, jy - 12, 24, 24);
      drawMovingGlow(px, py, jx, jy, 0.55, idx*0.07);
      hovered = hovered || { type:'planet', index: idx };
      // show hover card near mouse
      showHover(mouseX, mouseY, p.planetName || `Planet ${idx+1}`);
    }

    // if this planet is focused, draw nodes on surface (layered on planet)
    if(focused && focused.index === idx){
      // nodes aggregated from all tiers (but we keep junctions external)
      const allNodes = [];
      p.tiers.forEach((tObj, ti)=> tObj.achievements.forEach((a, ni)=> allNodes.push({a, ti, ni})));
      const pts = projectNodes(px, py, planetR*0.95, allNodes.length);
      allNodes.forEach((entry, k)=>{
        const {a, ti, ni} = entry;
        const pt = pts[k];
        // draw path pulse from planet center to node
        drawMovingGlow(px, py, pt.x, pt.y, 0.9, k*0.06);
        // hologram under node
        if(assets.hologram.complete) ctx.drawImage(assets.hologram, pt.x - NODE_SIZE*HOLO_SCALE/2, pt.y - NODE_SIZE*HOLO_SCALE/2, NODE_SIZE*HOLO_SCALE, NODE_SIZE*HOLO_SCALE);
        // node icon
        const icon = (a.status === 'locked' && assets.lock.complete) ? assets.lock : (assets.node.complete ? assets.node : null);
        if(icon) ctx.drawImage(icon, pt.x - NODE_SIZE/2, pt.y - NODE_SIZE/2, NODE_SIZE, NODE_SIZE);
        // glow for available nodes
        if(a.status === 'available' && assets.pulse.complete){
          const pul = NODE_SIZE + Math.sin(t*6 + k)*3;
          ctx.globalAlpha = 0.45 + 0.25*Math.sin(t*5 + k);
          ctx.drawImage(assets.pulse, pt.x - pul/2, pt.y - pul/2, pul, pul);
          ctx.globalAlpha = 1;
        }
        // small title next to node (always placed on-planet)
        ctx.save(); ctx.font = `11px ${getComputedStyle(document.documentElement).getPropertyValue('--font-main')}`; ctx.fillStyle = 'white'; ctx.textAlign = 'left';
        ctx.fillText(a.title || '', pt.x + NODE_SIZE/2 + 6, pt.y + 4); ctx.restore();
        // hover detection: if mouse over node in screen coords
        const sc = worldToScreen(pt.x, pt.y);
        if(Math.hypot(mouseX - sc.x, mouseY - sc.y) < Math.max(14, NODE_SIZE * camera.scale * 0.9)){
          hovered = { type:'node', p: idx, t: ti, n: ni };
          showHover(mouseX, mouseY, a.title || 'Achievement');
        }
      });
      // draw an outside junction for progression (single, outside)
      const jx = px + Math.cos(pos.angle) * (planetR + 68);
      const jy = py + Math.sin(pos.angle) * (planetR + 68);
      if(assets.junction.complete) ctx.drawImage(assets.junction, jx - 12, jy - 12, 24, 24);
      drawMovingGlow(px, py, jx, jy, 0.55, idx*0.07);
      // detect hover on junction
      const scj = worldToScreen(jx, jy);
      if(Math.hypot(mouseX - scj.x, mouseY - scj.y) < 18){
        hovered = hovered || { type:'junction', index: idx, tierIndex: 0 };
        showHover(mouseX, mouseY, 'Junction (travel)');
      }
    }

  }); // end planets

  ctx.restore();

  // hide hover card if nothing hovered
  if(!hovered) hideHover();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// simple lerp
function lerp(a,b,f){ return a + (b-a) * f; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

// mouse tracking
let mouseX = -9999, mouseY = -9999;
document.addEventListener('mousemove', (e)=>{ mouseX = e.clientX; mouseY = e.clientY; });

// hover card UI
const hoverCard = document.getElementById('hoverCard');
function showHover(x,y, txt){
  hoverCard.textContent = txt || '';
  hoverCard.style.left = x + 'px'; hoverCard.style.top = y + 'px';
  if(!hoverCard.classList.contains('show')) hoverCard.classList.add('show');
}
function hideHover(){ hoverCard.classList.remove('show'); }

// focus on load: compute a reasonable fit so all planets visible
function fitAndCenter(){
  if(!achievements.planets || achievements.planets.length === 0) return;
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  achievements.planets.forEach(p=>{
    minX = Math.min(minX, p._pos.x); maxX = Math.max(maxX, p._pos.x);
    minY = Math.min(minY, p._pos.y); maxY = Math.max(maxY, p._pos.y);
    p.tiers.forEach(t=>{ minX = Math.min(minX, t._pos.x); maxX = Math.max(maxX, t._pos.x); minY = Math.min(minY, t._pos.y); maxY = Math.max(maxY, t._pos.y); });
  });
  const pad = 180;
  const worldW = (maxX - minX) + pad;
  const worldH = (maxY - minY) + pad;
  const scaleX = W / worldW; const scaleY = H / worldH;
  const s = Math.min(scaleX, scaleY) * 0.85;
  target.scale = clamp(s, 0.18, 1.2);
  const centerX = (minX + maxX)/2, centerY = (minY + maxY)/2;
  target.x = -centerX; target.y = -centerY;
  camera.x = target.x; camera.y = target.y; camera.scale = target.scale;
}
function autoFit(){ fitAndCenter(); focused = null; }

// expose focusPlanet for click (no cursor bias)
function focusPlanetSimple(idx){ focusPlanet(idx); }

// project nodes on planet (returns world coords)
function projectNodes(cx, cy, radius, count){
  const pts = [];
  const rings = Math.max(1, Math.ceil(count / 8));
  let placed = 0;
  for(let r=0;r<rings;r++){
    const ringCount = Math.ceil(count / rings);
    const rr = radius * (0.45 + (r/(rings+1))*0.5);
    for(let i=0;i<ringCount && placed<count;i++){
      const ang = (i / ringCount) * Math.PI*2 + r*0.2;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr * 0.92;
      pts.push({x,y});
      placed++;
    }
  }
  return pts;
}

// get world pos for planet index
function getPlanetWorldPos(index){
  return achievements.planets[index]._pos;
}

// when loaded & layout prepared, fit all planets
function prepareAndFit(){
  prepareLayout();
  fitAndCenter();
}
window.prepareAndFit = prepareAndFit; // debug helper

// initial prepare after loadData completes: prepareLayout() called from loadData
// fit on first available data
setTimeout(()=> { if(achievements.planets && achievements.planets.length) prepareAndFit(); }, 300);

// small helpers for modal and admin omitted for brevity (keep previous approach)
// ... you can keep/reuse admin code from your previous version

// utility: simple image completeness checks used in earlier code - not necessary here

// End of script
