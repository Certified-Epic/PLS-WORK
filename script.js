// script.js
// Fixed: offscreen canvas initialized before buildStaticLayer()
// Includes: admin panel functions (login, edit, download, bulk unlock/reset)
// Behavior: Warframe-like star chart (wide orbits, zoom-to-cursor, nodes on planet)

const canvas = document.getElementById('starChart');
const ctx = canvas.getContext('2d', { alpha: false });

let W = innerWidth, H = innerHeight;
function resize(){
  W = innerWidth; H = innerHeight;
  canvas.width = W; canvas.height = H;
  buildStaticLayer();
}
addEventListener('resize', resize);

// ------------------- Offscreen canvas (must be declared before buildStaticLayer) -------------------
let off = document.createElement('canvas');
let offCtx = off.getContext('2d');

// ------------------- Theme & UI hooks -------------------
const themeColorInput = document.getElementById('themeColor');
const themeGradientSelect = document.getElementById('themeGradient');
const resetViewBtn = document.getElementById('resetView');
const adminBtn = document.getElementById('adminButton');

themeColorInput?.addEventListener('input', e => setTheme(e.target.value));
themeGradientSelect?.addEventListener('change', () => buildStaticLayer());
resetViewBtn?.addEventListener('click', () => autoFit());
adminBtn?.addEventListener('click', () => showAdminPanel());

// ------------------- Assets -------------------
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
function loadImg(src){ const i = new Image(); i.src = src; return i; }

// ------------------- Data -------------------
let achievements = { planets: [] };
async function loadData(){
  try{
    const r = await fetch('./achievements.json');
    achievements = await r.json();
  } catch(e){
    console.warn('achievements.json missing — using demo data', e);
    // fallback demo
    achievements = Array.from({length:8}).map((_,pi)=>({
      planetName:`Planet ${pi+1}`,
      tiers: Array.from({length:4}).map((__,ti)=>({
        tierName:`Tier ${ti+1}`,
        achievements: Array.from({length:5}).map((___,ai)=>({
          title:`A${pi+1}-${ti+1}-${ai+1}`,
          description:'Demo achievement',
          status: ti===0? 'available' : 'locked',
          dateCompleted: null
        }))
      }))
    }));
    achievements = { planets: achievements };
  }
  prepareLayout();
  autoFit();
}
loadData();

// restore progress helper
function restoreProgress(){
  const saved = localStorage.getItem('progress');
  if(!saved) return;
  try{
    const prog = JSON.parse(saved);
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
  }catch(e){ console.warn('failed restore progress', e); }
}
restoreProgress();

// ------------------- Layout & constants -------------------
const CORE_RADIUS = 420;
const ORBIT_GAP = 280;        // increased spacing so planets are far apart
const PLANET_SIZE = 92;
const NODE_SIZE = 18;
const HOLO_SCALE = 1.4;
const MAX_PER_ORBIT = 5;
const TIER_SPACING = 150;
const FOCUS_PLANET_SCREEN_RATIO = 0.60;

let t = 0;
let mouseX = -9999, mouseY = -9999;

// Camera
const camera = { x:0, y:0, scale:0.48 };
const target = { x:0, y:0, scale:0.48 };
let easing = 0.12;
let focused = null;
let hovered = null;

// ------------------- build offscreen static background -------------------
function buildStaticLayer(){
  off.width = W; off.height = H;
  offCtx.clearRect(0,0,W,H);

  // stars
  offCtx.globalAlpha = 1;
  for(let i=0;i<420;i++){
    offCtx.fillStyle = 'white';
    offCtx.globalAlpha = (Math.random()*0.7 + 0.06);
    const x = Math.random()*W, y = Math.random()*H, s = Math.random()*1.5+0.2;
    offCtx.fillRect(x, y, s, s);
  }
  offCtx.globalAlpha = 1;

  // concentric orbits (extend to fill canvas)
  offCtx.strokeStyle = 'rgba(255,255,255,0.06)';
  offCtx.lineWidth = 1;
  const cx = W/2, cy = H/2;
  const maxR = Math.hypot(W, H) * 0.9;
  for(let r = CORE_RADIUS; r < maxR; r += ORBIT_GAP){
    offCtx.beginPath();
    offCtx.arc(cx, cy, r, 0, Math.PI*2);
    offCtx.stroke();
  }
}

// ------------------- theme -------------------
let cachedThemeColor = '#8af3ff';
function setTheme(hex){
  cachedThemeColor = hex;
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-weak', hex.replace('#','rgba(') ); // not exact but fine
  buildStaticLayer();
}

// ------------------- layout preparation -------------------
function prepareLayout(){
  const n = achievements.planets.length;
  achievements.planets.forEach((p, idx) => {
    const orbitIndex = Math.floor(idx / MAX_PER_ORBIT);
    const within = idx % MAX_PER_ORBIT;
    const orbitRadius = CORE_RADIUS + (orbitIndex * ORBIT_GAP) + (orbitIndex * 18);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const angle = within * (Math.PI*2 / MAX_PER_ORBIT) + orbitIndex * golden;
    const jitter = (Math.sin(idx*13.7) + Math.cos(idx*7.3)) * 14;
    const x = Math.cos(angle) * (orbitRadius + jitter);
    const y = Math.sin(angle) * (orbitRadius + jitter) * 0.95;
    p._pos = { x, y, angle, orbitRadius };
    p.tiers.forEach((t, j) => {
      const a = angle + (j * 0.14) * ((j % 2) ? 1 : -1);
      const dist = TIER_SPACING + j * (TIER_SPACING * 0.7) + (j*8);
      const tx = x + Math.cos(a) * dist;
      const ty = y + Math.sin(a) * dist * 0.96;
      t._pos = { x: tx, y: ty };
    });
  });
}

// ------------------- autoFit to ensure everything visible on load -------------------
function autoFit(){
  if(!achievements.planets || achievements.planets.length === 0) return;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  achievements.planets.forEach(p=>{
    if(p._pos){ minX = Math.min(minX, p._pos.x); maxX = Math.max(maxX, p._pos.x); minY = Math.min(minY, p._pos.y); maxY = Math.max(maxY, p._pos.y); }
    p.tiers.forEach(t=>{
      if(t._pos){ minX = Math.min(minX, t._pos.x); maxX = Math.max(maxX, t._pos.x); minY = Math.min(minY, t._pos.y); maxY = Math.max(maxY, t._pos.y); }
    });
  });
  const pad = 160;
  const worldW = (maxX - minX) + pad;
  const worldH = (maxY - minY) + pad;
  const scaleX = W / worldW;
  const scaleY = H / worldH;
  const fitScale = Math.min(scaleX, scaleY) * 0.85;
  target.scale = clamp(fitScale, 0.18, 1.2);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  target.x = -centerX; target.y = -centerY;
  // set camera immediately for first load
  camera.x = target.x; camera.y = target.y; camera.scale = target.scale;
  focused = null;
}

// ------------------- input: mouse, pointer & wheel (zoom to cursor) -------------------
document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
let isDown = false, dragStart = null;
canvas.addEventListener('pointerdown', e => { isDown = true; dragStart = {x:e.clientX, y:e.clientY, tx: target.x, ty: target.y}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if(isDown && dragStart){
    const dx = (e.clientX - dragStart.x) / target.scale;
    const dy = (e.clientY - dragStart.y) / target.scale;
    target.x = dragStart.tx + dx;
    target.y = dragStart.ty + dy;
  }
});
canvas.addEventListener('pointerup', e => { isDown = false; dragStart = null; canvas.releasePointerCapture?.(e.pointerId); });

// zoom toward cursor
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = -e.deltaY * 0.0016;
  const oldScale = target.scale;
  const newScale = clamp(target.scale * (1 + delta), 0.18, 9.0);
  const worldBefore = screenToWorld(e.clientX, e.clientY);
  target.scale = newScale;
  const worldAfter = screenToWorld(e.clientX, e.clientY);
  target.x += (worldAfter.x - worldBefore.x);
  target.y += (worldAfter.y - worldBefore.y);
}, { passive:false });

// click behaviours (focus or open)
canvas.addEventListener('click', e => {
  if(!hovered) return;
  if(hovered.type === 'planet'){
    focusPlanet(hovered.index, e.clientX, e.clientY);
  } else if(hovered.type === 'node'){
    openDetail(hovered.p, hovered.t, hovered.n);
  } else if(hovered.type === 'junction'){
    // allow junction only if previous tier is complete
    const h = hovered;
    const p = achievements.planets[h.index];
    const ok = p?.tiers?.[h.tierIndex]?.achievements?.every(a=>a.status==='completed');
    if(ok){
      focusPlanet(h.index + 1 ?? h.index, e.clientX, e.clientY);
    } else {
      showTemp('Tier locked — complete nodes first');
    }
  }
});

// ------------------- world/screen helpers -------------------
function worldToScreen(wx, wy){
  return { x: (wx + camera.x) * camera.scale + W/2, y: (wy + camera.y) * camera.scale + H/2 };
}
function screenToWorld(sx, sy){
  return { x: (sx - W/2)/camera.scale - camera.x, y: (sy - H/2)/camera.scale - camera.y };
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function lerp(a,b,f){ return a + (b-a) * f; }

// ------------------- focus planet (fills ~60% of screen) -------------------
function focusPlanet(index, cursorX=null, cursorY=null){
  const p = achievements.planets[index];
  if(!p || !p._pos) return;
  const world = p._pos;
  // desired scale to show planet ~60% of screen
  const screenDesired = Math.min(W,H) * FOCUS_PLANET_SCREEN_RATIO;
  const desired = screenDesired / (PLANET_SIZE * 1.0);
  target.scale = clamp(desired, 1.8, 9.0);
  if(cursorX !== null && cursorY !== null){
    const before = screenToWorld(cursorX, cursorY);
    // set temp scale to compute after-world under cursor:
    const tempScale = target.scale;
    // compute camera after to keep worldBefore under cursor:
    const camxAfter = (cursorX - W/2)/tempScale - before.x;
    const camyAfter = (cursorY - H/2)/tempScale - before.y;
    target.x = camxAfter; target.y = camyAfter;
  } else {
    target.x = -world.x; target.y = -world.y;
  }
  focused = { index };
}

// ------------------- small temp message (uses hover card) -------------------
function showTemp(text){
  const hc = document.getElementById('hoverCard');
  hc.textContent = text;
  hc.style.left = (W/2) + 'px';
  hc.style.top = (H - 72) + 'px';
  hc.classList.add('show');
  setTimeout(()=> hc.classList.remove('show'), 1600);
}

// ------------------- project nodes on planet surface -------------------
function projectNodes(cx, cy, r, count){
  const pts = [];
  const rings = Math.max(1, Math.ceil(count / 8));
  let placed = 0;
  for(let ring=0; ring<rings; ring++){
    const ringCount = Math.ceil(count / rings);
    const rad = r * (0.45 + (ring/(rings+1))*0.5);
    for(let i=0;i<ringCount && placed < count; i++){
      const ang = (i / ringCount) * Math.PI*2 + ring*0.2;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad * 0.92;
      pts.push({x:px, y:py});
      placed++;
    }
  }
  return pts;
}

// ------------------- moving glow path -------------------
function drawMovingGlow(x1,y1,x2,y2, speed, offset){
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx,dy);
  if(len < 1) return;
  const nx = dx/len, ny = dy/len;
  const seg = Math.max(24, 120 / Math.max(0.5, target.scale));
  const prog = ((t * speed) + offset) % 1;
  const start = prog * (len + seg) - seg;
  const a = Math.max(0, start), b = Math.min(len, start + seg);
  // faint base line
  ctx.save();
  ctx.lineWidth = Math.max(1.2, 1.8 / Math.max(0.2, target.scale));
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  // bright segment
  if(b > a){
    ctx.lineWidth = Math.max(2.6, 4 / Math.max(0.2, target.scale));
    ctx.strokeStyle = cachedThemeColor || '#8af3ff';
    ctx.shadowBlur = 10;
    ctx.shadowColor = cachedThemeColor || '#8af3ff';
    ctx.beginPath(); ctx.moveTo(x1 + nx*a, y1 + ny*a); ctx.lineTo(x1 + nx*b, y1 + ny*b); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

// ------------------- details modal (open on node click) -------------------
const modal = document.getElementById('detailModal');
function openDetail(pIdx, tIdx, nIdx){
  const a = achievements.planets[pIdx].tiers[tIdx].achievements[nIdx];
  document.getElementById('detailTitle').textContent = a.title || 'Achievement';
  document.getElementById('detailDesc').textContent = a.description || '';
  document.getElementById('detailStatus').textContent = `Status: ${a.status}`;
  document.getElementById('detailDate').textContent = a.dateCompleted ? `Completed: ${new Date(a.dateCompleted).toLocaleString()}` : '';
  document.getElementById('completeBtn').onclick = () => {
    a.status = 'completed';
    a.dateCompleted = new Date().toISOString();
    saveProgress();
    modal.classList.add('hidden');
  };
  modal.classList.remove('hidden');
}
document.getElementById('closeDetail')?.addEventListener('click', ()=> modal.classList.add('hidden'));

// ------------------- main render loop -------------------
let last = performance.now();
function loop(now){
  const dt = Math.min(0.033, (now - last)/1000);
  last = now;
  t += dt;

  // smooth camera interpolation
  camera.x = lerp(camera.x, target.x, easing);
  camera.y = lerp(camera.y, target.y, easing);
  camera.scale = lerp(camera.scale, target.scale, easing);

  // clear & draw static offscreen background
  ctx.clearRect(0,0,W,H);
  if(off) ctx.drawImage(off, 0, 0);

  // camera transform
  ctx.save();
  ctx.translate(W/2 + camera.x * camera.scale, H/2 + camera.y * camera.scale);
  ctx.scale(camera.scale, camera.scale);

  // draw center image
  if(assets.center.complete) ctx.drawImage(assets.center, -PLANET_SIZE/2, -PLANET_SIZE/2, PLANET_SIZE, PLANET_SIZE);

  hovered = null;
  // draw planets
  achievements.planets.forEach((p, idx) => {
    if(!p._pos) return;
    const px = p._pos.x, py = p._pos.y;
    const planetR = PLANET_SIZE;
    // subtle orbit arc for legibility
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1 / Math.max(0.2, camera.scale);
    ctx.beginPath(); ctx.arc(0,0, p._pos.orbitRadius, 0, Math.PI*2); ctx.stroke(); ctx.restore();

    // draw planet sprite
    if(assets.planet.complete) ctx.drawImage(assets.planet, px - planetR/2, py - planetR/2, planetR, planetR);

    // label when zoomed out
    if(camera.scale < 1.6){
      ctx.save(); ctx.font = `12px "Electrolize", Arial`; ctx.fillStyle = 'white'; ctx.textAlign = 'center';
      ctx.fillText(p.planetName || `Planet ${idx+1}`, px, py + planetR*0.68); ctx.restore();
    }

    // hover detection (screen-space)
    const sp = worldToScreen(px, py);
    const screenDist = Math.hypot(mouseX - sp.x, mouseY - sp.y);
    const hoverThreshold = Math.max(30, planetR * camera.scale * 0.7);
    const isHover = screenDist < hoverThreshold;

    if(isHover){
      hovered = hovered || { type:'planet', index: idx };
      // show junction icon slightly outside and a pulse path
      const jx = px + Math.cos(p._pos.angle) * (planetR + 38);
      const jy = py + Math.sin(p._pos.angle) * (planetR + 38);
      if(assets.junction.complete) ctx.drawImage(assets.junction, jx - 12, jy - 12, 24, 24);
      drawMovingGlow(px, py, jx, jy, 0.55, idx*0.06);
      // show hover card
      const card = document.getElementById('hoverCard'); card.textContent = p.planetName || `Planet ${idx+1}`;
      card.style.left = (mouseX) + 'px'; card.style.top = (mouseY) + 'px'; card.classList.add('show');
    }

    // if focused planet, paint nodes on the surface (layered on top)
    if(focused && focused.index === idx){
      // gather all nodes from tiers
      const allNodes = [];
      p.tiers.forEach((tObj, ti) => { tObj.achievements.forEach((a, ni) => allNodes.push({a, ti, ni})); });
      const pts = projectNodes(px, py, planetR*0.95, allNodes.length || 1);
      allNodes.forEach((entry, k) => {
        const { a, ti, ni } = entry;
        const pt = pts[k];
        // link glow planet->node
        drawMovingGlow(px, py, pt.x, pt.y, 0.9, k * 0.08);
        // hologram under node
        if(assets.hologram.complete) ctx.drawImage(assets.hologram, pt.x - NODE_SIZE*HOLO_SCALE/2, pt.y - NODE_SIZE*HOLO_SCALE/2, NODE_SIZE*HOLO_SCALE, NODE_SIZE*HOLO_SCALE);
        // node icon (locked/completed/available)
        const icon = (a.status === 'locked') ? assets.lock : assets.node;
        if(icon.complete) ctx.drawImage(icon, pt.x - NODE_SIZE/2, pt.y - NODE_SIZE/2, NODE_SIZE, NODE_SIZE);
        // available pulse
        if(a.status === 'available' && assets.pulse.complete){
          const pul = NODE_SIZE + Math.sin(t*5 + k) * 3;
          ctx.globalAlpha = 0.45 + 0.25*Math.sin(t*4 + k);
          ctx.drawImage(assets.pulse, pt.x - pul/2, pt.y - pul/2, pul, pul);
          ctx.globalAlpha = 1;
        }
        // small title placed on planet (left of node)
        ctx.save(); ctx.font = `11px "Electrolize", Arial`; ctx.fillStyle = 'white'; ctx.textAlign = 'left';
        ctx.fillText(a.title || '', pt.x + NODE_SIZE/2 + 6, pt.y + 4); ctx.restore();

        // detect node hover (screen coords)
        const sc = worldToScreen(pt.x, pt.y);
        if(Math.hypot(mouseX - sc.x, mouseY - sc.y) < Math.max(14, NODE_SIZE * camera.scale * 0.9)){
          hovered = hovered || { type:'node', p: idx, t: ti, n: ni };
          const card = document.getElementById('hoverCard'); card.textContent = a.title || 'Achievement';
          card.style.left = (mouseX) + 'px'; card.style.top = (mouseY) + 'px'; card.classList.add('show');
        }
      });

      // external single junction per focused planet (progress)
      const jx = px + Math.cos(p._pos.angle) * (planetR + 72);
      const jy = py + Math.sin(p._pos.angle) * (planetR + 72);
      if(assets.junction.complete) ctx.drawImage(assets.junction, jx - 12, jy - 12, 24, 24);
      drawMovingGlow(px, py, jx, jy, 0.55, idx*0.06);
      const scj = worldToScreen(jx, jy);
      if(Math.hypot(mouseX - scj.x, mouseY - scj.y) < 18){
        hovered = hovered || { type:'junction', index: idx, tierIndex: 0 };
        const card = document.getElementById('hoverCard'); card.textContent = 'Junction (travel)'; card.style.left = (mouseX) + 'px'; card.style.top = (mouseY) + 'px'; card.classList.add('show');
      }
    }
  });

  ctx.restore();

  // hide hover card if nothing hovered
  if(!hovered){
    document.getElementById('hoverCard')?.classList.remove('show');
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ------------------- modal/admin/save helpers -------------------
function saveProgress(){
  localStorage.setItem('progress', JSON.stringify(achievements));
}

// Admin panel functions (show/hide, login, edit)
function showAdminPanel(){
  const panel = document.getElementById('adminPanel');
  panel.classList.remove('hidden');
}
function hideAdminPanel(){ document.getElementById('adminPanel').classList.add('hidden'); }

document.getElementById('closeAdmin')?.addEventListener('click', hideAdminPanel);
document.getElementById('loginAdmin')?.addEventListener('click', loginAdmin);

// login admin (password 'admin')
function loginAdmin(){
  const pass = document.getElementById('adminPassword')?.value || '';
  if(pass !== 'admin'){ alert('Wrong password'); return; }
  const login = document.getElementById('adminLogin');
  login.style.display = 'none';
  const editContent = document.getElementById('editContent');
  editContent.classList.remove('hidden');

  let html = '';
  achievements.planets.forEach((p,i)=>{
    html += `<h3 style="margin:8px 0">${escapeHtml(p.planetName || 'Planet')}</h3>`;
    p.tiers.forEach((t,j)=>{
      html += `<div style="margin-bottom:8px"><strong>${escapeHtml(t.tierName || 'Tier')}</strong></div>`;
      t.achievements.forEach((a,k)=>{
        html += `<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px">
          <input value="${escapeHtml(a.title||'')}" onchange="editTitle(${i},${j},${k},this.value)">
          <input value="${escapeHtml(a.description||'')}" onchange="editDesc(${i},${j},${k},this.value)">
          <select onchange="editStatus(${i},${j},${k},this.value)">
            <option ${a.status==='locked'?'selected':''}>locked</option>
            <option ${a.status==='available'?'selected':''}>available</option>
            <option ${a.status==='completed'?'selected':''}>completed</option>
          </select>
        </div>`;
      });
    });
  });
  html += `<div style="margin-top:8px;display:flex;gap:8px">
    <button onclick="downloadJson()">Download JSON</button>
    <button onclick="bulkUnlock()">Bulk Unlock</button>
    <button onclick="bulkReset()">Bulk Reset</button>
  </div>`;
  editContent.innerHTML = html;
}

// admin edit helpers
function editTitle(i,j,k,v){ achievements.planets[i].tiers[j].achievements[k].title = v; saveProgress(); }
function editDesc(i,j,k,v){ achievements.planets[i].tiers[j].achievements[k].description = v; saveProgress(); }
function editStatus(i,j,k,v){ achievements.planets[i].tiers[j].achievements[k].status = v; achievements.planets[i].tiers[j].achievements[k].dateCompleted = v==='completed'? new Date().toISOString(): null; saveProgress(); }
function downloadJson(){
  const blob = new Blob([JSON.stringify(achievements, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'achievements.json'; a.click();
}
function bulkUnlock(){ achievements.planets.forEach(p=>p.tiers.forEach(t=>t.achievements.forEach(a=>a.status='available'))); saveProgress(); alert('All unlocked'); }
function bulkReset(){ achievements.planets.forEach(p=>p.tiers.forEach((t,j)=>t.achievements.forEach(a=>{ a.status = j===0? 'available' : 'locked'; a.dateCompleted = null; }))); saveProgress(); alert('All reset'); }

// ------------------- small helpers -------------------
function escapeHtml(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

// keep camera initial state fit after assets/data available
setTimeout(()=>{ if(achievements.planets && achievements.planets.length) { prepareLayout(); autoFit(); } }, 300);

// utility lerp
function lerp(a,b,f){ return a + (b-a) * f; }

// screen/world conversion helpers used elsewhere
function worldToScreenSimple(wx, wy){ return worldToScreen(wx, wy); }
function worldToScreen(wx, wy){ return { x: (wx + camera.x) * camera.scale + W/2, y: (wy + camera.y) * camera.scale + H/2 }; }
function screenToWorld(sx, sy){ return { x: (sx - W/2)/camera.scale - camera.x, y: (sy - H/2)/camera.scale - camera.y }; }

// On-load: build static and fit
buildStaticLayer();
prepareLayout();
autoFit();

// End of script.js
